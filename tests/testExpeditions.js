#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createGameState, createEmpire, createArmy, migrateGameState } from '../src/game/types.js';
import {
  handleExpeditionAction,
  processExpeditionsTick,
  refreshExpeditionOptions,
  resolveExpeditionBattles,
  getOccupationCost
} from '../src/game/expeditions/index.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({ level: LogLevel.ERROR, enableConsole: false, enableFile: false, enableUI: false });

const COMMODITIES = [
  'super_alloys', 'biomass', 'plasma_fuel', 'rare_gases', 'genomes',
  'ancient_relics', 'psycho_implants', 'nano_machines', 'quantum_circuits',
  'sentient_cores', 'wormhole_reactors', 'dark_matter', 'anti_grav_modules'
];
const launch = { action: 'launch', planId: 'frontier' };

function fixture(seed = 9182) {
  const state = createGameState(seed);
  state.empires = [createEmpire('home', 'Home Council', 70)];
  state.armies = [createArmy('home_army', 'home', 'Home Guard', 70, 80)];
  state.coalitionEconomy.requisition = 1_000_000;
  state.coalitionEconomy.treasury_credits = 1_000_000;
  state.stockpiles = Object.fromEntries(COMMODITIES.map(key => [key, 100_000]));
  state.market = Object.fromEntries(COMMODITIES.map(key => [key, { price: 2 }]));
  state.marketOrders = { buyOrders: [], sellOffers: [] };
  refreshExpeditionOptions(state);
  return state;
}

function action(state, payload) {
  const result = handleExpeditionAction(state, payload);
  assert.equal(result.success, true, `${JSON.stringify(payload)}: ${result.error || 'action failed'}`);
  return result;
}

function tick(state, count = 1) {
  for (let i = 0; i < count; i++) {
    processExpeditionsTick(state);
    state.turn += 1;
  }
}

function completeMission(state) {
  action(state, launch);
  const { duration } = state.expeditions.active[0];
  for (let i = 0; state.expeditions.active.length && i < 100; i++) tick(state);
  assert.equal(state.expeditions.active.length, 0, 'mission finishes in bounded time');
  return duration;
}

function contactFixture(seed) {
  const state = fixture(seed);
  completeMission(state);
  return { state, minor: state.expeditions.empires[0] };
}

function economicSnapshot(state) {
  return structuredClone({
    stockpiles: state.stockpiles,
    coalitionEconomy: state.coalitionEconomy,
    marketOrders: state.marketOrders,
    budgets: state.empires.map(empire => empire.budget_credits),
    active: state.expeditions.active,
    discoveries: state.expeditions.discoveries,
    empires: state.expeditions.empires
  });
}

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('one frontier mission can find a contact or discovery and spends only materials', () => {
  const state = fixture();
  state.coalitionEconomy.requisition = 0;
  const plans = refreshExpeditionOptions(state).filter(option => option.action === 'launch');
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].payload, launch);
  assert.deepEqual(plans[0].durationRange, { min: 10, max: 16 });
  assert.equal(plans[0].destinationKind, 'empire');
  assert.deepEqual(plans[0].cost.materials, { biomass: 150, plasma_fuel: 100 });
  assert.equal(plans[0].disabled, false, 'no requisition is needed to launch');
  state.coalitionEconomy.requisition = -5;
  const before = structuredClone(state.stockpiles);
  action(state, launch);
  assert.equal(state.expeditions.active.length, 1);
  const mission = state.expeditions.active[0];
  assert.equal(mission.kind, plans[0].destinationKind);
  assert.equal(state.expeditions.empires.length, 0, 'launch does not reveal a contact immediately');
  assert.equal(state.expeditions.discoveries.length, 0);
  assert.equal(state.coalitionEconomy.requisition, -5, 'launch works during requisition debt and preserves the balance');
  assert.deepEqual(state.stockpiles, {
    ...before, biomass: before.biomass - 150, plasma_fuel: before.plasma_fuel - 100
  });

  const committed = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, launch).success, false);
  assert.deepEqual(economicSnapshot(state), committed, 'a rejected second launch cannot retarget or double-charge the mission');
  tick(state, mission.duration - 1);
  assert.equal(state.expeditions.empires.length, 0, 'travel takes the full rolled duration');
  tick(state);
  assert.equal(state.expeditions.empires.length, 1);
  assert.equal(state.expeditions.discoveries.length, 0);
  const minor = state.expeditions.empires[0];
  assert.ok(minor.production.commodity && minor.production.amount > 0);
  assert.ok(minor.sustain.commodity && minor.sustain.amount > 0);
  assert.ok(minor.approval >= 0 && minor.approval <= 100);
  assert.ok(!state.empires.some(empire => empire.id === minor.id), 'contacts do not become voting Coalition empires');

  const next = state.expeditions.options.find(option => option.action === 'launch');
  assert.equal(next.destinationKind, 'discovery');
  assert.deepEqual(next.cost.materials, { super_alloys: 188, plasma_fuel: 125 });
  const beforeSecond = structuredClone(state.stockpiles);
  completeMission(state);
  assert.deepEqual(state.stockpiles, {
    ...beforeSecond, super_alloys: beforeSecond.super_alloys - 188, plasma_fuel: beforeSecond.plasma_fuel - 125
  });
  assert.equal(state.expeditions.empires.length, 1);
  assert.equal(state.expeditions.discoveries.length, 1);
  const counts = [state.expeditions.empires.length, state.expeditions.discoveries.length];
  tick(state, 20);
  assert.deepEqual([state.expeditions.empires.length, state.expeditions.discoveries.length], counts, 'completed missions cannot pay out again');
});

