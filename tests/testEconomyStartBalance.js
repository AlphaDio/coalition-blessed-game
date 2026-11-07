import assert from 'node:assert/strict';
import { GameManager } from '../src/server/gameManager.js';
import { advanceTurn } from '../src/game/turn.js';
import { initializeStarterNeedsStockpiles } from '../src/game/economyTick/ordersPhase.js';
import { getAllImprovementRequests, acceptImprovementRequest } from '../src/game/improvements/index.js';
import { clearMarket, computeEmpireFulfillment } from '../src/game/marketEconomy.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import { addPressure } from '../src/game/economyTick/backlog.js';
import { calculateScourgePrediction } from '../src/game/scourgePrediction.js';
import { getBattleChance, SCOURGE_FIRST_ATTACK_TURN } from '../src/game/turn/battleUtils.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

function newGame(seed) {
  const manager = new GameManager();
  manager.initializeNewGame(seed);
  initializeLogger({ level: LogLevel.ERROR, enableConsole: false, enableFile: false, enableUI: false });
  return manager.state;
}

function advance(state, count, inspect = () => {}) {
  for (let turn = 0; turn < count; turn++) {
    // Resolve events without applying choices, so scenarios remain comparable.
    state.activeEvent = null;
    advanceTurn(state);
    inspect(state);
  }
}

console.log('=== Test: Economy and Opening Pacing ===');

{
  const empire = { supply_state: {
    needs_demand: { biomass: 10 }, wants_demand: { biomass: 10 },
    received: { biomass: 10 }, needs_received: { biomass: 10 }, wants_received: {}
  } };
  const fulfillment = computeEmpireFulfillment(empire);
  assert.equal(fulfillment.needsFulfillment.biomass, 1);
  assert.equal(fulfillment.wantsFulfillment.biomass, 0, 'Essential supplies cannot also fill optional demand');
  const state = {};
  assert.equal(addPressure(state, 'biomass', 20, { category: 'needs' }), 20);
  assert.equal(addPressure(state, 'biomass', 20, { category: 'wants' }), 1);
}

// Sell offers must be depleted when traded, including across market ticks.
{
  const offer = { id: 'sell', commodity: 'biomass', qty: 5, filled_qty: 0, ask_price: 1, priority: 0 };
  const buy = id => ({ id, commodity: 'biomass', qty: 4, filled_qty: 0, max_price: 1, priority: 1 });
  assert.equal(clearMarket([buy('first')], [offer], { commodity: 'biomass' }).trades[0].qty, 4);
  assert.equal(offer.filled_qty, 4);
  assert.equal(clearMarket([buy('second')], [offer], { commodity: 'biomass' }).trades[0].qty, 1);
  assert.equal(offer.filled_qty, 5);
  assert.equal(clearMarket([buy('third')], [offer], { commodity: 'biomass' }).trades.length, 0);
}

{
  const state = newGame(7);
  state.turn = 150;
  const [producer] = state.empires;
  state.empires = [producer];
  state.armies = [];
  producer.production.outputs_per_tick = { biomass: 0.1 };
  producer.needs.per_pop = {};
  producer.wants.per_pop = {};
  const legacy = {
    id: 'legacy_sell', owner_type: 'empire', owner_id: producer.id, commodity: 'biomass',
    qty: 50000, filled_qty: 20, ask_price: state.market.biomass.price, duration: 1, max_duration: 1000000
  };
  state.marketOrders = { buyOrders: [], sellOffers: [legacy] };
  processEconomyTick(state);
  assert.equal(legacy.qty, 50000, 'New production never extends a legacy sell batch');
  assert.equal(legacy.filled_qty, 20);

  for (let turn = 0; turn < 20; turn++) {
    state.turn++;
    processEconomyTick(state);
  }
  const offers = state.marketOrders.sellOffers;
  assert.equal(offers.length, 6, 'Continuous production keeps only six turns of unsold supply');
  assert(!offers.some(offer => offer.id === legacy.id), 'Existing oversized offers expire even as production continues');
  assert(offers.every(offer => offer.qty > 0 && offer.qty === offers[0].qty));
  assert.equal(state.market.biomass.flow_supply_qty_turn, offers[0].qty, 'Posted supply excludes older batches');
}

for (const seed of [7, 123, 987]) {
  const state = newGame(seed);
  initializeStarterNeedsStockpiles(state);
  for (const empire of state.empires) {
    assert(Object.keys(empire.stockpiles).every(resource => resource in empire.needs.per_pop));
  }
  const initialReserves = state.empires.map(empire => ({ ...empire.stockpiles }));
  initializeStarterNeedsStockpiles(state);
  assert.deepEqual(state.empires.map(empire => empire.stockpiles), initialReserves, 'Reserves are seeded only once');

  advance(state, 60, current => {
    for (const empire of current.empires) {
      assert(empire.fulfillment_effects.needs_fulfillment >= 0.99, `${empire.name} should have essential supplies during the opening`);
      assert(empire.budget_credits > 8000, `${empire.name} should not lose its budget to order fees`);
    }
    assert.notEqual(current.activeEvent?.scope, 'PRESSURE', 'Optional demand should not cause an opening crisis');
    assert.equal(current.pendingScourgeAttack, null, 'No Scourge attack during the development window');
  });
  assert(state.empires.some((empire, index) => Object.entries(empire.stockpiles)
    .some(([resource, qty]) => qty < initialReserves[index][resource])), 'Reserves are spent when the market falls short');

  advance(state, 60);
  assert(state.empires.some(empire => empire.fulfillment_effects.needs_fulfillment < 0.9),
    'An undeveloped economy eventually faces real essential shortages');
  assert((state.economyPressure.by_type.biomass_pressure || 0) > 0,
    'Unresolved essential shortages accumulate pressure');
}

// Building production before reserves run out improves supply, but still costs
// requisition and requires sustainment from the rest of the economy.
{
  const baseline = newGame(7);
  const developed = newGame(7);
  const definitions = getAllImprovementRequests();
  for (const id of ['mycellium_grove', 'fuel_extractor']) {
    const request = { ...definitions.find(entry => entry.id === id), id: `test_${id}`, empireId: developed.empires[0].id };
    developed.improvements.requests.push(request);
    assert(acceptImprovementRequest(developed, request.id, request.empireId).success);
  }
  advance(baseline, 90);
  advance(developed, 90);
  assert(developed.improvements.queue.every(project => project.state === 'ACTIVE'), 'Early projects can be built and sustained together');
  const totalNeeds = state => state.empires.reduce((sum, empire) => sum + empire.fulfillment_effects.needs_fulfillment, 0);
  assert(totalNeeds(developed) > totalNeeds(baseline), 'Developing production improves later essential fulfillment');
  assert(developed.coalitionEconomy.requisition < baseline.coalitionEconomy.requisition, 'Construction and upkeep have a cost');
}

{
  const state = newGame(7);
  assert.equal(getBattleChance('Stable', SCOURGE_FIRST_ATTACK_TURN - 1), 0);
  assert(getBattleChance('Stable', SCOURGE_FIRST_ATTACK_TURN) > 0);
  const prediction = calculateScourgePrediction(state, () => 0.5);
  assert(prediction.estimatedTurnsToNextBattle >= SCOURGE_FIRST_ATTACK_TURN - state.turn);
}

console.log('Economy and opening pacing tests passed.');
