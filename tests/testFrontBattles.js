#!/usr/bin/env node

/**
 * Test Front Battles system
 * Tests MP-axis battles with morale badges and lockout mechanics
 */

import { createGameState, createArmy, createUnit, createEmpire } from '../src/game/types.js';
import { simulateBattleTick, startBattle, getActiveBattles } from '../src/game/frontBattles.js';
import { collectArmiesInBattle, isRegularArmy } from '../src/game/turn.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';
import { checkInsurrections, selectInsurrectionTargetEmpire } from '../src/game/insurrection.js';
import { INSURRECTION_CONSTANTS } from '../src/game/constants.js';
import { startInsurrectionBattle, handleInsurrectionBattleEnd } from '../src/game/battles.js';
import { triggerInsurrectionBattles } from '../src/game/turn/battlePhase.js';


// Helper to create a test state with two armies
function createTestState() {
  const state = createGameState(12345);
  
  const army1 = createArmy('army1', 'empire1', 'Test Army 1', 50, 60, 50);
  const army2 = createArmy('army2', 'empire2', 'Test Army 2', 50, 60, 50);
  
  army1.unitIds = ['unit_army1'];
  army2.unitIds = ['unit_army2'];
  state.armies = [army1, army2];
  state.units = [
    createUnit('unit_army1', 'army1', 'empire1', 'Test Unit 1'),
    createUnit('unit_army2', 'army2', 'empire2', 'Test Unit 2')
  ];
  state.turn = 1;
  refreshArmyAggregates(state);
  
  return state;
}

// Test 1: Morale regen stops after hitting 0
function testMoraleRegenStops() {
  console.log('\n=== Test 1: Morale regen stops after hitting 0 ===');
  
  const state = createTestState();
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  // Set army2 to have very low morale
  army2.mo.current = 1;
  
  // Make army1 deal high morale damage
  army1.dmgPerTickMO = 100;
  
  // Start battle
  const front = startBattle(state, 'army1', 'army2', 1000);
  
  // Simulate one tick - should break army2's morale
  console.log('Before tick: Army2 MO =', army2.mo.current, 'Broken =', front.moraleBroken.right);
  simulateBattleTick(front, state);
  console.log('After tick 1: Army2 MO =', army2.mo.current, 'Broken =', front.moraleBroken.right);
  
  if (army2.mo.current <= 0 && front.moraleBroken.right) {
    console.log('✓ Morale broke as expected');
  } else {
    console.log('✗ Morale did not break');
    return false;
  }
  
  // Simulate more ticks - morale should NOT recover WHILE BATTLE IS ACTIVE
  const moraleBefore = army2.mo.current;
  let ticksWhileActive = 0;
  for (let i = 0; i < 10; i++) {
    if (front.state === 'ENDED') break;
    simulateBattleTick(front, state);
    ticksWhileActive++;
  }
  
  console.log('After', ticksWhileActive, 'more ticks (battle active): Army2 MO =', army2.mo.current, 'Broken =', front.moraleBroken.right);
  console.log('Battle state:', front.state);
  
  // If battle ended, morale refills (that's expected behavior)
  if (front.state === 'ENDED') {
    console.log('✓ Battle ended (army shattered), morale refill is expected');
    return true;
  }
  
  if (army2.mo.current === moraleBefore && front.moraleBroken.right) {
    console.log('✓ Morale did NOT regenerate while broken');
    return true;
  } else {
    console.log('✗ Morale regenerated while broken (should not happen)');
    return false;
  }
}