test('a seed and the same decisions reproduce varied travel times, destinations, and material costs', () => {
  function run(seed) {
    const state = fixture(seed);
    const durations = Array.from({ length: 5 }, () => completeMission(state));
    return {
      durations,
      contacts: state.expeditions.empires.map(minor => ({ id: minor.id, production: minor.production, sustain: minor.sustain })),
      discoveries: state.expeditions.discoveries.map(discovery => discovery.id),
      stockpiles: state.stockpiles,
      requisition: state.coalitionEconomy.requisition
    };
  }
  const first = run(7714);
  assert.deepEqual(run(7714), first);
  assert(first.durations.every(duration => duration >= 10 && duration <= 16));
  assert(new Set(first.durations).size > 1, 'mission durations vary within a campaign');
  assert.equal(new Set(first.contacts.map(minor => minor.id)).size, first.contacts.length, 'contact rewards are unique');
  assert.equal(new Set(first.discoveries).size, first.discoveries.length, 'discovery rewards are unique');
});

test('Hyperdrive and completed Transit Lattice studies shorten later expeditions', () => {
  const baseline = fixture();
  action(baseline, launch);
  const baseDuration = baseline.expeditions.active[0].duration;

  const state = fixture();
  state.empires[0].technologies.push('hyperdrive');
  const launchOption = () => refreshExpeditionOptions(state).find(option => option.action === 'launch');
  assert.deepEqual(launchOption().durationRange, { min: 9, max: 14 });

  const lattice = { id: 'transit_lattice', name: 'Transit Lattice', status: 'UNSTUDIED' };
  state.expeditions.discoveries.push(lattice);
  action(state, { action: 'study', targetId: lattice.id });
  assert.equal(launchOption().speedBonus, 0.2, 'studies grant bonuses upon completion');
  tick(state, lattice.project.duration);
  assert.equal(lattice.status, 'STUDIED');
  assert.match(lattice.benefitDescription, /\+30% expedition speed/);
  assert.equal(launchOption().speedBonus, 0.5);
  assert.deepEqual(launchOption().durationRange, { min: 7, max: 11 });
  action(state, launch);
  assert.equal(state.expeditions.active[0].duration, Math.ceil(baseDuration / 1.5));
});

