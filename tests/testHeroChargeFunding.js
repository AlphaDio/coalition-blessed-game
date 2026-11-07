#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createGameState, createHero, createEmpire, createArmy, createLawProcess, migrateGameState } from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import {
  triggerHeroEvent,
  triggerHeroAbilities,
  tickHeroCooldowns,
  applyHeroFunding,
  createHeroFromCandidate
} from '../src/game/heroes.js';
import { getAbilityScalar, getFundingScalar } from '../src/game/heroes/utils.js';
import { startScourgeBattle, handleScourgeBattleEnd, startInsurrectionBattle } from '../src/game/battles.js';
import { calculateArmyPower } from '../src/game/battles/power.js';
import { simulateBattleTick } from '../src/game/frontBattles.js';
import { triggerScourgeBattle } from '../src/game/turn/battlePhase.js';
import { handleLawEventChoice } from '../src/game/lawProcess/events.js';
import { resolveLawProcess, startLawProcess } from '../src/game/lawProcess/resolve.js';
import { checkBurialRule } from '../src/game/lawEngine.js';
import { createLawEvent } from '../src/game/lawEventTemplates.js';
import { getSampleLawDefinitions } from '../src/game/lawDefinitions.js';
import { generateHeroLawProposals } from '../src/game/lawProposals.js';
import { handleTechEventChoice, getAvailableTechs } from '../src/game/technology.js';
import { createImprovement, initializeImprovementsState, processImprovementsTick, applyImprovementModifiers } from '../src/game/improvements/engine/index.js';
import { getAllImprovementRequests } from '../src/game/improvements/definitions.js';
import { advanceTurn } from '../src/game/turn.js';
import { GameManager } from '../src/server/gameManager.js';
import { getLogger } from '../src/modules/logger.js';
import { HERO_ABILITIES } from '../src/game/heroDefinitions.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({ level: LogLevel.ERROR, enableConsole: false, enableFile: false, enableUI: false });

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`[PASS] ${name}`);
}
function stateWith(...heroes) {
  const state = createGameState(731);
  state.empires = [createEmpire('home', 'Home'), createEmpire('ally', 'Ally')];
  state.heroes = heroes;
  state.armies = [];
  state.lawProcesses = [];
  state.coalitionEconomy.requisition = 0;
  return state;
}
function hero(id = 'hero', options = {}) {
  return createHero(id, 'home', id, { ability_id: 'ABILITY_EMERGENCY_FUNDS', ...options });
}
function rule(event, amount, conditions = {}) {
  return { event, amount, description: `${event} inspiration`, ...conditions };
}
function event(state, type, id, context = {}, log = []) {
  triggerHeroEvent(state, type, { ...context, eventId: id }, log);
  return log;
}
const law = { id: 'law', values: { doctrine: 1 }, tags: ['military'], category: 'military' };

test('An enactment energizes both its supporters and its opponents', () => {
  const supportive = hero('support', {
    values: { doctrine: 1 },
    charge_triggers: [rule('LAW_ENACTED', 30, { alignment: 'support', empire_scope: 'any' })]
  });
  const opposition = hero('opposition', {
    values: { doctrine: -1 },
    charge_triggers: [rule('LAW_ENACTED', 35, { alignment: 'oppose', empire_scope: 'any' })]
  });
  const neutral = hero('neutral', {
    values: {},
    charge_triggers: [rule('LAW_ENACTED', 30, { alignment: 'support', empire_scope: 'any' })]
  });
  const state = stateWith(supportive, opposition, neutral);
  const log = event(state, 'LAW_ENACTED', 'enactment-1', { lawDef: law });
  assert.equal(supportive.charge, 30);
  assert.equal(opposition.charge, 35);
  assert.equal(neutral.charge, 0);
  assert(log.some(message => message.includes('support') && /charge/i.test(message)));
  assert(log.some(message => message.includes('opposition') && /charge/i.test(message)));
});

test('Charge uses the Hero’s current values and the event’s law tags', () => {
  const subject = hero('adaptive', {
    values: { doctrine: -1 },
    charge_triggers: [rule('LAW_PROPOSED', 25, {
      alignment: 'support', law_tags_any: ['military'], empire_scope: 'any'
    })]
  });
  const state = stateWith(subject);
  event(state, 'LAW_PROPOSED', 'proposal-1', { lawDef: law });
  assert.equal(subject.charge, 0);
  subject.values.doctrine = 1;
  event(state, 'LAW_PROPOSED', 'proposal-2', { lawDef: { ...law, tags: ['economic'], category: 'economy' } });
  assert.equal(subject.charge, 0);
  event(state, 'LAW_PROPOSED', 'proposal-3', { lawDef: law });
  assert.equal(subject.charge, 25);
});

