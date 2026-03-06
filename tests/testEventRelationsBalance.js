#!/usr/bin/env node

import { createGameState } from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import { handleEventChoice } from '../src/game/events.js';
import { EVENT_CONSTANTS } from '../src/game/constants.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${message}`);
  } else {
    failed += 1;
    console.log(`FAIL ${message}`);
  }
}

function createState(seed = 77) {
  const state = createGameState(seed);
  const content = createSampleContent(seed);
  state.empires = content.empires;
  state.armies = content.armies;
  state.events = [];
  state.diplomacy = content.diplomacy;
  return state;
}

function applyRelationEvent(state, fromEmpireId, toEmpireId, delta) {
  const event = {
    id: `relation_test_${state.turn}_${Math.abs(delta)}`,
    title: 'Relation Balance Test',
    choices: [
      {
        text: 'Apply delta',
        effects: {
          empireRelations: {
            [fromEmpireId]: {
              [toEmpireId]: delta
            }
          }
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);
  if (!result.success) {
    throw new Error(result.error || 'Failed to apply relation test event');
  }
}

console.log('=== Event Relation Balance Tests ===');

{
  const state = createState();
  const from = state.empires[0].id;
  const to = state.empires[1].id;

  state.diplomacy.relations[from][to] = 0;
  const beforePositive = state.diplomacy.relations[from][to];
  applyRelationEvent(state, from, to, 15);
  const positiveDelta = state.diplomacy.relations[from][to] - beforePositive;

  assert(positiveDelta > 0, 'Positive relation event still increases relations');
  assert(positiveDelta < 15, 'Positive relation event is scaled down from raw value');
  assert(positiveDelta <= EVENT_CONSTANTS.RELATION_EFFECT_ABS_CAP, 'Positive relation event respects hard cap');

  state.diplomacy.relations[from][to] = 0;
  const beforeNegative = state.diplomacy.relations[from][to];
  applyRelationEvent(state, from, to, -15);
  const negativeDelta = state.diplomacy.relations[from][to] - beforeNegative;

  assert(negativeDelta < 0, 'Negative relation event still decreases relations');
  assert(Math.abs(negativeDelta) < 15, 'Negative relation event is scaled down from raw value');
  assert(Math.abs(negativeDelta) <= EVENT_CONSTANTS.RELATION_EFFECT_ABS_CAP, 'Negative relation event respects hard cap');
}

{
  const state = createState();
  const from = state.empires[0].id;
  const to = state.empires[1].id;

  state.diplomacy.relations[from][to] = 95;
  const before = state.diplomacy.relations[from][to];
  applyRelationEvent(state, from, to, 15);
  const delta = state.diplomacy.relations[from][to] - before;

  assert(delta > 0, 'High positive relations can still improve');
  assert(delta <= 2.1, 'Positive relation gains diminish strongly near +100 cap');
}

{
  const state = createState();
  const from = state.empires[0].id;
  const to = state.empires[1].id;

  state.diplomacy.relations[from][to] = -90;
  const before = state.diplomacy.relations[from][to];
  applyRelationEvent(state, from, to, -15);
  const delta = state.diplomacy.relations[from][to] - before;

  assert(delta < 0, 'Hostile relations can still worsen');
  assert(delta > -3, 'Hostility spiral is damped when relations are already very low');
}

{
  const state = createState();
  const from = state.empires[0].id;
  const to = state.empires[1].id;

  state.diplomacy.relations[from][to] = -60;
  const before = state.diplomacy.relations[from][to];
  applyRelationEvent(state, from, to, 8);
  const delta = state.diplomacy.relations[from][to] - before;

  assert(delta > 5.6, 'Repairing hostile relations gets a small recovery bias');
}

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}

