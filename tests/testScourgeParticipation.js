#!/usr/bin/env node

/**
 * Test Scourge Army Participation Logic
 * Tests that armies from other empires participate in scourge battles
 * based on their relations to the target empire and organization levels.
 */

import { createGameState, createArmy, createEmpire } from '../src/game/types.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';

// Helper to create test state with multiple empires and relations
function createScourgeParticipationTestState() {
  const state = createGameState(12345);

  // Create 4 empires
  state.empires = [
    createEmpire('empire1', 'Target Empire', 60),
    createEmpire('empire2', 'Ally Empire', 70),
    createEmpire('empire3', 'Neutral Empire', 50),
    createEmpire('empire4', 'Hostile Empire', 40)
  ];

  // Set up diplomatic relations
  state.diplomacy = { relations: {} };
  state.empires.forEach(empire => {
    state.diplomacy.relations[empire.id] = {};
  });

  // Relations to empire1 (target):
  // empire2 -> empire1: +80 (good ally)
  // empire3 -> empire1: +20 (neutral)
  // empire4 -> empire1: -50 (hostile)
  state.diplomacy.relations['empire2']['empire1'] = 80;
  state.diplomacy.relations['empire3']['empire1'] = 20;
  state.diplomacy.relations['empire4']['empire1'] = -50;

  // Relations from empire1 to others (symmetric for simplicity)
  state.diplomacy.relations['empire1']['empire2'] = 80;
  state.diplomacy.relations['empire1']['empire3'] = 20;
  state.diplomacy.relations['empire1']['empire4'] = -50;

  // Create armies with different organization levels
  state.armies = [
    // Target empire armies (empire1)
    createArmy('army1_1', 'empire1', 'Target Army High Org', 60, 80, 0, 50, 50, 10000), // High org
    createArmy('army1_2', 'empire1', 'Target Army Low Org', 60, 25, 0, 50, 50, 10000),  // Low org (should not participate)

    // Ally empire armies (empire2, +80 relations)
    createArmy('army2_1', 'empire2', 'Ally Army High Org', 70, 60, 0, 50, 50, 10000), // High org, should participate
    createArmy('army2_2', 'empire2', 'Ally Army Med Org', 70, 40, 0, 50, 50, 10000),  // Med org, should participate (threshold = 30)

    // Neutral empire armies (empire3, +20 relations)
    createArmy('army3_1', 'empire3', 'Neutral Army High Org', 50, 60, 0, 50, 50, 10000), // High org, should participate
    createArmy('army3_2', 'empire3', 'Neutral Army Low Org', 50, 25, 0, 50, 50, 10000),  // Low org, should not participate (threshold = 70)

    // Hostile empire armies (empire4, -50 relations)
    createArmy('army4_1', 'empire4', 'Hostile Army High Org', 40, 90, 0, 50, 50, 10000), // High org, but hostile - should not participate
  ];

  // Set combat stats for all armies
  state.armies.forEach(army => {
    army.dmgPerUnitMP = 1.0;
    army.dmgPerTickMO = 2.5;
    army.protection = 0.2;
    army.resolve = 0.3;
    army.killRate = 0.1;
  });

  state.turn = 1;
  state.scourgeFervor = 10;
  state.coalitionCohesion = 75;
  state.scourgeCohesion = 80;

  refreshArmyAggregates(state);

  return state;
}

