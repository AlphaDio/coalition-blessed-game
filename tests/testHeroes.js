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
