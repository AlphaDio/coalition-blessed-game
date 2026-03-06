#!/usr/bin/env node

import { createArmy, createEmpire, createGameState, createHero } from '../src/game/types.js';
import { UNITY_CONSTANTS } from '../src/game/constants.js';
import { processUnityAccrual, popNextUnityCelebrationEvent, calculateUnityThreshold, getEmpireUnityGainPerTurn } from '../src/game/unity.js';
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

function testPopulationBaselineUnityGeneration() {
  const state = createGameState(321);
  state.empires = [
    createEmpire('empire_low', 'Low Pop Empire', 55, {}, {}, { population: 2_000 }),
    createEmpire('empire_high', 'High Pop Empire', 55, {}, {}, { population: 1_000_000 })
  ];
  state.improvements = { queue: [] };
  state.activeLaws = [];
  state.heroes = [];

  const lowGain = getEmpireUnityGainPerTurn(state, 'empire_low');
  const highGain = getEmpireUnityGainPerTurn(state, 'empire_high');

  assert(lowGain > 0, `Expected low-pop empire to have non-zero unity baseline, got ${lowGain}`);
  assert(highGain > lowGain, `Expected high-pop empire baseline (${highGain}) to exceed low-pop baseline (${lowGain})`);
}

function testUnityGainEnhancedByLawsImprovementsAndHeroPopularity() {
  const baselineState = createGameState(654);
  baselineState.empires = [
    createEmpire('empire_hive', 'Synaptic Swarm', 55, {}, {}, { population: 250_000 })
  ];
  baselineState.improvements = {
    queue: [
      {
        id: 'unity_output_only',
        empireId: 'empire_hive',
        state: 'ACTIVE',
        unityOutput: 1.0
      }
    ],
    empireModifiers: {
      empire_hive: {}
    }
  };
  baselineState.activeLaws = [];
  baselineState.heroes = [createHero('hero_baseline', 'empire_hive', 'Baseline Hero')];
  baselineState.heroes[0].meters.popularity = 50;
  baselineState.heroes[0].meters.grievance = 0;

  const baselineGain = getEmpireUnityGainPerTurn(baselineState, 'empire_hive');

  const enhancedState = createGameState(654);
  enhancedState.empires = [
    createEmpire('empire_hive', 'Synaptic Swarm', 55, {}, {}, { population: 250_000 })
  ];
  enhancedState.improvements = {
    queue: [
      {
        id: 'unity_output_plus_mod',
        empireId: 'empire_hive',
        state: 'ACTIVE',
        unityOutput: 1.0
      }
    ],
    empireModifiers: {
      empire_hive: {
        unity_gain_add: 0.4,
        unity_gain_mult: 0.12
      }
    }
  };
  enhancedState.activeLaws = [
    {
      lawId: 'unity_charter',
      modifiers: {
        unity_gain_add: 0.35,
        unity_gain_mult: 0.2
      }
    }
  ];
  enhancedState.heroes = [createHero('hero_enhanced', 'empire_hive', 'Popular Hero')];
  enhancedState.heroes[0].meters.popularity = 92;
  enhancedState.heroes[0].meters.grievance = 5;

  const enhancedGain = getEmpireUnityGainPerTurn(enhancedState, 'empire_hive');
  assert(enhancedGain > baselineGain, `Expected enhanced unity gain (${enhancedGain}) > baseline (${baselineGain})`);

  const lowPopularityState = createGameState(654);
  lowPopularityState.empires = [
    createEmpire('empire_hive', 'Synaptic Swarm', 55, {}, {}, { population: 250_000 })
  ];
  lowPopularityState.improvements = {
    queue: [
      {
        id: 'unity_output_plus_mod_low',
        empireId: 'empire_hive',
        state: 'ACTIVE',
        unityOutput: 1.0
      }
    ],
    empireModifiers: {
      empire_hive: {
        unity_gain_add: 0.4,
        unity_gain_mult: 0.12
      }
    }
  };
  lowPopularityState.activeLaws = [
    {
      lawId: 'unity_charter',
      modifiers: {
        unity_gain_add: 0.35,
        unity_gain_mult: 0.2
      }
    }
  ];
  lowPopularityState.heroes = [createHero('hero_low', 'empire_hive', 'Unpopular Hero')];
  lowPopularityState.heroes[0].meters.popularity = 15;
  lowPopularityState.heroes[0].meters.grievance = 5;

  const lowPopularityGain = getEmpireUnityGainPerTurn(lowPopularityState, 'empire_hive');
  assert(
    enhancedGain > lowPopularityGain,
    `Expected high-popularity unity gain (${enhancedGain}) > low-popularity gain (${lowPopularityGain})`
  );
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

  testPopulationBaselineUnityGeneration();
  console.log('[PASS] Unity generation has a population-based baseline');

  testUnityGainEnhancedByLawsImprovementsAndHeroPopularity();
  console.log('[PASS] Unity generation is enhanced by laws, improvements, and hero popularity');

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