test('Own-empire developments and personal proposals exclude unrelated Heroes', () => {
  const subject = hero('sponsor', {
    charge_triggers: [
      rule('TECH_UNLOCKED', 45, { empire_scope: 'own' }),
      rule('LAW_PROPOSED', 25, { proposer_only: true, empire_scope: 'own' })
    ]
  });
  const state = stateWith(subject);
  event(state, 'TECH_UNLOCKED', 'tech-ally', { empireId: 'ally' });
  event(state, 'TECH_UNLOCKED', 'tech-missing');
  assert.equal(subject.charge, 0);
  event(state, 'TECH_UNLOCKED', 'tech-home', { empireId: 'home' });
  assert.equal(subject.charge, 45);
  event(state, 'LAW_PROPOSED', 'proposal-other', {
    proposal: { proposerHeroId: 'other', proposerEmpireId: 'home' }, lawDef: law
  });
  assert.equal(subject.charge, 45);
  event(state, 'LAW_PROPOSED', 'proposal-self', {
    proposal: { proposerHeroId: subject.id, proposerEmpireId: 'home' }, proposerHero: subject, lawDef: law
  });
  assert.equal(subject.charge, 70);
});

test('Defeat and rejected agendas charge eligible Heroes, with no participation inferred', () => {
  const subject = hero('resilient', {
    values: { doctrine: 1 },
    charge_triggers: [
      rule('BATTLE_LOST', 60, { empire_scope: 'participant' }),
      rule('LAW_REJECTED', 45, { alignment: 'support', empire_scope: 'any' })
    ]
  });
  const state = stateWith(subject);
  event(state, 'BATTLE_LOST', 'battle-other', { participatingEmpireIds: ['ally'] });
  event(state, 'BATTLE_LOST', 'battle-unknown');
  event(state, 'BATTLE_LOST', 'battle-empty', { participatingEmpireIds: [] });
  assert.equal(subject.charge, 0);
  event(state, 'BATTLE_LOST', 'battle-home', { participatingEmpireIds: ['home'] });
  event(state, 'LAW_REJECTED', 'burial-home', { lawDef: law });
  assert.equal(subject.charge, 105);
});

test('A single event awards the strongest matching rule once, across observations and saves', () => {
  const subject = hero('overlap', {
    charge_triggers: [
      rule('IMPROVEMENT_COMPLETED', 20, { empire_scope: 'own' }),
      rule('IMPROVEMENT_COMPLETED', 45, { empire_scope: 'own' })
    ]
  });
  const state = stateWith(subject);
  event(state, 'IMPROVEMENT_COMPLETED', 'project-1', { empireId: 'home' });
  event(state, 'IMPROVEMENT_COMPLETED', 'project-1', { empireId: 'home' });
  assert.equal(subject.charge, 45);
  const restored = migrateGameState(JSON.parse(JSON.stringify(state)));
  event(restored, 'IMPROVEMENT_COMPLETED', 'project-1', { empireId: 'home' });
  assert.equal(restored.heroes[0].charge, 45);
  event(restored, 'IMPROVEMENT_COMPLETED', 'project-2', { empireId: 'home' });
  assert.equal(restored.heroes[0].charge, 90);
});

test('Replaying a charged event cannot refill Charge after an automatic activation', () => {
  const subject = hero('automatic', {
    charge_triggers: [rule('TECH_UNLOCKED', 200, { empire_scope: 'own' })]
  });
  const state = stateWith(subject);
  const log = event(state, 'TECH_UNLOCKED', 'breakthrough-1', { empireId: 'home' });
  assert.equal(subject.charge, 0);
  assert(subject.cooldowns.ability > 0);
  const requisition = state.coalitionEconomy.requisition;
  assert(requisition > 0, 'Resource ability resolves without an active law');
  assert(log.some(message => /Hero Ability/.test(message)));
  event(state, 'TECH_UNLOCKED', 'breakthrough-1', { empireId: 'home' });
  assert.equal(subject.charge, 0);
  assert.equal(state.coalitionEconomy.requisition, requisition);
  while (subject.cooldowns.ability > 0) tickHeroCooldowns(state);
  event(state, 'TECH_UNLOCKED', 'breakthrough-1', { empireId: 'home' });
  assert.equal(subject.charge, 0);
});

