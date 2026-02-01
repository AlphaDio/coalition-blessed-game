/**
 * Tiered Improvements System Tests
 * 
 * Tests the per-empire tier unlock system for improvements.
 * Key difference from laws: each empire tracks tier progress independently.
 */

import { createGameState, createEmpire } from './src/game/types.js';
import {
  initializeImprovementsState,
  acceptImprovementRequest,
  processImprovementsTick,
  createImprovementRequest
} from './src/game/improvements/index.js';
import {
  IMPROVEMENT_TIER_REQUIREMENTS,
  TIERED_IMPROVEMENT_DEFINITIONS,
  getTieredImprovementRequests,
  countEmpireCompletedByTier,
  isImprovementTierUnlocked,
  getAvailableImprovements,
  canStartImprovement,
  getImprovementTierStatus,
  getImprovementsByBranch,
  getImprovementsByTier,
  generateImprovementSuggestions,
  getEmpiresWithAccess,
  canCoalitionSuggest,
  refreshImprovementSuggestions
} from './src/game/improvements/definitions.js';

// Test counters
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ FAILED: ${message}`);
  }
}

function createTestState() {
  const state = createGameState(12345);
  state.improvements = initializeImprovementsState();
  state.improvements.requests = getTieredImprovementRequests();
  state.coalitionEconomy.requisition = 5000; // Plenty of requisition for testing
  
  // Add two empires
  state.empires = [
    createEmpire('empire_1', 'First Empire', 50, {}, {}, { stockpiles: { biomass: 100, plasma_fuel: 100, super_alloys: 100 } }),
    createEmpire('empire_2', 'Second Empire', 50, {}, {}, { stockpiles: { biomass: 100, plasma_fuel: 100, super_alloys: 100 } })
  ];
  
  return state;
}

function completeImprovement(state, improvement) {
  // Force complete the improvement
  improvement.buildProgress = improvement.build;
  improvement.state = 'ACTIVE';
}

console.log('============================================================');
console.log('Tiered Improvements System Test Suite');
console.log('============================================================\n');

// Test 1: Improvement definitions structure
console.log('=== Test 1: Improvement Definitions Structure ===');
{
  const definitions = TIERED_IMPROVEMENT_DEFINITIONS;
  
  assert(definitions.length > 0, `Definitions exist (${definitions.length} total)`);
  
  const t1 = definitions.filter(d => d.tier === 1);
  const t2 = definitions.filter(d => d.tier === 2);
  const t3 = definitions.filter(d => d.tier === 3);
  
  assert(t1.length > 0, `T1 improvements exist (${t1.length})`);
  assert(t2.length > 0, `T2 improvements exist (${t2.length})`);
  assert(t3.length > 0, `T3 improvements exist (${t3.length})`);
  
  // Check all have tier and branch
  const allHaveTier = definitions.every(d => d.tier >= 1 && d.tier <= 3);
  const allHaveBranch = definitions.every(d => typeof d.branch === 'string');
  
  assert(allHaveTier, 'All improvements have valid tier (1-3)');
  assert(allHaveBranch, 'All improvements have branch');
  
  // Check branches
  const branches = [...new Set(definitions.map(d => d.branch))];
  console.log(`  Branches: ${branches.join(', ')}`);
  assert(branches.length >= 3, 'Multiple branches defined');
}
console.log();

// Test 2: Tier requirements configuration
console.log('=== Test 2: Tier Requirements Configuration ===');
{
  assert(IMPROVEMENT_TIER_REQUIREMENTS[2] === 2, 'T2 requires 2 T1 improvements');
  assert(IMPROVEMENT_TIER_REQUIREMENTS[3] === 2, 'T3 requires 2 T2 improvements');
}
console.log();

// Test 3: Per-empire tier tracking
console.log('=== Test 3: Per-Empire Tier Tracking ===');
{
  const state = createTestState();
  
  // Initially no improvements for either empire
  const counts1 = countEmpireCompletedByTier(state, 'empire_1');
  const counts2 = countEmpireCompletedByTier(state, 'empire_2');
  
  assert(counts1[1] === 0, 'Empire 1 starts with 0 T1 improvements');
  assert(counts2[1] === 0, 'Empire 2 starts with 0 T1 improvements');
  
  // Accept a T1 improvement for empire_1
  const t1Improvement = state.improvements.requests.find(r => r.tier === 1);
  const result = acceptImprovementRequest(state, t1Improvement.id, 'empire_1');
  assert(result.success, `Empire 1 can accept T1: ${t1Improvement.name}`);
  
  // Complete it
  completeImprovement(state, state.improvements.queue[0]);
  
  const counts1After = countEmpireCompletedByTier(state, 'empire_1');
  const counts2After = countEmpireCompletedByTier(state, 'empire_2');
  
  assert(counts1After[1] === 1, 'Empire 1 now has 1 T1 improvement');
  assert(counts2After[1] === 0, 'Empire 2 still has 0 T1 improvements (per-empire tracking)');
}
console.log();

// Test 4: Tier unlock is per-empire
console.log('=== Test 4: Tier Unlock is Per-Empire ===');
{
  const state = createTestState();
  
  // Complete 2 T1 improvements for empire_1 only
  const t1Improvements = state.improvements.requests.filter(r => r.tier === 1);
  
  for (let i = 0; i < 2; i++) {
    const result = acceptImprovementRequest(state, t1Improvements[i].id, 'empire_1');
    assert(result.success, `Empire 1 accepts T1 #${i + 1}: ${t1Improvements[i].name}`);
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  // Empire 1 should have T2 unlocked
  assert(isImprovementTierUnlocked(2, state, 'empire_1'), 'Empire 1 has T2 unlocked');
  assert(!isImprovementTierUnlocked(2, state, 'empire_2'), 'Empire 2 does NOT have T2 unlocked');
  
  // Empire 1 can start T2, Empire 2 cannot
  const t2Improvement = state.improvements.requests.find(r => r.tier === 2);
  
  const check1 = canStartImprovement(t2Improvement.id, state, 'empire_1');
  const check2 = canStartImprovement(t2Improvement.id, state, 'empire_2');
  
  assert(check1.canStart, `Empire 1 can start T2: ${t2Improvement.name}`);
  assert(!check2.canStart, `Empire 2 cannot start T2 (${check2.reason})`);
}
console.log();

