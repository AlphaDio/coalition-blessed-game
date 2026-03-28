#!/usr/bin/env node

/**
 * Regression tests for requisition-from-consumption flow.
 * Verifies coalition gain from:
 *  - empire needs/wants consumption
 *  - army tagged consumption
 *  - improvement sustainment consumption
 */

import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { clearMarkets } from '../src/game/economyTick/ordersLifecycle.js';
import {
  initializeTurnConsumptionTracking,
  recordConsumption,
  processConsumptionToRequisition,
  CONSUMPTION_SOURCE_MULTIPLIERS,
  CONSUMPTION_SOURCES
} from '../src/game/consumptionToRequisition.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import { processImprovementsTick, processImprovementSustainmentPostMarket } from '../src/game/improvements/index.js';
import { processEmpireStockpileConsumption } from '../src/game/turn/economyPhase.js';
import { replenishArmyManpower } from '../src/game/turn/armyPhase.js';
import { applyBasePopulationGrowth } from '../src/game/turn/population.js';
import { ECONOMY_CONSTANTS, SCOURGE_MISSION_CONSTANTS } from '../src/game/constants.js';
import { scalePositiveApprovalGain } from '../src/game/approvalUtils.js';
import { getArmyPopulationDemandMultiplier } from '../src/game/consumptionScaling.js';
import { createSampleContent } from '../src/game/content.js';
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

function approxEqual(actual, expected, epsilon = 1e-9) {
  return Math.abs(actual - expected) <= epsilon;
}

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
      buy_orders: [],
      sell_offers: [],
      remaining_sell_offers_post_clear: [],
      remaining_buy_offers_post_clear: [],
      buy_backlog_total: 0
    },
    remaining_sell_offers_post_clear: [],
    remaining_buy_offers_post_clear: [],
    buy_backlog_by_commodity: {},
    buy_backlog_by_commodity_and_owner: {}
  };
}

function createEmpireShell(id, approval = 50, budget = 10000) {
  return {
    id,
    name: id,
    approval,
    budget_credits: budget,
    economy_spend: { needs: 0, wants: 0, order_fees: 0 },
    needs: { per_pop: {} },
    wants: { per_pop: {} },
    stats: { population: 1000 },
    modifiers: { supply_efficiency: 0 }
  };
}

console.log('============================================================');
console.log('Consumption Requisition Flow Tests');
console.log('============================================================\n');

console.log('=== Test 1: Empire Needs Fill Generates Coalition Requisition ===');
{
  initializeTurnConsumptionTracking();

  const state = {
    empires: [
      createEmpireShell('empire_1', 50, 1000),
      createEmpireShell('empire_2', 50, 1000)
    ],
    armies: [],
    market: createMarketState('biomass', 2)
  };

  const buyOrders = [{
    id: 'buy_empire_needs_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    max_price: 5,
    priority: 1,
    category: 'needs'
  }];
  const sellOffers = [{
    id: 'sell_empire_2_1',
    owner_type: 'empire',
    owner_id: 'empire_2',
    commodity: 'biomass',
    qty: 10,
    filled_qty: 0,
    ask_price: 2,
    priority: 0
  }];

  clearMarkets(state, [{ key: 'biomass' }], buyOrders, sellOffers);

  const coalitionEconomy = {
    requisition: 0,
    allowance_credits: 1000,
    consumption_requisition_pool: 0,
    consumption_requisition_pool_turns: 0
  };
  const result = processConsumptionToRequisition(state.market, coalitionEconomy, {}, state.empires);

  assert(approxEqual(result.totalConsumed, 10), 'Tracks exact filled quantity as consumption');
  assert((result.sourceBreakdown[CONSUMPTION_SOURCES.EMPIRE_NEEDS]?.quantity || 0) === 10, 'Classifies fill as empire needs consumption');
  assert(
    approxEqual(
      result.sourceBreakdown[CONSUMPTION_SOURCES.EMPIRE_NEEDS]?.weightedValue || 0,
      (result.sourceBreakdown[CONSUMPTION_SOURCES.EMPIRE_NEEDS]?.rawValue || 0) *
        CONSUMPTION_SOURCE_MULTIPLIERS[CONSUMPTION_SOURCES.EMPIRE_NEEDS]
    ),
    'Empire needs payout uses the configured source multiplier'
  );
  assert(result.requisitionGenerated > 0, 'Empire needs consumption generates requisition value');
  assert(result.requisitionGained === 0, 'No requisition is paid before payout cadence');
  assert(coalitionEconomy.requisition === 0, 'Coalition requisition stays unchanged before payout turn');
  assert(result.requisitionPoolBalance > 0 && result.requisitionPoolTurns === 1, 'Generated requisition is queued in the pool');
}
console.log();