test('Exiled Heroes gain no Charge, and sidelined Heroes retain their political penalty', () => {
  const rules = [rule('BATTLE_LOST', 50, { empire_scope: 'participant' })];
  const active = hero('active', { charge_triggers: rules });
  const sidelined = hero('sidelined', { status: 'SIDELINED', charge_triggers: rules });
  const exiled = hero('exiled', { status: 'EXILED', charge_triggers: rules });
  const state = stateWith(active, sidelined, exiled);
  event(state, 'BATTLE_LOST', 'defeat-1', { participatingEmpireIds: ['home'] });
  assert.equal(active.charge, 50);
  assert(sidelined.charge > 0 && sidelined.charge < active.charge);
  assert.equal(exiled.charge, 0);
});

test('Actual funding competes for credits but never supplies Charge or activation debt', () => {
  const subject = hero('apparatus', { budget_share: 0.01, charge: 75 });
  const state = stateWith(subject);
  state.empires[0].budget_credits = 1000;
  applyHeroFunding(state, []);
  assert(subject.funding > 0);
  assert(subject.funding_last_paid > 0);
  assert.equal(subject.funding_total, subject.funding_last_paid);
  assert.equal(state.empires[0].budget_credits, 1000 - subject.funding_last_paid);
  assert.equal(subject.charge, 75);
  assert(!Object.hasOwn(subject, 'siphon_bank'));
});

test('Shared funding is proportional, capped and affordable with a tiny treasury', () => {
  const first = hero('first', { budget_share: 0.8 });
  const second = hero('second', { budget_share: 0.4 });
  const state = stateWith(first, second);
  state.empires[0].budget_credits = 1;
  applyHeroFunding(state, []);
  const spent = first.funding_last_paid + second.funding_last_paid;
  assert(spent > 0 && spent <= 0.3 + 1e-10);
  assert(Math.abs(first.funding_last_paid - second.funding_last_paid * 2) < 1e-10);
  assert.equal(first.funding_total, first.funding_last_paid);
  assert.equal(second.funding_total, second.funding_last_paid);
  assert(state.empires[0].budget_credits >= 0);
  assert(Math.abs(state.empires[0].budget_credits + spent - 1) < 1e-10);
});

test('Sustained support builds a bounded rating; dry funding gradually erodes it', () => {
  const subject = hero('supported', { budget_share: 0.1 });
  const state = stateWith(subject);
  state.empires[0].budget_credits = 100000;
  for (let tick = 0; tick < 150; tick += 1) {
    state.turn += 1;
    applyHeroFunding(state, []);
    assert(subject.funding >= 0 && subject.funding <= 100);
  }
  assert.equal(subject.funding, 100);
  const accumulated = subject.funding_total;
  assert(accumulated > 100, 'Actual payments keep accumulating beyond the rating cap');
  assert(Math.abs(accumulated - (100000 - state.empires[0].budget_credits)) < 1e-8);
  state.empires[0].budget_credits = 0;
  state.turn += 1;
  applyHeroFunding(state, []);
  assert(subject.funding > 0 && subject.funding < 100);
  assert.equal(subject.funding_last_paid, 0);
  assert.equal(subject.funding_total, accumulated, 'Funding history survives a shortage');
  assert.equal(state.empires[0].budget_credits, 0);
  for (let tick = 0; tick < 150; tick += 1) {
    state.turn += 1;
    applyHeroFunding(state, []);
  }
  assert.equal(subject.funding, 0);
  assert.equal(subject.funding_total, accumulated, 'Rating decay does not erase paid funding');
});

test('Popularity and funding both strengthen abilities while retaining a useful minimum', () => {
  const poor = hero('poor', { funding: 0, meters: { heat: 0, grievance: 100, popularity: 0 } });
  const rich = hero('rich', { funding: 100, meters: { heat: 0, grievance: 0, popularity: 100 } });
  assert(getFundingScalar(poor) < getFundingScalar(rich));
  assert(getAbilityScalar(poor) >= 0.35);
  assert(getAbilityScalar(rich) > getAbilityScalar(poor));
  const middle = hero('middle', { funding: 0, meters: { heat: 0, grievance: 0, popularity: 60 } });
  const funded = hero('funded', { funding: 100, meters: { heat: 0, grievance: 0, popularity: 60 } });
  const poorState = stateWith(middle);
  const richState = stateWith(funded);
  middle.charge = funded.charge = 200;
  triggerHeroAbilities(poorState, null, []);
  triggerHeroAbilities(richState, null, []);
  assert(poorState.coalitionEconomy.requisition > 0);
  assert(richState.coalitionEconomy.requisition > poorState.coalitionEconomy.requisition);
});

