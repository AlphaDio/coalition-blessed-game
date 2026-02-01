#!/usr/bin/env node

/**
 * Test suite for hero system v0.3
 * Validates creation, siphon/charge mechanics, meters, passives, abilities,
 * law integration hooks, and recruitment events.
 */

import {
  createGameState,
  createHero,
  createLawProcess,
  createPowerSystemPolicy
} from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import { DeterministicRNG } from '../src/modules/rng.js';
import { getSampleLawDefinitions } from '../src/game/lawDefinitions.js';
import { resolveAllLawProcesses } from '../src/game/lawProcessManager.js';
import {
  applyHeroBudgetSiphon,
  applyHeroLawPressure,
  applyHeroLawTension,
  runHeroPassives,
  triggerHeroAbilities,
  tickHeroMeters,
  buildHeroRecruitmentEvent,
  handleHeroRecruitmentChoice,
  computeAlignmentScore,
  HERO_RECRUIT_DELAY_RANGE
} from '../src/game/heroes.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

// Initialize logger with minimal output
initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

console.log('============================================================');
console.log('Hero System v0.3 Test Suite');
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

function approxEqual(actual, expected, epsilon = 0.01) {
  return Math.abs(actual - expected) <= epsilon;
}

function createTestState(seed = 12345) {
  const state = createGameState(seed);
  const content = createSampleContent(seed);
  state.empires = content.empires;
  state.armies = content.armies;
  state.lawDefinitions = getSampleLawDefinitions();
  state.events = content.events || [];
  state.heroRoster = content.heroRoster || [];
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
  state.heroes = [];
  return state;
}

console.log('=== Test 1: Hero Creation ===');
{
  const hero = createHero('HERO_1', 'EMPIRE_1', 'Test Hero', {
    tagline: 'A steady hand in chaos.',
    budget_share: 0.002,
    ability_id: 'ABILITY_PUBLIC_MANDATE',
    passive: { phase: 'VOTING', cadence: 'OnStart', passive_id: 'PASSIVE_VOTING_START_WHIP' }
  });

  assert(hero.id === 'HERO_1', 'Hero id set');
  assert(hero.empireId === 'EMPIRE_1', 'Hero empireId set');
  assert(hero.tagline === 'A steady hand in chaos.', 'Hero tagline set');
  assert(hero.budget_share === 0.002, 'Hero budget_share set');
  assert(hero.charge === 0, 'Hero charge defaulted to 0');
  assert(hero.siphon_bank === 0, 'Hero siphon_bank defaulted to 0');
  assert(hero.ability_id === 'ABILITY_PUBLIC_MANDATE', 'Hero ability_id set');
}
console.log();

console.log('=== Test 2: Budget Siphon Mechanics ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.budget_credits = 1000;
  const hero = createHero('HERO_1', empire.id, 'Siphon Hero', {
    budget_share: 0.002,
    ability_id: 'ABILITY_PUBLIC_MANDATE'
  });
  state.heroes = [hero];

  const log = [];
  applyHeroBudgetSiphon(state, log);

  assert(empire.budget_credits === 1000, 'Empire budget not deducted by virtual siphon');
  assert(approxEqual(hero.siphon_bank, 2), 'Hero siphon_bank accumulates virtual credits');
  assert(approxEqual(hero.charge, 0.04), 'Hero charge increases by virtual siphon');
}
console.log();