// Test 2: Morale refills fully after battle ends
function testMoraleRefillsAfterBattle() {
  console.log('\n=== Test 2: Morale refills fully after battle ends ===');
  
  const state = createTestState();
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  // Set army2 to have low MP so battle ends quickly
  army2.mp.current = 500;
  army2.mp.max = 500;
  army2.mo.current = 50; // Partially damaged morale
  
  // Disable reinforcement so battle can end (no reserves joining during battle)
  army2.reinforcementRate = 0;
  
  // Make army1 strong enough to win
  army1.dmgPerUnitMP = 50;
  
  // Start battle
  const front = startBattle(state, 'army1', 'army2', 1000);
  
  const moraleBefore = army2.mo.current;
  console.log('Before battle end: Army2 MO =', moraleBefore, '/', army2.mo.max);
  
  // Simulate until battle ends
  let ticks = 0;
  const maxTicks = 100;
  while (front.state === 'ACTIVE' && ticks < maxTicks) {
    simulateBattleTick(front, state);
    ticks++;
  }
  
  console.log('Battle ended after', ticks, 'ticks, state:', front.state);
  console.log('After battle end: Army2 MO =', army2.mo.current, '/', army2.mo.max);
  console.log('Army2 MP =', army2.mp.current, '/', army2.mp.max);
  
  if (front.state === 'ENDED' && army2.mo.current === army2.mo.max) {
    console.log('✓ Morale refilled to max after battle ended');
    return true;
  } else if (front.state !== 'ENDED') {
    console.log('✗ Battle did not end (likely infinite due to reinforcement)');
    return false;
  } else {
    console.log('✗ Morale did not refill to max');
    return false;
  }
}

// Test 3: Battlefield size impacts MP damage throughput
function testBattlefieldSizeImpact() {
  console.log('\n=== Test 3: Battlefield size impacts MP damage throughput ===');
  
  // Test with small battlefield
  const state1 = createTestState();
  const army1a = state1.armies[0];
  const army2a = state1.armies[1];
  
  const smallField = 500;
  const front1 = startBattle(state1, 'army1', 'army2', smallField);
  
  const army2InitialMP = army2a.mp.current;
  simulateBattleTick(front1, state1);
  const damageLowWidth = army2InitialMP - army2a.mp.current;
  
  console.log('Small battlefield (', smallField, '): Damage dealt =', damageLowWidth);
  
  // Test with large battlefield
  const state2 = createTestState();
  const army1b = state2.armies[0];
  const army2b = state2.armies[1];
  
  const largeField = 2000;
  const front2 = startBattle(state2, 'army1', 'army2', largeField);
  
  const army2bInitialMP = army2b.mp.current;
  simulateBattleTick(front2, state2);
  const damageHighWidth = army2bInitialMP - army2b.mp.current;
  
  console.log('Large battlefield (', largeField, '): Damage dealt =', damageHighWidth);
  
  if (damageHighWidth > damageLowWidth) {
    console.log('✓ Larger battlefield resulted in more damage (', damageHighWidth, '>', damageLowWidth, ')');
    return true;
  } else {
    console.log('✗ Battlefield size did not affect damage properly');
    return false;
  }
}

// Test 4: killRate moves a fraction of MP damage into permanent losses
function testKillRatePermanentLosses() {
  console.log('\n=== Test 4: killRate moves fraction to permanent losses ===');
  
  const state = createTestState();
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  // Set known killRate
  army1.killRate = 0.2; // 20% of damage becomes permanent
  
  // Disable army2 attack to avoid mutual damage
  army2.dmgPerUnitMP = 0;
  
  // Disable reinforcement for clean measurements
  army2.reinforcementRate = 0;
  
  const front = startBattle(state, 'army1', 'army2', 1000);
  
  const initialPermanentLosses = front.permanentLosses.right;
  const initialMP = army2.mp.current;
  const initialWoundedPool = army2.woundedPool ?? 0;
  
  simulateBattleTick(front, state);
  
  const totalDamage = initialMP - army2.mp.current;
  const permanentLosses = front.permanentLosses.right - initialPermanentLosses;
  const temporaryDamage = (army2.woundedPool ?? 0) - initialWoundedPool;
  
  console.log('Total damage dealt:', totalDamage);
  console.log('Permanent losses:', permanentLosses);
  console.log('Temporary damage (wounded pool):', temporaryDamage);
  console.log('Sum (perm + temp):', permanentLosses + temporaryDamage);
  console.log('Kill rate ratio:', (permanentLosses / totalDamage).toFixed(2), '(expected ~0.20-0.28)');
  
  // Check if ratio is close to expected killRate (0.2 + fervor bonus up to 0.025)
  const ratio = permanentLosses / totalDamage;
  if (ratio >= 0.20 && ratio <= 0.28) {
    console.log('✓ killRate properly affects permanent losses');
    return true;
  } else {
    console.log('✗ killRate ratio out of expected range');
    return false;
  }

}