console.log('=== Test 2: Army-Tagged Fill Counts As Army Consumption And Payout Triggers On Turn 15 ===');
{
  initializeTurnConsumptionTracking();

  const army = createArmy('army_1', 'empire_1', 'Army One', 50, 60, 0, 50, 50, 1000);
  const state = {
    empires: [
      createEmpireShell('empire_1', 50, 1000),
      createEmpireShell('empire_2', 50, 1000)
    ],
    armies: [army],
    market: createMarketState('rare_gases', 4)
  };

  const buyOrders = [{
    id: 'buy_army_wants_1',
    owner_type: 'empire',
    owner_id: 'empire_1',
    commodity: 'rare_gases',
    qty: 5,
    filled_qty: 0,
    max_price: 6,
    priority: 1,
    category: 'wants',
    tags: {
      army_id: 'army_1',
      demand_type: 'army_wants'
    }
  }];
  const sellOffers = [{
    id: 'sell_empire_2_2',
    owner_type: 'empire',
    owner_id: 'empire_2',
    commodity: 'rare_gases',
    qty: 5,
    filled_qty: 0,
    ask_price: 4,
    priority: 0
  }];

  clearMarkets(state, [{ key: 'rare_gases' }], buyOrders, sellOffers);

  const coalitionEconomy = {
    requisition: 0,
    allowance_credits: 1000,
    consumption_requisition_pool: 1,
    consumption_requisition_pool_turns: 14
  };
  const result = processConsumptionToRequisition(state.market, coalitionEconomy, {}, state.empires);

  assert((army.supply_state?.received?.rare_gases || 0) === 5, 'Army-tagged fills route commodities to army receipts');
  assert((result.sourceBreakdown[CONSUMPTION_SOURCES.ARMY_WANTS]?.quantity || 0) === 5, 'Classifies tagged fill as army wants consumption');
  assert(result.requisitionGenerated > 0, 'Army consumption generates requisition value');
  assert(result.requisitionGained > 1, 'Pool pays out on the 15th turn');
  assert(approxEqual(coalitionEconomy.requisition, result.requisitionGained), 'Paid requisition is credited to coalition economy');
  assert(result.requisitionPoolBalance === 0 && result.requisitionPoolTurns === 0, 'Pool resets after payout');
}
console.log();

console.log('=== Test 3: Improvement Sustainment Consumption Grants Requisition ===');
{
  initializeTurnConsumptionTracking();

  const empire1 = createEmpire('empire_1', 'Empire One', 50, {}, {}, {
    population: 1000,
    budget_credits: 10000,
    needs: { per_pop: {} },
    wants: { per_pop: {} },
    production: { outputs_per_tick: {} },
    stockpiles: {}
  });
  const empire2 = createEmpire('empire_2', 'Empire Two', 50, {}, {}, {
    population: 1000,
    budget_credits: 10000,
    needs: { per_pop: {} },
    wants: { per_pop: {} },
    production: { outputs_per_tick: {} },
    stockpiles: {}
  });

  const state = {
    turn: 11,
    coalitionConstruction: 4,
    coalitionModifiers: {
      rationing_add: 0,
      rationing_mult: 1.0,
      supply_efficiency: 0,
      dynamic: {
        improvement_build_speed_mult: 1.0,
        requisition_gen_mult: 1.0
      },
      consumptionShareMultiplier: 1.0,
      consumptionShareBonus: 0,
      consumptionSourceMultipliers: {}
    },
    coalitionEconomy: {
      requisition: 500,
      treasury_credits: 10000,
      allowance_credits: 1000,
      consumption_requisition_pool: 0,
      consumption_requisition_pool_turns: 0
    },
    market: createMarketState('biomass', 1),
    marketOrders: {
      buyOrders: [],
      sellOffers: [{
        id: 'sustain_sell_emp2',
        owner_type: 'empire',
        owner_id: 'empire_2',
        commodity: 'biomass',
        qty: 30,
        filled_qty: 0,
        ask_price: 1,
        priority: 0,
        duration: 0,
        max_duration: 1000000
      }]
    },
    empires: [empire1, empire2],
    armies: [],
    improvements: {
      queue: [{
        id: 'imp_sustain_1',
        empireId: 'empire_1',
        name: 'Sustainment Relay',
        state: 'ACTIVE',
        completedAtTick: null,
        ticksSinceSustained: 0,
        sustainmentCost: { biomass: 10 },
        productionOutputs: {},
        productionBank: {},
        productionBankThreshold: 10,
        requisitionUpkeep: 0,
        modifiers: {}
      }],
      requests: [],
      completed: [],
      maxTotalCapacity: 10,
      currentCapacity: 0,
      pendingSustainmentDemand: {},
      pendingSustainmentNeedsByImprovement: {},
      fulfilledSustainmentReceipts: {}
    },
    diplomacy: { relations: { empire_1: { empire_2: 0 }, empire_2: { empire_1: 0 } } }
  };

  processImprovementsTick(state);
  processEconomyTick(state);
  processImprovementSustainmentPostMarket(state);

  const result = processConsumptionToRequisition(state.market, state.coalitionEconomy, {}, state.empires);
  const improvementSourceQty = result.sourceBreakdown[CONSUMPTION_SOURCES.IMPROVEMENT_SUSTAINMENT]?.quantity || 0;

  assert(improvementSourceQty > 0, 'Consumed sustainment goods are tracked as improvement consumption');
  assert(result.requisitionGenerated > 0, 'Improvement sustainment consumption generates requisition value');
  assert(state.coalitionEconomy.requisition === 500, 'Requisition stays unchanged before 15-turn payout');
  assert(result.requisitionPoolBalance > 0, 'Improvement requisition is added to the pool');
  assert(state.improvements.queue[0].state === 'ACTIVE', 'Improvement remains active after same-turn sustainment fill');
}
console.log();

