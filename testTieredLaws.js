#!/usr/bin/env node

/**
 * Test suite for tiered progressive law system
 * Validates tier-based unlocking, enacted law tracking, and progression
 */

import { createGameState, createPowerSystemPolicy } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { DeterministicRNG } from './src/modules/rng.js';
import { startLawProcess, resolveAllLawProcesses } from './src/game/lawProcessManager.js';
import { 
  getSampleLawDefinitions, 
  getAvailableLaws, 
  canStartLaw,
  getLawsByBranch,
  getLawsByTier,
  getBranchInfo,
  getTierStatus,
  countEnactedByTier,
  isTierUnlocked,
  TIERED_LAW_DEFINITIONS,
  TIER_REQUIREMENTS
} from './src/game/lawDefinitions.js';
import { createLawEvent, getAllLawEvents } from './src/game/lawEventTemplates.js';
import { initializeLogger, LogLevel } from './src/modules/logger.js';

// Initialize logger with minimal output
initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

console.log('============================================================');
console.log('Tiered Progressive Law System Test Suite');
console.log('============================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${message}`);
    return true;
  } else {
    testsFailed++;
    console.log(`✗ ${message}`);
    return false;
  }
}

function createTestState() {
  const state = createGameState(12345);
  const content = createSampleContent(12345);
  
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
  state.playerInfluence = 500; // Enough for multiple laws
  state.enactedLaws = []; // No enacted laws initially
  
  return state;
}

// Test 1: Law definitions have proper tier structure
console.log('=== Test 1: Tier Structure ===');
{
  const t1Laws = getLawsByTier(1);
  const t2Laws = getLawsByTier(2);
  const t3Laws = getLawsByTier(3);
  
  assert(t1Laws.length > 0, `T1 laws exist (${t1Laws.length} found)`);
  assert(t2Laws.length > 0, `T2 laws exist (${t2Laws.length} found)`);
  assert(t3Laws.length > 0, `T3 laws exist (${t3Laws.length} found)`);
  
  // All laws should have tier and branch
  const allHaveTier = TIERED_LAW_DEFINITIONS.every(l => l.tier >= 1 && l.tier <= 3);
  assert(allHaveTier, 'All laws have valid tier (1-3)');
  
  const allHaveBranch = TIERED_LAW_DEFINITIONS.every(l => l.branch && l.branch.length > 0);
  assert(allHaveBranch, 'All laws have a branch');
}
console.log();

// Test 2: Branches are properly organized
console.log('=== Test 2: Branch Organization ===');
{
  const branches = getBranchInfo();
  assert(branches.length >= 5, `Multiple branches exist (${branches.length} found)`);
  
  branches.forEach(branch => {
    const branchLaws = getLawsByBranch(branch.id);
    assert(branchLaws.length >= 3, `${branch.name} branch has laws (${branchLaws.length} found)`);
    
    // Check each branch has T1, T2, T3
    const tiers = branchLaws.map(l => l.tier);
    assert(tiers.includes(1) && tiers.includes(2) && tiers.includes(3), 
      `${branch.name} branch has all tiers`);
  });
}
console.log();

// Test 3: Tier requirements are configured
console.log('=== Test 3: Tier Requirements ===');
{
  assert(TIER_REQUIREMENTS[2] > 0, `T2 requires ${TIER_REQUIREMENTS[2]} T1 laws`);
  assert(TIER_REQUIREMENTS[3] > 0, `T3 requires ${TIER_REQUIREMENTS[3]} T2 laws`);
}
console.log();

// Test 4: T2/T3 blocked initially, T1 available
console.log('=== Test 4: Initial Availability ===');
{
  const state = createTestState();
  const available = getAvailableLaws(state);
  
  // All T1 laws should be available
  const t1Laws = getLawsByTier(1);
  const availableT1 = available.filter(l => l.tier === 1);
  assert(availableT1.length === t1Laws.length, `All T1 laws available (${availableT1.length}/${t1Laws.length})`);
  
  // No T2 or T3 should be available
  const availableT2 = available.filter(l => l.tier === 2);
  const availableT3 = available.filter(l => l.tier === 3);
  assert(availableT2.length === 0, 'No T2 laws available initially');
  assert(availableT3.length === 0, 'No T3 laws available initially');
  
  // Verify via isTierUnlocked
  assert(isTierUnlocked(1, state), 'T1 is unlocked');
  assert(!isTierUnlocked(2, state), 'T2 is locked initially');
  assert(!isTierUnlocked(3, state), 'T3 is locked initially');
}
console.log();