test('missing resources and malformed actions reject atomically', () => {
  const state = fixture();
  state.stockpiles.plasma_fuel = 99;
  const shortfall = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, launch).success, false, 'one missing material blocks launch');
  assert.deepEqual(economicSnapshot(state), shortfall);

  state.stockpiles.plasma_fuel = 100;
  for (const payload of [
    { action: 'launch', planId: 'invented_route' },
    { action: 'launch', planId: 'contact' },
    { action: 'launch', planId: 'survey' },
    { action: 'develop', targetId: 'missing' },
    { action: 'aid', targetId: 'missing' },
    { action: 'invented_action' },
    {}
  ]) {
    const before = economicSnapshot(state);
    assert.equal(handleExpeditionAction(state, payload).success, false);
    assert.deepEqual(economicSnapshot(state), before);
  }
});

test('material procurement retires only unfilled reserves and pays the producing empire', () => {
  const state = fixture();
  state.stockpiles = {};
  const plan = refreshExpeditionOptions(state).find(option => option.action === 'launch');
  const materials = Object.entries(plan.cost.materials);
  assert.ok(materials.length > 0);
  state.empires[0].budget_credits = 0;
  state.marketOrders.sellOffers = materials.map(([commodity, quantity], index) => ({
    id: `reserve_${index}`, owner_type: 'empire', owner_id: 'home', commodity,
    qty: quantity + 7, filled_qty: 2, ask_price: 2
  }));
  const creditsBefore = state.coalitionEconomy.treasury_credits;
  const price = materials.reduce((sum, [, quantity]) => sum + quantity * 2, 0);
  action(state, launch);
  approx(state.coalitionEconomy.treasury_credits, creditsBefore - price, 'treasury pays for reserve materials');
  approx(state.empires[0].budget_credits, price, 'producer receives exact procurement credits');
  state.marketOrders.sellOffers.forEach(order => {
    approx(order.qty, 7, 'only the cost quantity is retired');
    assert.equal(order.filled_qty, 2, 'existing trade receipts are preserved');
  });
});

test('reserve procurement without treasury credit leaves all resources intact', () => {
  const state = fixture();
  state.stockpiles = {};
  state.coalitionEconomy.treasury_credits = 0;
  state.marketOrders.sellOffers = COMMODITIES.map(commodity => ({
    id: `reserve_${commodity}`, owner_type: 'empire', owner_id: 'home', commodity,
    qty: 10_000, filled_qty: 0, ask_price: 2
  }));
  const before = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, launch).success, false);
  assert.deepEqual(economicSnapshot(state), before, 'credit validation precedes every deduction');
});

test('an envoy reveals priorities and priority aid improves approval with a persistent cooldown', () => {
  const { state, minor } = contactFixture();
  assert.equal(minor.interestRevealed, false);
  assert.equal(handleExpeditionAction(state, { action: 'aid', targetId: minor.id }).success, false, 'learn what the contact values before tailoring aid');
  action(state, { action: 'envoy', targetId: minor.id });
  assert.equal(minor.interestRevealed, true);
  assert.ok(minor.interest.name && minor.interest.commodity);
  const approvalBefore = minor.approval;
  action(state, { action: 'aid', targetId: minor.id });
  assert.ok(minor.approval > approvalBefore);
  const after = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, { action: 'aid', targetId: minor.id }).success, false, 'aid cannot be repeated without a cooldown');
  assert.deepEqual(economicSnapshot(state), after);
  const reloaded = migrateGameState(JSON.parse(JSON.stringify(state)));
  assert.equal(handleExpeditionAction(reloaded, { action: 'aid', targetId: minor.id }).success, false, 'save/load cannot bypass the cooldown');
  tick(reloaded, 6);
  action(reloaded, { action: 'aid', targetId: minor.id });
});

