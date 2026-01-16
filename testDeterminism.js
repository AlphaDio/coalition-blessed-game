#!/usr/bin/env node

/**
 * Test determinism of law enactment system
 * Runs the same seed twice and verifies identical outcomes
 */

import { createGameState, createPowerSystemPolicy } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { DeterministicRNG } from './src/modules/rng.js';
import { startLawProcess, resolveAllLawProcesses } from './src/game/lawProcessManager.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';

function runSimulation(seed) {
  const rng = new DeterministicRNG(seed);
  const state = createGameState();
  const content = createSampleContent();
  
  state.empires = content.empires;
  state.armies = content.armies;
  state.lawDefinitions = getSampleLawDefinitions();
  state.events = [...content.events, ...getAllLawEvents()];
  state.powerSystemPolicy = createPowerSystemPolicy(
    'equal_council',
    'Equal Council Votes',
    'equal_council',
    {
      base_votes_per_empire: 1,
      quorum_threshold: 0.5,
      pass_threshold: 0.5
    }
  );
  state.playerInfluence = 100;
  
  // Start law process
  const lawToStart = state.lawDefinitions[0];
  startLawProcess(state, lawToStart.id, 100);
  const lawProcess = state.lawProcesses[0];
  
  // Simulate
  const MAX_TICKS = 100;
  let tick = 0;
  
  while (tick < MAX_TICKS && lawProcess.phase !== 'ENACTED' && lawProcess.phase !== 'BURIED') {
    tick++;
    state.turn = tick;
    resolveAllLawProcesses(state, rng);
    
    if (lawProcess.phase === 'ENACTED' || lawProcess.phase === 'BURIED') {
      break;
    }
  }
  
  return {
    finalPhase: lawProcess.phase,
    totalTicks: tick,
    rejects: lawProcess.rejects,
    eventCount: lawProcess.eventLog.length,
    eventLog: lawProcess.eventLog.map(e => ({
      tick: e.tick,
      phase: e.phase,
      eventId: e.eventId,
      nature: e.nature
    }))
  };
}

console.log('Testing determinism of law enactment system...\n');

const SEED = 12345;

console.log(`Running simulation 1 with seed ${SEED}...`);
const result1 = runSimulation(SEED);

console.log(`Running simulation 2 with seed ${SEED}...`);
const result2 = runSimulation(SEED);

console.log('\nComparison:');
console.log('============');

const checks = [
  { name: 'Final Phase', val1: result1.finalPhase, val2: result2.finalPhase },
  { name: 'Total Ticks', val1: result1.totalTicks, val2: result2.totalTicks },
  { name: 'Rejects', val1: result1.rejects, val2: result2.rejects },
  { name: 'Event Count', val1: result1.eventCount, val2: result2.eventCount }
];

let allMatch = true;

checks.forEach(check => {
  const match = check.val1 === check.val2;
  allMatch = allMatch && match;
  console.log(`${check.name}: ${check.val1} vs ${check.val2} ${match ? '✓' : '✗'}`);
});

// Check event log matches
let eventsMatch = true;
if (result1.eventLog.length === result2.eventLog.length) {
  for (let i = 0; i < result1.eventLog.length; i++) {
    const e1 = result1.eventLog[i];
    const e2 = result2.eventLog[i];
    if (e1.tick !== e2.tick || e1.phase !== e2.phase || e1.eventId !== e2.eventId || e1.nature !== e2.nature) {
      eventsMatch = false;
      console.log(`Event ${i} mismatch:`, e1, 'vs', e2);
      break;
    }
  }
} else {
  eventsMatch = false;
}

console.log(`Event Log Match: ${eventsMatch ? '✓' : '✗'}`);
allMatch = allMatch && eventsMatch;

console.log('\n' + '='.repeat(50));
if (allMatch) {
  console.log('✓ DETERMINISM TEST PASSED');
  console.log('Same seed produces identical outcomes');
} else {
  console.log('✗ DETERMINISM TEST FAILED');
  console.log('Same seed produced different outcomes');
  process.exit(1);
}
console.log('='.repeat(50));
