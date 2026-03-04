#!/usr/bin/env node

import { createArmy, createEmpire, createGameState } from '../src/game/types.js';
import {
  applyMissionSliderEffects,
  buildDeepMissionEvent,
  buildPreAttackMissionEvent,
  getDeepMissionThreshold,
  maybeSpawnDeepMission,
  handleMissionEventChoice
} from '../src/game/scourgeMissions.js';
import { calculateScourgePrediction, selectScourgeTargetEmpire } from '../src/game/scourgePrediction.js';
import { SCOURGE_MISSION_CONSTANTS } from '../src/game/constants.js';
import { handleEventChoice } from '../src/game/events.js';
import { triggerScourgeBattle } from '../src/game/turn/battlePhase.js';
import { GameManager } from '../src/server/gameManager.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function approxEqual(left, right, epsilon = 0.0001) {
  return Math.abs(left - right) <= epsilon;
}

function createBasicState() {
  const state = createGameState(42);
  state.empires = [
    createEmpire('empire_1', 'Alpha Combine', 60),
    createEmpire('empire_2', 'Beta Compact', 55)
  ];
  state.diplomacy = {
    relations: {
      empire_1: { empire_2: 0 },
      empire_2: { empire_1: 0 }
    }
  };
  return state;
}

function testMissionIntelFlow() {
  const state = createBasicState();
  state.coalitionEconomy.requisition = 1000;
  state.missionSlider = 5;

  applyMissionSliderEffects(state, []);
  assert(approxEqual(state.coalitionIntel, 1.25), `Expected 1.25 intel from mission budget, got ${state.coalitionIntel}`);
  assert(
    approxEqual(state.scourgePrediction.confidenceModifier, 1.0625),
    `Expected mission slider intel to also update confidence immediately, got ${state.scourgePrediction.confidenceModifier}`
  );

  const preAttackEvent = buildPreAttackMissionEvent(state, () => 0);
  const intelBeforeEscalate = state.coalitionIntel;
  const escalateResult = handleMissionEventChoice(state, preAttackEvent, 2, () => 0);
  assert(escalateResult.success, 'Pre-attack escalate choice should succeed');
  assert(approxEqual(state.coalitionIntel, intelBeforeEscalate), 'Escalate should no longer grant intel');

  const deepMissionEvent = buildDeepMissionEvent(state, () => 0);
  const intelBeforeHarvest = state.coalitionIntel;
  const harvestResult = handleMissionEventChoice(state, deepMissionEvent, 2, () => 0);
  assert(harvestResult.success, 'Deep mission harvest choice should succeed');
  assert(approxEqual(state.coalitionIntel, intelBeforeHarvest), 'Deep harvest should no longer grant intel');
}

function testDirectTargetUsesIntel() {
  const manager = new GameManager();
  manager.state = createBasicState();
  manager.state.coalitionIntel = 10;

  const result = manager.directScourgeTarget('empire_2');
  assert(result.success, 'Direct target action should succeed');
  assert(approxEqual(manager.state.coalitionIntel, 4), `Expected 4 intel remaining, got ${manager.state.coalitionIntel}`);
  assert(manager.state.scourgeDirectedTargetEmpireId === 'empire_2', 'Directed target should be stored');
  assert(manager.state.scourgePrediction.targetEmpireId === 'empire_2', 'Prediction should immediately point at directed target');
  assert(manager.state.scourgePrediction.targetingMode === 'directed', 'Prediction should mark directed targeting mode');
  assert(manager.state.scourgePrediction.confidenceLevel === 'high', 'Directed target should show high confidence');
}

