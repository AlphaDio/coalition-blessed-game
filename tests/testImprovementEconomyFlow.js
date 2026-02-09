#!/usr/bin/env node

/**
 * Regression tests for improvement-market economy flow.
 * Focuses on order persistence and aggregation boundaries.
 */

import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { createOrderAggregator } from '../src/game/economyTick/orders.js';
import { applyOrderDurations, clearMarkets, saveMarketOrders } from '../src/game/economyTick/ordersLifecycle.js';
import { processEmpireStockpileConsumption } from '../src/game/turn/economyPhase.js';
import { canActivateEmergencyLaw, activateEmergencyLaw, tickEmergencyLaws } from '../src/game/emergencyLaws.js';
import { replenishArmyManpower } from '../src/game/turn/armyPhase.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import { processImprovementsTick, processImprovementSustainmentPostMarket } from '../src/game/improvements/index.js';
import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../src/game/improvements/types.js';
import { clearMarket } from '../src/game/marketEconomy.js';
import { createArmy, createEmpire } from '../src/game/types.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${message}`);
  } else {
    testsFailed++;
    console.log(`[FAIL] ${message}`);
  }
}

console.log('============================================================');
console.log('Improvement Economy Flow Regression Tests');
console.log('============================================================\n');

console.log('=== Test 1: Untouched Orders Persist Across Ticks ===');
{
  const persistedBuy = {
    id: 'persist_buy_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 12,
    filled_qty: 0,
    max_price: 1.2,
    category: 'needs',
    duration: 0,
    max_duration: 6
  };
  const persistedSell = {
    id: 'persist_sell_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 9,
    filled_qty: 0,
    ask_price: 0.9,
    duration: 0,
    max_duration: 6,
    tags: { purpose: 'production', originator: 'imp_1' }
  };

  const state = {
    marketOrders: {
      buyOrders: [persistedBuy],
      sellOffers: [persistedSell]
    },
    empires: [{ id: 'empire_1', stockpiles: {}, budget_credits: 1000 }],
    armies: []
  };

  const { validBuyOrders, validSellOffers } = applyOrderDurations(state, [], []);
  saveMarketOrders(state, new Set(), validBuyOrders, validSellOffers, [], []);

  assert(state.marketOrders.buyOrders.some(o => o.id === 'persist_buy_1'), 'Existing buy order is persisted');
  assert(state.marketOrders.sellOffers.some(o => o.id === 'persist_sell_1'), 'Existing sell order is persisted');
}
console.log();

console.log('=== Test 2: Generic Needs Do Not Merge Into Sustainment Orders ===');
{
  const sustainmentOrder = {
    id: 'sustain_buy_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 20,
    filled_qty: 0,
    max_price: 1.0,
    category: 'needs',
    duration: 0,
    max_duration: 6,
    tags: { purpose: 'improvement_sustainment_pool', payer: 'empire_1' }
  };
  const state = {
    marketOrders: { buyOrders: [sustainmentOrder], sellOffers: [] }
  };

  const { aggregateBuyOrder, buyOrders } = createOrderAggregator(state);
  const genericNeedsOrder = aggregateBuyOrder('empire', 'empire_1', 'biomass', 5, 1.1, 'needs', 1);

  assert(genericNeedsOrder.id !== 'sustain_buy_1', 'Generic needs order is separate from pooled sustainment order');
  assert(sustainmentOrder.qty === 20, 'Pooled sustainment order quantity is unchanged');
  assert(buyOrders.length === 1, 'Only one new generic buy order created this tick');
}
console.log();

console.log('=== Test 3: Improvement Production Merges Into Empire Sell Accumulation ===');
{
  const improvementSell = {
    id: 'prod_sell_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'super_alloys',
    qty: 30,
    filled_qty: 0,
    ask_price: 2.0,
    duration: 0,
    max_duration: 1000000
  };
  const state = {
    marketOrders: { buyOrders: [], sellOffers: [improvementSell] }
  };

  const { aggregateSellOffer, sellOffers } = createOrderAggregator(state);
  const genericSell = aggregateSellOffer('empire', 'empire_1', 'super_alloys', 7, 2.1, 0);

  assert(genericSell.id === 'prod_sell_1', 'Improvement and generic production share one sell order');
  assert(improvementSell.qty === 37, 'Sell accumulation quantity is increased on the existing order');
  assert(sellOffers.length === 1, 'No duplicate sell order created for same empire+commodity');
}
console.log();

