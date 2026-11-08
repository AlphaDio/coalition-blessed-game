import assert from 'node:assert/strict';
import { createEmpire, createGameState } from '../src/game/types.js';
import { initializeMarket } from '../src/game/marketEconomy.js';
import { loadResources } from '../src/game/economyTick/resources.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import { clearMarkets } from '../src/game/economyTick/ordersLifecycle.js';
import {
  prepareMinorEconomy,
  emitMinorEconomyOrders,
  applyMinorEconomyPostMarket
} from '../src/game/expeditions/economy.js';
import { createOrderAggregator } from '../src/game/economyTick/orders.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { initializeTurnConsumptionTracking, getEmpireTurnConsumptionByCommodity } from '../src/game/consumptionToRequisition.js';

initializeLogger({ level: LogLevel.ERROR, enableConsole: false, enableFile: false, enableUI: false });
const resources = loadResources().commodities;

function makeState(options = {}) {
  const state = createGameState(42);
  state.empires = [createEmpire('seller', 'Supplier', 50, {}, {}, { budget_credits: 0 })];
  state.armies = [];
  state.market = initializeMarket(resources, () => 0.5);
  for (const resource of resources) state.market[resource.key].price = 1;
  state.marketOrders = { buyOrders: [], sellOffers: [] };
  state.expeditions = {
    empires: [{
      id: 'minor_test', name: 'Test Power', budget_credits: 100,
      production: { commodity: 'super_alloys', amount: 10 },
      sustain: { commodity: 'biomass', amount: 10 },
      approval: 50, status: 'INDEPENDENT', war: null,
      exportMultiplier: 1, supplyState: { fulfillment: 1 }, ...options
    }]
  };
  return state;
}

function sellOffer(commodity, qty, owner = 'seller') {
  return { id: `sell_${commodity}_${owner}`, owner_type: 'empire', owner_id: owner,
    commodity, qty, filled_qty: 0, ask_price: 1, priority: 0, fee: 0,
    duration: 0, max_duration: 6 };
}

function tick(state) {
  initializeTurnConsumptionTracking();
  processEconomyTick(state);
  state.turn++;
}

{
  const state = makeState({ budget_credits: 5 });
  state.marketOrders.sellOffers.push(sellOffer('biomass', 100));
  const treasury = state.coalitionEconomy.treasury_credits;
  tick(state);
  const minor = state.expeditions.empires[0];
  assert.equal(minor.budget_credits, 0, 'Minor purchases stop at its own budget');
  assert.equal(state.empires[0].budget_credits, 4.75, 'Supplier receives payment less the 5% tax at 50 Approval');
  assert.equal(state.marketTaxLastTick, 0.25, 'Market tax is tracked as retired Credits');
  assert.equal(minor.supplyState.received, 5, 'Only affordable sustainment is received');
  assert.equal(minor.supplyState.fulfillment, 0.5);
  assert.equal(minor.approval, 49.625, 'Shortages affect the minor approval');
  assert.equal(state.coalitionEconomy.treasury_credits, treasury, 'Minor spending cannot draw on Coalition treasury');
  assert.deepEqual(getEmpireTurnConsumptionByCommodity(minor.id), {}, 'Minor trade does not create Coalition consumption requisition');
}

for (const approval of [0, 50, 100]) {
  const state = makeState({ approval, exportMultiplier: 1.5, supplyState: { fulfillment: 0.5 } });
  prepareMinorEconomy(state);
  const aggregator = createOrderAggregator(state);
  emitMinorEconomyOrders(state, aggregator);
  const output = aggregator.sellOffers.find(order => order.owner_type === 'minor');
  assert.equal(output.qty, 7.5, 'Output uses prior sustainment and export development multipliers');
  const buyer = state.empires[0];
  buyer.budget_credits = 100;
  const buys = [{ id: 'buy_export', owner_type: 'empire', owner_id: buyer.id,
    commodity: 'super_alloys', qty: 10, filled_qty: 0, max_price: 1,
    priority: 0, category: 'needs', fee: 0 }];
  const trades = clearMarkets(state, resources, buys, aggregator.sellOffers);
  assert.equal(trades.reduce((sum, trade) => sum + trade.qty, 0), 7.5);
  assert.equal(buyer.budget_credits, 92.5, 'Coalition buyer pays for minor exports');
  const expectedTax = 7.5 * approval / 1000;
  assert.equal(state.marketTaxLastTick, expectedTax);
  assert.equal(state.expeditions.empires[0].budget_credits, 107.5 - expectedTax, 'Minor exports pay tax based on seller Approval');
}

{
  const state = makeState();
  for (let i = 0; i < 4; i++) {
    tick(state);
    const orders = state.marketOrders.buyOrders.filter(order => order.owner_type === 'minor');
    assert.equal(orders.length, 1, 'One current sustain requirement remains after each tick');
    assert.equal(orders[0].qty, 10, 'Unmet sustainment does not accumulate duplicate demand');
  }
  assert.equal(state.economyPressure.total, 0, 'Minor shortages do not create Coalition pressure events');
  assert.equal(state.expeditions.empires[0].supplyState.fulfillment, 0);
  assert.equal(state.expeditions.empires[0].supplyState.output, 2.5, 'Unsustained production has a 25% floor');
}

for (const blockedState of [{ status: 'HOSTILE' }, { war: { frontId: 'war_1' } }]) {
  const state = makeState(blockedState);
  state.marketOrders.sellOffers.push({ ...sellOffer('super_alloys', 999), owner_type: 'minor', owner_id: 'minor_test' });
  state.marketOrders.buyOrders.push({ id: 'old_minor_buy', owner_type: 'minor', owner_id: 'minor_test',
    commodity: 'biomass', qty: 999, filled_qty: 0, max_price: 1, category: 'needs', duration: 0 });
  tick(state);
  assert(!state.marketOrders.buyOrders.some(order => order.owner_type === 'minor'), 'War/hostility cancels old sustain orders');
  assert(!state.marketOrders.sellOffers.some(order => order.owner_type === 'minor'), 'War/hostility cancels old exports');
  assert.equal(state.expeditions.empires[0].budget_credits, 100, 'Embargoed powers cannot buy or sell');
}

{
  const state = makeState({ budget_credits: 0 });
  state.marketOrders.sellOffers.push(sellOffer('biomass', 100));
  tick(state);
  assert.equal(state.expeditions.empires[0].supplyState.received, 0, 'Broke powers cannot receive free upkeep');
  assert.equal(state.expeditions.empires[0].budget_credits, 0);
  assert.equal(state.empires[0].budget_credits, 0);
}

{
  const state = makeState({ sustain: { commodity: 'biomass', amount: 0 }, approval: 99.95 });
  prepareMinorEconomy(state);
  applyMinorEconomyPostMarket(state);
  assert.equal(state.expeditions.empires[0].supplyState.fulfillment, 1, 'Zero demand is fully sustained');
  assert.equal(state.expeditions.empires[0].approval, 100, 'Approval stays within bounds');
}

console.log('Expedition economy tests passed');