// Test 5: Wounded pool mechanics (no during-battle recovery; wounded returned after battle)
function testRecoveryPool() {
  console.log('\n=== Test 5: Wounded pool mechanics ===');
  
  const state = createTestState();
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  army1.reinforcementRate = 0;
  army2.reinforcementRate = 0;
  army2.dmgPerUnitMP = 0;
  const recoveryArmy1DamagePerUnitMP = army1.dmgPerUnitMP;

  const front = startBattle(state, 'army1', 'army2', 1000);
  const initialMP = army2.mp.current;

  simulateBattleTick(front, state);

  const mpAfterDamage = army2.mp.current;
  const woundedPoolAfterDamage = army2.woundedPool ?? 0;
  const totalDamage = initialMP - mpAfterDamage;
  const permanentDamage = front.permanentLosses.right;
  const expectedTemporary = totalDamage - permanentDamage;

  if (woundedPoolAfterDamage <= 0 && expectedTemporary > 0) {
    console.log('✗ Temporary damage not in wounded pool');
    return false;
  }
  console.log('✓ Temporary damage added to wounded pool (wounded retired from battle)');

  army1.dmgPerUnitMP = 0;
  const mpBeforeTick = army2.mp.current;
  const poolBeforeTick = army2.woundedPool ?? 0;
  simulateBattleTick(front, state);
  const mpAfterTick = army2.mp.current;
  const poolAfterTick = army2.woundedPool ?? 0;
  
  if (mpAfterTick !== mpBeforeTick || Math.abs((poolAfterTick || 0) - (poolBeforeTick || 0)) > 0.01) {
    console.log('✗ Wounded should not return to the line during battle (no during-battle recovery)');
    return false;
  }
  console.log('✓ Wounded stay in pool during battle (no reinforcement from pool)');

  army1.dmgPerUnitMP = recoveryArmy1DamagePerUnitMP;
  
  let endTicks = 0;
  const maxEndTicks = 200;
  while (front.state !== 'ENDED' && (army1.mp.current > 0 && army2.mp.current > 0) && endTicks < maxEndTicks) {
    simulateBattleTick(front, state);
    endTicks++;
  }
  if (front.state !== 'ENDED') {
    console.log('✗ Battle did not end within ' + maxEndTicks + ' ticks');
    return false;
  }
  if ((army1.woundedPool ?? 0) !== 0 || (army2.woundedPool ?? 0) !== 0) {
    console.log('✗ Wounded pool should be 0 after battle (wounded returned to army)');
    return false;
  }
  console.log('✓ Wounded returned to armies after battle');
  return true;
}

// Test 6: collectArmiesInBattle tracks all active participants
function testCollectArmiesInBattle() {
  console.log('\n=== Test 6: collectArmiesInBattle tracks all active participants ===');

  const activeBattles = [
    {
      leftArmyId: 'left-1',
      rightArmyId: 'right-1',
      participatingArmyIds: ['combined-1', 'combined-2'],
      rebelliousArmyIds: ['rebel-1'],
      loyalArmyIds: ['loyal-1', 'loyal-2']
    },
    {
      leftArmyId: 'left-2',
      rightArmyId: 'right-2'
    }
  ];

  const armiesInBattle = collectArmiesInBattle(activeBattles);
  const expectedIds = [
    'left-1',
    'right-1',
    'combined-1',
    'combined-2',
    'rebel-1',
    'loyal-1',
    'loyal-2',
    'left-2',
    'right-2'
  ];

  const missingIds = expectedIds.filter(id => !armiesInBattle.has(id));
  if (missingIds.length === 0) {
    console.log('✓ collectArmiesInBattle captured all active armies');
    return true;
  }

  console.log('✗ collectArmiesInBattle missing ids:', missingIds.join(', '));
  return false;
}