// Test 5: Enacting T1 laws unlocks T2
console.log('=== Test 5: T2 Unlocking ===');
{
  const state = createTestState();
  const t1Laws = getLawsByTier(1);
  const t2Laws = getLawsByTier(2);
  
  // Enact first T1 law - T2 should still be locked
  state.enactedLaws.push(t1Laws[0].id);
  assert(!isTierUnlocked(2, state), 'T2 still locked after 1 T1 law');
  
  let available = getAvailableLaws(state);
  assert(available.filter(l => l.tier === 2).length === 0, 'No T2 laws available after 1 T1');
  
  // Enact second T1 law - T2 should unlock
  state.enactedLaws.push(t1Laws[1].id);
  assert(isTierUnlocked(2, state), 'T2 unlocked after 2 T1 laws');
  
  available = getAvailableLaws(state);
  const availableT2 = available.filter(l => l.tier === 2);
  assert(availableT2.length === t2Laws.length, `All T2 laws now available (${availableT2.length})`);
  
  // Enacted T1 laws should not be in available list
  assert(!available.some(l => l.id === t1Laws[0].id), 'Enacted T1 law removed from available');
  assert(!available.some(l => l.id === t1Laws[1].id), 'Enacted T1 law removed from available');
}
console.log();

// Test 6: Enacting T2 laws unlocks T3
console.log('=== Test 6: T3 Unlocking ===');
{
  const state = createTestState();
  const t1Laws = getLawsByTier(1);
  const t2Laws = getLawsByTier(2);
  const t3Laws = getLawsByTier(3);
  
  // First unlock T2
  state.enactedLaws.push(t1Laws[0].id);
  state.enactedLaws.push(t1Laws[1].id);
  
  // Enact first T2 law - T3 should still be locked
  state.enactedLaws.push(t2Laws[0].id);
  assert(!isTierUnlocked(3, state), 'T3 still locked after 1 T2 law');
  
  // Enact second T2 law - T3 should unlock
  state.enactedLaws.push(t2Laws[1].id);
  assert(isTierUnlocked(3, state), 'T3 unlocked after 2 T2 laws');
  
  const available = getAvailableLaws(state);
  const availableT3 = available.filter(l => l.tier === 3);
  assert(availableT3.length === t3Laws.length, `All T3 laws now available (${availableT3.length})`);
}
console.log();

// Test 7: countEnactedByTier works correctly
console.log('=== Test 7: Tier Counting ===');
{
  const state = createTestState();
  const t1Laws = getLawsByTier(1);
  const t2Laws = getLawsByTier(2);
  
  let counts = countEnactedByTier(state);
  assert(counts[1] === 0 && counts[2] === 0 && counts[3] === 0, 'Initial counts are 0');
  
  state.enactedLaws.push(t1Laws[0].id);
  state.enactedLaws.push(t1Laws[1].id);
  state.enactedLaws.push(t1Laws[2].id);
  
  counts = countEnactedByTier(state);
  assert(counts[1] === 3, 'Counted 3 T1 laws');
  assert(counts[2] === 0, 'Still 0 T2 laws');
  
  state.enactedLaws.push(t2Laws[0].id);
  counts = countEnactedByTier(state);
  assert(counts[2] === 1, 'Counted 1 T2 law');
}
console.log();

// Test 8: canStartLaw returns correct reasons
console.log('=== Test 8: canStartLaw Messages ===');
{
  const state = createTestState();
  const t2Laws = getLawsByTier(2);
  
  // Non-existent law
  let result = canStartLaw('nonexistent_law', state);
  assert(!result.canStart && result.reason === 'Law not found', 'Error for non-existent law');
  
  // T2 law when T2 is locked
  result = canStartLaw(t2Laws[0].id, state);
  assert(!result.canStart, 'T2 law blocked when tier locked');
  assert(result.reason.includes('Tier 2 locked'), `Reason mentions tier lock: ${result.reason}`);
  
  // T1 law (should be startable)
  const t1Laws = getLawsByTier(1);
  result = canStartLaw(t1Laws[0].id, state);
  assert(result.canStart, 'T1 law can be started');
  
  // Already enacted law
  state.enactedLaws.push(t1Laws[0].id);
  result = canStartLaw(t1Laws[0].id, state);
  assert(!result.canStart && result.reason === 'Law already enacted', 'Error for already enacted law');
}
console.log();

