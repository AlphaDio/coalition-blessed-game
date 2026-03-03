#!/usr/bin/env node

/**
 * Tests for the Armies Panel endpoint logic
 * Validates the data transformation and filtering used by GET /api/game/armies
 */

import { createArmy, createEmpire, createGameState } from '../src/game/types.js';
import { startBattle } from '../src/game/frontBattles.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.log(`✗ FAIL: ${message}`);
    failed++;
    return false;
  }
  console.log(`✓ PASS: ${message}`);
  passed++;
  return true;
}

/**
 * Replicate the armies panel data extraction logic from api.js
 * This mirrors what GET /api/game/armies does so we can test it in isolation.
 */
function extractArmiesPanelData(state) {
  const regularArmies = (state.armies || []).filter(army =>
    !army.id.startsWith('_scourge') &&
    !army.id.startsWith('_coalition_combined') &&
    !army.id.startsWith('_insurrection')
  );

  const empireMap = new Map((state.empires || []).map(e => [e.id, e]));

  const activeBattleFronts = (state.battleFronts || []).filter(f => f.state === 'ACTIVE');
  const armyBattleMap = new Map(); // armyId -> { front, side }
  activeBattleFronts.forEach(front => {
    const record = (armyId, side) => {
      if (armyId) armyBattleMap.set(armyId, { front, side });
    };
    record(front.leftArmyId, 'left');
    record(front.rightArmyId, 'right');
    (front.participatingArmyIds || []).forEach(id => record(id, 'left'));
    (front.loyalArmyIds || []).forEach(id => record(id, 'left'));
    (front.rebelliousArmyIds || []).forEach(id => record(id, 'right'));
  });

  return regularArmies.map(army => {
    const empire = empireMap.get(army.empireId) || null;
    const mpCurrent = Math.floor(army.mp?.current ?? army.manpower ?? 0);
    const mpMax = Math.floor(army.mp?.max ?? army.manpower ?? 1);
    const mpPercent = mpMax > 0 ? Math.round((mpCurrent / mpMax) * 100) : 0;

    const entry = armyBattleMap.get(army.id) || null;
    let battle = null;
    if (entry) {
      const { front, side } = entry;
      const opponentId = side === 'left' ? front.rightArmyId : front.leftArmyId;
      const opponentArmy = (state.armies || []).find(a => a.id === opponentId);
      battle = {
        frontId: front.id,
        opponentArmyId: opponentId || null,
        opponentName: opponentArmy?.name || opponentId || null,
        battlefieldSize: front.battlefieldSize || 0,
        moraleBroken: front.moraleBroken?.[side] ?? false
      };
    }

    return {
      id: army.id,
      name: army.name,
      empire: empire ? { id: empire.id, name: empire.name } : null,
      manpower: {
        current: mpCurrent,
        max: mpMax,
        percent: mpPercent
      },
      morale: {
        current: Math.round(army.mo?.current ?? 100),
        max: Math.round(army.mo?.max ?? 100)
      },
      stats: {
        organization: Math.round(army.organization ?? 0),
        fervor: Math.round(army.fervor ?? 0),
        aggravation: Math.round(army.aggravation ?? 0),
        command: Math.round(army.command ?? 50)
      },
      combat: {
        dmgPerUnitMP: army.dmgPerUnitMP ?? 1.0,
        dmgPerTickMO: army.dmgPerTickMO ?? 2.5,
        protection: army.protection ?? 0.2,
        resolve: army.resolve ?? 0.3,
        killRate: army.killRate ?? 0.1
      },
      supply: {
        needsFulfillment: army.supply_state?.needs_fulfillment ?? {},
        wantsFulfillment: army.supply_state?.wants_fulfillment ?? {}
      },
      battle
    };
  });
}

// Test 1: Only regular armies are returned (no synthetic armies)
function testFiltersOutSyntheticArmies() {
  console.log('\n=== Test 1: Only regular armies returned ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Stellar Federation', 60)];

  const regular = createArmy('army1', 'empire1', 'First Legion', 60, 70, 0, 50, 50, 5000);
  const scourge = createArmy('_scourge_1', 'empire1', 'Scourge Horde', 80, 80, 0, 50, 50, 3000);
  const combined = createArmy('_coalition_combined_1', 'empire1', 'Combined Force', 60, 60, 0, 50, 50, 8000);
  const insurrection = createArmy('_insurrection_1', 'empire1', 'Rebel Force', 50, 50, 80, 50, 50, 2000);

  state.armies = [regular, scourge, combined, insurrection];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);

  assert(armies.length === 1, `Only 1 regular army should be returned, got ${armies.length}`);
  assert(armies[0].id === 'army1', `Regular army id should be army1, got ${armies[0]?.id}`);
}