test('trade pacts need approval and reward a sustained peaceful relationship', () => {
  const { state, minor } = contactFixture();
  action(state, { action: 'envoy', targetId: minor.id });
  minor.status = 'INDEPENDENT';
  minor.approval = 64;
  const before = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, { action: 'pact', targetId: minor.id }).success, false);
  assert.deepEqual(economicSnapshot(state), before);
  minor.approval = 65;
  action(state, { action: 'pact', targetId: minor.id });
  assert.equal(minor.status, 'ALLIED');
  minor.supplyState.fulfillment = 1;
  const requisitionBefore = state.coalitionEconomy.requisition;
  tick(state);
  assert.ok(minor.exportMultiplier > 1, 'a pact increases peaceful trade output');
  assert.ok(state.coalitionEconomy.requisition > requisitionBefore, 'a supplied ally provides recurring Coalition requisition');
  assert.equal(handleExpeditionAction(state, { action: 'pact', targetId: minor.id }).success, false, 'an existing pact cannot be purchased repeatedly');
});

test('development is one immediate upgrade with a fixed cost', () => {
  const { state, minor } = contactFixture();
  const develop = { action: 'develop', targetId: minor.id };
  minor.approval = 39;
  const beforeApproval = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, develop).success, false);
  assert.deepEqual(economicSnapshot(state), beforeApproval);
  minor.approval = 40;
  const options = refreshExpeditionOptions(state).filter(option => option.action === 'develop');
  assert.equal(options.length, 1);
  const [option] = options;
  assert.deepEqual(option.payload, develop);
  assert.equal(option.duration, undefined);
  assert.equal(option.cost.requisition, 35);
  assert.deepEqual(option.cost.materials, { super_alloys: 65 });

  const outputBefore = minor.production.amount;
  const sustainBefore = minor.sustain.amount;
  const materialsBefore = { ...state.stockpiles };
  const requisitionBefore = state.coalitionEconomy.requisition;
  action(state, develop);
  assert.deepEqual(state.stockpiles, { ...materialsBefore, super_alloys: materialsBefore.super_alloys - 65 });
  assert.equal(state.coalitionEconomy.requisition, requisitionBefore - 35);
  assert.equal(minor.production.amount, outputBefore * 1.5);
  assert.equal(minor.sustain.amount, sustainBefore * 0.8);
  assert.equal(minor.approval, 46);
  assert.equal(minor.developmentLevel, 1);
  assert.equal(minor.project, null);

  const committed = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, develop).success, false);
  assert.deepEqual(economicSnapshot(state), committed, 'a contact can only be developed once');
  const restored = migrateGameState(JSON.parse(JSON.stringify(state)));
  assert.equal(handleExpeditionAction(restored, develop).success, false, 'save/load preserves the completed upgrade');
});

test('older saves retain completed development and finish paid projects on schedule', () => {
  const { state, minor } = contactFixture();
  state.expeditions.version = 1;
  const baseProduction = minor.production.amount;
  const baseSustain = minor.sustain.amount;
  minor.production.amount = baseProduction * 2;
  Object.assign(minor, { approval: 80, baseProduction, baseSustain, developmentLevel: 2,
    developments: { industry: 2, infrastructure: 0 },
    project: { id: 'infrastructure', name: 'Build civilian infrastructure', duration: 7, remainingTurns: 2 } });
  const restored = migrateGameState(JSON.parse(JSON.stringify(state)));
  const restoredMinor = restored.expeditions.empires[0];
  const develop = { action: 'develop', targetId: minor.id };
  assert.equal(handleExpeditionAction(restored, develop).success, false);
  tick(restored);
  assert.equal(restoredMinor.project.remainingTurns, 1);
  assert.equal(restoredMinor.production.amount, baseProduction * 2);
  assert.equal(restoredMinor.sustain.amount, baseSustain);
  tick(restored);
  assert.equal(restoredMinor.project, null);
  assert.equal(restoredMinor.production.amount, baseProduction * 2);
  assert.equal(restoredMinor.sustain.amount, baseSustain * 0.8);
  assert.equal(restoredMinor.developmentLevel, 3);
  assert.equal(handleExpeditionAction(restored, develop).success, false);
  assert.deepEqual(restored.stockpiles, state.stockpiles, 'legacy projects need no further payment');
});