// Test 5: T2 to T3 progression
console.log('=== Test 5: T2 to T3 Progression ===');
{
  const state = createTestState();
  
  // Complete 2 T1 for empire_1
  const t1s = state.improvements.requests.filter(r => r.tier === 1);
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  assert(isImprovementTierUnlocked(2, state, 'empire_1'), 'T2 unlocked after 2 T1s');
  assert(!isImprovementTierUnlocked(3, state, 'empire_1'), 'T3 still locked');
  
  // Complete 2 T2 for empire_1
  const t2s = state.improvements.requests.filter(r => r.tier === 2);
  for (let i = 0; i < 2; i++) {
    const result = acceptImprovementRequest(state, t2s[i].id, 'empire_1');
    assert(result.success, `Empire 1 accepts T2 #${i + 1}`);
    completeImprovement(state, state.improvements.queue[2 + i]);
  }
  
  assert(isImprovementTierUnlocked(3, state, 'empire_1'), 'T3 unlocked after 2 T2s');
  
  // Now empire_1 can build T3
  const t3 = state.improvements.requests.find(r => r.tier === 3);
  const check = canStartImprovement(t3.id, state, 'empire_1');
  assert(check.canStart, `Empire 1 can now start T3: ${t3.name}`);
}
console.log();

// Test 6: Available improvements filtered by empire tier
console.log('=== Test 6: Available Improvements Per Empire ===');
{
  const state = createTestState();
  
  // Initially only T1 available
  const available1 = getAvailableImprovements(state, 'empire_1');
  const available2 = getAvailableImprovements(state, 'empire_2');
  
  assert(available1.every(i => i.tier === 1), 'Empire 1 only sees T1 improvements initially');
  assert(available2.every(i => i.tier === 1), 'Empire 2 only sees T1 improvements initially');
  
  // Unlock T2 for empire_1
  const t1s = state.improvements.requests.filter(r => r.tier === 1);
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  const available1After = getAvailableImprovements(state, 'empire_1');
  const available2After = getAvailableImprovements(state, 'empire_2');
  
  const hasT2 = available1After.some(i => i.tier === 2);
  assert(hasT2, 'Empire 1 now sees T2 improvements');
  assert(available2After.every(i => i.tier === 1), 'Empire 2 still only sees T1 improvements');
}
console.log();