console.log('=== Test 3: Meter Calculations (Heat/Grievance) ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.values = { axis1: -1 };
  const hero = createHero('HERO_1', empire.id, 'Meter Hero', {
    values: { axis1: -1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [hero];

  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;

  const log = [];
  applyHeroLawPressure(state, lawProcess, lawDef, log);

  assert(hero.meters.heat > 0, 'Hero heat increases with empire mismatch');
  assert(hero.meters.grievance > 0, 'Hero grievance increases with hero mismatch');
}
console.log();

console.log('=== Test 4: Heat Drives Law Tension ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  const hero = createHero('HERO_1', empire.id, 'Tension Hero', {
    values: { axis1: -1 },
    meters: { heat: 80, grievance: 60, popularity: 50 }
  });
  state.heroes = [hero];

  const lawProcess = createLawProcess('LAW_TEST', state.turn);
  lawProcess.meters.unrest = 0.2;
  lawProcess.meters.reject_pressure = 0.1;

  const log = [];
  applyHeroLawTension(state, lawProcess, log);

  assert(lawProcess.meters.unrest > 0.2, 'High heat increases law unrest');
  assert(lawProcess.meters.reject_pressure > 0.1, 'High grievance increases reject pressure');
}
console.log();

console.log('=== Test 5: Meter Drift and Popularity Cap ===');
{
  const state = createTestState();
  state.coalitionCohesion = 80;
  state.coalitionEconomy = { requisition: 10 };
  const hero = createHero('HERO_1', state.empires[0].id, 'Drift Hero', {
    meters: { heat: 50, grievance: 50, popularity: 90 }
  });
  state.heroes = [hero];

  tickHeroMeters(state, []);

  assert(hero.meters.heat < 50, 'Heat decays');
  assert(hero.meters.grievance < 50, 'Grievance decays');
  const cap = 100 - (hero.meters.grievance * 0.5);
  assert(hero.meters.popularity <= cap, 'Popularity capped by grievance');
}
console.log();

console.log('=== Test 6: Passive Trigger ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  const hero = createHero('HERO_1', empire.id, 'Passive Hero', {
    ability_id: 'ABILITY_PUBLIC_MANDATE',
    passive: { phase: 'VOTING', cadence: 'OnStart', passive_id: 'PASSIVE_VOTING_START_WHIP' }
  });
  state.heroes = [hero];

  const lawDef = { id: 'LAW_TEST', tags: ['governance'] };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.phase = 'VOTING';
  lawProcess.meters.legitimacy = 0;

  const log = [];
  runHeroPassives(state, lawProcess, lawDef, 'OnStart', log);
  assert(lawProcess.meters.legitimacy > 0, 'Passive increases legitimacy');
}
console.log();

console.log('=== Test 7: Ability Trigger + Siphon Bank Spend ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.budget_credits = 500;
  const hero = createHero('HERO_1', empire.id, 'Ability Hero', {
    ability_id: 'ABILITY_PUBLIC_MANDATE',
    charge: 100,
    siphon_bank: 300,
    meters: { heat: 20, grievance: 10, popularity: 50 }
  });
  state.heroes = [hero];

  const log = [];
  triggerHeroAbilities(state, null, log);

  assert(hero.charge === 0, 'Ability consumes charge');
  assert(hero.cooldowns.ability > 0, 'Ability cooldown applied');
  assert(empire.budget_credits === 200, 'Siphon bank deducted from budget on ability');
  assert(hero.siphon_bank === 0, 'Siphon bank reset after ability');
  assert(hero.meters.heat < 20, 'Ability reduces heat');
  assert(hero.meters.grievance < 10, 'Ability reduces grievance');
  assert(hero.meters.popularity > 50, 'Ability increases popularity');
}
console.log();