test('a discovery must be studied and cannot repeat its reward', () => {
  const state = fixture(3941);
  completeMission(state);
  const discovery = state.expeditions.discoveries[0];
  assert.equal(discovery.status, 'UNSTUDIED');
  assert.ok(discovery.benefitDescription, 'the player can see what study will unlock');
  action(state, { action: 'study', targetId: discovery.id });
  assert.equal(discovery.status, 'STUDYING');
  const duringStudy = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, { action: 'study', targetId: discovery.id }).success, false);
  assert.deepEqual(economicSnapshot(state), duringStudy, 'study cannot be queued twice');
  for (let i = 0; discovery.status !== 'STUDIED' && i < 100; i++) tick(state);
  assert.equal(discovery.status, 'STUDIED');
  const after = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, { action: 'study', targetId: discovery.id }).success, false);
  assert.deepEqual(economicSnapshot(state), after);
});

test('processing the same turn twice cannot advance travel or duplicate rewards', () => {
  const state = fixture();
  action(state, launch);
  processExpeditionsTick(state);
  const once = structuredClone(state);
  processExpeditionsTick(state);
  assert.deepEqual(state, once, 'one simulation turn has only one expedition tick');

  state.turn += 1;
  for (let i = 0; state.expeditions.active.length && i < 100; i++) tick(state);
  const minor = state.expeditions.empires[0];
  action(state, { action: 'envoy', targetId: minor.id });
  minor.approval = 90;
  minor.status = 'INDEPENDENT';
  action(state, { action: 'pact', targetId: minor.id });
  processExpeditionsTick(state);
  const paid = economicSnapshot(state);
  processExpeditionsTick(state);
  assert.deepEqual(economicSnapshot(state), paid, 'a recurring alliance payment cannot be collected twice per turn');
});

test('a salvage cache pays once and a studied relay grants its recurring intel once per turn', () => {
  const state = fixture(3941);
  for (let i = 0; i < 12; i++) completeMission(state);
  assert.equal(state.expeditions.empires.length, 6);
  assert.equal(state.expeditions.discoveries.length, 6);
  const cache = state.expeditions.discoveries.find(entry => entry.id === 'derelict_convoy');
  const relay = state.expeditions.discoveries.find(entry => entry.id === 'ancient_relay');
  assert.ok(cache && relay, 'finite discovery pool includes salvage and an ongoing benefit');
  const outputBefore = state.stockpiles.super_alloys;
  action(state, { action: 'study', targetId: cache.id });
  for (let i = 0; cache.status !== 'STUDIED' && i < 100; i++) tick(state);
  assert.ok(state.stockpiles.super_alloys > outputBefore, 'cache cargo enters usable Coalition stockpiles');
  const salvaged = state.stockpiles.super_alloys;
  tick(state, 10);
  assert.equal(state.stockpiles.super_alloys, salvaged, 'completed salvage does not mint more materials');

  action(state, { action: 'study', targetId: relay.id });
  for (let i = 0; relay.status !== 'STUDIED' && i < 100; i++) tick(state);
  const intelBefore = state.coalitionIntel;
  processExpeditionsTick(state);
  approx(state.coalitionIntel, intelBefore + 0.5, 'studied relay generates its advertised intel');
  const intelAfter = state.coalitionIntel;
  processExpeditionsTick(state);
  assert.equal(state.coalitionIntel, intelAfter, 'same-turn processing does not stack the benefit');
  state.turn += 1;
  processExpeditionsTick(state);
  approx(state.coalitionIntel, intelAfter + 0.5, 'benefit recurs on the following turn');

  const before = economicSnapshot(state);
  assert.equal(handleExpeditionAction(state, launch).success, false, 'a fully charted frontier cannot sell an expedition with no reward');
  assert.deepEqual(economicSnapshot(state), before);
});