test('An empty treasury never gates a ready, underfunded ability or pays on activation', () => {
  const subject = hero('ready', { charge: 200, funding: 0 });
  const state = stateWith(subject);
  state.empires[0].budget_credits = 0;
  triggerHeroAbilities(state, null, []);
  assert.equal(subject.charge, 0);
  assert.equal(subject.funding, 0);
  assert.equal(state.empires[0].budget_credits, 0);
  assert(state.coalitionEconomy.requisition > 0);
});

test('Law abilities retain resources and avoid backlash until a live law can benefit', () => {
  for (const abilityId of ['ABILITY_PUBLIC_MANDATE', 'ABILITY_LEGISLATIVE_SURGE', 'ABILITY_IRON_DECREE']) {
    const subject = hero(abilityId, { ability_id: abilityId, funding: 65, charge: HERO_ABILITIES[abilityId].chargeRequired });
    const state = stateWith(subject);
    const before = JSON.parse(JSON.stringify(subject));
    triggerHeroAbilities(state, null, []);
    assert.equal(subject.charge, before.charge, `${abilityId} retains Charge without a law`);
    assert.equal(subject.funding, before.funding);
    assert.deepEqual(subject.meters, before.meters);
    assert(!subject.cooldowns.ability);
    const completed = createLawProcess('finished', 0);
    completed.phase = 'ENACTED';
    triggerHeroAbilities(state, completed, []);
    assert.equal(subject.charge, before.charge, `${abilityId} ignores completed laws`);
    const live = createLawProcess('live', 0);
    triggerHeroAbilities(state, live, []);
    assert.equal(subject.charge, 0, `${abilityId} resolves with useful live context`);
    assert.equal(subject.funding, before.funding);
  }
});

test('Army abilities wait for a useful empire army instead of consuming Charge on a no-op', () => {
  const subject = hero('commander', { ability_id: 'ABILITY_WAR_CRY', charge: HERO_ABILITIES.ABILITY_WAR_CRY.chargeRequired });
  const state = stateWith(subject);
  triggerHeroAbilities(state, null, []);
  assert(subject.charge > 0);
  const unrelated = createArmy('ally-legion', 'ally', 'Allied Army');
  state.armies = [unrelated];
  triggerHeroAbilities(state, null, []);
  assert(subject.charge > 0);
  const army = createArmy('home-legion', 'home', 'Home Army');
  army.fervor = army.organization = 100;
  state.armies.push(army);
  triggerHeroAbilities(state, null, []);
  assert(subject.charge > 0, 'Fully rallied armies produce no useful effect');
  army.organization = 40;
  triggerHeroAbilities(state, null, []);
  assert.equal(subject.charge, 0);
  assert(army.organization > 40);
});