console.log('=== Test 4: Effect Pool Aggregates Empire And Sustainment Sources Before Trigger ===');
{
  initializeTurnConsumptionTracking();

  const state = {
    coalitionConstruction: 0,
    coalitionModifiers: {},
    consumptionEffectPools: {},
    empires: [{
      id: 'empire_1',
      name: 'Empire One',
      stats: { population: 1000, approvalBonus: 0, researchSpeedBonus: 0 },
      consumptionRules: [{
        commodity: 'biomass',
        threshold: 20,
        effect: { type: 'coalition_construction_bonus', amount: 1 }
      }]
    }],
    armies: []
  };

  recordConsumption('biomass', 10, 'empire_1', CONSUMPTION_SOURCES.EMPIRE_NEEDS);
  recordConsumption('biomass', 12, 'empire_1', CONSUMPTION_SOURCES.IMPROVEMENT_SUSTAINMENT);
  recordConsumption('biomass', 5, 'empire_1', CONSUMPTION_SOURCES.ARMY_WANTS);

  const log = [];
  processEmpireStockpileConsumption(state, log);

  assert(state.coalitionConstruction === 1, 'Pooled effect triggers once after combined empire and sustainment sources reach threshold');
  assert((state.consumptionEffectPools?.empire_1?.biomass || 0) === 2, 'Pool keeps commodity carryover after threshold hit');
}
console.log();

console.log('=== Test 5: Large Resource Thresholds Are Preserved ===');
{
  initializeTurnConsumptionTracking();

  const state = {
    coalitionConstruction: 0,
    coalitionModifiers: {},
    consumptionEffectPools: {},
    empires: [{
      id: 'empire_1',
      name: 'Empire One',
      stats: { population: 1000, approvalBonus: 0, researchSpeedBonus: 0 },
      consumptionRules: [{
        commodity: 'plasma_fuel',
        threshold: 10000,
        effect: { type: 'coalition_construction_bonus', amount: 1 }
      }]
    }],
    armies: []
  };

  recordConsumption('plasma_fuel', 150, 'empire_1', CONSUMPTION_SOURCES.EMPIRE_NEEDS);

  const log = [];
  processEmpireStockpileConsumption(state, log);

  assert(state.coalitionConstruction === 0, 'Large configured thresholds do not trigger early');
  assert((state.consumptionEffectPools?.empire_1?.plasma_fuel || 0) === 150, 'Large-threshold pool keeps full accumulated consumption');
}
console.log();

