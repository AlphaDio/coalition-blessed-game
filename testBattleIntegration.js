#!/usr/bin/env node

/**
 * Integration Tests for Battle System
 * Tests the full battle flow including:
 * - Scourge army and unit creation
 * - Coalition vs Scourge battles
 * - Battle end handling and cohesion changes
 * - Unit sync after battles
 * - Insurrection battles
 */

import { createGameState, createArmy, createUnit, createEmpire } from './src/game/types.js';
import { startScourgeBattle, handleScourgeBattleEnd, startInsurrectionBattle, handleInsurrectionBattleEnd } from './src/game/battles.js';
import { simulateBattleTick, getActiveBattles } from './src/game/frontBattles.js';
import { refreshArmyAggregates, syncUnitsFromArmy } from './src/game/armyComposition.js';

// Helper to create a full test state with empires, armies, and units
function createFullTestState(seed = 12345) {
  const state = createGameState(seed);
  
  // Create empires
  state.empires = [
    createEmpire('empire1', 'Empire One', 60),
    createEmpire('empire2', 'Empire Two', 55)
  ];
  
  // Create armies with units
  const army1 = createArmy('army1', 'empire1', 'First Legion', 60, 70, 0);
  const army2 = createArmy('army2', 'empire2', 'Second Legion', 55, 65, 0);
  
  army1.unitIds = ['unit_army1'];
  army2.unitIds = ['unit_army2'];
  
  state.armies = [army1, army2];
  state.units = [
    createUnit('unit_army1', 'army1', 'empire1', 'First Legion Infantry', {
      mp: { current: 10000, max: 10000 },
      mo: { current: 100, max: 100 }
    }),
    createUnit('unit_army2', 'army2', 'empire2', 'Second Legion Infantry', {
      mp: { current: 10000, max: 10000 },
      mo: { current: 100, max: 100 }
    })
  ];
  
  state.turn = 1;
  state.scourgeFervor = 10;
  state.coalitionCohesion = 75;
  state.scourgeCohesion = 80;
  
  refreshArmyAggregates(state);
  
  return state;
}