test('Legacy saves discard virtual siphon balances without retroactive debit or free funding', () => {
  const content = createSampleContent(101);
  const definition = content.heroRoster[0];
  const subject = createHeroFromCandidate({ heroes: [], turn: 0 }, content.empires.find(entry => entry.id === definition.empireId), definition, () => 0.5);
  const state = stateWith(subject);
  state.empires = content.empires;
  subject.charge = 55;
  subject.siphon_bank = 999999;
  delete subject.funding;
  delete subject.funding_total;
  delete subject.charge_triggers;
  delete subject.charge_events;
  subject.meters = { heat: 21, grievance: 37, popularity: 48 };
  subject.cooldowns = { ability: 3, law_proposal: 7 };
  state.heroRoster = content.heroRoster.map(entry => {
    const old = { ...entry };
    delete old.charge_triggers;
    return old;
  });
  state.proposedLaws = [{ proposalId: 'pending', lawId: 'law', proposerHeroId: subject.id, status: 'IN_PROCESS' }];
  const process = createLawProcess('law', 2);
  process.proposalId = 'pending';
  process.sponsorHeroId = subject.id;
  state.lawProcesses = [process];
  const treasury = state.empires.map(entry => entry.budget_credits);
  const passive = JSON.parse(JSON.stringify(subject.passive));
  const migrated = migrateGameState(JSON.parse(JSON.stringify(state)));
  const restored = migrated.heroes[0];
  assert.equal(restored.charge, 55);
  assert.equal(restored.funding, 0);
  assert.equal(restored.funding_total, 0, 'Virtual legacy money is not accumulated funding');
  assert(!Object.hasOwn(restored, 'siphon_bank'));
  assert.deepEqual(migrated.empires.map(entry => entry.budget_credits), treasury);
  assert.deepEqual(restored.meters, subject.meters);
  assert.deepEqual(restored.cooldowns, subject.cooldowns);
  assert.deepEqual(restored.passive, passive);
  assert.deepEqual(migrated.proposedLaws, state.proposedLaws);
  assert.equal(migrated.lawProcesses[0].sponsorHeroId, subject.id);
  assert.equal(migrated.lawProcesses[0].proposalId, 'pending');
  assert(restored.charge_triggers.length > 0);
  assert(migrated.heroRoster.every(entry => entry.charge_triggers.length > 0));
  assert.deepEqual(migrateGameState(JSON.parse(JSON.stringify(migrated))), migrated, 'Migration is idempotent');
});

test('Current saves retain funded strength and unknown legacy Heroes receive usable triggers', () => {
  const custom = hero('custom-legacy', { funding: 72, funding_total: 456.75, charge: 40 });
  custom.siphon_bank = 100;
  delete custom.charge_triggers;
  const state = stateWith(custom);
  const migrated = migrateGameState(JSON.parse(JSON.stringify(state)));
  assert.equal(migrated.heroes[0].funding, 72);
  assert.equal(migrated.heroes[0].funding_total, 456.75);
  assert.equal(migrated.heroes[0].charge, 40);
  assert(migrated.heroes[0].charge_triggers.length > 0);
  assert(!Object.hasOwn(migrated.heroes[0], 'siphon_bank'));
});


test('Scourge battle producers preserve composite affiliations and deduplicate core/wrapper outcomes', () => {
  const subject = hero('defender', { charge_triggers: [
    rule('BATTLE_STARTED', 35, { empire_scope: 'participant' }),
    rule('BATTLE_LOST', 60, { empire_scope: 'participant' })
  ] });
  const outsider = hero('outsider', { charge_triggers: subject.charge_triggers });
  outsider.empireId = 'ally';
  const state = stateWith(subject, outsider);
  state.scourgeTargetEmpireId = 'home';
  state.armies = [createArmy('home-army', 'home', 'Home Defense')];
  const { front, log } = startScourgeBattle(state, state.armies, () => 0.5);
  assert.equal(subject.charge, 35);
  assert.equal(outsider.charge, 0);
  assert(log.some(message => /Hero charge/.test(message)));
  const composite = state.armies.find(army => army.id === front.leftArmyId);
  composite.mp.current = 0;
  simulateBattleTick(front, state);
  assert.equal(front.winnerSide, 'right');
  assert.equal(subject.charge, 95);
  assert.equal(outsider.charge, 0);
  handleScourgeBattleEnd(state, front, 'right');
  assert.equal(subject.charge, 95, 'Wrapper sees the same defeat without another award');
});

test('An empire with no armies still receives Charge for an unopposed Scourge defeat', () => {
  const subject = hero('struggling', { charge_triggers: [rule('BATTLE_LOST', 60, { empire_scope: 'participant' })] });
  const state = stateWith(subject);
  state.scourgeDirectedTargetEmpireId = 'home';
  const log = [];
  triggerScourgeBattle(state, () => 0, 1, [], log, getLogger());
  assert.equal(subject.charge, 60);
  assert.equal(state.battleFronts.length, 0);
  assert(log.some(message => /Hero charge/.test(message)));
});

