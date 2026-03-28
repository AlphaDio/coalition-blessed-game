#!/usr/bin/env node

/**
 * Regression tests for improvement-market economy flow.
 * Focuses on order persistence and aggregation boundaries.
 */

import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { createOrderAggregator } from '../src/game/economyTick/orders.js';
import { emitArmyOrders } from '../src/game/economyTick/ordersPhase.js';
import { applyOrderDurations, clearMarkets, saveMarketOrders } from '../src/game/economyTick/ordersLifecycle.js';
import { processEmpireStockpileConsumption } from '../src/game/turn/economyPhase.js';
import { canActivateEmergencyLaw, activateEmergencyLaw, tickEmergencyLaws } from '../src/game/emergencyLaws.js';
import { replenishArmyManpower } from '../src/game/turn/armyPhase.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import { processImprovementsTick, processImprovementSustainmentPostMarket } from '../src/game/improvements/index.js';
import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../src/game/improvements/types.js';
import { getEffectiveArmyFervor } from '../src/game/armyBattlePrep.js';
import { clearMarket, initializeMarket } from '../src/game/marketEconomy.js';
import { initializeTurnConsumptionTracking, recordConsumption } from '../src/game/consumptionToRequisition.js';
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

console.log('=== Test 4: Consumption Effects Use Persistent Commodity Pools ===');
{
  initializeTurnConsumptionTracking();

  const state = {
    coalitionConstruction: 4,
    coalitionModifiers: {},
    consumptionEffectPools: {
      empire_1: {
        biomass: 90
      }
    },
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
    ]
  };

  recordConsumption('biomass', 250, 'empire_1', 'empire_needs');
  const log = [];
  processEmpireStockpileConsumption(state, log);

  const remainingPool = state.consumptionEffectPools?.empire_1?.biomass || 0;
  assert(state.coalitionConstruction === 10, 'Consumption pool applies multiple threshold hits in one turn');
  assert(remainingPool === 40, 'Consumption pool keeps carryover remainder after threshold hits');
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
  assert(highSupplyArmy.mp.max === 10000, 'Fulfillment alone does not grow army MP capacity without consumed supply thresholds');
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

console.log('=== Test 11: Fractional Sustainment Values Create Non-Zero Demand ===');
{
  const state = {
    turn: 10,
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
    marketOrders: { buyOrders: [], sellOffers: [] },
    empires: [
      createEmpire('empire_1', 'Empire One', 50, {}, {}, { population: 1000, budget_credits: 10000 })
    ],
    armies: [],
    improvements: {
      queue: [
        {
          id: 'imp_fractional_sustain',
          empireId: 'empire_1',
          name: 'Fractional Sustain Test',
          state: 'ACTIVE',
          completedAtTick: null,
          ticksSinceSustained: 0,
          sustainmentCost: { biomass: 0.01 },
          productionOutputs: {},
          productionBank: {},
          productionBankThreshold: 1,
          requisitionUpkeep: 0,
          modifiers: {}
        }
      ],
      requests: [],
      completed: [],
      maxTotalCapacity: 20,
      currentCapacity: 0
    }
  };

  processImprovementsTick(state);
  const pooledOrder = state.marketOrders.buyOrders.find(order => order.tags?.purpose === 'improvement_sustainment_pool');
  assert(Boolean(pooledOrder), 'Fractional sustainment creates a pooled buy order');
  assert((pooledOrder?.qty || 0) > 0, 'Fractional sustainment demand is non-zero');
  assert((pooledOrder?.qty || 0) < 1, 'Fractional sustainment demand remains tame');
}
console.log();