// Test 2: Empire name is correctly included
function testEmpireNameLookup() {
  console.log('\n=== Test 2: Empire name included in army data ===');
  const state = createGameState(42);
  state.empires = [
    createEmpire('empire1', 'Stellar Federation', 60),
    createEmpire('empire2', 'Iron Collective', 55)
  ];

  const army1 = createArmy('army1', 'empire1', 'First Legion', 60, 70, 0, 50, 50, 5000);
  const army2 = createArmy('army2', 'empire2', 'Iron Guard', 55, 65, 0, 50, 50, 4000);
  state.armies = [army1, army2];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);

  assert(armies.length === 2, `Expected 2 armies, got ${armies.length}`);
  const a1 = armies.find(a => a.id === 'army1');
  const a2 = armies.find(a => a.id === 'army2');
  assert(a1?.empire?.name === 'Stellar Federation', `Army1 empire should be Stellar Federation, got ${a1?.empire?.name}`);
  assert(a2?.empire?.name === 'Iron Collective', `Army2 empire should be Iron Collective, got ${a2?.empire?.name}`);
}

// Test 3: Army with unknown empire returns null empire
function testUnknownEmpireReturnsNull() {
  console.log('\n=== Test 3: Unknown empire returns null ===');
  const state = createGameState(42);
  state.empires = [];

  const army = createArmy('army1', 'unknown_empire', 'Lost Legion', 60, 70, 0, 50, 50, 5000);
  state.armies = [army];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);

  assert(armies.length === 1, `Expected 1 army, got ${armies.length}`);
  assert(armies[0].empire === null, `Empire should be null for unknown empireId, got ${JSON.stringify(armies[0].empire)}`);
}

