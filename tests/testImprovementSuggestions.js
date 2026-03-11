import { createGameState, createEmpire } from '../src/game/types.js';
import { advanceTurn } from '../src/game/turn.js';
import {
  MAX_SUGGESTIONS_PER_EMPIRE,
  acceptImprovementRequest,
  generateImprovementSuggestions,
  initializeImprovementsState
} from '../src/game/improvements/index.js';
import { GameManager } from '../src/server/gameManager.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }

  failures++;
  console.log(`FAIL ${message}`);
}

function getSuggestionCounts(state) {
  const counts = new Map();
  for (const empire of state.empires || []) {
    counts.set(empire.id, 0);
  }
  for (const request of state.improvements?.requests || []) {
    if (!request?.empireId) {
      continue;
    }
    counts.set(request.empireId, (counts.get(request.empireId) || 0) + 1);
  }
  return counts;
}

function assertSuggestionCounts(state, label) {
  const counts = getSuggestionCounts(state);
  for (const empire of state.empires || []) {
    assert(
      counts.get(empire.id) === MAX_SUGGESTIONS_PER_EMPIRE,
      `${label}: ${empire.id} has ${MAX_SUGGESTIONS_PER_EMPIRE} suggestions`
    );
  }
  assert(
    (state.improvements?.requests?.length || 0) === (state.empires?.length || 0) * MAX_SUGGESTIONS_PER_EMPIRE,
    `${label}: total suggestion count matches per-empire target`
  );
}

function createSuggestionState() {
  const state = createGameState(99);
  state.improvements = initializeImprovementsState();
  state.empires = [
    createEmpire('empire_a', 'Empire A', 55),
    createEmpire('empire_b', 'Empire B', 55)
  ];
  state.coalitionEconomy.requisition = 5000;
  state.improvements.requests = generateImprovementSuggestions(state, () => 0.25);
  return state;
}

console.log('============================================================');
console.log('Improvement Suggestion Regression Tests');
console.log('============================================================\n');

console.log('=== Test 1: New game starts with 3 suggestions per empire ===');
const manager = new GameManager();
const liveState = manager.newGame(12345);
assertSuggestionCounts(liveState, 'new game');
console.log();

console.log('=== Test 2: Turn advancement preserves the per-empire suggestion target ===');
for (let i = 0; i < 6; i++) {
  advanceTurn(liveState, () => 0.99);
}
assertSuggestionCounts(liveState, 'after turn advancement');
console.log();

console.log('=== Test 3: Turn refill restores missing slots without a global cap ===');
const refillRequest = liveState.improvements.requests.find(request => request.empireId === liveState.empires[0].id);
liveState.improvements.requests = liveState.improvements.requests.filter(request => request.id !== refillRequest.id);
const countsAfterRemoval = getSuggestionCounts(liveState);
assert(
  countsAfterRemoval.get(liveState.empires[0].id) === MAX_SUGGESTIONS_PER_EMPIRE - 1,
  'manual removal drops one empire below target before refill'
);
advanceTurn(liveState, () => 0.99);
assertSuggestionCounts(liveState, 'after refill turn');
console.log();

console.log('=== Test 4: Requests are bound to their owning empire ===');
const ownershipState = createSuggestionState();
const ownedRequest = ownershipState.improvements.requests.find(request => request.empireId === 'empire_a');
const mismatchedResult = acceptImprovementRequest(ownershipState, ownedRequest.id, 'empire_b');
assert(!mismatchedResult.success, 'mismatched empire is rejected');
assert(
  ownershipState.improvements.queue.length === 0,
  'rejected mismatched accept does not create an improvement'
);
assert(
  ownershipState.improvements.requests.some(request => request.id === ownedRequest.id),
  'rejected mismatched accept leaves the original request intact'
);
assertSuggestionCounts(ownershipState, 'after mismatched accept');
console.log();

console.log('=== Test 5: Accepting a request uses the request empire and keeps the queue full ===');
const acceptedResult = acceptImprovementRequest(ownershipState, ownedRequest.id);
assert(acceptedResult.success, 'accept succeeds without passing empireId');
assert(
  acceptedResult.improvement?.empireId === 'empire_a',
  'accepted improvement is created for the request owner'
);
assertSuggestionCounts(ownershipState, 'after accepted request replacement');
console.log();

console.log('============================================================');
console.log('Suggestion Test Summary');
console.log('============================================================');
if (failures > 0) {
  console.log(`FAIL ${failures} suggestion regression test(s) failed`);
  process.exit(1);
}
console.log('PASS all suggestion regression tests passed');
console.log('============================================================');