// Test 9: Start process respects tier locking
console.log('=== Test 9: Start Process Tier Check ===');
{
  const state = createTestState();
  const t2Laws = getLawsByTier(2);
  
  // Try to start T2 law when T2 is locked
  const result = startLawProcess(state, t2Laws[0].id, 100);
  assert(!result.success, `Cannot start T2 law when tier locked`);
  assert(result.error.includes('Tier 2 locked'), `Error mentions tier lock: ${result.error}`);
  
  // Unlock T2 by enacting 2 T1 laws
  const t1Laws = getLawsByTier(1);
  state.enactedLaws.push(t1Laws[0].id);
  state.enactedLaws.push(t1Laws[1].id);
  
  // Should be able to start T2 now
  const result2 = startLawProcess(state, t2Laws[0].id, 100);
  assert(result2.success, `Can start T2 law after tier unlocked`);
}
console.log();

// Test 10: getTierStatus provides correct info
console.log('=== Test 10: Tier Status Display ===');
{
  const state = createTestState();
  
  let status = getTierStatus(state);
  assert(status[0].unlocked === true, 'T1 shows as unlocked');
  assert(status[1].unlocked === false, 'T2 shows as locked initially');
  assert(status[2].unlocked === false, 'T3 shows as locked initially');
  assert(status[1].required === TIER_REQUIREMENTS[2], `T2 shows requirement: ${status[1].required}`);
  
  // Unlock T2
  const t1Laws = getLawsByTier(1);
  state.enactedLaws.push(t1Laws[0].id);
  state.enactedLaws.push(t1Laws[1].id);
  
  status = getTierStatus(state);
  assert(status[1].unlocked === true, 'T2 shows as unlocked after progression');
  assert(status[1].previousEnacted === 2, 'T2 shows 2 T1 laws enacted');
}
console.log();

// Test 11: Full progression through all tiers
console.log('=== Test 11: Full Tier Progression ===');
{
  const state = createTestState();
  const t1Laws = getLawsByTier(1);
  const t2Laws = getLawsByTier(2);
  const t3Laws = getLawsByTier(3);
  
  // Start: only T1 available
  let available = getAvailableLaws(state);
  assert(available.every(l => l.tier === 1), 'Initially only T1 available');
  
  // Enact 2 T1 laws -> T2 unlocks
  state.enactedLaws.push(t1Laws[0].id, t1Laws[1].id);
  available = getAvailableLaws(state);
  const hasT1 = available.some(l => l.tier === 1);
  const hasT2 = available.some(l => l.tier === 2);
  assert(hasT1 && hasT2, 'After 2 T1: both T1 and T2 available');
  assert(!available.some(l => l.tier === 3), 'After 2 T1: T3 still locked');
  
  // Enact 2 T2 laws -> T3 unlocks
  state.enactedLaws.push(t2Laws[0].id, t2Laws[1].id);
  available = getAvailableLaws(state);
  const hasT3 = available.some(l => l.tier === 3);
  assert(hasT3, 'After 2 T2: T3 now available');
  
  // All tiers should have available laws (minus enacted ones)
  const availableT1 = available.filter(l => l.tier === 1).length;
  const availableT2 = available.filter(l => l.tier === 2).length;
  const availableT3 = available.filter(l => l.tier === 3).length;
  
  assert(availableT1 === t1Laws.length - 2, `T1: ${availableT1} available (${t1Laws.length - 2} expected)`);
  assert(availableT2 === t2Laws.length - 2, `T2: ${availableT2} available (${t2Laws.length - 2} expected)`);
  assert(availableT3 === t3Laws.length, `T3: ${availableT3} available (${t3Laws.length} expected)`);
  
  console.log('  Full progression: T1 enacted -> T2 unlocked -> T2 enacted -> T3 unlocked');
}
console.log();

// Summary
console.log('============================================================');
console.log('Test Results Summary');
console.log('============================================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('============================================================');

if (testsFailed === 0) {
  console.log('✓ ALL TESTS PASSED');
} else {
  console.log('✗ SOME TESTS FAILED');
  process.exit(1);
}
console.log('============================================================');