console.log('=== Test 12: Fractional Production Outputs Accumulate Without Flooring To Zero ===');
{
  const state = {
    coalitionModifiers: {
      production_efficiency_add: 0,
      production_efficiency_mult: 1.0,
      rationing_add: 0,
      rationing_mult: 1.0,
      supply_efficiency: 0
    },
    market: {
      super_alloys: {
        commodity: 'super_alloys',
        price: 1.0,
        floor_price: 1.0
      }
    },
    marketOrders: { buyOrders: [], sellOffers: [] },
    empires: [createEmpire('empire_1', 'Empire One', 50, {}, {}, { population: 1000, budget_credits: 10000 })],
    improvements: {
      queue: [
        {
          id: 'imp_fractional_prod',
          empireId: 'empire_1',
          name: 'Fractional Production Test',
          state: 'ACTIVE',
          completedAtTick: null,
          ticksSinceSustained: 0,
          sustainmentCost: {},
          productionOutputs: { super_alloys: 0.0001 },
          productionBank: {},
          productionBankThreshold: 1,
          requisitionUpkeep: 0,
          modifiers: {}
        }
      ],
      requests: [],
      completed: [],
      maxTotalCapacity: 20,
      currentCapacity: 0
    },
    armies: []
  };

  processImprovementsTick(state);
  processImprovementsTick(state);

  const sellOrder = state.marketOrders.sellOffers.find(order => order.commodity === 'super_alloys');
  assert(Boolean(sellOrder), 'Fractional production eventually creates a market sell order');
  assert((sellOrder?.qty || 0) > 0, 'Fractional production order quantity is non-zero');
  assert((sellOrder?.qty || 0) < 1, 'Fractional production release remains in fractional range');
}
console.log();

console.log('=== Test 13: Positive Relations Discount Bilateral Trade Settlement ===');
{
  const state = {
    diplomacy: {
      relations: {
        empire_1: { empire_2: 100 },
        empire_2: { empire_1: 100 }
      }
    },
    empires: [
      { id: 'empire_1', budget_credits: 1000, economy_spend: { needs: 0, wants: 0, order_fees: 0 } },
      { id: 'empire_2', budget_credits: 1000, economy_spend: { needs: 0, wants: 0, order_fees: 0 } }
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
    id: 'buy_rel_good_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    max_price: 20,
    priority: 0,
    category: 'needs'
  }];
  const sellOffers = [{
    id: 'sell_rel_good_1',
    owner_type: 'empire',
    owner_id: 'empire_2',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    ask_price: 10,
    priority: 0
  }];

  const trades = clearMarkets(state, [{ key: 'biomass' }], buyOrders, sellOffers);
  const expectedPrice = 7; // 30% discount at +100 relation

  assert(trades.length === 1, 'Market clears one bilateral trade under positive relation');
  assert(Math.abs(trades[0].price - expectedPrice) < 1e-9, 'Positive relation applies discounted trade price');
  assert(Math.abs(state.empires[0].budget_credits - 930) < 1e-9, 'Buyer pays discounted bilateral trade cost');
  assert(Math.abs(state.empires[1].budget_credits - 1070) < 1e-9, 'Seller receives discounted bilateral trade revenue');
}
console.log();

console.log('=== Test 14: Negative Relations Increase Bilateral Trade Settlement ===');
{
  const state = {
    diplomacy: {
      relations: {
        empire_1: { empire_2: -100 },
        empire_2: { empire_1: -100 }
      }
    },
    empires: [
      { id: 'empire_1', budget_credits: 1000, economy_spend: { needs: 0, wants: 0, order_fees: 0 } },
      { id: 'empire_2', budget_credits: 1000, economy_spend: { needs: 0, wants: 0, order_fees: 0 } }
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
    id: 'buy_rel_bad_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    max_price: 20,
    priority: 0,
    category: 'needs'
  }];
  const sellOffers = [{
    id: 'sell_rel_bad_1',
    owner_type: 'empire',
    owner_id: 'empire_2',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    ask_price: 10,
    priority: 0
  }];

  const trades = clearMarkets(state, [{ key: 'biomass' }], buyOrders, sellOffers);
  const expectedPrice = 13; // 30% penalty at -100 relation

  assert(trades.length === 1, 'Market clears one bilateral trade under negative relation');
  assert(Math.abs(trades[0].price - expectedPrice) < 1e-9, 'Negative relation applies penalized trade price');
  assert(Math.abs(state.empires[0].budget_credits - 870) < 1e-9, 'Buyer pays penalized bilateral trade cost');
  assert(Math.abs(state.empires[1].budget_credits - 1130) < 1e-9, 'Seller receives penalized bilateral trade revenue');
}
console.log();

