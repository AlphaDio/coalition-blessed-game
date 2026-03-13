#!/usr/bin/env node

/**
 * Test Enactment Events - Events that fire after a law is enacted,
 * weighted by the law's final meter values (reject_pressure, legitimacy,
 * polarization, unrest).
 */

import { createGameState, createLawProcess, createPowerSystemPolicy } from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import { DeterministicRNG } from '../src/modules/rng.js';
import { resolveLawProcess } from '../src/game/lawProcessManager.js';
import { getSampleLawDefinitions } from '../src/game/lawDefinitions.js';
import { assignInitialHeroes } from '../src/game/heroes.js';
import { handleLawEventChoice } from '../src/game/lawProcess/events.js';
import { computeEventWeight, filterEligibleEvents, buildLawContext } from '../src/game/lawEngine.js';
import { getAllLawEvents } from '../src/game/lawEventTemplates.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

console.log('============================================================');
console.log('Enactment Events Test Suite');
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
  // Add law events from templates (as gameManager does)
  const lawEvents = getAllLawEvents();
  if (!state.events.some(e => e.scope === 'LAW')) {
    state.events = [...state.events, ...lawEvents];
  }
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

// ---------------------------------------------------------------------------
console.log('=== Test 1: Enactment Events Exist In Template Pool ===');
{
  const allEvents = getAllLawEvents();
  const enactmentEvents = allEvents.filter(e =>
    e.phase_tags && e.phase_tags.includes('ENACTED')
  );
  assert(enactmentEvents.length > 0, 'At least one ENACTED phase event exists in the pool');
  assert(enactmentEvents.every(e => e.scope === 'LAW'), 'All enactment events have scope LAW');
  assert(enactmentEvents.every(e => e.choices && e.choices.length > 0), 'All enactment events are choice events');
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 2: Enactment Events Are Filtered By ENACTED Phase ===');
{
  const allEvents = getAllLawEvents();
  const state = createTestState();
  const lawDef = state.lawDefinitions[0];
  const lawProcess = createLawProcess(lawDef.id, 0);

  // During DEBATE, no enactment events should be eligible
  const debateContext = buildLawContext(lawProcess, lawDef, state);
  const debateEligible = filterEligibleEvents(allEvents, debateContext);
  const debateEnactment = debateEligible.filter(e =>
    e.phase_tags && e.phase_tags.includes('ENACTED')
  );
  assert(debateEnactment.length === 0, 'No ENACTED events eligible during DEBATE phase');

  // During ENACTED phase with high legitimacy, enactment events should be eligible
  lawProcess.phase = 'ENACTED';
  lawProcess.meters.legitimacy = 0.9;
  const enactedContext = buildLawContext(lawProcess, lawDef, state);
  enactedContext.phase = 'ENACTED';
  const enactedEligible = filterEligibleEvents(allEvents, enactedContext);
  assert(enactedEligible.length > 0, 'ENACTED events are eligible during ENACTED phase');
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 3: Meter Values Influence Enactment Event Weights ===');
{
  const allEvents = getAllLawEvents();
  const enactmentEvents = allEvents.filter(e =>
    e.phase_tags && e.phase_tags.includes('ENACTED')
  );

  // Find an APPROVE nature event (boosted by legitimacy)
  const approveEvent = enactmentEvents.find(e => e.nature === 'APPROVE');
  // Find a REJECT nature event (boosted by reject_pressure)
  const rejectEvent = enactmentEvents.find(e => e.nature === 'REJECT');

  if (approveEvent && rejectEvent) {
    // High legitimacy should boost APPROVE weight
    const highLegitimacyContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.9, reject_pressure: 0.1, polarization: 0.1, unrest: 0.1, momentum: 0.5 }
    };
    const approveWeightHigh = computeEventWeight(approveEvent, highLegitimacyContext);

    const lowLegitimacyContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.1, reject_pressure: 0.1, polarization: 0.1, unrest: 0.1, momentum: 0.5 }
    };
    const approveWeightLow = computeEventWeight(approveEvent, lowLegitimacyContext);
    assert(approveWeightHigh > approveWeightLow, 'High legitimacy increases APPROVE enactment event weight');

    // High reject_pressure should boost REJECT weight
    const highRejectContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.5, reject_pressure: 0.8, polarization: 0.1, unrest: 0.1, momentum: 0.5 }
    };
    const rejectWeightHigh = computeEventWeight(rejectEvent, highRejectContext);

    const lowRejectContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.5, reject_pressure: 0.1, polarization: 0.1, unrest: 0.1, momentum: 0.5 }
    };
    const rejectWeightLow = computeEventWeight(rejectEvent, lowRejectContext);
    assert(rejectWeightHigh > rejectWeightLow, 'High reject_pressure increases REJECT enactment event weight');
  } else {
    assert(false, 'Could not find both APPROVE and REJECT enactment events');
  }

  // NEUTRAL events boosted by polarization
  const neutralEvent = enactmentEvents.find(e => e.nature === 'NEUTRAL');
  if (neutralEvent) {
    const highPolarContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.5, reject_pressure: 0.1, polarization: 0.8, unrest: 0.1, momentum: 0.5 }
    };
    const lowPolarContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.5, reject_pressure: 0.1, polarization: 0.1, unrest: 0.1, momentum: 0.5 }
    };
    assert(
      computeEventWeight(neutralEvent, highPolarContext) > computeEventWeight(neutralEvent, lowPolarContext),
      'High polarization increases NEUTRAL enactment event weight'
    );
  }

  // EXTERNALITY events boosted by unrest
  const externalityEvent = enactmentEvents.find(e => e.nature === 'EXTERNALITY');
  if (externalityEvent) {
    const highUnrestContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.5, reject_pressure: 0.1, polarization: 0.1, unrest: 0.8, momentum: 0.5 }
    };
    const lowUnrestContext = {
      phase: 'ENACTED',
      meters: { legitimacy: 0.5, reject_pressure: 0.1, polarization: 0.1, unrest: 0.1, momentum: 0.5 }
    };
    assert(
      computeEventWeight(externalityEvent, highUnrestContext) > computeEventWeight(externalityEvent, lowUnrestContext),
      'High unrest increases EXTERNALITY enactment event weight'
    );
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 4: Enactment Event Fires After Law Enactment ===');
{
  const state = createTestState();
  const lawDef = state.lawDefinitions.find(l => l.tier === 1);
  const lawProcess = createLawProcess(lawDef.id, state.turn || 0);

  // Set up for enactment: VOTING phase with progress >= 1.0
  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 1.0;
  lawProcess.phaseTicks = 0;
  // Set high legitimacy to guarantee an enactment event is eligible
  lawProcess.meters.legitimacy = 0.9;
  lawProcess.meters.reject_pressure = 0.1;
  lawProcess.meters.unrest = 0.1;
  lawProcess.meters.polarization = 0.1;

  state.lawProcesses = [lawProcess];

  const rng = new DeterministicRNG(123);
  const log = resolveLawProcess(lawProcess, state, rng);

  assert(lawProcess.phase === 'ENACTED', 'Law process reaches ENACTED phase');

  // Check that an enactment event was selected
  const hasEnactmentEvent = lawProcess.pendingEvent !== null && state.activeEvent !== null;
  assert(hasEnactmentEvent, 'An enactment event was selected after law enactment');

  if (hasEnactmentEvent) {
    assert(state.activeEvent.isLawEvent === true, 'Enactment event is marked as a law event');
    assert(state.activeEvent.lawProcessPhase === 'ENACTED', 'Enactment event phase is ENACTED');
    assert(state.activeEvent.choices && state.activeEvent.choices.length > 0, 'Enactment event has choices');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 5: Enactment Event Choice Applies Game-State Effects ===');
{
  const state = createTestState();
  const lawDef = state.lawDefinitions.find(l => l.tier === 1);
  const lawProcess = createLawProcess(lawDef.id, state.turn || 0);

  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 1.0;
  lawProcess.meters.legitimacy = 0.9;
  lawProcess.meters.reject_pressure = 0.1;
  lawProcess.meters.unrest = 0.1;
  lawProcess.meters.polarization = 0.1;

  state.lawProcesses = [lawProcess];

  const rng = new DeterministicRNG(123);
  resolveLawProcess(lawProcess, state, rng);

  if (lawProcess.pendingEvent && state.activeEvent) {
    const initialCohesion = state.coalitionCohesion;
    const initialApprovals = state.empires.map(e => e.approval);

    // Handle the enactment event choice
    const result = handleLawEventChoice(state, lawProcess.lawId, lawProcess.pendingEvent, 0);
    assert(result.success === true, 'Enactment event choice handled successfully');
    assert(lawProcess.pendingEvent === null, 'Pending event cleared after choice');
    assert(state.activeEvent === null, 'Active event cleared after choice');

    // Check that game state was affected (cohesion or approval changed)
    const cohesionChanged = state.coalitionCohesion !== initialCohesion;
    const approvalChanged = state.empires.some((e, i) => e.approval !== initialApprovals[i]);
    assert(cohesionChanged || approvalChanged, 'Game state was modified by enactment event choice');
  } else {
    assert(false, 'No enactment event was fired (cannot test choice effects)');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 6: Pending Enactment Event Blocks Further Resolution ===');
{
  const state = createTestState();
  const lawDef = state.lawDefinitions.find(l => l.tier === 1);
  const lawProcess = createLawProcess(lawDef.id, state.turn || 0);

  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 1.0;
  lawProcess.meters.legitimacy = 0.9;

  state.lawProcesses = [lawProcess];

  const rng = new DeterministicRNG(123);
  resolveLawProcess(lawProcess, state, rng);

  if (lawProcess.pendingEvent) {
    // Try resolving again - should return empty (waiting for player choice)
    const secondLog = resolveLawProcess(lawProcess, state, rng);
    assert(secondLog.length === 0, 'Resolution returns empty log while enactment event is pending');
    assert(lawProcess.pendingEvent !== null, 'Pending event persists across resolution ticks');
  } else {
    // If no event fired (meters didn't meet thresholds), that's ok - skip this test
    console.log('[SKIP] No enactment event pending - skipping blocking test');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 7: Different Meter Profiles Produce Different Events ===');
{
  const state1 = createTestState(100);
  const state2 = createTestState(200);

  const allEvents = getAllLawEvents();
  const enactmentEvents = allEvents.filter(e =>
    e.phase_tags && e.phase_tags.includes('ENACTED')
  );

  // High legitimacy profile
  const highLegitimacyContext = {
    phase: 'ENACTED',
    meters: { legitimacy: 0.95, reject_pressure: 0.05, polarization: 0.05, unrest: 0.05, momentum: 0.8 },
    lawProcess: { rejects: 0, phaseProgress: 1.0 },
    empireStances: {},
    empires: state1.empires
  };

  // High reject_pressure profile
  const highRejectContext = {
    phase: 'ENACTED',
    meters: { legitimacy: 0.2, reject_pressure: 0.8, polarization: 0.3, unrest: 0.3, momentum: 0.3 },
    lawProcess: { rejects: 2, phaseProgress: 1.0 },
    empireStances: {},
    empires: state2.empires
  };

  const eligibleForLegitimacy = filterEligibleEvents(enactmentEvents, highLegitimacyContext);
  const eligibleForReject = filterEligibleEvents(enactmentEvents, highRejectContext);

  // High legitimacy profile should have APPROVE events eligible
  const approveEligible = eligibleForLegitimacy.filter(e => e.nature === 'APPROVE');
  assert(approveEligible.length > 0, 'High legitimacy profile has eligible APPROVE enactment events');

  // High reject_pressure profile should have REJECT events eligible
  const rejectEligible = eligibleForReject.filter(e => e.nature === 'REJECT');
  assert(rejectEligible.length > 0, 'High reject_pressure profile has eligible REJECT enactment events');
}

// ---------------------------------------------------------------------------

console.log('\n============================================================');
console.log('Test Results Summary');
console.log('============================================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('============================================================');
if (testsFailed > 0) {
  console.log('[FAIL] SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('[PASS] ALL TESTS PASSED');
}