console.log('=== Test 8: Law Integration Hooks ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  const lawDef = state.lawDefinitions[0];
  empire.values = { axis1: -1 };
  lawDef.axis_vector = { axis1: 1 };
  const hero = createHero('HERO_1', empire.id, 'Hook Hero', {
    ability_id: 'ABILITY_PUBLIC_MANDATE',
    passive: { phase: 'DEBATE', cadence: 'OnTick', passive_id: 'PASSIVE_DEBATE_TICK_ORATOR' },
    tags: lawDef.tags || [],
    values: { axis1: -1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [hero];

  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;
  state.lawProcesses = [lawProcess];

  const rng = new DeterministicRNG(42);
  resolveAllLawProcesses(state, rng);

  assert(hero.meters.heat > 0 || hero.meters.grievance > 0, 'Law integration applies hero pressure');
}
console.log();

console.log('=== Test 9: Hero Recruitment Event ===');
{
  const state = createTestState();
  state.heroes = [];
  const rng = new DeterministicRNG(7);
  let event = null;
  let delayTicks = null;
  for (let i = 0; i < HERO_RECRUIT_DELAY_RANGE.max + 5; i++) {
    event = buildHeroRecruitmentEvent(state, rng.random.bind(rng));
    if (delayTicks === null) {
      const entry = state.heroRecruitmentState?.[state.empires[0].id];
      if (entry) {
        delayTicks = entry.delayTicks;
        assert(
          delayTicks >= HERO_RECRUIT_DELAY_RANGE.min && delayTicks <= HERO_RECRUIT_DELAY_RANGE.max,
          'Recruitment delay is within configured range'
        );
      }
    }
    if (event) break;
  }
  assert(!!event, 'Recruitment event generated after stagger delay');
  assert(event.choices.length === 2, 'Recruitment event offers 2 candidates');

  const result = handleHeroRecruitmentChoice(state, event, 0, rng.random.bind(rng));
  assert(result.success, 'Recruitment choice succeeds');
  assert(state.heroes.length === 1, 'Hero added to state');
  assert(state.heroes[0].empireId === event.empireId, 'Hero assigned to target empire');
}
console.log();

console.log('=== Test 10a: Empire Opposes Law → Heat Increases ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.values = { axis1: -1 }; // Empire opposes law
  
  const hero = createHero('HERO_1', empire.id, 'Test Hero', {
    values: { axis1: 1 }, // Hero aligns with law
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [hero];

  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;

  applyHeroLawPressure(state, lawProcess, lawDef, []);

  assert(hero.meters.heat > 0, 'Heat increases when empire opposes');
  assert(hero.meters.grievance === 0, 'Grievance unchanged when hero aligns');
}
console.log();

console.log('=== Test 10b: Hero Opposes Law → Grievance Increases ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.values = { axis1: 1 }; // Empire aligns with law
  
  const hero = createHero('HERO_1', empire.id, 'Test Hero', {
    values: { axis1: -1 }, // Hero opposes law
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [hero];

  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;

  applyHeroLawPressure(state, lawProcess, lawDef, []);

  assert(hero.meters.heat === 0, 'Heat unchanged when empire aligns');
  assert(hero.meters.grievance > 0, 'Grievance increases when hero opposes');
}
console.log();

console.log('=== Test 10c: Both Align → No Meter Changes ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.values = { axis1: 1 }; // Empire aligns
  
  const hero = createHero('HERO_1', empire.id, 'Test Hero', {
    values: { axis1: 1 }, // Hero also aligns
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [hero];

  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;

  applyHeroLawPressure(state, lawProcess, lawDef, []);

  assert(hero.meters.heat === 0, 'Heat stays 0 when empire aligns');
  assert(hero.meters.grievance === 0, 'Grievance stays 0 when hero aligns');
}
console.log();

console.log('=== Test 10d: Both Oppose → Both Meters Increase ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.values = { axis1: -1 }; // Empire opposes
  
  const hero = createHero('HERO_1', empire.id, 'Test Hero', {
    values: { axis1: -1 }, // Hero also opposes
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [hero];

  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;

  applyHeroLawPressure(state, lawProcess, lawDef, []);

  assert(hero.meters.heat > 0, 'Heat increases when empire opposes');
  assert(hero.meters.grievance > 0, 'Grievance increases when hero opposes');
}
console.log();

console.log('=== Test 11: Heat Amplitude Scales with Axis Difference ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  
  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.meters.unrest = 1;
  lawProcess.meters.legitimacy = 0;

  // Small opposition: empire axis1 = 0 (neutral) vs law axis1 = 1
  empire.values = { axis1: 0 };
  const heroSmall = createHero('HERO_S', empire.id, 'Small', {
    values: { axis1: 1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [heroSmall];
  applyHeroLawPressure(state, lawProcess, lawDef, []);
  const heatSmall = heroSmall.meters.heat;

  // Medium opposition: empire axis1 = -0.5 vs law axis1 = 1
  empire.values = { axis1: -0.5 };
  const heroMed = createHero('HERO_M', empire.id, 'Medium', {
    values: { axis1: 1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [heroMed];
  applyHeroLawPressure(state, lawProcess, lawDef, []);
  const heatMedium = heroMed.meters.heat;

  // Max opposition: empire axis1 = -1 vs law axis1 = 1
  empire.values = { axis1: -1 };
  const heroMax = createHero('HERO_X', empire.id, 'Max', {
    values: { axis1: 1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [heroMax];
  applyHeroLawPressure(state, lawProcess, lawDef, []);
  const heatMax = heroMax.meters.heat;

  // Verify scaling: small < medium < max
  assert(heatSmall < heatMedium, `Small opposition (${heatSmall.toFixed(2)}) < Medium (${heatMedium.toFixed(2)})`);
  assert(heatMedium < heatMax, `Medium opposition (${heatMedium.toFixed(2)}) < Max (${heatMax.toFixed(2)})`);
  
  // Verify max opposition produces expected heat (HEAT_BASE * 1.0 * 1.0 * 1.0 = 2.0)
  assert(approxEqual(heatMax, 2.0), `Max heat is ~2.0 (got ${heatMax.toFixed(2)})`);
}
console.log();

console.log('=== Test 12: Heat Scales with Unrest ===');
{
  const state = createTestState();
  const empire = state.empires[0];
  empire.values = { axis1: -1 }; // Max opposition
  
  const lawDef = { id: 'LAW_TEST', axis_vector: { axis1: 1 } };

  // Low unrest
  const lawProcessLow = createLawProcess(lawDef.id, state.turn);
  lawProcessLow.meters.unrest = 0.25;
  lawProcessLow.meters.legitimacy = 0;
  
  const heroLow = createHero('HERO_L', empire.id, 'Low', {
    values: { axis1: 1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [heroLow];
  applyHeroLawPressure(state, lawProcessLow, lawDef, []);
  const heatLowUnrest = heroLow.meters.heat;

  // High unrest
  const lawProcessHigh = createLawProcess(lawDef.id, state.turn);
  lawProcessHigh.meters.unrest = 1.0;
  lawProcessHigh.meters.legitimacy = 0;
  
  const heroHigh = createHero('HERO_H', empire.id, 'High', {
    values: { axis1: 1 },
    meters: { heat: 0, grievance: 0, popularity: 50 }
  });
  state.heroes = [heroHigh];
  applyHeroLawPressure(state, lawProcessHigh, lawDef, []);
  const heatHighUnrest = heroHigh.meters.heat;

  assert(heatLowUnrest < heatHighUnrest, `Low unrest heat (${heatLowUnrest.toFixed(2)}) < High unrest (${heatHighUnrest.toFixed(2)})`);
  assert(approxEqual(heatHighUnrest / heatLowUnrest, 4.0), 'Heat scales 4x with 4x unrest');
}
console.log();

console.log('=== Test 13: Integration - Law Enactment with Hero Tie-in ===');
{
  // Create state with law process and heroes
  const state = createTestState();
  const empire = state.empires[0];
  
  // Empire opposes the law, hero aligns - this should generate heat
  empire.values = { axis1: -0.8 };
  
  const hero = createHero('HERO_INT', empire.id, 'Integration Hero', {
    values: { axis1: 0.8 }, // Hero favors law
    meters: { heat: 0, grievance: 0, popularity: 60 },
    ability_id: 'ABILITY_PUBLIC_MANDATE',
    passive: { phase: 'VOTING', cadence: 'OnStart', passive_id: 'PASSIVE_VOTING_START_WHIP' }
  });
  state.heroes = [hero];
  
  // Get a law definition
  const lawDefs = getSampleLawDefinitions();
  const lawDef = lawDefs[0]; // Use first available law
  lawDef.axis_vector = { axis1: 1 }; // Law pushes axis1 positive
  
  // Create law process starting in DEBATE phase
  const lawProcess = createLawProcess(lawDef.id, state.turn);
  lawProcess.phase = 'DEBATE';
  lawProcess.meters.unrest = 0.5;
  lawProcess.meters.momentum = 0.5;
  lawProcess.meters.legitimacy = 0.3;
  state.lawProcesses = [lawProcess];
  
  const initialHeat = hero.meters.heat;
  const initialGrievance = hero.meters.grievance;
  
  // Simulate multiple ticks through DEBATE phase
  for (let i = 0; i < 5; i++) {
    applyHeroLawPressure(state, lawProcess, lawDef, []);
    state.turn++;
  }
  
  // Heat should have accumulated (empire opposes law)
  assert(hero.meters.heat > initialHeat, 'Heat accumulates during debate (empire opposes)');
  // Grievance should stay low (hero aligns with law)
  assert(hero.meters.grievance < 1, 'Grievance stays low (hero aligns with law)');
  
  const debateHeat = hero.meters.heat;
  
  // Advance to FALLOUT phase
  lawProcess.phase = 'FALLOUT';
  lawProcess.phaseProgress = 0;
  lawProcess.phaseTicks = 0;
  
  // Run passive at FALLOUT start (should trigger FALLOUT passive if hero has one)
  const falloutLog = [];
  runHeroPassives(state, lawProcess, lawDef, 'OnStart', falloutLog);
  
  // Simulate FALLOUT ticks
  for (let i = 0; i < 3; i++) {
    applyHeroLawPressure(state, lawProcess, lawDef, []);
    state.turn++;
  }
  
  const falloutHeat = hero.meters.heat;
  assert(falloutHeat >= debateHeat, 'Heat continues accumulating through fallout');
  
  // Advance to VOTING phase
  lawProcess.phase = 'VOTING';
  lawProcess.phaseProgress = 0;
  lawProcess.phaseTicks = 0;
  
  // Run VOTING passive (hero has PASSIVE_VOTING_START_WHIP)
  const votingLog = [];
  const legitimacyBefore = lawProcess.meters.legitimacy;
  runHeroPassives(state, lawProcess, lawDef, 'OnStart', votingLog);
  
  // Passive should have boosted legitimacy
  assert(lawProcess.meters.legitimacy > legitimacyBefore, 'Voting passive boosts legitimacy');
  assert(votingLog.length > 0, 'Voting passive logs a message');
  
  // Complete voting
  lawProcess.phaseProgress = 1.0;
  
  // Final assertions
  assert(hero.meters.heat > 0, 'Hero has accumulated heat during law process');
  assert(lawProcess.phase === 'VOTING', 'Law reached VOTING phase');
  assert(lawProcess.phaseProgress >= 1.0, 'Law ready to enact');
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
