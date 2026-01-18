#!/usr/bin/env node

/**
 * Integration Tests for Improvements System
 * Tests the improvements queue, requests board, and progress mechanics
 */

import { createGameState, createEmpire } from './src/game/types.js';
import { 
  initializeImprovementsSystem,
  refreshRequestsIfDue,
  acceptRequest,
  scheduleAllQueues,
  advanceImprovementProgress
} from './src/game/improvements.js';
import { getImprovementTemplates } from './src/game/improvementTemplates.js';
import { DeterministicRNG } from './src/modules/rng.js';
import { initializeLogger, LogLevel } from './src/modules/logger.js';

// Initialize logger to suppress console output during tests
initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

console.log('============================================================');
console.log('Improvements System Test Suite');
console.log('============================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✓ ${testName}`);
    testsPassed++;
    return true;
  }
  console.log(`✗ ${testName}`);
  testsFailed++;
  return false;
}

// Test 1: Initialize improvements system
console.log('=== Test 1: Initialize improvements system ===');
const state = createGameState();
state.empires = [
  createEmpire('empire1', 'Empire One', 50),
  createEmpire('empire2', 'Empire Two', 60)
];

// Initialize coalition economy
state.coalitionEconomy = {
  stockpiles: {
    Supplies: 1000
  }
};

const templates = getImprovementTemplates();
initializeImprovementsSystem(state);
state.improvementTemplates = templates;

assert(state.requestsBoard !== undefined, 'Requests board initialized');
assert(state.improvementQueues !== undefined, 'Improvement queues initialized');
assert(state.improvements !== undefined, 'Improvements map initialized');
assert(state.improvementTemplates !== undefined, 'Templates loaded');
console.log('');

// Test 2: Generate requests
console.log('=== Test 2: Generate requests ===');
const rng = new DeterministicRNG(12345);
state.turn = 50; // Set turn to trigger refresh (refresh_cadence_ticks = 50)

// Generate initial requests
refreshRequestsIfDue(state, templates, rng);

assert(state.requestsBoard.requests.length > 0, 'Requests generated');
const requestCount = state.requestsBoard.requests.length;
console.log(`  Generated ${requestCount} initial requests`);

// Check request structure
const firstRequest = state.requestsBoard.requests[0];
assert(firstRequest.id !== undefined, 'Request has ID');
assert(firstRequest.template_key !== undefined, 'Request has template_key');
assert(firstRequest.expires_at_tick > state.turn, 'Request has expiration');
console.log(`  First request: ${firstRequest.id} (template: ${firstRequest.template_key})`);
console.log('');

// Test 3: Accept a request
console.log('=== Test 3: Accept a request ===');
const requestToAccept = state.requestsBoard.requests[0];
const initialSupplies = state.coalitionEconomy.stockpiles.Supplies;

const result = acceptRequest(state, requestToAccept.id, templates);

assert(result.success, 'Request accepted successfully');
assert(state.coalitionEconomy.stockpiles.Supplies < initialSupplies, 'Supplies deducted');
assert(Object.keys(state.improvements).length > 0, 'Improvement created');
console.log(`  Supplies: ${initialSupplies} -> ${state.coalitionEconomy.stockpiles.Supplies}`);
console.log(`  Improvement created: ${result.improvement.id}`);

// Check improvement was enqueued
const queueId = requestToAccept.target;
assert(state.improvementQueues[queueId] !== undefined, 'Queue created for target');
assert(state.improvementQueues[queueId].pending_ids.includes(result.improvement.id), 'Improvement in pending queue');
console.log(`  Queue: ${queueId}, Pending: ${state.improvementQueues[queueId].pending_ids.length}`);
console.log('');

// Test 4: Queue scheduling
console.log('=== Test 4: Queue scheduling ===');
const queue = state.improvementQueues[queueId];
const improvement = state.improvements[result.improvement.id];

console.log(`  Before scheduling - Pending: ${queue.pending_ids.length}, Active: ${queue.active_ids.length}`);
console.log(`  Improvement status: ${improvement.status}`);

scheduleAllQueues(state);

console.log(`  After scheduling - Pending: ${queue.pending_ids.length}, Active: ${queue.active_ids.length}`);
console.log(`  Improvement status: ${improvement.status}`);

assert(queue.active_ids.includes(result.improvement.id), 'Improvement moved to active');
assert(improvement.status === 'active', 'Improvement status is active');
console.log('');

// Test 5: Progress advancement
console.log('=== Test 5: Progress advancement ===');
const initialProgress = improvement.progress;
console.log(`  Initial progress: ${initialProgress}/${improvement.work}`);
console.log(`  Queue potency: ${queue.potency}/tick`);

advanceImprovementProgress(state);

console.log(`  After 1 tick: ${improvement.progress}/${improvement.work}`);
assert(improvement.progress > initialProgress, 'Progress advanced');