// Test 7: isRegularArmy excludes temporary armies
function testIsRegularArmy() {
  console.log('\n=== Test 7: isRegularArmy excludes temporary armies ===');

  const regular = { id: 'army-1' };
  const scourge = { id: '_scourge_1' };
  const combined = { id: '_coalition_combined_2' };
  const insurrection = { id: '_insurrection_3' };

  if (!isRegularArmy(regular)) {
    console.log('✗ Regular army flagged as temporary');
    return false;
  }

  const temporaryFlags = [
    isRegularArmy(scourge),
    isRegularArmy(combined),
    isRegularArmy(insurrection)
  ];

  if (temporaryFlags.every(flag => flag === false)) {
    console.log('✓ isRegularArmy excludes temporary armies');
    return true;
  }

  console.log('✗ isRegularArmy allowed temporary armies');
  return false;
}

// Test 8: Rebellion resets aggravation to prevent immediate retrigger
function testInsurrectionResetsAggravation() {
  console.log('\n=== Test 8: Rebellion resets aggravation ===');

  const state = createGameState(12345);
  state.turn = 42;
  state.insurrections = [];
  state.armies = [
    createArmy('army1', 'empire1', 'Aggravated Army', 50, 60, INSURRECTION_CONSTANTS.THRESHOLD + 5)
  ];

  checkInsurrections(state);

  const army = state.armies[0];
  const hasInsurrection = state.insurrections.length === 1;
  const resetApplied = army.aggravation === INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION;

  if (hasInsurrection && resetApplied) {
    console.log('✓ Insurrection spawned and aggravation reset');
    return true;
  }

  console.log('✗ Insurrection/aggravation reset behavior is incorrect');
  return false;
}

// Test 9: Low approval alone should not trigger insurrections
function testLowApprovalDoesNotTriggerInsurrection() {
  console.log('\n=== Test 9: Low approval alone does not trigger insurrection ===');

  const state = createGameState(12345);
  state.turn = 1;
  state.insurrections = [];
  state.empires = [createEmpire('empire1', 'Low Approval Empire', 0)];
  state.armies = [
    createArmy('army1', 'empire1', 'Calm Army', 50, 60, INSURRECTION_CONSTANTS.THRESHOLD - 1)
  ];

  checkInsurrections(state);

  if (state.insurrections.length === 0) {
    console.log('✓ No insurrection triggered from low approval when aggravation is below threshold');
    return true;
  }

  console.log('✗ Insurrection should not trigger from approval alone');
  return false;
}

// Test 10: Rebellion victory still resolves insurrection and resets aggravation
function testRebellionVictoryResetsAndResolves() {
  console.log('\n=== Test 10: Rebellion victory resolves/reset ===');

  const state = createGameState(12345);
  state.turn = 7;
  state.empires = [
    createEmpire('empire1', 'Rebel Empire', 60),
    createEmpire('empire2', 'Loyal Empire', 60)
  ];

  const rebelliousArmy = createArmy('rebel_army', 'empire1', 'Rebel Army', 60, 60, INSURRECTION_CONSTANTS.THRESHOLD + 10, 50, 50, 5000);
  const loyalArmy = createArmy('loyal_army', 'empire2', 'Loyal Army', 60, 60, 10, 50, 50, 6000);
  state.armies = [rebelliousArmy, loyalArmy];
  state.insurrections = [{ id: 'insurrection_7', armies: ['rebel_army'], active: true }];

  const { front } = startInsurrectionBattle(state, state.insurrections[0], [loyalArmy], () => 0.5);
  if (!front) {
    console.log('✗ Failed to create insurrection battle front');
    return false;
  }

  handleInsurrectionBattleEnd(state, front, 'right');

  const insurrection = state.insurrections.find(ins => ins.id === 'insurrection_7');
  const rebelAfter = state.armies.find(a => a.id === 'rebel_army');

  if (!insurrection || insurrection.active) {
    console.log('✗ Insurrection should resolve even on rebellion victory');
    return false;
  }
  if (!rebelAfter || rebelAfter.aggravation !== INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION) {
    console.log('✗ Rebellious army aggravation was not reset after rebellion victory');
    return false;
  }

  console.log('✓ Rebellion victory resolves insurrection and resets aggravation');
  return true;
}