console.log('=== Test 6: Army Consumption Rules Now Support Scaling Growth And Damage ===');
{
  const army = createArmy('army_1', 'empire_1', 'Army One', 50, 60, 0, 50, 50, 1000);
  army.consumptionRules = [
    {
      commodity: 'rare_gases',
      threshold: 4,
      effect: { type: 'mp_growth_multiplier_bonus', amount: 0.25 }
    },
    {
      commodity: 'plasma_fuel',
      threshold: 4,
      effect: { type: 'army_damage_bonus', amount: 0.05 }
    },
    {
      commodity: 'super_alloys',
      threshold: 4,
      effect: { type: 'mp_bonus', amount: 2 }
    }
  ];
  army.supply_state.received = { rare_gases: 4, plasma_fuel: 4, super_alloys: 4 };

  const state = {
    coalitionIntel: 0,
    empires: [createEmpireShell('empire_1', 50, 1000)],
    armies: [army]
  };

  const log = [];
  replenishArmyManpower(state, [], log);

  const baselineExpectedMpGain =
    2 *
    1.25 *
    getArmyPopulationDemandMultiplier(state.empires[0].stats.population) *
    ECONOMY_CONSTANTS.ARMY_CONSUMPTION_MP_BASELINE_MULTIPLIER;

  assert(approxEqual(army.consumptionMpGainMultiplier, 1.25), 'Army resource thresholds can increase future MP growth from consumption');
  assert(approxEqual(army.consumptionDamageAdd, 0.05), 'Army resource thresholds can add persistent army damage');
  assert(
    approxEqual(army.mp.current, 1000 + baselineExpectedMpGain) &&
      approxEqual(army.mp.max, 1000 + baselineExpectedMpGain),
    'Direct MP gain uses the fixed baseline pacing multiplier with current population scaling'
  );
  assert((army.consumptionEffectPools?.rare_gases || 0) === 0, 'Army consumption pool spends exact threshold hits without phantom carryover');

  const populousArmy = createArmy('army_populous', 'empire_2', 'Population Army', 50, 60, 0, 50, 50, 1000);
  populousArmy.consumptionRules = [{
    commodity: 'super_alloys',
    threshold: 4,
    effect: { type: 'mp_bonus', amount: 2 }
  }];
  populousArmy.supply_state.received = { super_alloys: 4 };

  const populousState = {
    coalitionIntel: 0,
    empires: [createEmpireShell('empire_2', 50, 1000)],
    armies: [populousArmy]
  };
  populousState.empires[0].stats.population = 100000;

  replenishArmyManpower(populousState, [], []);
  const populousExpectedMpGain =
    2 *
    getArmyPopulationDemandMultiplier(populousState.empires[0].stats.population) *
    ECONOMY_CONSTANTS.ARMY_CONSUMPTION_MP_BASELINE_MULTIPLIER;
  assert(
    approxEqual(populousArmy.mp.current, 1000 + populousExpectedMpGain),
    'Higher population increases army MP gains from consumption'
  );

  const highThreatArmy = createArmy('army_high_threat', 'empire_3', 'High Threat Army', 50, 60, 0, 50, 50, 1000);
  highThreatArmy.consumptionRules = [{
    commodity: 'super_alloys',
    threshold: 4,
    effect: { type: 'mp_bonus', amount: 2 }
  }];
  highThreatArmy.supply_state.received = { super_alloys: 4 };

  const highThreatState = {
    coalitionIntel: 0,
    coalitionThreat: SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_SAFE_THREAT_DELTA + 200,
    empires: [createEmpireShell('empire_3', 50, 1000)],
    armies: [highThreatArmy]
  };

  replenishArmyManpower(highThreatState, [], []);
  const highThreatExpectedMpGain =
    2 *
    getArmyPopulationDemandMultiplier(highThreatState.empires[0].stats.population) *
    ECONOMY_CONSTANTS.ARMY_CONSUMPTION_MP_BASELINE_MULTIPLIER;
  assert(
    approxEqual(highThreatArmy.mp.current, 1000 + highThreatExpectedMpGain) &&
      approxEqual(highThreatArmy.mp.max, 1000 + highThreatExpectedMpGain),
    'Army MP growth no longer changes with Coalition Threat and stays on the fixed baseline pace'
  );
}
console.log();

console.log('=== Test 7: Army MP Thresholds Stay Reachable While Scaling Thresholds Stay High ===');
{
  const content = createSampleContent(42);
  const rules = (content.armies || [])
    .flatMap((army) => (army.consumptionRules || []).map((rule) => ({
      threshold: Number(rule.threshold),
      effectType: rule.effect?.type || null
    })))
    .filter((rule) => Number.isFinite(rule.threshold));

  const mpThresholds = rules
    .filter((rule) => rule.effectType === 'mp_bonus')
    .map((rule) => rule.threshold);
  const scalingThresholds = rules
    .filter((rule) => rule.effectType !== 'mp_bonus')
    .map((rule) => rule.threshold);

  const minMpThreshold = mpThresholds.length > 0 ? Math.min(...mpThresholds) : 0;
  const maxMpThreshold = mpThresholds.length > 0 ? Math.max(...mpThresholds) : 0;
  const minScalingThreshold = scalingThresholds.length > 0 ? Math.min(...scalingThresholds) : 0;
  const maxScalingThreshold = scalingThresholds.length > 0 ? Math.max(...scalingThresholds) : 0;

  assert(minMpThreshold >= 200 && maxMpThreshold <= 500, 'Army MP growth thresholds stay in a fast, reachable range');
  assert(minScalingThreshold >= 800 && maxScalingThreshold <= 4000, 'Army non-MP scaling thresholds stay in a live but slower range');
}
console.log();

