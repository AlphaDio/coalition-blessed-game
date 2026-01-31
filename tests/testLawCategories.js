#!/usr/bin/env node

/**
 * Test Law Categories + Tier Unlocks
 */

import { createGameState, createLawProcess, createPowerSystemPolicy } from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import { DeterministicRNG } from '../src/modules/rng.js';
import { resolveLawProcess } from '../src/game/lawProcessManager.js';
import { getSampleLawDefinitions, isTierUnlocked } from '../src/game/lawDefinitions.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

console.log('============================================================');
console.log('Law Categories + Tier Unlocks Test Suite');
console.log('============================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${message}`);
    return true;
  } else {
    testsFailed++;
    console.log(`[FAIL] ${message}`);
    return false;
  }
}

function createTestState(seed = 42) {
  const state = createGameState(seed);
  const content = createSampleContent(seed);
  state.empires = content.empires;
  state.armies = content.armies;
  state.events = content.events || [];
  state.lawDefinitions = getSampleLawDefinitions();
  state.powerSystemPolicy = createPowerSystemPolicy(
    'equal_council',
    'Equal Council Votes',
    'equal_council',
    { base_votes_per_empire: 1, quorum_threshold: 0.5, pass_threshold: 0.5 }
  );
  state.heroes = [];
  state.lawProcesses = [];
  state.enactedLaws = [];
  state.enactedLawsByCategory = {};
  state.enactedLawsHistory = [];
  state.lawTierUnlocks = { 1: true, 2: false, 3: false };
  return state;
}

function enactLaw(state, lawId) {
  const lawProcess = createLawProcess(lawId, state.turn || 0);
  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 1.0;
  lawProcess.phaseTicks = 0;
  const rng = new DeterministicRNG(123);
  resolveLawProcess(lawProcess, state, rng);
}

console.log('=== Test 1: Tier Unlocks ===');
{
  const state = createTestState();
  assert(isTierUnlocked(2, state) === false, 'T2 locked before any T1 enacted');
  assert(isTierUnlocked(3, state) === false, 'T3 locked before any T2 enacted');

  const t1Law = state.lawDefinitions.find(l => l.tier === 1);
  enactLaw(state, t1Law.id);
  assert(isTierUnlocked(2, state) === true, 'T2 unlocked after any T1 enacted');

  const t2Law = state.lawDefinitions.find(l => l.tier === 2);
  enactLaw(state, t2Law.id);
  assert(isTierUnlocked(3, state) === true, 'T3 unlocked after any T2 enacted');
}
console.log();

console.log('=== Test 2: One Law Per Category (Replacement) ===');
{
  const state = createTestState();
  const econLaws = state.lawDefinitions.filter(l => l.category === 'economy');
  const first = econLaws.find(l => l.modifiers?.trade_income);
  const second = econLaws.find(l => l.id !== first.id && l.modifiers?.trade_income);
  enactLaw(state, first.id);
  assert(state.enactedLawsByCategory.economy === first.id, 'Economy category set to first law');
  const firstIncome = state.coalitionModifiers.trade_income;
  enactLaw(state, second.id);
  assert(state.enactedLawsByCategory.economy === second.id, 'Economy category replaced by second law');
  assert(state.coalitionModifiers.trade_income === second.modifiers.trade_income, 'Trade income reflects latest law only');
  assert(state.coalitionModifiers.trade_income !== firstIncome, 'Old law modifier removed on replacement');
}
console.log();

console.log('=== Test 3: Active Laws Mirror Categories ===');
{
  const state = createTestState();
  const econ = state.lawDefinitions.find(l => l.category === 'economy' && l.tier === 1);
  const mil = state.lawDefinitions.find(l => l.category === 'military' && l.tier === 1);
  const gov = state.lawDefinitions.find(l => l.category === 'governance' && l.tier === 1);

  enactLaw(state, econ.id);
  enactLaw(state, mil.id);
  enactLaw(state, gov.id);

  assert(state.enactedLaws.length === 3, 'Three categories -> three active laws');
  assert(state.activeLaws.length === 3, 'activeLaws mirrors enacted categories');
}
console.log();

console.log('============================================================');
console.log('Test Results Summary');
console.log('============================================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('============================================================');

if (testsFailed === 0) {
  console.log('[PASS] ALL TESTS PASSED');
} else {
  console.log('[FAIL] SOME TESTS FAILED');
  process.exit(1);
}
console.log('============================================================');
