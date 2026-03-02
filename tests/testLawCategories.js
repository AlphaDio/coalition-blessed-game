#!/usr/bin/env node

/**
 * Test Law Statutes + Hero Proposal Flow
 */

import { createGameState, createLawProcess, createPowerSystemPolicy } from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import { DeterministicRNG } from '../src/modules/rng.js';
import { resolveLawProcess, startLawProcessFromProposal } from '../src/game/lawProcessManager.js';
import { generateHeroLawProposals, getAvailableProposedLaws } from '../src/game/lawProposals.js';
import { getSampleLawDefinitions, isTierUnlocked } from '../src/game/lawDefinitions.js';
import { assignInitialHeroes } from '../src/game/heroes.js';
import { TRADE_INCOME_EFFECT_DIVISOR } from '../src/game/constants.js';
import { applyPostMarketUpdates } from '../src/game/economyTick/postTick.js';
import { applyImprovementModifiers } from '../src/game/improvements/engine/modifiers.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

console.log('============================================================');
console.log('Law Statutes + Hero Proposal Test Suite');
console.log('============================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${message}`);
    return true;
  }

  testsFailed++;
  console.log(`[FAIL] ${message}`);
  return false;
}

function createTestState(seed = 42) {
  const state = createGameState(seed);
  const content = createSampleContent(seed);
  const rng = new DeterministicRNG(seed);

  state.empires = content.empires;
  state.armies = content.armies;
  state.events = content.events || [];
  state.lawDefinitions = getSampleLawDefinitions();
  state.heroRoster = content.heroRoster || [];
  state.powerSystemPolicy = createPowerSystemPolicy(
    'equal_council',
    'Equal Council Votes',
    'equal_council',
    { base_votes_per_empire: 1, quorum_threshold: 0.5, pass_threshold: 0.5 }
  );
  state.heroes = [];
  state.proposedLaws = [];
  state.lawProcesses = [];
  state.enactedLaws = [];
  state.enactedLawsByCategory = {};
  state.enactedLawsHistory = [];
  state.lawTierUnlocks = { 1: true, 2: false, 3: false };
  state.playerInfluence = 300;

  assignInitialHeroes(state, rng.random.bind(rng));
  return state;
}

function enactLaw(state, lawId, proposal = null) {
  if (proposal) {
    state.proposedLaws.push(proposal);
  }
  const lawProcess = createLawProcess(lawId, state.turn || 0);
  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 1.0;
  lawProcess.phaseTicks = 0;
  lawProcess.proposalId = proposal?.proposalId || null;
  lawProcess.sponsorHeroId = proposal?.proposerHeroId || null;
  const rng = new DeterministicRNG(123);
  resolveLawProcess(lawProcess, state, rng);
  return lawProcess;
}

console.log('=== Test 1: Tier Unlocks Still Work ===');
{
  const state = createTestState();
  assert(isTierUnlocked(2, state) === false, 'T2 locked before any T1 enacted');
  assert(isTierUnlocked(3, state) === false, 'T3 locked before any T2 enacted');

  const t1Law = state.lawDefinitions.find((law) => law.tier === 1);
  enactLaw(state, t1Law.id);
  assert(isTierUnlocked(2, state) === true, 'T2 unlocked after any T1 enacted');

  const t2Law = state.lawDefinitions.find((law) => law.tier === 2);
  enactLaw(state, t2Law.id);
  assert(isTierUnlocked(3, state) === true, 'T3 unlocked after any T2 enacted');
}
console.log();

console.log('=== Test 2: Same-Category Laws Coexist ===');
{
  const state = createTestState();
  const econLaws = state.lawDefinitions.filter((law) => law.category === 'economy');
  const first = econLaws.find((law) => Number.isFinite(law.modifiers?.trade_income));
  const second = econLaws.find((law) => law.id !== first.id && Number.isFinite(law.modifiers?.trade_income));

  enactLaw(state, first.id);
  const firstIncome = state.coalitionModifiers.trade_income;
  enactLaw(state, second.id);

  assert(state.enactedLaws.includes(first.id), 'First economy law remains enacted');
  assert(state.enactedLaws.includes(second.id), 'Second economy law also becomes enacted');
  assert(state.coalitionModifiers.trade_income === (first.modifiers.trade_income + second.modifiers.trade_income), 'Trade income stacks across economy statutes');
  assert(state.coalitionModifiers.trade_income > firstIncome, 'Second law adds on top of the first instead of replacing it');
}
console.log();