console.log('=== Test 4: Consumption Upgrade Retires Sell Accumulation ===');
{
  const state = {
    coalitionConstruction: 4,
    coalitionModifiers: {},
    armies: [],
    empires: [
      {
        id: 'empire_1',
        name: 'Empire One',
        stats: { population: 1000, approvalBonus: 0 },
        consumptionRules: [
          {
            commodity: 'biomass',
            threshold: 100,
            effect: { type: 'coalition_construction_bonus', amount: 2 }
          }
        ]
      }
    ],
    marketOrders: {
      buyOrders: [],
      sellOffers: [
        {
          id: 'sell_consume_1',
          owner_type: 'empire',
          owner_id: 'empire_1',
          commodity: 'biomass',
          qty: 120,
          filled_qty: 10,
          ask_price: 1.0,
          duration: 0,
          max_duration: 1000000
        }
      ]
    }
  };

  const log = [];
  processEmpireStockpileConsumption(state, log);

  const order = state.marketOrders.sellOffers[0];
  const remaining = order.qty - order.filled_qty;
  assert(remaining === 0, 'Consumption retires outstanding sell accumulation for triggering commodity');
  assert(state.coalitionConstruction === 6, 'Consumption effect applied from retired sell accumulation');
}
console.log();

console.log('=== Test 5: Emergency Laws Consume Market Reserves (No Coalition Stockpiles) ===');
{
  const state = {
    turn: 1,
    coalitionEconomy: { requisition: 500 },
    marketOrders: {
      buyOrders: [],
      sellOffers: [
        {
          id: 'reserve_alloys',
          owner_type: 'empire',
          owner_id: 'empire_1',
          commodity: 'super_alloys',
          qty: 80,
          filled_qty: 0,
          ask_price: 2
        },
        {
          id: 'reserve_biomass',
          owner_type: 'empire',
          owner_id: 'empire_1',
          commodity: 'biomass',
          qty: 60,
          filled_qty: 0,
          ask_price: 1
        }
      ]
    },
    activeEmergencyLaws: [],
    emergencyLawCooldowns: {}
  };

  const canActivate = canActivateEmergencyLaw('emergency_total_mobilization', state);
  assert(canActivate.canActivate, 'Emergency law checks market reserves for commodity costs');

  activateEmergencyLaw('emergency_total_mobilization', state);
  tickEmergencyLaws(state);

  const alloysOrder = state.marketOrders.sellOffers.find(order => order.id === 'reserve_alloys');
  const biomassOrder = state.marketOrders.sellOffers.find(order => order.id === 'reserve_biomass');
  assert((alloysOrder.qty - alloysOrder.filled_qty) === 30, 'Emergency law drains super_alloys from sell-order reserves');
  assert((biomassOrder.qty - biomassOrder.filled_qty) === 30, 'Emergency law drains biomass from sell-order reserves');
}
console.log();

console.log('=== Test 6: Army Growth Uses Needs/Wants Fulfillment ===');
{
  const state = {
    empires: [createEmpire('empire_1', 'Empire One', 50, {}, {}, { population: 20000 })],
    armies: [],
    battleFronts: []
  };

  const highSupplyArmy = createArmy('army_high', 'empire_1', 'High Supply Army', 50, 60, 0, 50, 50, 10000);
  highSupplyArmy.mp.current = 5000;
  highSupplyArmy.demands.needs = { biomass: 0.01 };
  highSupplyArmy.demands.wants = { rare_gases: 0.005 };
  highSupplyArmy.supply_state = {
    needs_fulfillment: { biomass: 1 },
    wants_fulfillment: { rare_gases: 1 },
    shortages: {},
    received: {}
  };

  const lowSupplyArmy = createArmy('army_low', 'empire_1', 'Low Supply Army', 50, 60, 0, 50, 50, 10000);
  lowSupplyArmy.mp.current = 5000;
  lowSupplyArmy.demands.needs = { biomass: 0.01 };
  lowSupplyArmy.demands.wants = { rare_gases: 0.005 };
  lowSupplyArmy.supply_state = {
    needs_fulfillment: { biomass: 0.1 },
    wants_fulfillment: { rare_gases: 0.1 },
    shortages: {},
    received: {}
  };

  state.armies.push(highSupplyArmy, lowSupplyArmy);
  replenishArmyManpower(state, []);

  const highGain = highSupplyArmy.mp.current - 5000;
  const lowGain = lowSupplyArmy.mp.current - 5000;

  assert(highGain > lowGain, 'Higher fulfillment yields faster manpower replenishment');
  assert(highSupplyArmy.mp.max > 10000, 'High fulfillment grows army MP capacity over time');
  assert(lowSupplyArmy.mp.max === 10000, 'Low fulfillment does not grow army MP capacity');
}
console.log();

