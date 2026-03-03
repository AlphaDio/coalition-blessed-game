#!/usr/bin/env node

/**
 * Integration Tests for Battle System
 * Tests the full battle flow including:
 * - Scourge army creation
 * - Coalition vs Scourge battles
 * - Battle end handling and cohesion changes
 * - Insurrection battles
 * 
 * Note: Units have been removed from the game. Armies now manage manpower directly.
 */

import { createGameState, createArmy, createEmpire } from '../src/game/types.js';
import { startScourgeBattle, handleScourgeBattleEnd, startInsurrectionBattle, handleInsurrectionBattleEnd } from '../src/game/battles.js';
import { simulateBattleTick, getActiveBattles } from '../src/game/frontBattles.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';
import { INSURRECTION_CONSTANTS } from '../src/game/constants.js';

// Helper to create a full test state with empires and armies
function createFullTestState(seed = 12345) {
  const state = createGameState(seed);
  
  // Create empires
  state.empires = [
    createEmpire('empire1', 'Empire One', 60),
    createEmpire('empire2', 'Empire Two', 55)
  ];
  
  // Create armies with manpower (no units)
  const army1 = createArmy('army1', 'empire1', 'First Legion', 60, 70, 0, 50, 50, 10000);
  const army2 = createArmy('army2', 'empire2', 'Second Legion', 55, 65, 0, 50, 50, 10000);
  
  // Set combat stats directly on armies
  army1.dmgPerUnitMP = 1.0;
  army1.dmgPerTickMO = 2.5;
  army1.protection = 0.2;
  army1.resolve = 0.3;
  army1.killRate = 0.1;
  
  army2.dmgPerUnitMP = 1.0;
  army2.dmgPerTickMO = 2.5;
  army2.protection = 0.2;
  army2.resolve = 0.3;
  army2.killRate = 0.1;
  
  state.armies = [army1, army2];
  
  state.turn = 1;
  state.scourgeFervor = 10;
  state.coalitionCohesion = 75;
  state.scourgeCohesion = 80;
  
  refreshArmyAggregates(state);
  
  return state;
}

