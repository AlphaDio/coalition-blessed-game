#!/usr/bin/env node

import { createArmy, createEmpire, createGameState } from '../src/game/types.js';
import { UNITY_CONSTANTS } from '../src/game/constants.js';
import { processUnityAccrual, popNextUnityCelebrationEvent, calculateUnityThreshold } from '../src/game/unity.js';
import { getUnityEffectForEmpire } from '../src/game/unityDefinitions.js';
import { handleEventChoice } from '../src/game/events.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testUnityUnlockAndCelebrationFlow() {
  const state = createGameState(123);
  state.empires = [
    createEmpire('empire_hive', 'Synaptic Swarm', 55, {}, {}, { budget_credits: 1000 })
  ];
  state.armies = [
    createArmy('army_hive', 'empire_hive', 'Hive Vanguard', 55, 60, 0, 50, 50, 9000)
  ];
  state.improvements = {
    queue: [
      {
        id: 'unity_source_1',
        empireId: 'empire_hive',
        state: 'ACTIVE',
        unityOutput: UNITY_CONSTANTS.INITIAL_THRESHOLD + 5
      }
    ]
  };

  const result = processUnityAccrual(state);
  const empire = state.empires[0];
  const firstEffect = getUnityEffectForEmpire('empire_hive', 0);

  assert(result.unlocks.length === 1, 'Expected one unity unlock');
  assert(empire.unityLevel === 1, `Expected unity level 1, got ${empire.unityLevel}`);
  assert(empire.unityEffects.includes(firstEffect.id), 'Expected first Synaptic Swarm unity effect to be unlocked');
  assert((empire.unityModifiers.army_replenishment_mult || 0) >= 0.5, 'Expected dramatic army recovery modifier for Synaptic Swarm');
  assert(empire.unityThreshold === calculateUnityThreshold(1), 'Expected threshold scaling after first unlock');
  assert(state.unityPendingCelebrations.length === 1, 'Expected one queued unity celebration event');

  const celebrationEvent = popNextUnityCelebrationEvent(state);
  assert(celebrationEvent && celebrationEvent.scope === 'UNITY', 'Expected a UNITY celebration event');
  assert(
    String(celebrationEvent.text || '').includes(firstEffect.name),
    'Celebration event should mention unlocked unity effect'
  );
  assert(Array.isArray(celebrationEvent.choices) && celebrationEvent.choices.length === 3, 'Expected 3 celebration reward choices');

  const creditsBefore = empire.budget_credits || 0;
  state.activeEvent = celebrationEvent;
  const choiceResult = handleEventChoice(state, celebrationEvent.id, 1);
  assert(choiceResult.success, 'Expected celebration choice to resolve successfully');
  assert((empire.budget_credits || 0) > creditsBefore, 'Expected celebration reward to grant empire credits');
}

function testUnityMartialCelebrationTargetsEmpireArmy() {
  const state = createGameState(456);
  state.empires = [
    createEmpire('empire_hive', 'Synaptic Swarm', 55, {}, {}, { budget_credits: 1000 })
  ];
  state.armies = [
    createArmy('army_hive', 'empire_hive', 'Hive Vanguard', 55, 60, 0, 50, 50, 9000)
  ];
  state.improvements = {
    queue: [
      {
        id: 'unity_source_2',
        empireId: 'empire_hive',
        state: 'ACTIVE',
        unityOutput: UNITY_CONSTANTS.INITIAL_THRESHOLD + 5
      },
      {
        id: 'unity_source_3',
        empireId: 'empire_hive',
        state: 'ACTIVE',
        unityOutput: calculateUnityThreshold(1) + 5
      }
    ]
  };

  // First unlock
  processUnityAccrual(state);
  popNextUnityCelebrationEvent(state);

  // Second unlock
  processUnityAccrual(state);
  const celebrationEvent = popNextUnityCelebrationEvent(state);
  assert(celebrationEvent, 'Expected second unity celebration event');

  const army = state.armies[0];
  const bonusesBefore = (army.timedFervorBonuses || []).length;
  state.activeEvent = celebrationEvent;
  const choiceResult = handleEventChoice(state, celebrationEvent.id, 2);
  assert(choiceResult.success, 'Expected martial celebration choice to resolve successfully');
  assert((army.timedFervorBonuses || []).length > bonusesBefore, 'Expected martial celebration to grant army fervor bonus');
}

function testUnityThresholdCurve() {
  const tier1 = calculateUnityThreshold(0);
  const tier2 = calculateUnityThreshold(1);
  const tier3 = calculateUnityThreshold(2);
  const tier4 = calculateUnityThreshold(3);
  const tier5 = calculateUnityThreshold(4);

  assert(tier1 === UNITY_CONSTANTS.INITIAL_THRESHOLD, `Expected tier1 threshold ${UNITY_CONSTANTS.INITIAL_THRESHOLD}, got ${tier1}`);
  assert(tier2 > tier1, 'Expected tier2 threshold > tier1');
  assert(tier3 > tier2, 'Expected tier3 threshold > tier2');
  assert(tier4 > tier3, 'Expected tier4 threshold > tier3');
  assert(tier5 > tier4, 'Expected tier5 threshold > tier4');
}

console.log('============================================================');
console.log('Unity System Tests');
console.log('============================================================');

try {
  testUnityUnlockAndCelebrationFlow();
  console.log('[PASS] Unity unlock applies empire-specific effects and queues celebration rewards');

  testUnityMartialCelebrationTargetsEmpireArmy();
  console.log('[PASS] Unity celebration can grant army-focused rewards to the unlocking empire');

  testUnityThresholdCurve();
  console.log('[PASS] Unity thresholds scale upward each tier');

  console.log('============================================================');
  console.log('[PASS] ALL UNITY TESTS PASSED');
  console.log('============================================================');
} catch (error) {
  console.error('============================================================');
  console.error('[FAIL] UNITY TEST FAILED');
  console.error(error.stack || error.message || error);
  console.error('============================================================');
  process.exit(1);
}