console.log('=== Test 15: Army Needs Are Damage-Gated And Wants Stay Persistent ===');
{
  const state = {
    marketOrders: { buyOrders: [], sellOffers: [] },
    market: {
      biomass: { price: 2.0 },
      rare_gases: { price: 3.0 }
    },
    coalitionModifiers: {},
    empires: [createEmpire('empire_1', 'Empire One', 50, {}, {}, { population: 1000, budget_credits: 10000 })],
    armies: []
  };

  const fullArmy = createArmy('army_full', 'empire_1', 'Full Army', 50, 60, 0, 50, 50, 1000);
  fullArmy.mp.current = 1000;
  fullArmy.demands = {
    needs: { biomass: 0.01 },
    wants: { rare_gases: 0.005 }
  };

  const damagedArmy = createArmy('army_dmg', 'empire_1', 'Damaged Army', 50, 60, 0, 50, 50, 1000);
  damagedArmy.mp.current = 500;
  damagedArmy.demands = {
    needs: { biomass: 0.01 },
    wants: { rare_gases: 0.005 }
  };

  state.armies.push(fullArmy, damagedArmy);

  const { aggregateBuyOrder, buyOrders } = createOrderAggregator(state);
  emitArmyOrders(state, aggregateBuyOrder, 1, 1);

  const fullNeeds = buyOrders.find(order => order.tags?.army_id === 'army_full' && order.category === 'needs');
  const fullWants = buyOrders.find(order => order.tags?.army_id === 'army_full' && order.category === 'wants');
  const damagedNeeds = buyOrders.find(order => order.tags?.army_id === 'army_dmg' && order.category === 'needs');
  const damagedWants = buyOrders.find(order => order.tags?.army_id === 'army_dmg' && order.category === 'wants');

  assert(!fullNeeds, 'Full army does not post needs demand');
  assert(Boolean(fullWants), 'Full army still posts wants demand');
  assert(Boolean(damagedNeeds), 'Damaged army posts needs demand');
  assert(Boolean(damagedWants), 'Damaged army posts wants demand');
  assert(damagedNeeds?.owner_type === 'empire' && damagedNeeds?.owner_id === 'empire_1', 'Army demand orders are empire-owned');
  assert((damagedNeeds?.tags?.demand_type === 'army_needs') && (damagedWants?.tags?.demand_type === 'army_wants'), 'Army demand orders carry routing tags');
}
console.log();

