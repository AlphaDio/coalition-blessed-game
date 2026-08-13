import assert from 'node:assert/strict';
import { createEmpire } from '../src/game/types.js';
import {
  applyOrderDurations,
  clearMarkets,
  enforceEmpireBudgetConstraints
} from '../src/game/economyTick/ordersLifecycle.js';

function createMarketState(commodity, price) {
  return {
    [commodity]: {
      commodity,
      price,
      last_price: price,
      floor_price: price,
      demand_qty: 0,
      supply_qty: 0,
      traded_qty: 0,
      remaining_sell_offers_post_clear: [],
      remaining_buy_offers_post_clear: []
    },
    remaining_sell_offers_post_clear: [],
    remaining_buy_offers_post_clear: [],
    buy_backlog_by_commodity: {},
    buy_backlog_by_commodity_and_owner: {}
  };
}

function createState(budget, treasury = 10000) {
  return {
    empires: [{
      id: 'empire_1',
      budget_credits: budget,
      economy_spend: { needs: 0, wants: 0, order_fees: 0 }
    }],
    armies: [],
    coalitionEconomy: {
      requisition: 1000,
      treasury_credits: treasury
    },
    market: createMarketState('biomass', 1),
    marketOrders: { buyOrders: [], sellOffers: [] }
  };
}

function buyOrder(id, category, priority, qty = 10, maxPrice = 1) {
  return {
    id,
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty,
    filled_qty: 0,
    max_price: maxPrice,
    priority,
    category,
    fee: 0
  };
}

function sellOffer(id, qty = 100, askPrice = 1) {
  return {
    id,
    owner_type: 'unknown',
    owner_id: 'supplier',
    commodity: 'biomass',
    qty,
    filled_qty: 0,
    ask_price: askPrice,
    priority: 0,
    fee: 0
  };
}

console.log('=== Test: Empire Budget Constraints ===');

{
  const state = createState(5, 100000);
  const buys = [buyOrder('needs', 'needs', 1), buyOrder('wants', 'wants', 0)];
  const sells = [sellOffer('supply')];
  const result = enforceEmpireBudgetConstraints(state, buys, sells);

  assert.equal(result.validBuyOrders.length, 2, 'Affordable order fees do not remove valid orders');
  assert.equal(result.validBuyOrders[0].qty, 5, 'Higher-priority needs receive the remaining budget commitment');
  assert.equal(result.validBuyOrders[1].qty, 0, 'Lower-priority wants are capped after the budget is reserved');
  assert.equal(state.coalitionEconomy.treasury_credits, 100000, 'Coalition treasury is not used as an empire budget fallback');
}

{
  const state = createState(5);
  const buys = [buyOrder('buy', 'needs', 1, 10, 1)];
  const trades = clearMarkets(state, [{ key: 'biomass' }], buys, [sellOffer('supply')]);

  assert.equal(trades.length, 1, 'An affordable partial order still clears');
  assert.equal(trades[0].qty, 5, 'Trade quantity is capped by the available budget');
  assert.equal(state.empires[0].budget_credits, 0, 'Budget reaches zero but never becomes negative');
}

{
  const state = createState(0, 100000);
  const persistentOrder = buyOrder('persistent', 'needs', 1, 10, 1);
  persistentOrder.fee = 1;
  state.marketOrders.buyOrders.push(persistentOrder);
  const durationResult = applyOrderDurations(state, [], []);
  const trades = clearMarkets(
    state,
    [{ key: 'biomass' }],
    durationResult.validBuyOrders,
    [sellOffer('supply')]
  );

  assert.equal(trades.length, 0, 'Persistent backlog cannot fill after the empire reaches zero budget');
  assert.equal(state.empires[0].budget_credits, 0, 'Zero-budget empire remains solvent');
  assert.equal(state.economyBudgetBlockedLastTick[0].reason, 'order_fee', 'Blocked persistent order records the affordability reason');
}

{
  const zeroBudgetEmpire = createEmpire('zero', 'Zero Budget', 50, {}, {}, { budget_credits: 0 });
  assert.equal(zeroBudgetEmpire.budget_credits, 0, 'Empire initializer preserves an explicit zero budget');

  const state = createState(-25);
  enforceEmpireBudgetConstraints(state, [], []);
  assert.equal(state.empires[0].budget_credits, 0, 'Legacy negative budgets are normalized at the economy boundary');
}

console.log('Passed: 12');