// Test 1: Scourge army creation
function testScourgeArmyCreation() {
  console.log('\n=== Test 1: Scourge army creation ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // Start a Scourge battle - this should create the Scourge army
  const { front } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  // Check Scourge army was created
  const scourgeArmy = state.armies.find(a => a.id.startsWith('_scourge_army'));
  if (!scourgeArmy) {
    console.log('✗ Scourge army was not created');
    return false;
  }
  console.log('✓ Scourge army created:', scourgeArmy.name);
  
  // Check Scourge army has manpower
  if (!scourgeArmy.mp || scourgeArmy.mp.max <= 0) {
    console.log('✗ Scourge army has no manpower');
    return false;
  }
  console.log('✓ Scourge army has manpower:', scourgeArmy.mp.max);
  
  // Check Scourge army has combat stats
  if (scourgeArmy.dmgPerUnitMP === undefined || scourgeArmy.dmgPerUnitMP <= 0) {
    console.log('✗ Scourge army has no combat stats');
    return false;
  }
  console.log('✓ Scourge army has combat stats - dmgPerUnitMP:', scourgeArmy.dmgPerUnitMP);
  
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

// Test 5: Damage distribution to original armies after battle
function testDamageDistributionAfterBattle() {
  console.log('\n=== Test 5: Damage distribution to original armies ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // Record initial army MP
  const initialArmyMP = {};
  participatingArmies.forEach(a => {
    initialArmyMP[a.id] = a.mp.current;
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
  
  // Combined army has damage, that's what we're testing
  if (damageRatio > 0) {
    console.log('✓ Combined army took damage during battle');
  } else {
    console.log('ℹ No damage taken yet (RNG dependent)');
  }
  
  // Verify original armies are tracked
  if (combinedArmy._originalArmies && combinedArmy._originalArmies.length > 0) {
    console.log('✓ Original armies are tracked for damage distribution');
  } else {
    console.log('✗ Original armies not tracked');
    return false;
  }
  
  return true;
}

// Test 6b: Permanent losses reduce MP max/manpower on original armies
function testPermanentLossReducesCapacity() {
  console.log('\n=== Test 6b: Permanent losses reduce army MP max/manpower ===');

  const state = createFullTestState();
  state.scourgeFervor = 60;
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  const initialCaps = {};
  participatingArmies.forEach(army => {
    initialCaps[army.id] = army.mp.max;
  });

  const { front } = startScourgeBattle(state, participatingArmies, () => 0.5);
  if (!front) {
    console.log('✗ Failed to start Scourge battle');
    return false;
  }

  let ticks = 0;
  while (front.state === 'ACTIVE' && ticks < 500) {
    simulateBattleTick(front, state);
    ticks++;
  }
  if (front.state !== 'ENDED') {
    console.log('✗ Battle did not end for capacity-loss test');
    return false;
  }

  const coalitionArmy = state.armies.find(a => a.id === front.leftArmyId);
  const coalitionWon = coalitionArmy && coalitionArmy.mp.current > 0;
  const winnerSide = coalitionWon ? 'left' : 'right';
  const coalitionHadCurrentDamage = coalitionArmy && coalitionArmy.mp.current < coalitionArmy.mp.max - 0.001;
  handleScourgeBattleEnd(state, front, winnerSide);

  let anyReduced = false;
  let anyCurrentBelowMax = false;
  let invalidState = false;
  participatingArmies.forEach(army => {
    const updated = state.armies.find(a => a.id === army.id);
    if (!updated) return;

    if (updated.mp.max < initialCaps[army.id] - 0.001) {
      anyReduced = true;
    }
    if (updated.mp.current > updated.mp.max + 0.001) {
      invalidState = true;
    }
    if (updated.mp.current < updated.mp.max - 0.001) {
      anyCurrentBelowMax = true;
    }
    if (Math.abs((updated.manpower || 0) - (updated.mp.max || 0)) > 0.001) {
      invalidState = true;
    }
  });

  if (invalidState) {
    console.log('✗ Invalid post-battle army state (current > max or manpower mismatch)');
    return false;
  }

  const coalitionPermanentLosses = front.permanentLosses?.left || 0;
  if (coalitionPermanentLosses > 0 && !anyReduced) {
    console.log('✗ Permanent losses recorded but no army capacity was reduced');
    return false;
  }

  if (coalitionHadCurrentDamage && !anyCurrentBelowMax) {
    console.log('✗ Battle dealt current MP damage but all armies returned at full strength');
    return false;
  }

  console.log(`✓ Permanent losses=${coalitionPermanentLosses.toFixed(1)} reflected in army capacity`);
  return true;
}

// Test 6: Scourge army persists and updates across battles
function testScourgeArmyPersistence() {
  console.log('\n=== Test 6: Scourge army persists across battles ===');
  
  const state = createFullTestState();
  const participatingArmies = state.armies.filter(a => a.organization > 30);
  
  // First battle
  const { front: front1 } = startScourgeBattle(state, participatingArmies, () => 0.5);
  
  const scourge1 = state.armies.find(a => a.id.startsWith('_scourge_army'));
  const initialMP = scourge1.mp.max;
  console.log('First battle - Scourge army MP:', initialMP);
  
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
  
  const scourge2 = state.armies.find(a => a.id.startsWith('_scourge_army'));
  const updatedMP = scourge2.mp.max;
  console.log('Second battle (turn 10) - Scourge army MP:', updatedMP);
  
  // Only one Scourge army should exist
  const scourgeArmies = state.armies.filter(a => a.id.startsWith('_scourge_army'));
  if (scourgeArmies.length !== 1) {
    console.log('✗ Multiple Scourge armies exist:', scourgeArmies.length);
    return false;
  }
  console.log('✓ Only one Scourge army exists');
  
  // Stats should have scaled
  if (updatedMP > initialMP) {
    console.log('✓ Scourge army MP scaled from', initialMP, 'to', updatedMP);
  } else {
    console.log('✗ Scourge army MP did not scale');
    return false;
  }
  
  return true;
}

// Test 7: Insurrection battle creates proper combined armies
function testInsurrectionBattle() {
  console.log('\n=== Test 7: Insurrection battle ===');
  
  const state = createFullTestState();
  
  // Add a third army to be rebellious
  const rebelliousArmy = createArmy('army3', 'empire1', 'Rebel Legion', 80, 50, 90, 50, 50, 8000);
  rebelliousArmy.dmgPerUnitMP = 1.0;
  rebelliousArmy.dmgPerTickMO = 2.5;
  rebelliousArmy.protection = 0.2;
  rebelliousArmy.resolve = 0.3;
  rebelliousArmy.killRate = 0.1;
  state.armies.push(rebelliousArmy);
  
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

  const resolvedInsurrection = state.insurrections.find(ins => ins.id === 'insurrection_1');
  if (!resolvedInsurrection || resolvedInsurrection.active) {
    console.log('✗ Insurrection was not resolved after battle end');
    return false;
  }

  const updatedRebelArmy = state.armies.find(a => a.id === 'army3');
  if (!updatedRebelArmy) {
    console.log('✗ Rebellious original army missing after battle resolution');
    return false;
  }
  if (updatedRebelArmy.aggravation !== INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION) {
    console.log('✗ Rebellious army aggravation was not reset after insurrection resolution');
    return false;
  }

  console.log('✓ Insurrection resolved and aggravation reset to post-rebellion baseline');
  
  return true;
}

// Test 8: Partial allied commitments only risk the deployed portion
function testPartialSupportCommitments() {
  console.log('\n=== Test 8: Partial allied commitments preserve reserve MP ===');

  const state = createFullTestState();
  const targetArmy = state.armies.find(army => army.id === 'army1');
  const allyArmy = state.armies.find(army => army.id === 'army2');
  const initialTargetMax = targetArmy.mp.max;
  const initialAllyMax = allyArmy.mp.max;

  const { front } = startScourgeBattle(state, [
    { army: targetArmy, commitRatio: 1.0 },
    { army: allyArmy, commitRatio: 0.4, isSupport: true, supportRelation: 80 }
  ], () => 0.5);

  const combinedArmy = state.armies.find(army => army.id === front.leftArmyId);
  const scourgeArmy = state.armies.find(army => army.id === front.rightArmyId);
  if (!combinedArmy || !scourgeArmy) {
    console.log('X Failed to create battle armies');
    return false;
  }

  const expectedCommittedMP = initialTargetMax + (initialAllyMax * 0.4);
  if (Math.abs(combinedArmy.mp.current - expectedCommittedMP) > 0.001) {
    console.log('X Combined army did not use partial commitment MP correctly');
    return false;
  }

  if (scourgeArmy.mp.max >= 20000) {
    console.log('X Scourge baseline is still too large for reduced coalition battles');
    return false;
  }

  front.permanentLosses.left = combinedArmy.mp.max * 0.2;
  combinedArmy.mp.current = expectedCommittedMP * 0.5;

  handleScourgeBattleEnd(state, front, 'left');

  const updatedTargetArmy = state.armies.find(army => army.id === 'army1');
  const updatedAllyArmy = state.armies.find(army => army.id === 'army2');

  const expectedTargetMax = initialTargetMax * 0.8;
  const expectedAllyMax = (initialAllyMax * 0.6) + (initialAllyMax * 0.4 * 0.8);

  if (Math.abs(updatedTargetArmy.mp.max - expectedTargetMax) > 0.01) {
    console.log('X Target army cap was not reduced from its committed losses');
    return false;
  }

  if (Math.abs(updatedAllyArmy.mp.max - expectedAllyMax) > 0.01) {
    console.log('X Allied reserve was damaged beyond its deployed share');
    return false;
  }

  if (updatedAllyArmy.mp.current >= updatedAllyArmy.mp.max + 0.001) {
    console.log('X Allied army current MP exceeded max after partial redistribution');
    return false;
  }

  console.log('PASS Partial support only damaged the committed allied detachment');
  return true;
}

// Test 9: Active composite battles push live damage onto the real armies
function testCompositeBattleAppliesLiveDamageToRealArmies() {
  console.log('\n=== Test 9: Active composite battles damage real armies ===');

  const state = createFullTestState();
  const army1 = state.armies.find((army) => army.id === 'army1');
  const army2 = state.armies.find((army) => army.id === 'army2');
  const initialTotalMP = (army1.mp.current || 0) + (army2.mp.current || 0);

  const { front } = startScourgeBattle(state, [army1, army2], () => 0.5);
  if (!front) {
    console.log('X Failed to create scourge battle front');
    return false;
  }

  simulateBattleTick(front, state);

  const updatedArmy1 = state.armies.find((army) => army.id === 'army1');
  const updatedArmy2 = state.armies.find((army) => army.id === 'army2');
  const updatedTotalMP = (updatedArmy1.mp.current || 0) + (updatedArmy2.mp.current || 0);

  if (updatedTotalMP >= initialTotalMP) {
    console.log('X Real armies did not lose live MP during the active battle');
    return false;
  }

  console.log('PASS Real armies reflect live battle damage before the battle ends');
  return true;
}

// Test 10: Army with no units uses direct manpower
function testDirectManpowerMechanics() {
  console.log('\n=== Test 10: Army with direct manpower ===');
  
  const state = createFullTestState();
  
  // Create an army with manpower directly (new system)
  const directArmy = createArmy('direct_army', 'empire1', 'Direct Army', 50, 60, 0, 50, 50, 5000);
  directArmy.dmgPerUnitMP = 0.8;
  directArmy.dmgPerTickMO = 2.0;
  directArmy.protection = 0.15;
  directArmy.resolve = 0.25;
  directArmy.killRate = 0.1;
  state.armies.push(directArmy);
  
  // Refresh aggregates
  refreshArmyAggregates(state);
  
  console.log('Direct army MP after aggregation:', directArmy.mp.current, '/', directArmy.mp.max);
  console.log('Direct army dmgPerUnitMP:', directArmy.dmgPerUnitMP);
  
  // The army should have the manpower we set
  if (directArmy.mp.max === 5000) {
    console.log('✓ Army has correct manpower (5000)');
  } else {
    console.log('✗ Army manpower incorrect, expected 5000, got:', directArmy.mp.max);
    return false;
  }
  
  if (directArmy.dmgPerUnitMP > 0) {
    console.log('✓ Army has combat capability');
    return true;
  } else {
    console.log('✗ Army has no combat capability');
    return false;
  }
}

// Run all tests
console.log('='.repeat(60));
console.log('Battle Integration Test Suite');
console.log('='.repeat(60));

const results = {
  'Scourge army creation': testScourgeArmyCreation(),
  'Scourge stats scale with turns': testScourgeStatsScaling(),
  'Coalition combined army aggregation': testCoalitionCombinedArmy(),
  'Full battle simulation': testFullBattleSimulation(),
  'Damage distribution after battle': testDamageDistributionAfterBattle(),
  'Permanent loss reduces MP capacity': testPermanentLossReducesCapacity(),
  'Scourge army persistence': testScourgeArmyPersistence(),
  'Insurrection battle': testInsurrectionBattle(),
  'Partial support commitments': testPartialSupportCommitments(),
  'Composite battles damage real armies live': testCompositeBattleAppliesLiveDamageToRealArmies(),
  'Direct manpower mechanics': testDirectManpowerMechanics()
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