console.log('=== Test 16: Empire-Owned Army Orders Credit Army Receipts On Fill ===');
{
  const state = {
    empires: [
      { id: 'empire_1', budget_credits: 1000, economy_spend: { needs: 0, wants: 0, order_fees: 0 } },
      { id: 'empire_2', budget_credits: 1000, economy_spend: { needs: 0, wants: 0, order_fees: 0 } }
    ],
    armies: [createArmy('army_1', 'empire_1', 'Army One', 50, 60, 0, 50, 50, 1000)],
    market: {
      biomass: {
        commodity: 'biomass',
        price: 5.0,
        last_price: 5.0,
        floor_price: 5.0,
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
    id: 'army_tagged_buy_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    max_price: 10,
    priority: 2,
    category: 'needs',
    tags: { army_id: 'army_1', demand_type: 'army_needs' }
  }];
  const sellOffers = [{
    id: 'sell_emp2_1',
    owner_type: 'empire',
    owner_id: 'empire_2',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    ask_price: 5,
    priority: 0
  }];

  const trades = clearMarkets(state, [{ key: 'biomass' }], buyOrders, sellOffers);
  const army = state.armies[0];

  assert(trades.length === 1, 'Tagged army order trade clears');
  assert(Math.abs(state.empires[0].budget_credits - 950) < 1e-9, 'Owning empire budget is debited for army order fill');
  assert(Math.abs(state.empires[1].budget_credits - 1050) < 1e-9, 'Seller empire receives trade revenue');
  assert((army.supply_state?.received?.biomass || 0) === 10, 'Filled quantity is routed to army supply receipts');
}
console.log();

console.log('=== Test 17: Damaged Needs Drive Aggravation And Wants Deficits Reduce Fervor ===');
{
  const state = {
    empires: [createEmpire('empire_1', 'Empire One', 50, {}, {}, { population: 10000 })],
    armies: [],
    battleFronts: []
  };

  const damagedArmy = createArmy('army_dmg_2', 'empire_1', 'Damaged Army', 50, 60, 10, 50, 50, 1000);
  damagedArmy.mp.current = 500;
  damagedArmy.reinforcementRate = 0;
  damagedArmy.supply_state = {
    needs_fulfillment: { biomass: 0 },
    wants_fulfillment: { rare_gases: 0 },
    shortages: {},
    received: {},
    needs_demand: { biomass: 5 },
    wants_demand: { rare_gases: 5 }
  };
  damagedArmy.demands = {
    needs: { biomass: 0.01 },
    wants: { rare_gases: 0.005 }
  };

  const fullArmy = createArmy('army_full_2', 'empire_1', 'Full Army', 50, 60, 10, 50, 50, 1000);
  fullArmy.mp.current = 1000;
  fullArmy.reinforcementRate = 0;
  fullArmy.supply_state = {
    needs_fulfillment: {},
    wants_fulfillment: { rare_gases: 0 },
    shortages: {},
    received: {},
    needs_demand: {},
    wants_demand: { rare_gases: 5 }
  };
  fullArmy.demands = {
    needs: { biomass: 0.01 },
    wants: { rare_gases: 0.005 }
  };

  state.armies.push(damagedArmy, fullArmy);

  const damagedAggravationBefore = damagedArmy.aggravation;
  const damagedFervorBefore = getEffectiveArmyFervor(damagedArmy);
  const fullAggravationBefore = fullArmy.aggravation;
  const fullFervorBefore = getEffectiveArmyFervor(fullArmy);

  replenishArmyManpower(state, []);

  assert(damagedArmy.aggravation > damagedAggravationBefore, 'Damaged army gains aggravation when needs are unmet');
  assert(getEffectiveArmyFervor(damagedArmy) < damagedFervorBefore, 'Damaged army loses effective fervor when wants are unmet');
  assert(fullArmy.aggravation < fullAggravationBefore, 'Full army still sheds aggravation when needs are met despite unmet wants');
  assert(getEffectiveArmyFervor(fullArmy) < fullFervorBefore, 'Full army still loses effective fervor from unmet persistent wants');
}
console.log();

console.log('=== Test 18: Run Price Multipliers Seed Initial Market Prices ===');
{
  const market = initializeMarket([{ key: 'biomass', floor_price: 10 }], () => 0);
  const biomassMarket = market.biomass;

  assert(biomassMarket.run_price_multiplier === 0.5, 'Seeded market assigns a discrete run multiplier');
  assert(Math.abs(biomassMarket.base_floor_price - 8.5) < 1e-9, 'Base floor price keeps the seeded floor variance before multiplier');
  assert(Math.abs(biomassMarket.floor_price - 4.25) < 1e-9, 'Run multiplier scales the actual floor price');
  assert(Math.abs(biomassMarket.price - 2.125) < 1e-9, 'Run multiplier scales the initial market price');
  assert(market.price_multiplier_by_commodity.biomass === 0.5, 'Market metadata stores the run multiplier by commodity');
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
