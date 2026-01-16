#!/usr/bin/env node

/**
 * CLI Runner for Law Enactment System
 * Usage: node lawRunner.js [seed]
 */

import { createGameState, createPowerSystemPolicy } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { DeterministicRNG } from './src/modules/rng.js';
import { startLawProcess, resolveAllLawProcesses } from './src/game/lawProcessManager.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';

// Parse command line arguments
const args = process.argv.slice(2);
const seed = args[0] ? parseInt(args[0], 10) : 42;

console.log('='.repeat(80));
console.log('Law Enactment System - CLI Runner');
console.log('='.repeat(80));
console.log(`Seed: ${seed}\n`);

// Initialize RNG
const rng = new DeterministicRNG(seed);

// Initialize game state
const state = createGameState();
const content = createSampleContent();

// Populate state
state.empires = content.empires;
state.armies = content.armies;

// Add law definitions
state.lawDefinitions = getSampleLawDefinitions();

// Add law events to the regular events array with scope marker
const lawEvents = getAllLawEvents();
state.events = [...content.events, ...lawEvents];

// Set up power system (equal council by default)
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

// Give player initial influence to start a law
state.playerInfluence = 100;

console.log('Initial State:');
console.log(`  Empires: ${state.empires.length}`);
console.log(`  Law Definitions: ${state.lawDefinitions.length}`);
console.log(`  Law Events: ${lawEvents.length}`);
console.log(`  Player Influence: ${state.playerInfluence}`);
console.log(`  Power System: ${state.powerSystemPolicy.name}\n`);

// List available laws
console.log('Available Laws:');
state.lawDefinitions.forEach((law, i) => {
  console.log(`  ${i + 1}. ${law.name} (${law.id})`);
});
console.log();

// Start a law process (AI Citizenship as example)
const lawToStart = state.lawDefinitions[0]; // AI Citizenship
console.log(`Starting law process: ${lawToStart.name}`);
console.log('-'.repeat(80));

const startResult = startLawProcess(state, lawToStart.id, 100);
if (startResult.error) {
  console.error(`Error: ${startResult.error}`);
  process.exit(1);
}

startResult.log.forEach(line => console.log(line));
console.log();

// Get the started process
const lawProcess = state.lawProcesses[0];

console.log('Empire Stances:');
Object.entries(lawProcess.empireStances).forEach(([empireId, stance]) => {
  const empire = state.empires.find(e => e.id === empireId);
  console.log(`  ${empire.name}: ${stance.stance_tier} (score: ${stance.stance_score.toFixed(2)}, vote: ${stance.vote_intent})`);
});
console.log();

// Simulate law process over multiple ticks
console.log('='.repeat(80));
console.log('Simulating Law Process');
console.log('='.repeat(80));
console.log();

const MAX_TICKS = 100;
let tick = 0;

while (tick < MAX_TICKS && lawProcess.phase !== 'ENACTED' && lawProcess.phase !== 'BURIED') {
  tick++;
  state.turn = tick;
  
  // Resolve law processes
  const logs = resolveAllLawProcesses(state, rng);
  
  if (logs.length > 0) {
    console.log(`\nTick ${tick}:`);
    logs.forEach(line => console.log(line));
  }
  
  // Check if process finished
  if (lawProcess.phase === 'ENACTED' || lawProcess.phase === 'BURIED') {
    break;
  }
}

// Final summary
console.log('\n' + '='.repeat(80));
console.log('Final Summary');
console.log('='.repeat(80));
console.log(`Law: ${lawToStart.name}`);
console.log(`Final Phase: ${lawProcess.phase}`);
console.log(`Total Ticks: ${tick}`);
console.log(`Rejects: ${lawProcess.rejects}/4`);
console.log(`Events Fired: ${lawProcess.eventLog.length}`);
console.log();

console.log('Meters (final):');
Object.entries(lawProcess.meters).forEach(([meter, value]) => {
  console.log(`  ${meter}: ${value.toFixed(2)}`);
});
console.log();

console.log('Event Log:');
lawProcess.eventLog.forEach(entry => {
  console.log(`  Tick ${entry.tick} [${entry.phase}]: ${entry.eventId} (${entry.nature || 'N/A'})`);
});
console.log();

console.log('Empire Final Stances:');
Object.entries(lawProcess.empireStances).forEach(([empireId, stance]) => {
  const empire = state.empires.find(e => e.id === empireId);
  console.log(`  ${empire.name}: ${stance.stance_tier} (vote: ${stance.vote_intent})`);
});
console.log();

console.log('='.repeat(80));
console.log(`Result: ${lawProcess.phase === 'ENACTED' ? 'LAW ENACTED ✓' : 'LAW BURIED ✗'}`);
console.log('='.repeat(80));
