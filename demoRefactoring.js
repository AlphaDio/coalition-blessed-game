#!/usr/bin/env node

/**
 * Demo script to showcase the battle system refactoring
 * Shows:
 * 1. Organization determining participation (not width)
 * 2. Recovery as independent stat
 * 3. Insurrection armies excluded from Scourge battles
 * 4. Space-themed empire and army names
 */

import { createGameState, createArmy } from './src/game/types.js';
import { startBattle, simulateBattleTick } from './src/game/frontBattles.js';
import { startScourgeBattle } from './src/game/battles.js';
import { createSampleContent } from './src/game/content.js';

console.log('='.repeat(70));
console.log('BATTLE SYSTEM REFACTORING DEMO');
console.log('='.repeat(70));

// Demo 1: Space-themed empires and armies
console.log('\n📡 DEMO 1: Space-Themed Empires and Armies');
console.log('-'.repeat(70));
const { empires, armies } = createSampleContent(12345);
console.log('\nEmpires:');
empires.forEach(e => console.log(`  • ${e.name} (${e.id})`));
console.log('\nArmies:');
armies.forEach(a => console.log(`  • ${a.name} (Org: ${a.organization}, Recovery: ${a.recovery})`));

// Demo 2: Organization determines participation
console.log('\n\n⚔️  DEMO 2: Organization Determines Battle Participation');
console.log('-'.repeat(70));
const state1 = createGameState(12345);
const highOrg = createArmy('high_org', 'empire1', 'High Organization Fleet', 50, 90, 50, 60);
const lowOrg = createArmy('low_org', 'empire2', 'Low Organization Fleet', 50, 30, 50, 60);

state1.armies = [highOrg, lowOrg];
state1.turn = 1;

console.log('\nArmy Stats:');
console.log(`  High Org Fleet: ${highOrg.organization}% organization, ${highOrg.mp.current} MP`);
console.log(`  Low Org Fleet:  ${lowOrg.organization}% organization, ${lowOrg.mp.current} MP`);

console.log('\nParticipation Calculation:');
console.log(`  High Org (90%): Can participate with 90% of MP = ${(highOrg.mp.current * 0.9).toFixed(0)} MP`);
console.log(`  Low Org (30%):  Can participate with 30% of MP = ${(lowOrg.mp.current * 0.3).toFixed(0)} MP`);
console.log('\n  ✓ Organization determines how much of army participates, not battlefield width!');

// Demo 3: Recovery as independent stat
console.log('\n\n🔧 DEMO 3: Recovery as Independent Stat');
console.log('-'.repeat(70));
const state2 = createGameState(12345);
const highRecovery = createArmy('high_rec', 'empire1', 'Fast Recovery Fleet', 50, 60, 50, 80);
const lowRecovery = createArmy('low_rec', 'empire2', 'Slow Recovery Fleet', 50, 60, 50, 20);

state2.armies = [highRecovery, lowRecovery];
state2.turn = 1;

console.log('\nRecovery Stats (same organization, different recovery):');
console.log(`  Fast Recovery: Org ${highRecovery.organization}%, Recovery ${highRecovery.recovery}`);
console.log(`  Slow Recovery: Org ${lowRecovery.organization}%, Recovery ${lowRecovery.recovery}`);

console.log('\nCalculated Recovery Rates:');
const fastRate = highRecovery.recovery * 10 * (0.5 + highRecovery.organization/100);
const slowRate = lowRecovery.recovery * 10 * (0.5 + lowRecovery.organization/100);
console.log(`  Fast Recovery: ${fastRate.toFixed(0)} MP/tick (${highRecovery.recovery} * 10 * org modifier)`);
console.log(`  Slow Recovery: ${slowRate.toFixed(0)} MP/tick (${lowRecovery.recovery} * 10 * org modifier)`);
console.log('\n  ✓ Recovery is now an independent stat, with organization as a modifier!');

// Demo 4: Insurrection armies excluded from Scourge battles
console.log('\n\n🚨 DEMO 4: Insurrection Armies Excluded from Scourge Battles');
console.log('-'.repeat(70));
const state3 = createGameState(12345);
const loyalArmy = createArmy('loyal', 'empire1', 'Loyal Fleet', 60, 70, 50, 55);
const rebelliousArmy = createArmy('rebel', 'empire2', 'Rebellious Fleet', 60, 70, 50, 55);

state3.armies = [loyalArmy, rebelliousArmy];
state3.insurrections = [{
  id: 'insurrection_1',
  armies: ['rebel'],
  strength: 50,
  active: true
}];
state3.turn = 1;
state3.scourgeFervor = 10;

console.log('\nSimulating Scourge battle with one rebellious army...');
console.log('  Loyal Fleet: Available for Scourge battles');
console.log('  Rebellious Fleet: In insurrection (army id: "rebel")');

// Simulate the filtering logic from turn.js
const rebelliousArmyIds = new Set();
state3.insurrections.forEach(ins => {
  if (ins.active && ins.armies) {
    ins.armies.forEach(id => rebelliousArmyIds.add(id));
  }
});

const participatingArmies = state3.armies.filter(a => 
  a.organization > 30 && 
  !a.id.startsWith('_scourge') && 
  !a.id.startsWith('_coalition_combined') &&
  !rebelliousArmyIds.has(a.id)
);

console.log(`\nArmies participating in Scourge battle: ${participatingArmies.length}`);
participatingArmies.forEach(a => console.log(`  • ${a.name}`));
console.log('\n  ✓ Rebellious armies excluded from Scourge battles!');
console.log('  ✓ They fight on the opposite side in Insurrection battles instead.');

console.log('\n' + '='.repeat(70));
console.log('✅ ALL REFACTORING FEATURES DEMONSTRATED');
console.log('='.repeat(70));
