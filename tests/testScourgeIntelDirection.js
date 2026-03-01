#!/usr/bin/env node

import { createArmy, createEmpire, createGameState } from '../src/game/types.js';
import {
  applyMissionSliderEffects,
  buildDeepMissionEvent,
  buildPreAttackMissionEvent,
  handleMissionEventChoice
} from '../src/game/scourgeMissions.js';
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
  assert(approxEqual(state.coalitionIntel, 1.0), `Expected 1.0 intel from mission budget, got ${state.coalitionIntel}`);

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
  assert(approxEqual(manager.state.coalitionIntel, 2), `Expected 2 intel remaining, got ${manager.state.coalitionIntel}`);
  assert(manager.state.scourgeDirectedTargetEmpireId === 'empire_2', 'Directed target should be stored');
  assert(manager.state.scourgePrediction.targetEmpireId === 'empire_2', 'Prediction should immediately point at directed target');
  assert(manager.state.scourgePrediction.targetingMode === 'directed', 'Prediction should mark directed targeting mode');
  assert(manager.state.scourgePrediction.confidenceLevel === 'high', 'Directed target should show high confidence');
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

function run() {
  console.log('=== Test: Scourge Intel Direction ===');

  testMissionIntelFlow();
  console.log('PASS Mission budget generates intel and mission rewards no longer do');

  testDirectTargetUsesIntel();
  console.log('PASS Direct target spends intel and updates prediction');

  testBattleTriggerHonorsDirective();
  console.log('PASS Battle trigger honors stored directive');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error('FAIL', error.message);
  process.exit(1);
}