// Test 7: Tier status reporting
console.log('=== Test 7: Tier Status Reporting ===');
{
  const state = createTestState();
  
  // Complete 1 T1 for empire_1
  const t1 = state.improvements.requests.find(r => r.tier === 1);
  acceptImprovementRequest(state, t1.id, 'empire_1');
  completeImprovement(state, state.improvements.queue[0]);
  
  const status = getImprovementTierStatus(state, 'empire_1');
  
  assert(status.length === 3, 'Status has 3 tiers');
  assert(status[0].tier === 1 && status[0].unlocked === true, 'T1 always unlocked');
  assert(status[0].completed === 1, 'T1 shows 1 completed');
  assert(status[1].tier === 2 && status[1].unlocked === false, 'T2 still locked');
  assert(status[1].previousCompleted === 1, 'T2 shows previousCompleted = 1');
  assert(status[1].required === 2, 'T2 shows required = 2');
  
  console.log('  Status for empire_1:');
  status.forEach(s => {
    console.log(`    T${s.tier}: ${s.unlocked ? 'UNLOCKED' : 'LOCKED'} (${s.completed} completed, need ${s.required})`);
  });
}
console.log();

// Test 8: Branch and tier filtering
console.log('=== Test 8: Branch and Tier Filtering ===');
{
  const military = getImprovementsByBranch('military');
  const industrial = getImprovementsByBranch('industrial');
  const tier1 = getImprovementsByTier(1);
  const tier3 = getImprovementsByTier(3);
  
  assert(military.length > 0, `Military branch has ${military.length} improvements`);
  assert(industrial.length > 0, `Industrial branch has ${industrial.length} improvements`);
  assert(tier1.length > 0, `Tier 1 has ${tier1.length} improvements`);
  assert(tier3.length > 0, `Tier 3 has ${tier3.length} improvements`);
  
  assert(military.every(i => i.branch === 'military'), 'Military filter is correct');
  assert(tier1.every(i => i.tier === 1), 'Tier 1 filter is correct');
}
console.log();

// Test 9: Accept rejects T2 when locked
console.log('=== Test 9: Accept Rejects T2 When Locked ===');
{
  const state = createTestState();
  
  const t2 = state.improvements.requests.find(r => r.tier === 2);
  const result = acceptImprovementRequest(state, t2.id, 'empire_1');
  
  assert(!result.success, 'T2 improvement rejected');
  assert(result.error.includes('Tier 2 locked'), `Error message: ${result.error}`);
}
console.log();

// Test 10: Improvement instance stores tier/branch
console.log('=== Test 10: Improvement Instance Stores Tier/Branch ===');
{
  const state = createTestState();
  
  const t1 = state.improvements.requests.find(r => r.tier === 1);
  acceptImprovementRequest(state, t1.id, 'empire_1');
  
  const instance = state.improvements.queue[0];
  
  assert(instance.tier === 1, `Instance has tier: ${instance.tier}`);
  assert(typeof instance.branch === 'string', `Instance has branch: ${instance.branch}`);
}
console.log();

// Test 11: Degraded improvements still count toward tier
console.log('=== Test 11: Degraded Improvements Count Toward Tier ===');
{
  const state = createTestState();
  
  // Complete 2 T1 for empire_1, then degrade one
  const t1s = state.improvements.requests.filter(r => r.tier === 1);
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  // Degrade one
  state.improvements.queue[0].state = 'DEGRADED';
  
  const counts = countEmpireCompletedByTier(state, 'empire_1');
  assert(counts[1] === 2, 'Degraded improvements still count (2 T1)');
  assert(isImprovementTierUnlocked(2, state, 'empire_1'), 'T2 still unlocked with degraded improvement');
}
console.log();

// Test 12: Building improvements don't count toward tier
console.log('=== Test 12: Building Improvements Do Not Count ===');
{
  const state = createTestState();
  
  // Accept 2 T1 but don't complete them
  const t1s = state.improvements.requests.filter(r => r.tier === 1);
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
  }
  
  // Both are BUILDING
  assert(state.improvements.queue[0].state === 'BUILDING', 'First is BUILDING');
  assert(state.improvements.queue[1].state === 'BUILDING', 'Second is BUILDING');
  
  const counts = countEmpireCompletedByTier(state, 'empire_1');
  assert(counts[1] === 0, 'BUILDING improvements do not count toward tier');
  assert(!isImprovementTierUnlocked(2, state, 'empire_1'), 'T2 still locked');
}
console.log();

// Test 13: Two empires can progress independently
console.log('=== Test 13: Independent Empire Progression ===');
{
  const state = createTestState();
  
  const t1s = state.improvements.requests.filter(r => r.tier === 1);
  
  // Empire 1 completes 2 T1
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  // Empire 2 completes 1 T1
  acceptImprovementRequest(state, t1s[2].id, 'empire_2');
  completeImprovement(state, state.improvements.queue[2]);
  
  assert(isImprovementTierUnlocked(2, state, 'empire_1'), 'Empire 1 has T2');
  assert(!isImprovementTierUnlocked(2, state, 'empire_2'), 'Empire 2 still locked at T1');
  
  // Empire 2 completes another T1
  acceptImprovementRequest(state, t1s[3].id, 'empire_2');
  completeImprovement(state, state.improvements.queue[3]);
  
  assert(isImprovementTierUnlocked(2, state, 'empire_2'), 'Empire 2 now has T2');
}
console.log();