console.log('=== Test 3: Active Laws Mirror All Enacted Statutes ===');
{
  const state = createTestState();
  const econ = state.lawDefinitions.find((law) => law.category === 'economy' && law.tier === 1);
  const mil = state.lawDefinitions.find((law) => law.category === 'military' && law.tier === 1);
  const gov = state.lawDefinitions.find((law) => law.category === 'governance' && law.tier === 1);

  enactLaw(state, econ.id);
  enactLaw(state, mil.id);
  enactLaw(state, gov.id);

  assert(state.enactedLaws.length === 3, 'Three statutes remain enacted');
  assert(state.activeLaws.length === 3, 'activeLaws mirrors all enacted statutes');
}
console.log();

console.log('=== Test 4: Heroes Generate Law Proposals ===');
{
  const state = createTestState();
  const rng = new DeterministicRNG(77);
  const created = generateHeroLawProposals(state, rng.random.bind(rng));
  const proposals = getAvailableProposedLaws(state);

  assert(created.length > 0, 'Hero proposal generation creates at least one proposal');
  assert(proposals.length === created.length, 'Available proposal list matches created proposals');
  assert(proposals.every((proposal) => proposal.proposerHero && proposal.law), 'Each proposal is linked to both a sponsor hero and a law');
}
console.log();

console.log('=== Test 5: Law Starts From Proposal and Tracks Sponsor ===');
{
  const state = createTestState();
  const rng = new DeterministicRNG(99);
  generateHeroLawProposals(state, rng.random.bind(rng));
  const proposal = getAvailableProposedLaws(state)[0];
  const sponsorHero = proposal.proposerHero;
  const popularityBefore = sponsorHero.meters.popularity;

  const result = startLawProcessFromProposal(state, proposal.proposalId, 100);
  const lawProcess = state.lawProcesses[0];

  assert(result.success === true, 'Proposal-backed law process starts successfully');
  assert(lawProcess.proposalId === proposal.proposalId, 'Law process stores the originating proposal id');
  assert(lawProcess.sponsorHeroId === proposal.proposerHeroId, 'Law process stores the sponsor hero id');
  assert(state.proposedLaws.find((entry) => entry.proposalId === proposal.proposalId)?.status === 'IN_PROCESS', 'Proposal transitions to IN_PROCESS');
  assert(lawProcess.meters.momentum > 0.6, 'Sponsor adds opening momentum to the law process');

  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 1.0;
  resolveLawProcess(lawProcess, state, new DeterministicRNG(12));

  assert(state.proposedLaws.find((entry) => entry.proposalId === proposal.proposalId)?.status === 'ENACTED', 'Proposal finalizes as ENACTED after passage');
  assert(sponsorHero.meters.popularity > popularityBefore, 'Sponsor hero gains popularity when their statute passes');
}
console.log();

console.log('=== Test 6: Trade Income Uses Scaled Credit Rate ===');
{
  const state = createTestState();
  state.coalitionModifiers.trade_income = 100;
  state.empires.forEach((empire) => {
    empire.budget_credits = 0;
  });

  applyPostMarketUpdates(state, {
    fulfillment_and_performance: {
      needs: { threshold: 0.75, max_penalty: 0.3 },
      wants: { max_bonus: 0.2 }
    }
  });

  const expectedScaledIncome = 100 / TRADE_INCOME_EFFECT_DIVISOR;
  assert(
    state.empires.every((empire) => empire.budget_credits === expectedScaledIncome),
    'Coalition trade income pays out at the scaled per-empire rate'
  );

  const improvementState = createTestState();
  improvementState.empires.forEach((empire) => {
    empire.budget_credits = 0;
  });
  improvementState.improvements = {
    queue: [
      {
        id: 'test_trade_hub',
        empireId: improvementState.empires[0].id,
        state: 'ACTIVE',
        modifiers: { trade_income: 100 }
      }
    ]
  };

  applyImprovementModifiers(improvementState);

  assert(
    improvementState.empires[0].budget_credits === expectedScaledIncome,
    'Improvement trade income uses the same scaled credit rate'
  );
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