// Advance until completion
let ticks = 0;
const maxTicks = 100;
while (improvement.status === 'active' && ticks < maxTicks) {
  advanceImprovementProgress(state);
  ticks++;
}

console.log(`  After ${ticks} more ticks: ${improvement.progress}/${improvement.work}`);
console.log(`  Improvement status: ${improvement.status}`);

assert(improvement.status === 'completed', 'Improvement completed');
assert(improvement.progress >= improvement.work, 'Progress reached work requirement');
assert(!queue.active_ids.includes(result.improvement.id), 'Improvement removed from active queue');
console.log('');

// Test 6: Multiple improvements in queue
console.log('=== Test 6: Multiple improvements in queue ===');
state.turn = 100;

// Accept multiple requests
let acceptedCount = 0;
for (let i = 0; i < Math.min(3, state.requestsBoard.requests.length); i++) {
  const req = state.requestsBoard.requests[i];
  const acceptResult = acceptRequest(state, req.id, templates);
  if (acceptResult.success) {
    acceptedCount++;
  }
}

console.log(`  Accepted ${acceptedCount} requests`);

// Schedule and check capacity
scheduleAllQueues(state);

const totalActiveSize = Object.values(state.improvementQueues).reduce((sum, q) => {
  return sum + q.active_ids.reduce((qSum, impId) => {
    const imp = state.improvements[impId];
    return qSum + (imp && imp.status === 'active' ? imp.size : 0);
  }, 0);
}, 0);

console.log(`  Total active size across all queues: ${totalActiveSize}`);
assert(totalActiveSize > 0, 'Multiple improvements active');
console.log('');

// Test 7: Request expiration
console.log('=== Test 7: Request expiration ===');
state.turn = 0;
state.requestsBoard.requests = [];
refreshRequestsIfDue(state, templates, rng);
const initialRequestCount = state.requestsBoard.requests.length;
console.log(`  Generated ${initialRequestCount} requests at turn 0`);

// Advance far into the future
state.turn = 500;
refreshRequestsIfDue(state, templates, rng);
console.log(`  At turn 500, requests: ${state.requestsBoard.requests.length}`);

assert(state.requestsBoard.requests.length < initialRequestCount || 
       state.requestsBoard.requests.length === state.requestsBoard.cap, 
       'Old requests expired or board is at cap');
console.log('');

// Test 8: Share policies
console.log('=== Test 8: Share policies ===');
state.turn = 600;
state.improvementQueues = {};
state.improvements = {};
state.requestsBoard.requests = [];
refreshRequestsIfDue(state, templates, rng);

// Accept two smaller requests to same queue or increase capacity
const targetQueue = 'coalition';
let imp1, imp2;

// First, find and accept smaller improvements or increase queue capacity
if (!state.improvementQueues[targetQueue]) {
  state.improvementQueues[targetQueue] = {
    owner_id: targetQueue,
    capacity: 200, // Larger capacity to fit both
    potency: 10,
    fill_policy: 'fifo',
    share_policy: 'proportional',
    active_ids: [],
    pending_ids: [],
    completed_log: []
  };
}

for (let i = 0; i < state.requestsBoard.requests.length && (!imp1 || !imp2); i++) {
  const req = state.requestsBoard.requests[i];
  if (req.target === targetQueue) {
    const acceptResult = acceptRequest(state, req.id, templates);
    if (acceptResult.success) {
      if (!imp1) imp1 = acceptResult.improvement;
      else if (!imp2) imp2 = acceptResult.improvement;
    }
  }
}

if (imp1 && imp2) {
  const queue = state.improvementQueues[targetQueue];
  queue.share_policy = 'proportional';
  
  scheduleAllQueues(state);
  
  const prog1Before = imp1.progress;
  const prog2Before = imp2.progress;
  
  advanceImprovementProgress(state);
  
  const prog1After = imp1.progress;
  const prog2After = imp2.progress;
  
  console.log(`  Imp1 (size ${imp1.size}): ${prog1Before} -> ${prog1After} (+${(prog1After - prog1Before).toFixed(2)})`);
  console.log(`  Imp2 (size ${imp2.size}): ${prog2Before} -> ${prog2After} (+${(prog2After - prog2Before).toFixed(2)})`);
  
  assert(prog1After > prog1Before && prog2After > prog2Before, 
         'Both improvements made progress with proportional sharing');
} else {
  console.log('  Skipped: Could not create two improvements for same queue');
}
console.log('');

// Summary
console.log('============================================================');
console.log('Test Results Summary');
console.log('============================================================');
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('============================================================');
  console.log('✓ ALL TESTS PASSED');
  console.log('Improvements system integration tests completed successfully');
  console.log('============================================================');
  process.exit(0);
} else {
  console.log('============================================================');
  console.log('✗ SOME TESTS FAILED');
  console.log('============================================================');
  process.exit(1);
}