// Test 11: Empire military modifiers from improvements and tech increase battle damage
function testEmpireMilitaryModifiersIncreaseDamage() {
  console.log('\n=== Test 11: Empire military modifiers increase battle damage ===');

  const baseline = createGameState(12345);
  baseline.turn = 1;
  baseline.empires = [
    createEmpire('empire1', 'Attacker', 60),
    createEmpire('empire2', 'Defender', 60)
  ];
  baseline.armies = [
    createArmy('army1', 'empire1', 'Attacker Army', 60, 70, 0, 50, 50, 4000),
    createArmy('army2', 'empire2', 'Defender Army', 60, 70, 0, 50, 50, 4000)
  ];
  baseline.units = [];
  baseline.armies[0].reinforcementRate = 0;
  baseline.armies[1].reinforcementRate = 0;
  baseline.armies[1].dmgPerUnitMP = 0;
  baseline.improvements = { empireModifiers: {} };

  const baselineFront = startBattle(baseline, 'army1', 'army2', 1000);
  const baselineInitialMP = baseline.armies[1].mp.current;
  simulateBattleTick(baselineFront, baseline);
  const baselineDamage = baselineInitialMP - baseline.armies[1].mp.current;

  const boosted = createGameState(12345);
  boosted.turn = 1;
  boosted.empires = [
    createEmpire('empire1', 'Attacker', 60),
    createEmpire('empire2', 'Defender', 60)
  ];
  boosted.empires[0].techModifiers = { army_damage_mult: 0.2 };
  boosted.armies = [
    createArmy('army1', 'empire1', 'Attacker Army', 60, 70, 0, 50, 50, 4000),
    createArmy('army2', 'empire2', 'Defender Army', 60, 70, 0, 50, 50, 4000)
  ];
  boosted.units = [];
  boosted.armies[0].reinforcementRate = 0;
  boosted.armies[1].reinforcementRate = 0;
  boosted.armies[1].dmgPerUnitMP = 0;
  boosted.armies[0].consumptionDamageAdd = 0.1;
  boosted.improvements = {
    empireModifiers: {
      empire1: { army_damage_add: 0.15 }
    }
  };

  const boostedFront = startBattle(boosted, 'army1', 'army2', 1000);
  const boostedInitialMP = boosted.armies[1].mp.current;
  simulateBattleTick(boostedFront, boosted);
  const boostedDamage = boostedInitialMP - boosted.armies[1].mp.current;

  console.log('Baseline damage:', baselineDamage.toFixed(2));
  console.log('Boosted damage:', boostedDamage.toFixed(2));

  if (boostedDamage > baselineDamage) {
    console.log('âœ“ Improvement, tech, and army scaling modifiers all increase battle damage');
    return true;
  }

  console.log('âœ— Military modifiers did not increase battle damage');
  return false;
}

// Test 12: Insurrections target the empire they hate most
function testInsurrectionTargetingUsesRelations() {
  console.log('\n=== Test 12: Insurrection targeting uses hostile relations ===');

  const state = createGameState(12345);
  state.empires = [
    createEmpire('empire1', 'Rebel Empire', 60),
    createEmpire('empire2', 'Hated Empire', 60),
    createEmpire('empire3', 'Tolerated Empire', 60)
  ];
  state.armies = [
    createArmy('rebel_army', 'empire1', 'Rebel Army', 60, 60, INSURRECTION_CONSTANTS.THRESHOLD + 5)
  ];
  state.diplomacy = {
    relations: {
      empire1: { empire2: -80, empire3: 60 },
      empire2: { empire1: -40, empire3: 0 },
      empire3: { empire1: 10, empire2: 0 }
    }
  };

  checkInsurrections(state);
  const targetEmpireId = selectInsurrectionTargetEmpire(state, state.insurrections[0], () => 0.4);

  if (targetEmpireId === 'empire2') {
    console.log('âœ“ Rebellion targets the most hated empire');
    return true;
  }

  console.log('âœ— Rebellion did not target the most hated empire');
  return false;
}

