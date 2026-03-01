#!/usr/bin/env node

/**
 * Test Scourge defense planning.
 * Validates that the target empire sends its own ready armies and that
 * allies only contribute partial detachments when mutual relations are strong.
 */

import { createGameState, createArmy, createEmpire } from '../src/game/types.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';
import { buildScourgeDefensePlan } from '../src/game/turn/battlePhase.js';

function createScourgeParticipationTestState() {
  const state = createGameState(12345);

  state.empires = [
    createEmpire('empire1', 'Target Empire', 60),
    createEmpire('empire2', 'Strong Ally', 70),
    createEmpire('empire3', 'Weak Friend', 55),
    createEmpire('empire4', 'Hostile Empire', 40)
  ];

  state.diplomacy = { relations: {} };
  state.empires.forEach(empire => {
    state.diplomacy.relations[empire.id] = {};
  });

  state.diplomacy.relations.empire1.empire2 = 80;
  state.diplomacy.relations.empire2.empire1 = 80;

  state.diplomacy.relations.empire1.empire3 = 55;
  state.diplomacy.relations.empire3.empire1 = 30;

  state.diplomacy.relations.empire1.empire4 = -50;
  state.diplomacy.relations.empire4.empire1 = -50;

  state.armies = [
    createArmy('army1_1', 'empire1', 'Target Ready Army', 60, 80, 0, 50, 50, 10000),
    createArmy('army1_2', 'empire1', 'Target Broken Army', 60, 20, 0, 50, 50, 10000),
    createArmy('army2_1', 'empire2', 'Ally Spearhead', 70, 65, 0, 50, 50, 10000),
    createArmy('army2_2', 'empire2', 'Ally Reserve', 70, 34, 0, 50, 50, 10000),
    createArmy('army3_1', 'empire3', 'Weak Friend Army', 55, 90, 0, 50, 50, 10000),
    createArmy('army4_1', 'empire4', 'Hostile Army', 40, 90, 0, 50, 50, 10000)
  ];

  state.armies.forEach(army => {
    army.dmgPerUnitMP = 1.0;
    army.dmgPerTickMO = 2.5;
    army.protection = 0.2;
    army.resolve = 0.3;
    army.killRate = 0.1;
  });

  refreshArmyAggregates(state);
  return state;
}

function testScourgeDefensePlanning() {
  console.log('\n=== Test: Scourge Defense Planning ===');

  const state = createScourgeParticipationTestState();
  const { targetEmpire, participantPlans } = buildScourgeDefensePlan(state, 'empire1');

  if (!targetEmpire || targetEmpire.id !== 'empire1') {
    console.log('X Failed to resolve target empire');
    return false;
  }

  const planMap = new Map(participantPlans.map(plan => [plan.armyId, plan]));

  const targetReady = planMap.get('army1_1');
  const targetBroken = planMap.get('army1_2');
  const allySpearhead = planMap.get('army2_1');
  const allyReserve = planMap.get('army2_2');
  const weakFriend = planMap.get('army3_1');
  const hostile = planMap.get('army4_1');

  const checks = [
    {
      label: 'Target ready army commits fully',
      ok: !!targetReady && targetReady.commitRatio === 1 && !targetReady.isSupport
    },
    {
      label: 'Low-organization target army is excluded',
      ok: !targetBroken
    },
    {
      label: 'Strong ally sends a partial detachment',
      ok: !!allySpearhead && Math.abs(allySpearhead.commitRatio - 0.4) < 0.0001 && allySpearhead.isSupport
    },
    {
      label: 'Low-organization ally army is excluded by support threshold',
      ok: !allyReserve
    },
    {
      label: 'One-sided relations do not qualify as mutual support',
      ok: !weakFriend
    },
    {
      label: 'Hostile empire does not assist',
      ok: !hostile
    }
  ];

  checks.forEach(check => {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}`);
  });

  const success = checks.every(check => check.ok);
  if (success) {
    console.log('\nAll scourge defense planning checks passed.');
  } else {
    console.log('\nScourge defense planning checks failed.');
  }

  return success;
}

if (testScourgeDefensePlanning()) {
  process.exit(0);
}

process.exit(1);