function testRegularEventSyncsIntelAndConfidence() {
  const state = createBasicState();
  const event = {
    id: 'evt_sync',
    title: 'Signal Intercept',
    choices: [
      {
        text: 'Exploit the intercept',
        effects: {
          scourgePredictionConfidence: 0.2
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);

  assert(result.success, 'Regular event choice should succeed');
  assert(approxEqual(state.coalitionIntel, 4), `Expected 4 intel from +0.2 confidence event, got ${state.coalitionIntel}`);
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.2), `Expected immediate confidence modifier 1.2, got ${state.scourgePrediction.confidenceModifier}`);
}

function testIntelEventBoostsConfidence() {
  const state = createBasicState();
  const event = {
    id: 'evt_intel_gain',
    title: 'Recovered Scout Cache',
    choices: [
      {
        text: 'Decrypt the recovered data',
        effects: {
          coalitionIntel: 2
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);

  assert(result.success, 'Intel event choice should succeed');
  assert(approxEqual(state.coalitionIntel, 2), `Expected +2 intel from explicit intel event, got ${state.coalitionIntel}`);
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.1), `Expected immediate confidence modifier 1.1 from +2 intel, got ${state.scourgePrediction.confidenceModifier}`);
}

function testIntelLossReducesConfidence() {
  const state = createBasicState();
  state.coalitionIntel = 5;
  state.scourgePrediction.confidenceModifier = 1.25;
  state.scourgePrediction.confidenceLevel = 'medium';

  const event = {
    id: 'evt_intel_loss',
    title: 'Compromised Relay',
    choices: [
      {
        text: 'Accept the loss',
        effects: {
          coalitionIntel: -2
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);

  assert(result.success, 'Intel loss event choice should succeed');
  assert(approxEqual(state.coalitionIntel, 3), `Expected intel to fall from 5 to 3, got ${state.coalitionIntel}`);
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.15), `Expected confidence modifier to drop from 1.25 to 1.15, got ${state.scourgePrediction.confidenceModifier}`);
}

function testBattleTriggerHonorsDirective() {
  const state = createBasicState();
  state.scourgeDirectedTargetEmpireId = 'empire_2';
  state.armies = [
    createArmy('army_alpha', 'empire_1', 'Alpha Guard', 60, 70, 0, 50, 50, 10000),
    createArmy('army_beta', 'empire_2', 'Beta Guard', 60, 70, 0, 50, 50, 10000)
  ];

  const log = [];
  const logger = {
    debug() {},
    info() {},
    warn() {}
  };

  triggerScourgeBattle(state, () => 0, 1, [], log, logger);

  assert(state.scourgeTargetEmpireId === 'empire_2', 'Scourge trigger should honor the directed target');
  assert(state.pendingScourgeAttack?.targetEmpireId === 'empire_2', 'Pending scourge attack should target the directed empire');
  assert(state.scourgeDirectedTargetEmpireId === null, 'Directive should be consumed once the attack is locked');
  assert(state.activeEvent?.id === 'EVT_MISSION_PRE_ATTACK', 'Pre-attack mission should still be created');
}

function testDeepMissionThresholdScaling() {
  const state = createBasicState();
  const baseThreshold = SCOURGE_MISSION_CONSTANTS.DEEP_MISSION_THRESHOLD_BASE;
  const nextThreshold = Math.round(
    baseThreshold * (1 + SCOURGE_MISSION_CONSTANTS.DEEP_MISSION_THRESHOLD_GROWTH_RATE)
  );
  const thirdThreshold = Math.round(
    baseThreshold * Math.pow(1 + SCOURGE_MISSION_CONSTANTS.DEEP_MISSION_THRESHOLD_GROWTH_RATE, 2)
  );

  assert(
    getDeepMissionThreshold(state) === baseThreshold,
    `Expected initial Deep Mission threshold ${baseThreshold}, got ${getDeepMissionThreshold(state)}`
  );

  state.missionMeter = baseThreshold - 1;
  assert(maybeSpawnDeepMission(state, () => 0) === null, 'Deep mission should not trigger below the base threshold');
  assert(state.deepMissionCount === 0, 'Deep mission count should not change before the first trigger');

  state.missionMeter = baseThreshold;
  let deepMission = maybeSpawnDeepMission(state, () => 0);
  assert(deepMission?.id === 'EVT_DEEP_MISSION', 'Deep mission should trigger at the base threshold');
  assert(state.missionMeter === 0, `Expected mission meter to spend the full ${baseThreshold} cost, got ${state.missionMeter}`);
  assert(state.deepMissionCount === 1, `Expected deep mission count 1 after first trigger, got ${state.deepMissionCount}`);
  assert(
    getDeepMissionThreshold(state) === nextThreshold,
    `Expected second Deep Mission threshold ${nextThreshold}, got ${getDeepMissionThreshold(state)}`
  );

  state.missionMeter = nextThreshold - 1;
  assert(maybeSpawnDeepMission(state, () => 0) === null, 'Deep mission should not trigger below the scaled threshold');
  assert(state.deepMissionCount === 1, 'Deep mission count should not increase on a failed trigger');

  state.missionMeter = nextThreshold + 15;
  deepMission = maybeSpawnDeepMission(state, () => 0);
  assert(deepMission?.id === 'EVT_DEEP_MISSION', 'Deep mission should trigger once the scaled threshold is met');
  assert(state.missionMeter === 15, `Expected mission meter overflow to be preserved (15), got ${state.missionMeter}`);
  assert(state.deepMissionCount === 2, `Expected deep mission count 2 after second trigger, got ${state.deepMissionCount}`);
  assert(
    getDeepMissionThreshold(state) === thirdThreshold,
    `Expected third Deep Mission threshold ${thirdThreshold}, got ${getDeepMissionThreshold(state)}`
  );
}

function testEmpirePredictionPrefersClearlyWeakTarget() {
  const state = createGameState(99);
  state.empires = [
    createEmpire('empire_1', 'Fortress Union', 78, {}, {}, { stability: 78 }),
    createEmpire('empire_2', 'Fractured Reach', 24, {}, {}, { stability: 28 }),
    createEmpire('empire_3', 'Border League', 58, {}, {}, { stability: 62 })
  ];

  state.diplomacy = {
    relations: {
      empire_1: { empire_2: 70, empire_3: 55 },
      empire_2: { empire_1: -20, empire_3: -10 },
      empire_3: { empire_1: 55, empire_2: -10 }
    }
  };

  state.armies = [
    createArmy('army_1a', 'empire_1', 'Fortress Guard', 70, 85, 10, 50, 50, 12000),
    createArmy('army_1b', 'empire_1', 'Fortress Reserve', 65, 78, 15, 50, 50, 9000),
    createArmy('army_2a', 'empire_2', 'Fractured Militia', 45, 34, 72, 50, 50, 3500),
    createArmy('army_3a', 'empire_3', 'Border Guard', 55, 68, 25, 50, 50, 8000)
  ];

  const selection = selectScourgeTargetEmpire(state, () => 0.99);
  assert(selection.source === 'calculated', 'Weak-target test should use calculated targeting');
  assert(selection.empire?.id === 'empire_2', `Expected Fractured Reach to be the top target, got ${selection.empire?.id}`);

  const prediction = calculateScourgePrediction(state, () => 0.25);
  assert(prediction.targetEmpireId === 'empire_2', `Expected prediction to point at Fractured Reach, got ${prediction.targetEmpireId}`);
  assert(prediction.confidenceModifier > 1.1, `Expected a stronger confidence signal for a clear weak target, got ${prediction.confidenceModifier}`);
}

function run() {
  console.log('=== Test: Scourge Intel Direction ===');

  testMissionIntelFlow();
  console.log('PASS Mission budget generates intel and mission rewards no longer do');

  testDirectTargetUsesIntel();
  console.log('PASS Direct target spends intel and updates prediction');

  testRegularEventSyncsIntelAndConfidence();
  console.log('PASS Regular events keep intel and confidence synchronized');

  testIntelEventBoostsConfidence();
  console.log('PASS Explicit intel gains raise confidence');

  testIntelLossReducesConfidence();
  console.log('PASS Intel losses reduce confidence');

  testBattleTriggerHonorsDirective();
  console.log('PASS Battle trigger honors stored directive');

  testDeepMissionThresholdScaling();
  console.log('PASS Deep mission threshold scales permanently and preserves overflow');

  testEmpirePredictionPrefersClearlyWeakTarget();
  console.log('PASS Empire prediction locks onto the clearly weakest empire');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error('FAIL', error.message);
  process.exit(1);
}