// Test 13: Insurrection battles only pull in the targeted empire
function testInsurrectionOnlyTargetsSingleEmpire() {
  console.log('\n=== Test 13: Insurrection only targets one empire ===');

  const state = createGameState(12345);
  state.empires = [
    createEmpire('empire1', 'Rebel Empire', 60),
    createEmpire('empire2', 'Target Empire', 60),
    createEmpire('empire3', 'Bystander Empire', 60)
  ];
  const rebelArmy = createArmy('rebel_army', 'empire1', 'Rebel Army', 60, 60, INSURRECTION_CONSTANTS.THRESHOLD + 10, 50, 50, 5000);
  const targetArmy = createArmy('target_army', 'empire2', 'Target Army', 60, 65, 10, 50, 50, 6000);
  const bystanderArmy = createArmy('bystander_army', 'empire3', 'Bystander Army', 60, 70, 10, 50, 50, 7000);
  state.armies = [rebelArmy, targetArmy, bystanderArmy];
  state.diplomacy = {
    relations: {
      empire1: { empire2: -90, empire3: 40 },
      empire2: { empire1: -60, empire3: 0 },
      empire3: { empire1: 10, empire2: 0 }
    }
  };

  checkInsurrections(state);
  const log = [];
  const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
  triggerInsurrectionBattles(state, () => 0.2, [], log, silentLogger);

  const front = (state.battleFronts || []).find(entry => entry.isInsurrectionBattle);
  if (!front) {
    console.log('âœ— No insurrection battle was created');
    return false;
  }

  const onlyTargetedEmpireResponded =
    front.targetEmpireId === 'empire2' &&
    front.loyalArmyIds.length === 1 &&
    front.loyalArmyIds[0] === 'target_army' &&
    !front.loyalArmyIds.includes('bystander_army');

  if (onlyTargetedEmpireResponded) {
    console.log('âœ“ Only the targeted empire defended against the insurrection');
    return true;
  }

  console.log('âœ— Insurrection still pulled in non-target empires');
  return false;
}

// Run all tests
console.log('='.repeat(60));
console.log('Front Battles Test Suite');
console.log('='.repeat(60));

const results = {
  'Morale regen stops after hitting 0': testMoraleRegenStops(),
  'Morale refills fully after battle ends': testMoraleRefillsAfterBattle(),
  'Battlefield size impacts MP damage': testBattlefieldSizeImpact(),
  'killRate creates permanent losses': testKillRatePermanentLosses(),
  'Recovery pool mechanics': testRecoveryPool(),
  'collectArmiesInBattle includes all participants': testCollectArmiesInBattle(),
  'isRegularArmy filters temporary armies': testIsRegularArmy(),
  'Insurrection resets aggravation after rebellion': testInsurrectionResetsAggravation(),
  'Low approval does not trigger insurrection': testLowApprovalDoesNotTriggerInsurrection(),
  'Rebellion victory resolves and resets': testRebellionVictoryResetsAndResolves(),
  'Empire military modifiers increase damage': testEmpireMilitaryModifiersIncreaseDamage(),
  'Insurrection targeting uses hostile relations': testInsurrectionTargetingUsesRelations(),
  'Insurrection only targets one empire': testInsurrectionOnlyTargetsSingleEmpire()
};


console.log('\n' + '='.repeat(60));
console.log('Test Results Summary');
console.log('='.repeat(60));

let allPassed = true;
Object.entries(results).forEach(([name, passed]) => {
  console.log(`${passed ? '✓' : '✗'} ${name}`);
  if (!passed) allPassed = false;
});

console.log('='.repeat(60));
if (allPassed) {
  console.log('✓ ALL TESTS PASSED');
} else {
  console.log('✗ SOME TESTS FAILED');
  process.exit(1);
}
console.log('='.repeat(60));