test('Automatic and player-choice law burials each charge the rejected agenda once', () => {
  for (const withChoice of [false, true]) {
    const subject = hero('reformer', { values: { doctrine: 1 }, charge_triggers: [
      rule('LAW_REJECTED', 45, { alignment: 'support', empire_scope: 'any' })
    ] });
    const state = stateWith(subject);
    state.lawDefinitions = [{ ...law, name: 'Reform' }];
    const process = createLawProcess(law.id, 3);
    process.rejects = 3;
    state.lawProcesses = [process];
    const rejection = createLawEvent('last-reject', 'Final Rejection', {
      phase_tags: ['DEBATE'], nature: 'REJECT', effects: { progress: -0.1 },
      ...(withChoice ? { choices: [{ text: 'Concede', effects: { progress: -0.1 } }] } : {})
    });
    state.events = [rejection];
    if (withChoice) {
      process.pendingEvent = rejection.id;
      const result = handleLawEventChoice(state, law.id, rejection.id, 0);
      assert.equal(result.success, true);
      assert(result.log.some(message => /Hero charge/.test(message)));
    } else {
      const log = resolveLawProcess(process, state, { random: () => 0 });
      assert(log.some(message => /Hero charge/.test(message)));
    }
    assert.equal(process.phase, 'BURIED');
    assert.equal(subject.charge, 45);
    checkBurialRule(process, state, []);
    assert.equal(subject.charge, 45);
  }
});

test('Law enactment and proposal producers dispatch stable Hero events', () => {
  const subject = hero('legislator', { charge_triggers: [
    rule('LAW_PROPOSED', 25, { proposer_only: true, empire_scope: 'own' }),
    rule('LAW_ENACTED', 30, { empire_scope: 'any' })
  ] });
  const state = stateWith(subject);
  state.lawDefinitions = getSampleLawDefinitions();
  generateHeroLawProposals(state, () => 0.5, []);
  assert.equal(subject.charge, 25);
  const proposal = state.proposedLaws[0];
  const process = createLawProcess(proposal.lawId, 3);
  process.phase = 'VOTING';
  process.phaseProgress = 1;
  state.lawProcesses = [process];
  state.events = [];
  resolveLawProcess(process, state, { random: () => 0.5 });
  assert.equal(process.phase, 'ENACTED');
  assert.equal(subject.charge, 55);
  resolveLawProcess(process, state, { random: () => 0.5 });
  assert.equal(subject.charge, 55);
});

test('Technology choices charge only on a newly unlocked technology', () => {
  const subject = hero('scientist', { charge_triggers: [rule('TECH_UNLOCKED', 50, { empire_scope: 'own' })] });
  const state = stateWith(subject);
  const tech = getAvailableTechs(state.empires[0])[0];
  assert(tech);
  const choiceEvent = { scope: 'TECH', empireId: 'home', choices: [{ effects: { _grantTech: tech.id } }] };
  assert.equal(handleTechEventChoice(state, choiceEvent, 0).success, true);
  assert.equal(subject.charge, 50);
  assert.equal(handleTechEventChoice(state, choiceEvent, 0).success, false);
  assert.equal(subject.charge, 50);
});

test('Improvement completion charges once when construction finishes, never on sustainment ticks', () => {
  const subject = hero('builder', { charge_triggers: [rule('IMPROVEMENT_COMPLETED', 45, { empire_scope: 'own' })] });
  const state = stateWith(subject);
  state.improvements = initializeImprovementsState();
  state.coalitionConstruction = 1;
  state.improvements.queue = [createImprovement('project', 'home', state.turn, {
    name: 'Local Project', build: 1, capacity: 1, sustainmentCost: {}, productionOutputs: {}, modifiers: {}, tags: []
  })];
  processImprovementsTick(state);
  assert.equal(state.improvements.queue[0].state, 'ACTIVE');
  assert.equal(subject.charge, 45);
  state.turn += 1;
  processImprovementsTick(state);
  assert.equal(subject.charge, 45);
});


test('A fully charged law ability fires immediately when the player starts a law', () => {
  const subject = hero('waiting-legislator', { ability_id: 'ABILITY_LEGISLATIVE_SURGE', charge: 150 });
  const state = stateWith(subject);
  state.lawDefinitions = getSampleLawDefinitions();
  state.playerInfluence = 1000;
  const started = startLawProcess(state, state.lawDefinitions[0].id, 100);
  assert.equal(started.success, true);
  assert.equal(subject.charge, 0);
  assert(subject.cooldowns.ability > 0);
  assert(state.lawProcesses[0].phaseProgress > 0);
  assert(started.log.some(message => /Hero Ability/.test(message)));
});