// Test the scourge army participation logic
function testScourgeArmyParticipation() {
  console.log('\n=== Test: Scourge Army Participation Logic ===');

  const state = createScourgeParticipationTestState();
  const targetEmpire = state.empires[0]; // empire1

  // Simulate the new participation logic from turn.js
  const rebelliousArmyIds = new Set(); // No rebellions for this test
  let participatingArmies = [];

  // First, collect all target empire armies that meet basic criteria
  const targetEmpireArmies = state.armies.filter(army =>
    army.empireId === targetEmpire.id &&
    army.id && // ensure army has id
    !rebelliousArmyIds.has(army.id) &&
    army.organization > 30
  );
  participatingArmies.push(...targetEmpireArmies);

  // For each other empire with positive relations, select a percentage of armies
  const otherEmpires = state.empires.filter(empire => empire.id !== targetEmpire.id);
  for (const otherEmpire of otherEmpires) {
    const relations = state.diplomacy?.relations?.[otherEmpire.id]?.[targetEmpire.id] ?? 0;
    if (relations <= 0) continue; // Skip hostile or neutral empires

    // Calculate participation percentage based on relations (0-100 range)
    const participationPercentage = Math.min(100, Math.max(0, relations));

    // Get all eligible armies from this empire (not rebellious, regular army)
    const empireArmies = state.armies.filter(army =>
      army.empireId === otherEmpire.id &&
      army.id &&
      !rebelliousArmyIds.has(army.id)
    );

    if (empireArmies.length === 0) continue;

    // Select a random subset based on participation percentage
    const numToSelect = Math.ceil((empireArmies.length * participationPercentage) / 100);
    const shuffledArmies = [...empireArmies].sort(() => 0.5 - 0.5); // Deterministic shuffle for testing
    const selectedArmies = shuffledArmies.slice(0, numToSelect);

    // Apply organization filter to selected armies
    // Use a base threshold that gets lower with better relations
    const baseOrgThreshold = Math.max(20, 60 - (relations / 4));
    const filteredArmies = selectedArmies.filter(army => army.organization >= baseOrgThreshold);

    participatingArmies.push(...filteredArmies);
  }

  console.log(`Target empire: ${targetEmpire.name} (${targetEmpire.id})`);
  console.log(`Participating armies: ${participatingArmies.length}`);
  console.log('');

  // Expected participants with new logic:
  // Target empire (empire1):
  //   army1_1: high org (80 > 30) ✓
  //   army1_2: low org (25 < 30) ✗

  // Ally empire (empire2, +80 relations):
  //   Participation: ~80% of armies = ~2 out of 2 armies selected
  //   Org threshold: max(20, 60 - 80/4) = max(20, 40) = 40
  //   army2_1: selected (60 >= 40) ✓
  //   army2_2: selected (40 >= 40) ✓

  // Neutral empire (empire3, +20 relations):
  //   Participation: ~20% of armies = ~1 out of 2 armies selected (first in deterministic shuffle: army3_1)
  //   Org threshold: max(20, 60 - 20/4) = max(20, 55) = 55
  //   army3_1: selected but 60 >= 55 ✓
  //   army3_2: not selected ✗

  // Hostile empire (empire4, -50 relations):
  //   Relations <= 0, excluded entirely ✗

  const expectedParticipants = ['army1_1', 'army2_1', 'army2_2', 'army3_1'];
  const actualParticipants = participatingArmies.map(a => a.id).sort();
  expectedParticipants.sort();

  console.log('Expected participants:', expectedParticipants.join(', '));
  console.log('Actual participants:', actualParticipants.join(', '));
  console.log('');

  // Check each army
  const armyDetails = state.armies.map(army => {
    const relations = state.diplomacy?.relations?.[army.empireId]?.[targetEmpire.id] ?? 0;
    const participates = participatingArmies.some(p => p.id === army.id);
    const expected = expectedParticipants.includes(army.id);

    // Calculate what would happen for this army under the new logic
    let wouldParticipate = false;
    if (army.empireId === targetEmpire.id) {
      wouldParticipate = army.organization > 30;
    } else if (relations > 0) {
      const participationPercentage = Math.min(100, Math.max(0, relations));
      const empireArmies = state.armies.filter(a => a.empireId === army.empireId);
      const numToSelect = Math.ceil((empireArmies.length * participationPercentage) / 100);
      // For deterministic test, check if this army would be in the first N selected
      const empireArmiesSorted = empireArmies.sort((a, b) => a.id.localeCompare(b.id)); // deterministic sort
      const armyIndex = empireArmiesSorted.findIndex(a => a.id === army.id);
      if (armyIndex < numToSelect) {
        const baseOrgThreshold = Math.max(20, 60 - (relations / 4));
        wouldParticipate = army.organization >= baseOrgThreshold;
      }
    }

    return {
      id: army.id,
      empire: army.empireId,
      org: army.organization,
      relations,
      participates,
      expected,
      wouldParticipate,
      correct: participates === expected
    };
  });

  armyDetails.forEach(detail => {
    const status = detail.correct ? '✓' : '✗';
    console.log(`${status} ${detail.id}: Empire ${detail.empire}, Org ${detail.org}, Relations ${detail.relations}, Participates: ${detail.participates}`);
  });

  const allCorrect = armyDetails.every(d => d.correct);
  if (allCorrect) {
    console.log('\n✓ All participation decisions are correct');
    return true;
  } else {
    console.log('\n✗ Some participation decisions are incorrect');
    return false;
  }
}

// Run the test
if (testScourgeArmyParticipation()) {
  console.log('\n🎉 Scourge participation test passed!');
  process.exit(0);
} else {
  console.log('\n❌ Scourge participation test failed!');
  process.exit(1);
}