// Test 14: T1 always accessible
console.log('=== Test 14: T1 Always Accessible ===');
{
  const state = createTestState();
  
  assert(isImprovementTierUnlocked(1, state, 'empire_1'), 'T1 unlocked for new empire');
  assert(isImprovementTierUnlocked(1, state, 'empire_2'), 'T1 unlocked for second empire');
  assert(isImprovementTierUnlocked(1, state, 'nonexistent'), 'T1 unlocked even for nonexistent empire');
}
console.log();

// Test 15: Integration with build process
console.log('=== Test 15: Integration with Build Process ===');
{
  const state = createTestState();
  state.coalitionConstruction = 5; // Fast building
  
  const t1s = state.improvements.requests.filter(r => r.tier === 1);
  
  // Accept 2 T1 and build them via tick processing
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
  }
  
  // Run ticks until both complete
  for (let tick = 0; tick < 20; tick++) {
    state.turn++;
    processImprovementsTick(state);
  }
  
  const active = state.improvements.queue.filter(i => i.state === 'ACTIVE');
  assert(active.length === 2, `2 improvements now ACTIVE (got ${active.length})`);
  assert(isImprovementTierUnlocked(2, state, 'empire_1'), 'T2 unlocked via natural build process');
  
  // Now accept a T2
  const t2 = state.improvements.requests.find(r => r.tier === 2);
  const result = acceptImprovementRequest(state, t2.id, 'empire_1');
  assert(result.success, 'Can now accept T2 improvement');
}
console.log();

// Test 16: Suggestion system - only eligible suggesters
console.log('=== Test 16: Suggestion System - Eligible Suggesters ===');
{
  const state = createTestState();
  
  // Use a deterministic RNG
  let rngCalls = 0;
  const deterministicRng = () => {
    rngCalls++;
    return 0.75; // Will pick empire over coalition for T1
  };
  
  const suggestions = generateImprovementSuggestions(state, deterministicRng);
  
  // All T1 should be present (coalition can always suggest T1)
  const t1Suggestions = suggestions.filter(s => s.tier === 1);
  assert(t1Suggestions.length === 10, `All 10 T1 improvements suggested (got ${t1Suggestions.length})`);
  
  // No T2/T3 should be present (no empire has access yet)
  const t2Suggestions = suggestions.filter(s => s.tier === 2);
  const t3Suggestions = suggestions.filter(s => s.tier === 3);
  assert(t2Suggestions.length === 0, 'No T2 improvements suggested (no empire has access)');
  assert(t3Suggestions.length === 0, 'No T3 improvements suggested (no empire has access)');
}
console.log();

// Test 17: T1 suggestions can be coalition or empire
console.log('=== Test 17: T1 Suggestions - Coalition or Empire ===');
{
  const state = createTestState();
  
  // RNG that returns 0.3 (< 0.5) should pick coalition
  const coalitionRng = () => 0.3;
  const coalitionSuggestions = generateImprovementSuggestions(state, coalitionRng);
  const coalitionT1 = coalitionSuggestions.filter(s => s.tier === 1 && s.suggestedBy === 'coalition');
  assert(coalitionT1.length === 10, `Coalition suggests all T1 when rng < 0.5 (got ${coalitionT1.length})`);
  
  // RNG that returns 0.7 (> 0.5) should pick empire
  const empireRng = () => 0.7;
  const empireSuggestions = generateImprovementSuggestions(state, empireRng);
  const empireT1 = empireSuggestions.filter(s => s.tier === 1 && s.suggestedBy !== 'coalition');
  assert(empireT1.length === 10, `Empires suggest all T1 when rng > 0.5 (got ${empireT1.length})`);
}
console.log();