// Test 4: Manpower percentage is correctly calculated
function testManpowerPercentage() {
  console.log('\n=== Test 4: Manpower percentage calculated correctly ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const army = createArmy('army1', 'empire1', 'Test Army', 60, 70, 0, 50, 50, 10000);
  army.mp = { current: 7500, max: 10000 };
  state.armies = [army];

  const armies = extractArmiesPanelData(state);

  assert(armies[0].manpower.current === 7500, `MP current should be 7500, got ${armies[0].manpower.current}`);
  assert(armies[0].manpower.max === 10000, `MP max should be 10000, got ${armies[0].manpower.max}`);
  assert(armies[0].manpower.percent === 75, `MP percent should be 75%, got ${armies[0].manpower.percent}`);
}

// Test 5: Battle status is included when army is in active battle
function testBattleStatusInActiveBattle() {
  console.log('\n=== Test 5: Battle status shown for armies in active battle ===');
  const state = createGameState(42);
  state.empires = [
    createEmpire('empire1', 'Federation', 60),
    createEmpire('empire2', 'Collective', 55)
  ];

  const army1 = createArmy('army1', 'empire1', 'First Legion', 60, 70, 0, 50, 50, 5000);
  const army2 = createArmy('army2', 'empire2', 'Second Legion', 55, 65, 0, 50, 50, 4000);
  state.armies = [army1, army2];
  refreshArmyAggregates(state);

  startBattle(state, 'army1', 'army2', 1000);

  const armies = extractArmiesPanelData(state);
  const a1 = armies.find(a => a.id === 'army1');
  const a2 = armies.find(a => a.id === 'army2');

  assert(a1?.battle !== null, 'army1 should have battle info');
  assert(a2?.battle !== null, 'army2 should have battle info');
  assert(a1?.battle?.opponentArmyId === 'army2', `army1's opponent should be army2, got ${a1?.battle?.opponentArmyId}`);
  assert(a2?.battle?.opponentArmyId === 'army1', `army2's opponent should be army1, got ${a2?.battle?.opponentArmyId}`);
  assert(a1?.battle?.opponentName === 'Second Legion', `army1 opponent name should be Second Legion, got ${a1?.battle?.opponentName}`);
  assert(a1?.battle?.frontId !== null, `battle frontId should not be null`);
}

// Test 6: Battle status is null for army not in battle
function testNoBattleStatusWhenNotFighting() {
  console.log('\n=== Test 6: Battle status null when not in battle ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const army = createArmy('army1', 'empire1', 'Idle Legion', 60, 70, 0, 50, 50, 5000);
  state.armies = [army];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);

  assert(armies[0].battle === null, `Battle should be null when not fighting, got ${JSON.stringify(armies[0].battle)}`);
}

// Test 7: Combat stats are included and reasonable
function testCombatStatsIncluded() {
  console.log('\n=== Test 7: Combat stats included in army data ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const army = createArmy('army1', 'empire1', 'Battle Army', 60, 70, 0, 50, 50, 5000);
  army.dmgPerUnitMP = 1.2;
  army.dmgPerTickMO = 3.0;
  army.protection = 0.35;
  army.resolve = 0.45;
  army.killRate = 0.15;
  state.armies = [army];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);
  const result = armies[0];

  assert(result.combat.dmgPerUnitMP === 1.2, `dmgPerUnitMP should be 1.2, got ${result.combat.dmgPerUnitMP}`);
  assert(result.combat.dmgPerTickMO === 3.0, `dmgPerTickMO should be 3.0, got ${result.combat.dmgPerTickMO}`);
  assert(result.combat.protection === 0.35, `protection should be 0.35, got ${result.combat.protection}`);
  assert(result.combat.resolve === 0.45, `resolve should be 0.45, got ${result.combat.resolve}`);
  assert(result.combat.killRate === 0.15, `killRate should be 0.15, got ${result.combat.killRate}`);
}

// Test 8: Supply state is included
function testSupplyStateIncluded() {
  console.log('\n=== Test 8: Supply fulfillment included in army data ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const army = createArmy('army1', 'empire1', 'Supply Army', 60, 70, 0, 50, 50, 5000);
  army.supply_state = {
    needs_fulfillment: { super_alloys: 0.9, plasma_fuel: 0.75 },
    wants_fulfillment: { rare_gases: 0.6 },
    shortages: {},
    received: {}
  };
  state.armies = [army];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);
  const result = armies[0];

  assert(result.supply.needsFulfillment.super_alloys === 0.9, `super_alloys needs fulfillment should be 0.9`);
  assert(result.supply.needsFulfillment.plasma_fuel === 0.75, `plasma_fuel needs fulfillment should be 0.75`);
  assert(result.supply.wantsFulfillment.rare_gases === 0.6, `rare_gases wants fulfillment should be 0.6`);
}

// Test 9: Stats are correctly rounded to integers
function testStatsAreRoundedToIntegers() {
  console.log('\n=== Test 9: Army stats are rounded to integers ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const army = createArmy('army1', 'empire1', 'Test Army', 52.7, 76.3, 41.9, 58.1, 50, 5000);
  state.armies = [army];
  refreshArmyAggregates(state);

  const armies = extractArmiesPanelData(state);
  const stats = armies[0].stats;

  assert(Number.isInteger(stats.fervor), `fervor should be integer, got ${stats.fervor}`);
  assert(Number.isInteger(stats.organization), `organization should be integer, got ${stats.organization}`);
  assert(Number.isInteger(stats.aggravation), `aggravation should be integer, got ${stats.aggravation}`);
  assert(Number.isInteger(stats.command), `command should be integer, got ${stats.command}`);
}

// Test 10: Empty armies array returns empty list
function testEmptyArmiesReturnsEmptyList() {
  console.log('\n=== Test 10: Empty armies returns empty list ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];
  state.armies = [];

  const armies = extractArmiesPanelData(state);

  assert(armies.length === 0, `Expected 0 armies, got ${armies.length}`);
}

// Test 11: Armies in participatingArmyIds (Scourge battle) are on left side
function testParticipatingArmiesInScourgeBattle() {
  console.log('\n=== Test 11: Armies in participatingArmyIds treated as left side (Scourge battle) ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const coalition = createArmy('army1', 'empire1', 'Coalition Force', 60, 70, 0, 50, 50, 5000);
  const scourgeArmy = createArmy('_scourge_1', '_scourge', 'Scourge Horde', 80, 80, 0, 50, 50, 8000);
  const combinedArmy = createArmy('_coalition_combined_1', 'empire1', 'Combined Force', 60, 70, 0, 50, 50, 5000);
  state.armies = [coalition, scourgeArmy, combinedArmy];

  // Simulate a Scourge battle front (combined army vs scourge, with coalition in participatingArmyIds)
  state.battleFronts = [{
    id: 'front_scourge_1',
    state: 'ACTIVE',
    leftArmyId: '_coalition_combined_1',
    rightArmyId: '_scourge_1',
    battlefieldSize: 1200,
    moraleBroken: { left: false, right: true },
    participatingArmyIds: ['army1']
  }];

  const armies = extractArmiesPanelData(state);
  const result = armies.find(a => a.id === 'army1');

  assert(result !== undefined, 'coalition army1 should be in results');
  assert(result.battle !== null, 'army1 should have battle info');
  assert(result.battle.frontId === 'front_scourge_1', `frontId should be front_scourge_1, got ${result.battle.frontId}`);
  assert(result.battle.opponentArmyId === '_scourge_1', `opponent should be _scourge_1, got ${result.battle.opponentArmyId}`);
  assert(result.battle.moraleBroken === false, `moraleBroken should be false (left side), got ${result.battle.moraleBroken}`);
}

// Test 12: Armies in loyalArmyIds and rebelliousArmyIds (insurrection battle)
function testInsurrectionBattleSides() {
  console.log('\n=== Test 12: loyalArmyIds on left, rebelliousArmyIds on right (insurrection) ===');
  const state = createGameState(42);
  state.empires = [createEmpire('empire1', 'Federation', 60)];

  const loyalArmy = createArmy('army_loyal', 'empire1', 'Loyal Guard', 60, 70, 0, 50, 50, 4000);
  const rebelArmy = createArmy('army_rebel', 'empire1', 'Rebel Force', 55, 65, 80, 50, 50, 3000);
  const loyalCombined = createArmy('_loyal_1', 'empire1', 'Loyal Forces (1 armies)', 60, 70, 0, 50, 50, 4000);
  const rebelCombined = createArmy('_rebel_1', '_insurrection', 'Rebellious Forces (1 armies)', 55, 65, 80, 50, 50, 3000);
  state.armies = [loyalArmy, rebelArmy, loyalCombined, rebelCombined];

  // Simulate insurrection battle front: left=loyal, right=rebel, morale broken on right
  state.battleFronts = [{
    id: 'front_insurrection_1',
    state: 'ACTIVE',
    leftArmyId: '_loyal_1',
    rightArmyId: '_rebel_1',
    battlefieldSize: 800,
    moraleBroken: { left: false, right: true },
    loyalArmyIds: ['army_loyal'],
    rebelliousArmyIds: ['army_rebel'],
    isInsurrectionBattle: true
  }];

  const armies = extractArmiesPanelData(state);
  const loyal = armies.find(a => a.id === 'army_loyal');
  const rebel = armies.find(a => a.id === 'army_rebel');

  assert(loyal !== undefined, 'army_loyal should be in results');
  assert(rebel !== undefined, 'army_rebel should be in results');
  assert(loyal.battle !== null, 'loyal army should have battle info');
  assert(rebel.battle !== null, 'rebel army should have battle info');

  // loyal is on left side → moraleBroken.left = false
  assert(loyal.battle.moraleBroken === false, `loyal moraleBroken should be false (left side), got ${loyal.battle.moraleBroken}`);
  // rebel is on right side → moraleBroken.right = true
  assert(rebel.battle.moraleBroken === true, `rebel moraleBroken should be true (right side), got ${rebel.battle.moraleBroken}`);

  // Opponents: loyal's opponent is the rebel combined; rebel's opponent is loyal combined
  assert(loyal.battle.opponentArmyId === '_rebel_1', `loyal opponent should be _rebel_1, got ${loyal.battle.opponentArmyId}`);
  assert(rebel.battle.opponentArmyId === '_loyal_1', `rebel opponent should be _loyal_1, got ${rebel.battle.opponentArmyId}`);
  assert(loyal.battle.opponentName === 'Rebellious Forces (1 armies)', `loyal opponent name should match, got ${loyal.battle.opponentName}`);
}

// Run all tests
testFiltersOutSyntheticArmies();
testEmpireNameLookup();
testUnknownEmpireReturnsNull();
testManpowerPercentage();
testBattleStatusInActiveBattle();
testNoBattleStatusWhenNotFighting();
testCombatStatsIncluded();
testSupplyStateIncluded();
testStatsAreRoundedToIntegers();
testEmptyArmiesReturnsEmptyList();
testParticipatingArmiesInScourgeBattle();
testInsurrectionBattleSides();

// Print summary
console.log('\n============================================================');
console.log('Test Results Summary');
console.log('============================================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('============================================================');
if (failed === 0) {
  console.log('[PASS] ALL TESTS PASSED');
} else {
  console.log(`[FAIL] ${failed} TEST(S) FAILED`);
  process.exit(1);
}
console.log('============================================================');
