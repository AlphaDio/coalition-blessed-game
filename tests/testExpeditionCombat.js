import assert from 'node:assert/strict';
import { createGameState, createArmy, createEmpire } from '../src/game/types.js';
import { simulateBattleTick } from '../src/game/frontBattles.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';
import { getAvailableExpeditionArmies, startExpeditionBattle, resolveExpeditionBattle } from '../src/game/expeditions/combat.js';
import { createExpeditionsState, handleExpeditionAction, processExpeditionsTick, resolveExpeditionBattles } from '../src/game/expeditions/index.js';
import { buildScourgeDefensePlan, handleBattlePhase, resolveScourgeParticipantPlans } from '../src/game/turn/battlePhase.js';

function fixture() {
  const state = createGameState(77);
  state.empires = [createEmpire('home', 'Home', 60)];
  state.armies = [
    createArmy('strong', 'home', 'First Fleet', 70, 80, 0, 50, 50, 14000),
    createArmy('reserve', 'home', 'Reserve Fleet', 60, 70, 0, 50, 50, 8000)
  ];
  return { state, minor: { id: 'border', name: 'Border Republic', defense: 6000, status: 'INDEPENDENT', approval: 50 } };
}

function finish(state, front) {
  let rounds = 0;
  while (front.state === 'ACTIVE' && rounds++ < 1000) simulateBattleTick(front, state);
  assert.equal(front.state, 'ENDED', 'finite expedition front should resolve');
  return resolveExpeditionBattle(state, front, front.winnerSide);
}

{
  const { state, minor } = fixture();
  const scourge = state.scourgeCohesion;
  const cohesion = state.coalitionCohesion;
  const reserveBefore = structuredClone(state.armies[1]);
  const { front } = startExpeditionBattle(state, minor);
  assert(front);
  assert.deepEqual(front.participatingArmyIds, ['strong'], 'default commits only one ready army');
  assert.deepEqual(getAvailableExpeditionArmies(state).map(army => army.id), ['reserve']);
  const result = finish(state, front);
  assert.equal(result.coalitionWon, true);
  assert(state.armies[0].mp.max < 14000, 'invasions cause lasting capacity losses');
  assert(state.armies[0].mp.current < state.armies[0].mp.max, 'wounded recovery does not erase all losses');
  assert.equal(state.armies.length, 2, 'temporary forces cleaned up');
  assert.deepEqual(state.armies[1], reserveBefore, 'uncommitted army unchanged');
  assert.equal(state.scourgeCohesion, scourge);
  assert.equal(state.coalitionCohesion, cohesion);
  assert.equal(minor.status, 'INDEPENDENT', 'economy engine owns diplomatic outcomes');
  const after = JSON.stringify(state.armies);
  resolveExpeditionBattle(state, front, front.winnerSide);
  assert.equal(JSON.stringify(state.armies), after, 'losses and experience applied once');
  const cap = state.armies[0].mp.max;
  refreshArmyAggregates(state);
  assert.equal(state.armies[0].mp.max, cap, 'persistent losses survive aggregate refresh');
}

{
  const { state, minor } = fixture();
  state.pendingScourgeAttack = { participantPlans: [{ armyId: 'strong' }] };
  state.insurrections = [{ active: true, armies: ['reserve'] }];
  assert.equal(getAvailableExpeditionArmies(state).length, 0);
  const armiesBefore = JSON.stringify(state.armies);
  const refused = startExpeditionBattle(state, minor);
  assert.equal(refused.front, null);
  assert.equal(JSON.stringify(state.armies), armiesBefore, 'failed commitment does not mutate armies');
}

{
  const { state, minor } = fixture();
  assert.equal(startExpeditionBattle(state, minor, { armyIds: ['strong', 'strong'] }).front, null);
  assert.equal(startExpeditionBattle(state, minor, { armyIds: ['foreign'] }).front, null);
  assert.equal(startExpeditionBattle(state, minor, { armyIds: [] }).front, null);
  const { front } = startExpeditionBattle(state, minor, { kind: 'raid', armyIds: ['reserve'] });
  assert(front);
  assert.equal(startExpeditionBattle(state, minor).front, null, 'one active battle per minor empire');
  assert.equal(state.armies.find(army => army.id === front.rightArmyId).mp.max, 3900);
  const restored = JSON.parse(JSON.stringify(state));
  const restoredFront = restored.battleFronts.find(candidate => candidate.id === front.id);
  assert.equal(restored.armies.find(army => army.id === front.leftArmyId).isComposite, true);
  const result = finish(restored, restoredFront);
  assert.equal(result.kind, 'raid');
  assert.equal(restored.armies.length, 2);
}

{
  const { state, minor } = fixture();
  state.armies[0].mp = { current: 100, max: 100 };
  state.armies[0].manpower = 100;
  const { front } = startExpeditionBattle(state, minor, { armyIds: ['strong'] });
  assert.equal(finish(state, front).coalitionWon, false);
  assert(state.armies[0].mp.max < 100);
}