console.log('=== Test 7: Same-Turn Market Fill Prevents Sustainment Degradation ===');
{
  const state = {
    turn: 25,
    coalitionModifiers: {
      rationing_add: 0,
      rationing_mult: 1.0,
      supply_efficiency: 0
    },
    coalitionEconomy: { requisition: 500 },
    market: {
      biomass: {
        commodity: 'biomass',
        price: 1.0,
        last_price: 1.0,
        floor_price: 1.0,
        demand_qty: 0,
        supply_qty: 0,
        buy_orders: [],
        sell_offers: []
      }
    },
    marketOrders: {
      buyOrders: [],
      sellOffers: [
        {
          id: 'reserve_sell_1',
          owner_type: 'empire',
          owner_id: 'empire_2',
          commodity: 'biomass',
          qty: 1500,
          filled_qty: 0,
          ask_price: 1.0,
          duration: 0,
          max_duration: 1000000
        }
      ]
    },
    empires: [
      createEmpire('empire_1', 'Empire One', 50, {}, {}, { population: 1000, budget_credits: 10000 }),
      createEmpire('empire_2', 'Empire Two', 50, {}, {}, { population: 1000, budget_credits: 10000 })
    ],
    armies: [],
    improvements: {
      queue: [
        {
          id: 'imp_1',
          empireId: 'empire_1',
          name: 'Sustainment Test Relay',
          state: 'ACTIVE',
          completedAtTick: null,
          ticksSinceSustained: IMPROVEMENT_SUSTAINMENT_TICKS - 1,
          sustainmentCost: { biomass: 10 },
          productionOutputs: {},
          productionBank: {},
          productionBankThreshold: 10,
          requisitionUpkeep: 0
        }
      ],
      requests: [],
      completed: [],
      maxTotalCapacity: 20,
      currentCapacity: 0
    }
  };

  processImprovementsTick(state);
  processEconomyTick(state);
  processImprovementSustainmentPostMarket(state);

  const improvement = state.improvements.queue[0];
  assert(improvement.state === 'ACTIVE', 'Improvement remains ACTIVE when pooled sustainment fills in same turn');
  assert(improvement.ticksSinceSustained === 0, 'Successful same-turn sustainment fill resets unsustained tick counter');
}
console.log();

console.log('=== Test 8: Market Matching Does Not Overfill Buys Across Multiple Sells ===');
{
  const marketState = {
    commodity: 'biomass',
    price: 1,
    last_price: 1,
    floor_price: 1,
    demand_qty: 0,
    supply_qty: 0,
    traded_qty: 0
  };

  const buyOrders = [{
    id: 'buy_limit_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    max_price: 2.0,
    priority: 0
  }];

  const sellOffers = [
    {
      id: 'sell_a',
      owner_type: 'empire',
      owner_id: 'empire_2',
      commodity: 'biomass',
      qty: 6,
      filled_qty: 0,
      ask_price: 1.0,
      priority: 0
    },
    {
      id: 'sell_b',
      owner_type: 'empire',
      owner_id: 'empire_3',
      commodity: 'biomass',
      qty: 8,
      filled_qty: 0,
      ask_price: 1.2,
      priority: 0
    }
  ];

  const result = clearMarket(buyOrders, sellOffers, marketState);
  const tradedQty = result.trades.reduce((sum, trade) => sum + trade.qty, 0);
  const remainingSell = result.unfilledSells.reduce((sum, offer) => sum + (offer.remaining || 0), 0);

  assert(tradedQty === 10, 'Trade quantity is capped at buy demand');
  assert(buyOrders[0].filled_qty === 10, 'Buy order filled quantity never exceeds requested quantity');
  assert(remainingSell === 4, 'Unfilled sell quantity reflects only true residual supply');
}
console.log();

console.log('=== Test 9: Post-Clear Buy Backlog Snapshots Are Stored ===');
{
  const state = {
    empires: [
      { id: 'empire_1', budget_credits: 1000 },
      { id: 'empire_2', budget_credits: 1000 }
    ],
    armies: [],
    market: {
      biomass: {
        commodity: 'biomass',
        price: 1.0,
        last_price: 1.0,
        floor_price: 1.0,
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
    }
  };

  const buyOrders = [{
    id: 'buy_backlog_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 15,
    filled_qty: 0,
    max_price: 1.0,
    priority: 0,
    category: 'needs'
  }];

  const sellOffers = [];
  clearMarkets(state, [{ key: 'biomass' }], buyOrders, sellOffers);

  assert(state.market.biomass.remaining_buy_offers_post_clear.length === 1, 'Per-commodity market state stores unfilled buy orders');
  assert(state.market.remaining_buy_offers_post_clear.length === 1, 'Root market state stores aggregated unfilled buy orders');
  assert(state.market.buy_backlog_by_commodity.biomass === 15, 'Commodity backlog summary tracks residual demand');
  assert(state.market.buy_backlog_by_commodity_and_owner.biomass.empire_1 === 15, 'Commodity-owner backlog summary tracks residual demand');
}
console.log();

console.log('=== Test 10: Buy Backlog Orders Persist Despite max_duration ===');
{
  const persistentBuy = {
    id: 'buy_persistent_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 20,
    filled_qty: 0,
    max_price: 1.0,
    category: 'needs',
    duration: 5,
    max_duration: 3
  };
  const state = {
    marketOrders: {
      buyOrders: [persistentBuy],
      sellOffers: []
    }
  };

  const { validBuyOrders, expiredBuyOrders } = applyOrderDurations(state, [], []);
  assert(validBuyOrders.some(order => order.id === 'buy_persistent_1'), 'Persistent buy backlog remains valid even when max_duration is exceeded');
  assert(expiredBuyOrders.length === 0, 'No buy backlog orders are expired by duration');
}
console.log();

console.log('============================================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('============================================================');

if (testsFailed > 0) {
  process.exit(1);
}

console.log('[PASS] ALL TESTS PASSED');
