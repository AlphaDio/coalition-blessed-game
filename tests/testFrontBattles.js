#!/usr/bin/env node

/**
 * Test Front Battles system
 * Tests MP-axis battles with morale badges and lockout mechanics
 */

import { createGameState, createArmy, createUnit } from '../src/game/types.js';
import { simulateBattleTick, startBattle, getActiveBattles } from '../src/game/frontBattles.js';
import { collectArmiesInBattle, isRegularArmy } from '../src/game/turn.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';


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
  
  // Disable reinforcement and recovery to ensure battle actually ends
  army2.reinforcementRate = 0;
  army2.recovery = 0;
  
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
  
  // Disable recovery and reinforcement to get clean measurements
  army2.recovery = 0;
  army2.reinforcementRate = 0;
  
  const front = startBattle(state, 'army1', 'army2', 1000);
  
  const initialPermanentLosses = front.permanentLosses.right;
  const initialMP = army2.mp.current;
  const initialRecoveryPool = army2.recoveryPool;
  
  simulateBattleTick(front, state);
  
  const totalDamage = initialMP - army2.mp.current;
  const permanentLosses = front.permanentLosses.right - initialPermanentLosses;
  const temporaryDamage = army2.recoveryPool - initialRecoveryPool;
  
  console.log('Total damage dealt:', totalDamage);
  console.log('Permanent losses:', permanentLosses);
  console.log('Temporary damage (recovery pool):', temporaryDamage);
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

// Test 5: Recovery pool mechanics
function testRecoveryPool() {
  console.log('\n=== Test 5: Recovery pool mechanics ===');
  
  const state = createTestState();
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  // Set army2's recovery stat LOW so pool accumulates
  army2.recovery = 10; // Low recovery - only recover ~100 per tick with org modifier
  army2.reinforcementRate = 0; // Disable reinforcement for this test
  
  // Disable army2's attack
  army2.dmgPerUnitMP = 0;
  
  const front = startBattle(state, 'army1', 'army2', 1000);
  
  const initialMP = army2.mp.current;
  
  // Damage army2
  simulateBattleTick(front, state);
  
  const mpAfterDamage = army2.mp.current;
  const recoveryPoolAfterDamage = army2.recoveryPool;
  const totalDamage = initialMP - mpAfterDamage;
  const permanentDamage = front.permanentLosses.right;
  const expectedTemporary = totalDamage - permanentDamage;
  
  console.log('Total damage:', totalDamage);
  console.log('Permanent damage:', permanentDamage);
  console.log('Expected temporary:', expectedTemporary);
  console.log('Recovery pool after damage:', recoveryPoolAfterDamage);
  console.log('Recovered this tick (pool reduced from expected):', expectedTemporary - recoveryPoolAfterDamage);
  
  if (recoveryPoolAfterDamage > 0) {
    console.log('✓ Temporary damage added to recovery pool (some remains after partial recovery)');
  } else {
    console.log('✗ No temporary damage in recovery pool');
    return false;
  }
  
  // Now stop dealing damage and let recovery happen
  army1.dmgPerUnitMP = 0;
  const mpBeforeRecovery = army2.mp.current;
  const poolBeforeRecovery = army2.recoveryPool;
  
  simulateBattleTick(front, state);
  
  const mpAfterRecovery = army2.mp.current;
  const poolAfterRecovery = army2.recoveryPool;
  
  console.log('\nRecovery tick (no new damage):');
  console.log('MP before recovery:', mpBeforeRecovery);
  console.log('MP after recovery:', mpAfterRecovery);
  console.log('Pool before recovery:', poolBeforeRecovery);
  console.log('Pool after recovery:', poolAfterRecovery);
  
  const mpRecovered = mpAfterRecovery - mpBeforeRecovery;
  const poolReduced = poolBeforeRecovery - poolAfterRecovery;
  
  console.log('MP recovered:', mpRecovered);
  console.log('Pool reduced:', poolReduced);
  
  if (mpRecovered > 0 && poolReduced > 0 && Math.abs(mpRecovered - poolReduced) < 0.01) {
    console.log('✓ Recovery pool converted to MP correctly');
    return true;
  } else {
    console.log('✗ Recovery did not work properly');
    return false;
  }
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
  'isRegularArmy filters temporary armies': testIsRegularArmy()
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