function coreFixture() {
  const { state, minor } = fixture();
  Object.assign(minor, {
    production: { commodity: 'super_alloys', amount: 24 },
    sustain: { commodity: 'biomass', amount: 8 },
    interest: { id: 'industry', name: 'Industry', commodity: 'super_alloys', description: 'Values local development.' },
    interestRevealed: true, developmentLevel: 0,
    occupationTurns: 0, occupationUnrest: 0, war: null,
    supplyState: { fulfillment: 1 }, nextRaidTurn: 0, raidWarningTurns: null
  });
  state.expeditions = createExpeditionsState();
  state.expeditions.empires.push(minor);
  state.stockpiles = { super_alloys: 10000, biomass: 10000, plasma_fuel: 10000 };
  state.coalitionEconomy.requisition = 10000;
  return { state, minor };
}

{
  const { state, minor } = coreFixture();
  const action = handleExpeditionAction(state, { action: 'invade', targetId: minor.id });
  assert.equal(action.success, true);
  const front = state.battleFronts.find(candidate => candidate.id === minor.war.frontId);
  assert.equal(front.expeditionKind, 'conquest');
  for (let rounds = 0; front.state === 'ACTIVE' && rounds < 1000; rounds++) simulateBattleTick(front, state);
  assert.equal(front.state, 'ENDED');
  assert(!getAvailableExpeditionArmies(state).some(army => army.id === 'strong'), 'ended front retains troops until casualties resolve');
  assert.equal(startExpeditionBattle(state, minor, { armyIds: ['reserve'] }).front, null, 'one unresolved battle per minor');
  resolveExpeditionBattles(state);
  assert.equal(minor.status, 'CONQUERED');
  assert.equal(minor.war, null);
  assert.equal(minor.occupationTurns, 15);
  const beforeUpkeep = state.coalitionEconomy.requisition;
  processExpeditionsTick(state);
  assert.equal(minor.occupationTurns, 14);
  assert.equal(minor.upkeepPaid, true);
  assert(state.coalitionEconomy.requisition < beforeUpkeep);
  assert.equal(state.armies.length, 2);

  // Conquest remains costly after the initial occupation timer completes.
  for (let turns = 0; minor.occupationTurns > 0 && turns < 20; turns++) {
    state.turn++;
    processExpeditionsTick(state);
  }
  const stableUpkeep = state.coalitionEconomy.requisition;
  state.turn++;
  processExpeditionsTick(state);
  assert.equal(minor.status, 'CONQUERED');
  assert.equal(state.coalitionEconomy.requisition, stableUpkeep - minor.upkeep.requisition + minor.tributeIncome,
    'stable conquests pay garrison upkeep and earn supplied tribute');
  assert(minor.tributeIncome > minor.upkeep.requisition, 'a supplied stable conquest offers a limited positive return');
  state.stockpiles.plasma_fuel = 0;
  for (let turns = 0; turns < state.expeditions.occupationUnrestLimit; turns++) {
    state.turn++;
    processExpeditionsTick(state);
  }
  assert.equal(minor.status, 'HOSTILE', 'a sustained lapse in garrison upkeep leads to secession');
  assert.equal(minor.exportMultiplier, 0);
}

{
  const { state, minor } = coreFixture();
  minor.status = 'HOSTILE';
  minor.approval = 10;
  processExpeditionsTick(state);
  assert.equal(minor.raidWarningTurns, 4);
  for (let turns = 0; !minor.war && turns < 4; turns++) {
    state.turn++;
    processExpeditionsTick(state);
  }
  assert.equal(minor.war?.kind, 'raid', 'warning becomes a real raid front');
  const front = state.battleFronts.find(candidate => candidate.id === minor.war.frontId);
  for (let rounds = 0; front.state === 'ACTIVE' && rounds < 1000; rounds++) simulateBattleTick(front, state);
  resolveExpeditionBattles(state);
  assert.equal(minor.status, 'INDEPENDENT');
  assert.equal(minor.war, null);
  assert(minor.nextRaidTurn >= state.turn + 20);
  assert.equal(state.armies.length, 2);
}

{
  const { state, minor } = coreFixture();
  state.armies.forEach(army => { army.organization = 0; });
  minor.status = 'HOSTILE';
  minor.approval = 10;
  const before = state.coalitionEconomy.requisition;
  for (let turns = 0; turns < 5; turns++) {
    processExpeditionsTick(state);
    state.turn++;
  }
  assert.equal(minor.war, null);
  assert.equal(state.battleFronts?.length || 0, 0);
  assert.equal(state.coalitionEconomy.requisition, before - 80, 'undefended raids raid supplies without phantom troops');
}

{
  const { state, minor } = coreFixture();
  assert.equal(handleExpeditionAction(state, { action: 'invade', targetId: minor.id }).success, true);
  const { participantPlans } = buildScourgeDefensePlan(state, 'home');
  assert.deepEqual(participantPlans.map(plan => plan.armyId), ['reserve'], 'Scourge defense cannot double-book expedition troops');
  assert.deepEqual(resolveScourgeParticipantPlans(state, [{ armyId: 'strong', commitRatio: 1 }]), []);
  const logger = { info() {}, debug() {}, warn() {}, error() {} };
  for (let rounds = 0; minor.war && rounds < 1000; rounds++) {
    handleBattlePhase(state, () => 1, [], logger);
    state.turn++;
  }
  assert.equal(minor.status, 'CONQUERED', 'ordinary battle phase immediately applies the expedition result');
  assert.equal(minor.war, null);
  assert.equal(state.armies.length, 2);
  assert(state.armies[0].mp.max < 14000);
}

console.log('Expedition combat tests passed.');