test('Malformed saved Charge rules are ignored while valid rules remain usable', () => {
  const subject = hero('saved-rules');
  subject.charge_triggers = [
    null, 23, 'LAW_ENACTED', {},
    { event: 'TECH_UNLOCKED', amount: -4 },
    { event: 'TECH_UNLOCKED', amount: '25' },
    { event: 'TECH_UNLOCKED', amount: Infinity },
    { event: 99, amount: 25 },
    rule('TECH_UNLOCKED', 25, { empire_scope: 'own' })
  ];
  const restored = migrateGameState(JSON.parse(JSON.stringify(stateWith(subject))));
  event(restored, 'TECH_UNLOCKED', 'safe-saved-rules', { empireId: 'home' });
  assert.equal(restored.heroes[0].charge, 25);
  event(restored, 'TECH_UNLOCKED', 'safe-saved-rules', { empireId: 'home' });
  assert.equal(restored.heroes[0].charge, 25);
});

test('Early law and improvement activations retain their full cooldown for the turn', () => {
  const manager = new GameManager();
  manager.initializeNewGame(731);
  const baseline = manager.getSaveState();
  for (const triggerType of ['LAW_ENACTED', 'IMPROVEMENT_COMPLETED']) {
    const state = JSON.parse(JSON.stringify(baseline));
    const subject = hero('early-activation', {
      charge_triggers: [rule(triggerType, 200, { empire_scope: 'any' })]
    });
    subject.empireId = state.empires[0].id;
    state.heroes = [subject];
    state.events = [];
    state.activeEvent = { id: 'hold-event' };
    state.proposedLaws = [];
    state.improvements.requests = [];
    state.improvements.queue = [];
    if (triggerType === 'LAW_ENACTED') {
      const process = createLawProcess(state.lawDefinitions[0].id, state.turn);
      process.phase = 'VOTING';
      process.phaseProgress = 1;
      state.lawProcesses = [process];
    } else {
      state.lawProcesses = [];
      state.improvements.queue = [createImprovement('early-project', subject.empireId, state.turn, {
        name: 'Early Project', build: 1, capacity: 1, sustainmentCost: {}, productionOutputs: {}, modifiers: {}, tags: []
      })];
    }
    const rng = () => 0.99;
    rng.random = rng;
    const result = advanceTurn(state, rng);
    assert.equal(subject.charge, 0, `${triggerType} activates in its producing turn`);
    assert.equal(subject.cooldowns.ability, HERO_ABILITIES.ABILITY_EMERGENCY_FUNDS.cooldown,
      `${triggerType} does not lose one cooldown tick immediately after activation`);
    assert(result.log.some(message => /Hero Ability fired/.test(message)));
  }
});

test('GameManager keeps initial and save-load proposal Charge explanations in the player log', () => {
  const manager = new GameManager();
  manager.initializeNewGame(731);
  assert(manager.state.heroes.some(subject => subject.charge > 0), 'Seed includes a Hero inspired by a proposal');
  assert(manager.state.log.some(message => /Hero charge/.test(message)), 'Initial proposal Charge reaches the player log');
  assert(manager.state.log.some(message => /proposed/.test(message)));

  const subject = hero('loaded-proposer', {
    charge_triggers: [rule('LAW_PROPOSED', 25, { proposer_only: true, empire_scope: 'own' })]
  });
  const legacy = stateWith(subject);
  legacy.lawDefinitions = getSampleLawDefinitions();
  legacy.proposedLaws = [];
  legacy.log = [];
  manager.loadSaveState(JSON.parse(JSON.stringify(legacy)));
  assert.equal(manager.state.heroes[0].charge, 25);
  assert(manager.state.log.some(message => /Hero charge/.test(message)), 'Loaded proposal Charge reaches the player log');
  assert(manager.state.log.some(message => /loaded-proposer proposed/.test(message)));
});