// Test 1: Scourge army creation includes unit
function testScourgeArmyCreation() {
  console.log('\n=== Test 1: Scourge army creation includes unit ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // Start a Scourge battle - this should create the Scourge army and unit
  const { front } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  // Check Scourge army was created
  const scourgeArmy = state.armies.find(a => a.id.startsWith('_scourge_army'));
  if (!scourgeArmy) {
    console.log('✗ Scourge army was not created');
    return false;
  }
  console.log('✓ Scourge army created:', scourgeArmy.name);
  
  // Check Scourge army has unitIds
  if (!scourgeArmy.unitIds || scourgeArmy.unitIds.length === 0) {
    console.log('✗ Scourge army has no unitIds');
    return false;
  }
  console.log('✓ Scourge army has unitIds:', scourgeArmy.unitIds);
  
  // Check Scourge unit was created
  const scourgeUnit = state.units.find(u => u.id.startsWith('_scourge_unit'));
  if (!scourgeUnit) {
    console.log('✗ Scourge unit was not created');
    return false;
  }
  console.log('✓ Scourge unit created:', scourgeUnit.name);
  
  // Check unit stats match army stats
  const statsMatch = 
    scourgeUnit.dmgPerUnitMP === scourgeArmy.dmgPerUnitMP &&
    scourgeUnit.protection === scourgeArmy.protection &&
    scourgeUnit.resolve === scourgeArmy.resolve;
  
  if (!statsMatch) {
    console.log('✗ Scourge unit stats do not match army stats');
    console.log('  Unit dmgPerUnitMP:', scourgeUnit.dmgPerUnitMP, 'Army:', scourgeArmy.dmgPerUnitMP);
    return false;
  }
  console.log('✓ Scourge unit stats match army stats');
  
  // Check MP matches
  if (scourgeUnit.mp.max !== scourgeArmy.mp.max) {
    console.log('✗ Scourge unit MP does not match army MP');
    return false;
  }
  console.log('✓ Scourge unit MP matches army MP:', scourgeUnit.mp.max);
  
  return true;
}

// Test 2: Scourge army stats scale with turns
function testScourgeStatsScaling() {
  console.log('\n=== Test 2: Scourge army stats scale with turns ===');
  
  // Test at turn 1
  const state1 = createFullTestState();
  state1.turn = 1;
  const armies1 = state1.armies.filter(a => a.organization > 30);
  startScourgeBattle(state1, armies1, () => 0.5);
  const scourge1 = state1.armies.find(a => a.id.startsWith('_scourge_army'));
  
  // Test at turn 10
  const state2 = createFullTestState();
  state2.turn = 10;
  const armies2 = state2.armies.filter(a => a.organization > 30);
  startScourgeBattle(state2, armies2, () => 0.5);
  const scourge2 = state2.armies.find(a => a.id.startsWith('_scourge_army'));
  
  console.log('Turn 1 - dmgPerUnitMP:', scourge1.dmgPerUnitMP.toFixed(3), 'MP:', scourge1.mp.max);
  console.log('Turn 10 - dmgPerUnitMP:', scourge2.dmgPerUnitMP.toFixed(3), 'MP:', scourge2.mp.max);
  
  if (scourge2.dmgPerUnitMP > scourge1.dmgPerUnitMP) {
    console.log('✓ Scourge damage scales with turns');
  } else {
    console.log('✗ Scourge damage does not scale');
    return false;
  }
  
  if (scourge2.mp.max > scourge1.mp.max) {
    console.log('✓ Scourge MP scales with turns');
  } else {
    console.log('✗ Scourge MP does not scale');
    return false;
  }
  
  // Check unit also scaled
  const scourgeUnit2 = state2.units.find(u => u.id.startsWith('_scourge_unit'));
  if (scourgeUnit2.dmgPerUnitMP === scourge2.dmgPerUnitMP) {
    console.log('✓ Scourge unit stats also scaled');
  } else {
    console.log('✗ Scourge unit stats did not scale');
    return false;
  }
  
  return true;
}

// Test 3: Coalition combined army aggregates stats from participating armies
function testCoalitionCombinedArmy() {
  console.log('\n=== Test 3: Coalition combined army aggregates stats ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // Get combined MP before battle
  const totalMP = participatingArmies.reduce((sum, a) => sum + a.mp.current, 0);
  
  const { front } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  // Find the combined coalition army
  const combinedArmy = state.armies.find(a => a.id.startsWith('_coalition_combined'));
  
  if (!combinedArmy) {
    console.log('✗ Combined coalition army was not created');
    return false;
  }
  console.log('✓ Combined coalition army created:', combinedArmy.name);
  
  // Check MP is aggregated
  if (Math.abs(combinedArmy.mp.current - totalMP) < 1) {
    console.log('✓ Combined army MP matches total:', combinedArmy.mp.current);
  } else {
    console.log('✗ Combined army MP mismatch. Expected:', totalMP, 'Got:', combinedArmy.mp.current);
    return false;
  }
  
  // Check original armies are tracked
  if (combinedArmy._originalArmies && combinedArmy._originalArmies.length === participatingArmies.length) {
    console.log('✓ Original armies tracked:', combinedArmy._originalArmies.length);
  } else {
    console.log('✗ Original armies not tracked properly');
    return false;
  }
  
  // Check original unit IDs are tracked
  const expectedUnitIds = participatingArmies.flatMap(a => a.unitIds || []);
  if (combinedArmy._originalUnitIds && combinedArmy._originalUnitIds.length === expectedUnitIds.length) {
    console.log('✓ Original unit IDs tracked:', combinedArmy._originalUnitIds.length);
  } else {
    console.log('✗ Original unit IDs not tracked properly');
    return false;
  }
  
  return true;
}

// Test 4: Full battle simulation until one side wins
function testFullBattleSimulation() {
  console.log('\n=== Test 4: Full battle simulation ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  const initialCoalitionCohesion = state.coalitionCohesion;
  const initialScourgeCohesion = state.scourgeCohesion;
  
  const { front } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  console.log('Battle started:', front.id);
  console.log('Coalition MP:', state.armies.find(a => a.id === front.leftArmyId)?.mp.current);
  console.log('Scourge MP:', state.armies.find(a => a.id === front.rightArmyId)?.mp.current);
  
  // Simulate battle ticks until it ends
  let ticks = 0;
  const maxTicks = 500;
  
  while (front.state === 'ACTIVE' && ticks < maxTicks) {
    simulateBattleTick(front, state);
    ticks++;
  }
  
  if (front.state !== 'ENDED') {
    console.log('✗ Battle did not end after', maxTicks, 'ticks');
    return false;
  }
  console.log('✓ Battle ended after', ticks, 'ticks');
  
  // Determine winner
  const coalitionArmy = state.armies.find(a => a.id === front.leftArmyId);
  const scourgeArmy = state.armies.find(a => a.id === front.rightArmyId);
  
  const coalitionWon = coalitionArmy && coalitionArmy.mp.current > 0;
  const winnerSide = coalitionWon ? 'left' : 'right';
  
  console.log('Winner:', coalitionWon ? 'Coalition' : 'Scourge');
  console.log('Coalition remaining MP:', coalitionArmy?.mp.current || 0);
  console.log('Scourge remaining MP:', scourgeArmy?.mp.current || 0);
  console.log('Permanent losses - Coalition:', front.permanentLosses.left, 'Scourge:', front.permanentLosses.right);
  
  // Handle battle end
  const result = handleScourgeBattleEnd(state, front, winnerSide);
  
  // Check cohesion changes
  if (coalitionWon) {
    if (state.scourgeCohesion < initialScourgeCohesion) {
      console.log('✓ Scourge cohesion decreased:', initialScourgeCohesion, '->', state.scourgeCohesion);
    } else {
      console.log('✗ Scourge cohesion did not decrease after Coalition victory');
      return false;
    }
  } else {
    if (state.coalitionCohesion < initialCoalitionCohesion) {
      console.log('✓ Coalition cohesion decreased:', initialCoalitionCohesion, '->', state.coalitionCohesion);
    } else {
      console.log('✗ Coalition cohesion did not decrease after Scourge victory');
      return false;
    }
  }
  
  return true;
}

// Test 5: Unit sync after battle distributes damage
function testUnitSyncAfterBattle() {
  console.log('\n=== Test 5: Unit sync after battle ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // Record initial unit MP
  const initialUnitMP = {};
  state.units.forEach(u => {
    initialUnitMP[u.id] = u.mp.current;
  });
  
  const { front } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  // Simulate some battle ticks to cause damage
  for (let i = 0; i < 10; i++) {
    if (front.state === 'ACTIVE') {
      simulateBattleTick(front, state);
    }
  }
  
  // Get the combined army
  const combinedArmy = state.armies.find(a => a.id === front.leftArmyId);
  if (!combinedArmy) {
    console.log('✗ Combined army not found');
    return false;
  }
  
  // Calculate damage ratio
  const damageRatio = combinedArmy.mp.max > 0 
    ? (combinedArmy.mp.max - combinedArmy.mp.current) / combinedArmy.mp.max 
    : 0;
  console.log('Coalition damage ratio:', (damageRatio * 100).toFixed(1) + '%');
  
  // Get original unit IDs
  const originalUnitIds = combinedArmy._originalUnitIds || [];
  const coalitionUnits = state.units.filter(u => originalUnitIds.includes(u.id));
  
  // Sync damage to units
  syncUnitsFromArmy(combinedArmy, coalitionUnits);
  
  // Check units received damage proportionally
  let allUnitsUpdated = true;
  coalitionUnits.forEach(unit => {
    const initialMP = initialUnitMP[unit.id];
    const currentMP = unit.mp.current;
    const expectedMP = unit.mp.max * (1 - damageRatio);
    
    console.log(`Unit ${unit.id}: ${initialMP} -> ${currentMP.toFixed(0)} (expected ~${expectedMP.toFixed(0)})`);
    
    if (Math.abs(currentMP - expectedMP) > 1) {
      allUnitsUpdated = false;
    }
  });
  
  if (allUnitsUpdated) {
    console.log('✓ Units received proportional damage');
  } else {
    console.log('✗ Unit damage distribution incorrect');
    return false;
  }
  
  return true;
}

// Test 6: Scourge unit persists and updates across battles
function testScourgeUnitPersistence() {
  console.log('\n=== Test 6: Scourge unit persists across battles ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // First battle
  const { front: front1 } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  const scourgeUnit1 = state.units.find(u => u.id.startsWith('_scourge_unit'));
  const initialMP = scourgeUnit1.mp.max;
  console.log('First battle - Scourge unit MP:', initialMP);
  
  // Simulate and end first battle quickly
  for (let i = 0; i < 100 && front1.state === 'ACTIVE'; i++) {
    simulateBattleTick(front1, state);
  }
  
  // Advance turns
  state.turn = 10;
  
  // Clean up old combined army
  state.armies = state.armies.filter(a => !a.id.startsWith('_coalition_combined'));
  
  // Second battle at later turn
  const { front: front2 } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  const scourgeUnit2 = state.units.find(u => u.id.startsWith('_scourge_unit'));
  const updatedMP = scourgeUnit2.mp.max;
  console.log('Second battle (turn 10) - Scourge unit MP:', updatedMP);
  
  // Only one Scourge unit should exist
  const scourgeUnits = state.units.filter(u => u.id.startsWith('_scourge_unit'));
  if (scourgeUnits.length !== 1) {
    console.log('✗ Multiple Scourge units exist:', scourgeUnits.length);
    return false;
  }
  console.log('✓ Only one Scourge unit exists');
  
  // Stats should have scaled
  if (updatedMP > initialMP) {
    console.log('✓ Scourge unit MP scaled from', initialMP, 'to', updatedMP);
  } else {
    console.log('✗ Scourge unit MP did not scale');
    return false;
  }
  
  return true;
}

// Test 7: Insurrection battle creates proper combined armies
function testInsurrectionBattle() {
  console.log('\n=== Test 7: Insurrection battle ===');
  
  const state = createFullTestState();
  
  // Add a third army to be rebellious
  const rebelliousArmy = createArmy('army3', 'empire1', 'Rebel Legion', 80, 50, 90);
  rebelliousArmy.unitIds = ['unit_army3'];
  state.armies.push(rebelliousArmy);
  state.units.push(createUnit('unit_army3', 'army3', 'empire1', 'Rebel Infantry', {
    mp: { current: 8000, max: 8000 },
    mo: { current: 100, max: 100 }
  }));
  
  refreshArmyAggregates(state);
  
  // Create insurrection
  const insurrection = {
    id: 'insurrection_1',
    armies: ['army3'],
    active: true
  };
  state.insurrections = [insurrection];
  
  // Loyal armies oppose the insurrection
  const loyalArmies = state.armies.filter(a => a.id !== 'army3' && !a.id.startsWith('_'));
  
  const { front } = startInsurrectionBattle(state, insurrection, loyalArmies, () => 0.5);
  
  if (!front) {
    console.log('✗ Insurrection battle front not created');
    return false;
  }
  console.log('✓ Insurrection battle started:', front.id);
  
  // Check both combined armies exist
  const loyalCombined = state.armies.find(a => a.id === front.leftArmyId);
  const rebelliousCombined = state.armies.find(a => a.id === front.rightArmyId);
  
  if (!loyalCombined || !rebelliousCombined) {
    console.log('✗ Combined armies not created');
    return false;
  }
  console.log('✓ Loyal combined army:', loyalCombined.name, 'MP:', loyalCombined.mp.current);
  console.log('✓ Rebellious combined army:', rebelliousCombined.name, 'MP:', rebelliousCombined.mp.current);
  
  // Check battle metadata
  if (front.isInsurrectionBattle && front.insurrectionId === 'insurrection_1') {
    console.log('✓ Battle marked as insurrection battle');
  } else {
    console.log('✗ Battle not properly marked as insurrection');
    return false;
  }
  
  // Simulate until battle ends
  let ticks = 0;
  while (front.state === 'ACTIVE' && ticks < 500) {
    simulateBattleTick(front, state);
    ticks++;
  }
  
  if (front.state !== 'ENDED') {
    console.log('✗ Insurrection battle did not end');
    return false;
  }
  console.log('✓ Insurrection battle ended after', ticks, 'ticks');
  
  // Handle battle end
  const winnerSide = loyalCombined.mp.current > 0 ? 'left' : 'right';
  const result = handleInsurrectionBattleEnd(state, front, winnerSide);
  
  console.log('Winner:', winnerSide === 'left' ? 'Loyal forces' : 'Rebellious forces');
  
  return true;
}

// Test 8: Battle with army that has no pre-existing units uses fallback
function testFallbackUnitMechanics() {
  console.log('\n=== Test 8: Army without units gets combat stats ===');
  
  const state = createFullTestState();
  
  // Create an army without explicit units
  const bareArmy = createArmy('bare_army', 'empire1', 'Bare Army', 50, 60, 0);
  // Don't assign units - the aggregation should handle defaults
  bareArmy.unitIds = [];
  state.armies.push(bareArmy);
  
  // Refresh aggregates - with no units, the army should have 0 MP
  refreshArmyAggregates(state);
  
  console.log('Bare army MP after aggregation:', bareArmy.mp.current, '/', bareArmy.mp.max);
  console.log('Bare army dmgPerUnitMP:', bareArmy.dmgPerUnitMP);
  
  // The army should have 0 MP since it has no units
  // This is expected behavior - armies need units to have combat capability
  if (bareArmy.mp.max === 0) {
    console.log('✓ Army without units has 0 MP (expected behavior)');
  }
  
  // Now add a fallback unit (simulating what content.js does)
  const fallbackUnit = createUnit('unit_bare_army', 'bare_army', 'empire1', 'Bare Army Core Unit');
  state.units.push(fallbackUnit);
  bareArmy.unitIds = ['unit_bare_army'];
  
  refreshArmyAggregates(state);
  
  console.log('After adding fallback unit:');
  console.log('Bare army MP:', bareArmy.mp.current, '/', bareArmy.mp.max);
  console.log('Bare army dmgPerUnitMP:', bareArmy.dmgPerUnitMP);
  
  if (bareArmy.mp.max > 0 && bareArmy.dmgPerUnitMP > 0) {
    console.log('✓ Fallback unit provides combat capability');
    return true;
  } else {
    console.log('✗ Fallback unit did not provide combat capability');
    return false;
  }
}

// Run all tests
console.log('='.repeat(60));
console.log('Battle Integration Test Suite');
console.log('='.repeat(60));

const results = {
  'Scourge army creation includes unit': testScourgeArmyCreation(),
  'Scourge stats scale with turns': testScourgeStatsScaling(),
  'Coalition combined army aggregation': testCoalitionCombinedArmy(),
  'Full battle simulation': testFullBattleSimulation(),
  'Unit sync after battle': testUnitSyncAfterBattle(),
  'Scourge unit persistence': testScourgeUnitPersistence(),
  'Insurrection battle': testInsurrectionBattle(),
  'Fallback unit mechanics': testFallbackUnitMechanics()
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
  console.log('✓ ALL INTEGRATION TESTS PASSED');
} else {
  console.log('✗ SOME TESTS FAILED');
  process.exit(1);
}
console.log('='.repeat(60));