test('old saves gain expeditions and an expedition already travelling survives save/load', () => {
  const oldSave = fixture();
  delete oldSave.expeditions;
  const migrated = migrateGameState(oldSave);
  assert.ok(migrated.expeditions && Array.isArray(migrated.expeditions.active));
  assert.equal(migrated.expeditions.empires.length, 0);

  const state = fixture(7281);
  action(state, launch);
  tick(state, 2);
  const restored = migrateGameState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.expeditions.active, state.expeditions.active);
  for (let i = 0; state.expeditions.active.length && i < 100; i++) tick(state);
  for (let i = 0; restored.expeditions.active.length && i < 100; i++) tick(restored);
  assert.deepEqual(restored.expeditions.empires, state.expeditions.empires);

  const legacySave = fixture();
  legacySave.expeditions.sequence = 1;
  legacySave.expeditions.active = [{
    id: 'expedition_1', planId: 'survey', name: 'Survey the unknown', kind: 'discovery',
    destinationId: 'ancient_relay', duration: 5, remainingTurns: 2, startedTurn: 0
  }];
  const legacy = migrateGameState(legacySave);
  assert.equal(handleExpeditionAction(legacy, launch).success, false, 'a legacy mission still occupies the active slot');
  tick(legacy, 2);
  assert.equal(legacy.expeditions.discoveries[0].id, 'ancient_relay', 'a legacy mission returns to its saved destination');
});

test('hostile contacts warn before raiding and a ceasefire prevents the attack', () => {
  const { state, minor } = contactFixture();
  minor.approval = 10;
  minor.nextRaidTurn = state.turn;
  tick(state);
  assert.equal(minor.status, 'HOSTILE');
  assert.equal(minor.exportMultiplier, 0, 'hostility closes trade');
  assert.ok(minor.raidWarningTurns > 0, 'the player receives a countdown before an attack');
  assert.equal(state.battleFronts.length, 0, 'becoming hostile does not cause an immediate battle');
  tick(state);
  assert.ok(minor.raidWarningTurns > 0, 'there is time to respond');
  action(state, { action: 'appease', targetId: minor.id });
  assert.equal(minor.status, 'INDEPENDENT');
  assert.ok(minor.approval >= 35);
  assert.equal(minor.raidWarningTurns, null);
  tick(state, 5);
  assert.equal(state.battleFronts.length, 0, 'ceasefire cancels the warned raid');
});

test('invasion costs reputation and conquest requires upkeep with reduced exports until liberation', () => {
  const { state, minor } = contactFixture();
  while (state.expeditions.empires.length < 2) completeMission(state);
  const observer = state.expeditions.empires.find(entry => entry.id !== minor.id);
  const observerApproval = observer.approval;
  const memberApproval = state.empires[0].approval;
  const cohesion = state.coalitionCohesion;
  const reqBeforeInvasion = state.coalitionEconomy.requisition;
  action(state, { action: 'invade', targetId: minor.id });
  assert.ok(minor.war?.frontId, 'the expedition starts a real battle front');
  assert.ok(state.coalitionEconomy.requisition < reqBeforeInvasion);
  assert.ok(state.coalitionCohesion < cohesion, 'aggression has a Coalition political cost');
  assert.ok(state.empires[0].approval < memberApproval);
  assert.ok(observer.approval < observerApproval, 'other discovered empires react to conquest');
  assert.equal(minor.exportMultiplier, 0, 'war interrupts exports');

  // Military casualty calculations are exercised in testExpeditionCombat.
  // Feed an ended front into the diplomacy/economy integration here.
  const front = state.battleFronts.find(entry => entry.id === minor.war.frontId);
  front.state = 'ENDED';
  front.winnerSide = 'left';
  resolveExpeditionBattles(state);
  assert.equal(minor.status, 'CONQUERED');
  assert.equal(minor.war, null);
  assert.ok(minor.occupationTurns > 0);
  assert.ok(minor.exportMultiplier > 0 && minor.exportMultiplier < 1);
  const upkeep = getOccupationCost(minor);
  const reqBeforeUpkeep = state.coalitionEconomy.requisition;
  const fuelBeforeUpkeep = state.stockpiles.plasma_fuel;
  tick(state);
  approx(state.coalitionEconomy.requisition, reqBeforeUpkeep - upkeep.requisition, 'occupation charges recurring requisition');
  approx(state.stockpiles.plasma_fuel, fuelBeforeUpkeep - upkeep.materials.plasma_fuel, 'occupation consumes recurring fuel');
  assert.equal(minor.upkeepPaid, true);
  assert.equal(handleExpeditionAction(state, { action: 'pact', targetId: minor.id }).success, false, 'occupied contacts cannot also provide partnership rewards');

  action(state, { action: 'liberate', targetId: minor.id });
  assert.equal(minor.status, 'INDEPENDENT');
  assert.equal(minor.occupationTurns, 0);
  const liberatedReq = state.coalitionEconomy.requisition;
  const liberatedFuel = state.stockpiles.plasma_fuel;
  tick(state);
  assert.equal(state.coalitionEconomy.requisition, liberatedReq, 'liberation ends occupation payments');
  assert.equal(state.stockpiles.plasma_fuel, liberatedFuel);
  assert.equal(minor.exportMultiplier, 1);
});