test('Battle-start War Cry reaches fighting composites proportionally to the empire’s committed power', () => {
  const subject = hero('rally', {
    ability_id: 'ABILITY_WAR_CRY',
    charge_triggers: [rule('BATTLE_STARTED', 130, { empire_scope: 'participant' })]
  });
  const state = stateWith(subject);
  const home = createArmy('rallied-army', 'home', 'Home Army', 40, 50);
  const ally = createArmy('partner-army', 'ally', 'Coalition Partner', 60, 80);
  state.armies = [home, ally];
  const homeWeight = calculateArmyPower(home);
  const allyWeight = calculateArmyPower(ally) * 0.5;
  const total = homeWeight + allyWeight;
  const beforeFervor = (40 * homeWeight + 60 * allyWeight) / total;
  const beforeOrg = (50 * homeWeight + 80 * allyWeight) / total;
  const strength = getAbilityScalar(subject);
  const fervorBoost = Math.round(8 * strength);
  const orgBoost = Math.round(5 * strength);

  const { front, log } = startScourgeBattle(state, [
    { army: home, commitRatio: 1 },
    { army: ally, commitRatio: 0.5, isSupport: true }
  ], () => 0.5);
  const composite = state.armies.find(army => army.id === front.leftArmyId);
  assert.equal(subject.charge, 0);
  assert.equal(home.fervor, 40 + fervorBoost);
  assert.equal(home.organization, 50 + orgBoost);
  assert.equal(ally.fervor, 60, 'The partner’s original army receives no Hero bonus');
  assert.equal(ally.organization, 80);
  assert(Math.abs(composite.fervor - (beforeFervor + fervorBoost * homeWeight / total)) < 1e-9);
  assert(Math.abs(composite.organization - (beforeOrg + orgBoost * homeWeight / total)) < 1e-9);
  assert(log.some(message => /Hero Ability fired/.test(message)));
});

test('War Cry boosts a same-empire loyal composite once and leaves the rebel composite unchanged', () => {
  for (const [initialFervor, initialOrg] of [[40, 50], [98, 99]]) {
    const subject = hero('loyal-rally', {
      ability_id: 'ABILITY_WAR_CRY',
      charge_triggers: [rule('BATTLE_STARTED', 130, { empire_scope: 'participant' })]
    });
    const state = stateWith(subject);
    const loyal = createArmy('loyal-army', 'home', 'Loyal Army', initialFervor, initialOrg);
    const rebel = createArmy('rebel-army', 'home', 'Rebel Army', 45, 40);
    state.armies = [loyal, rebel];
    const { front } = startInsurrectionBattle(state, { id: 'rebellion', armies: [rebel.id], targetEmpireId: 'home' }, [loyal], () => 0.5);
    const loyalComposite = state.armies.find(army => army.id === front.leftArmyId);
    const rebelComposite = state.armies.find(army => army.id === front.rightArmyId);
    const expectedFervor = Math.min(100, initialFervor + Math.round(8 * getAbilityScalar(subject)));
    const expectedOrg = Math.min(100, initialOrg + Math.round(5 * getAbilityScalar(subject)));
    assert.equal(subject.charge, 0);
    assert.equal(loyalComposite.empireId, 'home');
    assert.equal(loyal.fervor, expectedFervor);
    assert.equal(loyal.organization, expectedOrg);
    assert.equal(loyalComposite.fervor, expectedFervor, 'The fighting force receives the actual capped original-army bonus once');
    assert.equal(loyalComposite.organization, expectedOrg);
    assert.equal(rebelComposite.fervor, 45);
    assert.equal(rebelComposite.organization, 40);
  }
});

test('New funding improvement bonuses and legacy siphon efficiency give equal yield only to the owning empire', () => {
  const definition = getAllImprovementRequests().find(request => request.id === 'civilization_hub');
  assert.equal(definition.modifiers.hero_funding_efficiency_mult, 0.05);
  const results = [];
  for (const mode of ['baseline', 'legacy', 'current']) {
    const home = hero('funded-home', { budget_share: 0.01 });
    const ally = hero('funded-ally', { budget_share: 0.01 });
    ally.empireId = 'ally';
    const state = stateWith(home, ally);
    state.empires.forEach(empire => { empire.budget_credits = 1000; });
    state.improvements = initializeImprovementsState();
    if (mode !== 'baseline') {
      const project = createImprovement('arcology', 'home', state.turn, definition);
      project.state = 'ACTIVE';
      if (mode === 'legacy') {
        delete project.modifiers.hero_funding_efficiency_mult;
        project.modifiers.hero_siphon_efficiency_add = 0.01;
      }
      state.improvements.queue = [project];
    }
    applyImprovementModifiers(state);
    applyHeroFunding(state, []);
    assert.equal(home.funding_last_paid, 10);
    assert.equal(ally.funding_last_paid, 10);
    assert.equal(ally.funding, 5, 'Another empire receives no funding efficiency from the Arcology');
    assert.equal(state.empires[0].budget_credits, 990);
    results.push(home.funding);
  }
  assert.equal(results[0], 5);
  assert(results[1] > results[0]);
  assert(Math.abs(results[1] - results[2]) < 1e-12);
});

console.log(`\n${passed} Hero Charge/funding tests passed.`);