console.log('=== Test 8: Sentient Cores Consumption Generates Intel ===');
{
  initializeTurnConsumptionTracking();

  const state = {
    coalitionIntel: 0,
    coalitionModifiers: {},
    consumptionEffectPools: {},
    scourgePrediction: {
      confidenceModifier: 1.0,
      confidenceLevel: 'medium'
    },
    empires: [{
      id: 'empire_clockwork',
      name: 'Quantum Collective',
      stats: { population: 300, approvalBonus: 0, researchSpeedBonus: 0 },
      consumptionRules: [{
        commodity: 'sentient_cores',
        threshold: 24,
        effect: { type: 'coalition_intel_bonus', amount: 1 }
      }]
    }],
    armies: []
  };

  recordConsumption('sentient_cores', 30, 'empire_clockwork', CONSUMPTION_SOURCES.IMPROVEMENT_SUSTAINMENT);

  const log = [];
  processEmpireStockpileConsumption(state, log);

  assert(state.coalitionIntel === 1, 'Sentient core threshold grants coalition intel');
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.05), 'Intel gain also improves current prediction confidence');
  assert((state.consumptionEffectPools?.empire_clockwork?.sentient_cores || 0) === 6, 'Sentient core pool keeps overflow after intel trigger');
}
console.log();

console.log('=== Test 9: Approval Consumption Effects Apply Immediately ===');
{
  initializeTurnConsumptionTracking();

  const empire = createEmpireShell('empire_approval', 50, 1000);
  empire.consumptionRules = [{
    commodity: 'rare_gases',
    threshold: 12,
    effect: { type: 'empire_approval_bonus', amount: 1.5 }
  }];

  const state = {
    consumptionEffectPools: {},
    empires: [empire],
    armies: []
  };

  recordConsumption('rare_gases', 24, 'empire_approval', CONSUMPTION_SOURCES.EMPIRE_WANTS);
  processEmpireStockpileConsumption(state, []);

  assert(
    approxEqual(empire.approval, 50 + scalePositiveApprovalGain(50, 3)),
    'Approval consumption effects use the scaled positive-approval pipeline when the threshold is hit'
  );
}
console.log();

console.log('=== Test 10: Army Consumption Does Not Trigger Empire Stockpile Effects ===');
{
  initializeTurnConsumptionTracking();

  const empire = createEmpireShell('empire_army_filter', 50, 1000);
  empire.consumptionRules = [{
    commodity: 'rare_gases',
    threshold: 12,
    effect: { type: 'empire_approval_bonus', amount: 1.5 }
  }];

  const state = {
    consumptionEffectPools: {},
    empires: [empire],
    armies: []
  };

  recordConsumption('rare_gases', 24, 'empire_army_filter', CONSUMPTION_SOURCES.ARMY_WANTS);
  processEmpireStockpileConsumption(state, []);

  assert(approxEqual(empire.approval, 50), 'Army-tagged consumption does not raise empire approval bonuses');
}
console.log();

console.log('=== Test 11: Population Growth Uses A Unified Capped Pipeline ===');
{
  const state = {
    coalitionModifiers: { population_growth: 0.003 },
    activeEmergencyLaws: [],
    improvements: {
      empireModifiers: {
        empire_1: {
          population_growth: 0.004
        }
      }
    },
    empires: [
      createEmpire('empire_1', 'Growth Empire', 50, {}, {}, { population: 10000 })
    ]
  };

  state.empires[0].techModifiers.population_growth = 0.002;

  applyBasePopulationGrowth(state);
  assert(state.empires[0].stats.population > 10050, 'Base, law, tech, and improvement growth stack through one population pipeline');

  state.empires[0].stats.population = 999990;
  state.empires[0].stats.population_growth_bank = 0;

  for (let i = 0; i < 200; i++) {
    applyBasePopulationGrowth(state);
  }

  assert(state.empires[0].stats.population === 1000000, 'Population growth respects the 1,000,000 ceiling');
  assert((state.empires[0].stats.population_growth_bank || 0) === 0, 'Positive growth bank clears once the population ceiling is reached');
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