test('only consecutive upkeep misses end Coalition control', () => {
  const { state, minor } = contactFixture();
  action(state, { action: 'invade', targetId: minor.id });
  const front = state.battleFronts.find(entry => entry.id === minor.war.frontId);
  front.state = 'ENDED';
  front.winnerSide = 'left';
  resolveExpeditionBattles(state);
  state.stockpiles = {};
  state.marketOrders.sellOffers = [];
  const requisition = state.coalitionEconomy.requisition;
  tick(state);
  assert.equal(minor.upkeepPaid, false);
  assert.equal(minor.exportMultiplier, 0);
  assert.match(minor.upkeepFailure, /plasma fuel/);
  assert.match(state.expeditions.history.at(-1).message, /19 more missed payments in a row/);
  assert.equal(state.coalitionEconomy.requisition, requisition, 'unpayable upkeep does not make a partial deduction');
  const limit = state.expeditions.occupationUnrestLimit;
  assert.equal(limit, 20);
  tick(state, limit - 2);
  assert.equal(minor.status, 'CONQUERED');
  assert.equal(minor.occupationUnrest, limit - 1);
  assert(state.expeditions.history.some(entry => /5 more missed payments in a row/.test(entry.message)));

  state.stockpiles.plasma_fuel = getOccupationCost(minor).materials.plasma_fuel;
  tick(state);
  assert.equal(minor.upkeepPaid, true);
  assert.equal(minor.upkeepFailure, null);
  assert.equal(minor.occupationUnrest, 0);
  assert.equal(minor.exportMultiplier, 0.35);
  tick(state);
  assert.equal(minor.occupationUnrest, 1);
  assert.equal(minor.status, 'CONQUERED', 'a single miss after recovery cannot end the occupation');

  const restored = migrateGameState(JSON.parse(JSON.stringify(state)));
  const restoredMinor = restored.expeditions.empires[0];
  tick(restored, limit - 2);
  assert.equal(restoredMinor.status, 'CONQUERED');
  assert.equal(restoredMinor.occupationUnrest, limit - 1, 'the current streak survives save/load');
  tick(restored);
  assert.equal(restoredMinor.status, 'HOSTILE');
  assert.equal(restoredMinor.occupationTurns, 0);
  assert(restored.expeditions.history.some(entry => /20 consecutive missed upkeep payments/.test(entry.message)));
});

test('older accumulated unrest starts a fresh countdown on load', () => {
  const { state, minor } = contactFixture();
  state.expeditions.version = 1;
  state.stockpiles.plasma_fuel = 0;
  Object.assign(minor, { status: 'CONQUERED', occupationTurns: 9, occupationUnrest: 7 });
  const restored = migrateGameState(JSON.parse(JSON.stringify(state)));
  const restoredMinor = restored.expeditions.empires[0];
  assert.equal(restoredMinor.occupationUnrest, 0);
  assert.equal(restoredMinor.occupationTurns, 9);
  tick(restored);
  assert.equal(restoredMinor.status, 'CONQUERED');
  assert.equal(restoredMinor.occupationUnrest, 1);
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
console.log(`\nExpeditions: ${tests.length - failed}/${tests.length} passed.`);
if (failed) process.exitCode = 1;