// Test 18: T2 suggestions appear when empire unlocks
console.log('=== Test 18: T2 Suggestions Appear When Empire Unlocks ===');
{
  const state = createTestState();
  
  // Initially no T2
  let suggestions = generateImprovementSuggestions(state, () => 0.5);
  assert(suggestions.filter(s => s.tier === 2).length === 0, 'No T2 initially');
  
  // Unlock T2 for empire_1
  const t1s = getTieredImprovementRequests().filter(r => r.tier === 1);
  state.improvements.requests = t1s;
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  // Now T2 should appear, suggested by empire_1
  suggestions = generateImprovementSuggestions(state, () => 0.5);
  const t2Suggestions = suggestions.filter(s => s.tier === 2);
  assert(t2Suggestions.length === 10, `T2 improvements now suggested (got ${t2Suggestions.length})`);
  
  // All T2 should be suggested by empire_1 (only empire with access)
  const allByEmpire1 = t2Suggestions.every(s => s.suggestedBy === 'empire_1');
  assert(allByEmpire1, 'All T2 suggested by empire_1 (only empire with access)');
}
console.log();

// Test 19: Coalition cannot suggest T2/T3 directly
console.log('=== Test 19: Coalition Cannot Suggest T2/T3 Directly ===');
{
  const state = createTestState();
  
  // Get a T2 improvement
  const t2Improvement = TIERED_IMPROVEMENT_DEFINITIONS.find(i => i.tier === 2);
  
  // Coalition cannot suggest T2 when no empire has access
  assert(!canCoalitionSuggest(state, t2Improvement), 'Coalition cannot suggest T2 when no empire has access');
  
  // Coalition CAN suggest T1
  const t1Improvement = TIERED_IMPROVEMENT_DEFINITIONS.find(i => i.tier === 1);
  assert(canCoalitionSuggest(state, t1Improvement), 'Coalition can suggest T1');
  
  // Unlock T2 for empire_1
  const t1s = getTieredImprovementRequests().filter(r => r.tier === 1);
  state.improvements.requests = t1s;
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  // Coalition CAN now suggest T2 (because empire_1 has access)
  assert(canCoalitionSuggest(state, t2Improvement), 'Coalition can suggest T2 when an empire has access');
  
  // But generated suggestions for T2 should be from empire, not coalition
  const suggestions = generateImprovementSuggestions(state, () => 0.5);
  const t2Suggestions = suggestions.filter(s => s.tier === 2);
  const anyCoalitionT2 = t2Suggestions.some(s => s.suggestedBy === 'coalition');
  assert(!anyCoalitionT2, 'T2 suggestions are from empires, not coalition');
}
console.log();

// Test 20: getEmpiresWithAccess returns correct empires
console.log('=== Test 20: getEmpiresWithAccess ===');
{
  const state = createTestState();
  
  const t1Improvement = TIERED_IMPROVEMENT_DEFINITIONS.find(i => i.tier === 1);
  const t2Improvement = TIERED_IMPROVEMENT_DEFINITIONS.find(i => i.tier === 2);
  
  // Both empires have T1 access
  let empires = getEmpiresWithAccess(state, t1Improvement);
  assert(empires.length === 2, 'Both empires have T1 access');
  assert(empires.includes('empire_1'), 'empire_1 has T1 access');
  assert(empires.includes('empire_2'), 'empire_2 has T1 access');
  
  // No empire has T2 access initially
  empires = getEmpiresWithAccess(state, t2Improvement);
  assert(empires.length === 0, 'No empire has T2 access initially');
  
  // Unlock T2 for empire_1 only
  const t1s = getTieredImprovementRequests().filter(r => r.tier === 1);
  state.improvements.requests = t1s;
  for (let i = 0; i < 2; i++) {
    acceptImprovementRequest(state, t1s[i].id, 'empire_1');
    completeImprovement(state, state.improvements.queue[i]);
  }
  
  empires = getEmpiresWithAccess(state, t2Improvement);
  assert(empires.length === 1, 'Only empire_1 has T2 access');
  assert(empires[0] === 'empire_1', 'empire_1 is the one with T2 access');
}
console.log();

// Test 21: refreshImprovementSuggestions updates state
console.log('=== Test 21: refreshImprovementSuggestions ===');
{
  const state = createTestState();
  state.improvements.requests = []; // Clear requests
  
  refreshImprovementSuggestions(state, () => 0.3);
  
  assert(state.improvements.requests.length > 0, 'Requests populated after refresh');
  
  // Only T1 should be present
  const allT1 = state.improvements.requests.every(r => r.tier === 1);
  assert(allT1, 'Only T1 improvements after refresh (no empire has T2)');
}
console.log();

// Summary
console.log('============================================================');
console.log('Test Results Summary');
console.log('============================================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('============================================================');
if (failed === 0) {
  console.log('✓ ALL TESTS PASSED');
} else {
  console.log('✗ SOME TESTS FAILED');
  process.exit(1);
}
console.log('============================================================');
