#!/usr/bin/env node

/**
 * Tests for the needs/wants fulfillment effects system.
 *
 * Validates that:
 *  - Empire needs fulfillment is tracked from market orders
 *  - Low needs fulfillment applies approval and population-growth penalties (steep curve)
 *  - High needs fulfillment applies small bonuses
 *  - Wants fulfillment applies gentler linear effects
 *  - Improvement sustainment degrades only below the low-fulfillment threshold
 */

import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { computeEmpireFulfillment } from '../src/game/marketEconomy.js';
import { applyEmpireFulfillmentEffects } from '../src/game/economyTick/postTick.js';
import { FULFILLMENT_CONSTANTS } from '../src/game/constants.js';
import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../src/game/improvements/types.js';
import {
  processImprovementSustainmentPreMarket,
  processImprovementSustainmentPostMarket
} from '../src/game/improvements/engine/sustainment.js';
import { initializeTurnConsumptionTracking } from '../src/game/consumptionToRequisition.js';
import { applyBasePopulationGrowth } from '../src/game/turn/population.js';
import { emitEmpireNeedsOrders, emitEmpireWantsOrders } from '../src/game/economyTick/ordersPhase.js';
import { createEmpire } from '../src/game/types.js';

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

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

console.log('============================================================');
console.log('Fulfillment Effects Tests');
console.log('============================================================\n');

// ─── Test 1: computeEmpireFulfillment – full fill ────────────────────────────
console.log('=== Test 1: Full needs fill yields 100% fulfillment ===');
{
  const empire = createEmpire('e1', 'Test', 50, {}, {}, { population: 1000 });
  empire.supply_state = {
    needs_demand: { biomass: 10, plasma_fuel: 5 },
    wants_demand: { nano_machines: 2 },
    received:     { biomass: 10, plasma_fuel: 5, nano_machines: 2 },
    needs_fulfillment: {},
    wants_fulfillment: {}
  };

  const { needsFulfillment, wantsFulfillment } = computeEmpireFulfillment(empire);
  assert(approxEqual(needsFulfillment.biomass, 1.0), 'Full biomass fill → 1.0 needs fulfillment');
  assert(approxEqual(needsFulfillment.plasma_fuel, 1.0), 'Full plasma_fuel fill → 1.0 needs fulfillment');
  assert(approxEqual(wantsFulfillment.nano_machines, 1.0), 'Full nano_machines fill → 1.0 wants fulfillment');
}
console.log();

// ─── Test 2: computeEmpireFulfillment – partial fill ────────────────────────
console.log('=== Test 2: 50% fill yields 0.5 fulfillment ===');
{
  const empire = createEmpire('e2', 'Test', 50, {}, {}, { population: 1000 });
  empire.supply_state = {
    needs_demand: { biomass: 10 },
    wants_demand: { nano_machines: 4 },
    received:     { biomass: 5, nano_machines: 2 },
    needs_fulfillment: {},
    wants_fulfillment: {}
  };

  const { needsFulfillment, wantsFulfillment } = computeEmpireFulfillment(empire);
  assert(approxEqual(needsFulfillment.biomass, 0.5), '50% biomass fill → 0.5 needs fulfillment');
  assert(approxEqual(wantsFulfillment.nano_machines, 0.5), '50% nano_machines fill → 0.5 wants fulfillment');
}
console.log();

// ─── Test 3: computeEmpireFulfillment – zero demand ─────────────────────────
console.log('=== Test 3: Zero demand counts as fully fulfilled ===');
{
  const empire = createEmpire('e3', 'Test', 50, {}, {}, { population: 1000 });
  empire.supply_state = {
    needs_demand: {},
    wants_demand: {},
    received:     {},
    needs_fulfillment: {},
    wants_fulfillment: {}
  };

  const { needsFulfillment, wantsFulfillment } = computeEmpireFulfillment(empire);
  assert(Object.keys(needsFulfillment).length === 0, 'No demand → no needs fulfillment entries');
  assert(Object.keys(wantsFulfillment).length === 0, 'No demand → no wants fulfillment entries');
}
console.log();

// ─── Test 4: applyEmpireFulfillmentEffects – zero needs → big penalty ────────
console.log('=== Test 4: 0% needs fulfillment applies maximum approval penalty ===');
{
  const empire = createEmpire('e4', 'Test', 50, {}, {}, { population: 1000 });
  empire.supply_state = {
    needs_demand:      { biomass: 10 },
    wants_demand:      {},
    received:          { biomass: 0 },
    needs_fulfillment: { biomass: 0.0 },
    wants_fulfillment: {}
  };

  const approvalBefore = empire.approval;
  applyEmpireFulfillmentEffects(empire);
  assert(empire.approval < approvalBefore, '0% needs → approval decreases');
  assert(
    approxEqual(empire.approval, approvalBefore - FULFILLMENT_CONSTANTS.NEEDS_MAX_APPROVAL_PENALTY, 0.01),
    '0% needs → approval decreases by max penalty'
  );
  assert(empire.stats.fulfillment_growth_modifier < 0, '0% needs → negative growth modifier');
  assert(
    approxEqual(empire.stats.fulfillment_growth_modifier, -FULFILLMENT_CONSTANTS.NEEDS_MAX_GROWTH_PENALTY, 1e-6),
    '0% needs → growth modifier equals max growth penalty (negated)'
  );
}
console.log();

// ─── Test 5: applyEmpireFulfillmentEffects – full needs → small bonus ────────
console.log('=== Test 5: 100% needs fulfillment applies small approval bonus ===');
{
  const empire = createEmpire('e5', 'Test', 50, {}, {}, { population: 1000 });
  empire.supply_state = {
    needs_demand:      { biomass: 10 },
    wants_demand:      {},
    received:          { biomass: 10 },
    needs_fulfillment: { biomass: 1.0 },
    wants_fulfillment: {}
  };

  const approvalBefore = empire.approval;
  applyEmpireFulfillmentEffects(empire);
  assert(empire.approval > approvalBefore, '100% needs → approval increases');
  assert(empire.stats.fulfillment_growth_modifier > 0, '100% needs → positive growth modifier');
}
console.log();

// ─── Test 6: needs steeper than wants curve ──────────────────────────────────
console.log('=== Test 6: Needs curve is steeper than wants curve at low fulfillment ===');
{
  const empireNeeds = createEmpire('en', 'Test', 50, {}, {}, { population: 1000 });
  empireNeeds.supply_state = {
    needs_demand:      { biomass: 10 },
    wants_demand:      {},
    received:          { biomass: 1 },   // 10% fulfillment
    needs_fulfillment: { biomass: 0.10 },
    wants_fulfillment: {}
  };

  const empireWants = createEmpire('ew', 'Test', 50, {}, {}, { population: 1000 });
  empireWants.supply_state = {
    needs_demand:      {},
    wants_demand:      { nano_machines: 10 },
    received:          { nano_machines: 1 },   // 10% fulfillment
    needs_fulfillment: {},
    wants_fulfillment: { nano_machines: 0.10 }
  };

  const startApprovalNeeds = empireNeeds.approval;
  const startApprovalWants = empireWants.approval;

  applyEmpireFulfillmentEffects(empireNeeds);
  applyEmpireFulfillmentEffects(empireWants);

  const needsApprovalDrop = startApprovalNeeds - empireNeeds.approval;
  const wantsApprovalDrop = startApprovalWants - empireWants.approval;

  assert(needsApprovalDrop > wantsApprovalDrop, 'Needs penalty at 10% is harsher than wants penalty at 10%');
}
console.log();

// ─── Test 7: wants bonus at 100% ─────────────────────────────────────────────
console.log('=== Test 7: 100% wants fulfillment gives approval and growth bonus ===');
{
  const empire = createEmpire('e7', 'Test', 50, {}, {}, { population: 1000 });
  empire.supply_state = {
    needs_demand:      {},
    wants_demand:      { nano_machines: 5 },
    received:          { nano_machines: 5 },
    needs_fulfillment: {},
    wants_fulfillment: { nano_machines: 1.0 }
  };

  const approvalBefore = empire.approval;
  applyEmpireFulfillmentEffects(empire);
  assert(empire.approval > approvalBefore, '100% wants → approval bonus applied');
  assert(empire.stats.fulfillment_growth_modifier > 0, '100% wants → positive growth modifier');
}
console.log();

// ─── Test 8: fulfillment_growth_modifier feeds into population growth ─────────
console.log('=== Test 8: fulfillment_growth_modifier contributes to population growth pipeline ===');
{
  const state = {
    coalitionModifiers: { population_growth: 0 },
    activeEmergencyLaws: [],
    improvements: { empireModifiers: {} },
    empires: [createEmpire('e8', 'Test', 50, {}, {}, { population: 10000 })]
  };
  const empire = state.empires[0];

  // Simulate full fulfillment (positive modifier)
  empire.stats.fulfillment_growth_modifier = 0.005;
  const popBefore = empire.stats.population;
  applyBasePopulationGrowth(state);
  assert(empire.stats.population > popBefore || empire.stats.population_growth_bank > 0,
    'Positive fulfillment growth modifier accelerates population growth');

  // Simulate zero fulfillment (negative modifier large enough to overcome base)
  const empire2 = createEmpire('e8b', 'Test', 50, {}, {}, { population: 10000 });
  // Need net rate < -0.001 so that bank (population * rate) crosses the -10 threshold in one tick
  empire2.stats.fulfillment_growth_modifier = -(FULFILLMENT_CONSTANTS.NEEDS_MAX_GROWTH_PENALTY * 5);
  const state2 = {
    coalitionModifiers: { population_growth: 0 },
    activeEmergencyLaws: [],
    improvements: { empireModifiers: {} },
    empires: [empire2]
  };
  applyBasePopulationGrowth(state2);
  assert(empire2.stats.population < 10000,
    'Large negative fulfillment modifier causes population to decline');
}
console.log();

// ─── Test 9: Empire needs and wants scale linearly with population ────────────
console.log('=== Test 9: Empire needs and wants scale linearly with population ===');
{
  const collectOrders = [];
  const aggregateBuyOrder = (_ownerType, _ownerId, commodity, qty, _maxPrice, category) => {
    collectOrders.push({ commodity, qty, category });
  };
  const makeEmpire = (id, population) => {
    const empire = createEmpire(id, 'Demand Test', 50, {}, {}, { population });
    empire.needs = { per_pop: { biomass: 1 } };
    empire.wants = { per_pop: { nano_machines: 2 } };
    return empire;
  };
  const buildState = (empire) => ({
    empires: [empire],
    armies: [],
    market: {
      biomass: { price: 1.0 },
      nano_machines: { price: 1.0 }
    },
    coalitionModifiers: {},
    improvements: { empireModifiers: {} }
  });

  const lowPopulationState = buildState(makeEmpire('e9a', 1_000));
  emitEmpireNeedsOrders(lowPopulationState, aggregateBuyOrder, 1, 1);
  emitEmpireWantsOrders(lowPopulationState, aggregateBuyOrder, 1, 1);
  const lowNeeds = lowPopulationState.empires[0].supply_state.needs_demand.biomass;
  const lowWants = lowPopulationState.empires[0].supply_state.wants_demand.nano_machines;

  const highPopulationState = buildState(makeEmpire('e9b', 2_000));
  emitEmpireNeedsOrders(highPopulationState, aggregateBuyOrder, 1, 1);
  emitEmpireWantsOrders(highPopulationState, aggregateBuyOrder, 1, 1);
  const highNeeds = highPopulationState.empires[0].supply_state.needs_demand.biomass;
  const highWants = highPopulationState.empires[0].supply_state.wants_demand.nano_machines;

  assert(approxEqual(highNeeds, lowNeeds * 2, 1e-6), 'Empire needs demand doubles when population doubles');
  assert(approxEqual(highWants, lowWants * 2, 1e-6), 'Empire wants demand doubles when population doubles');
}
console.log();

// ─── Test 10: Improvement sustainment scales linearly with population ─────────
console.log('=== Test 10: Improvement sustainment demand scales linearly with population ===');
{
  initializeTurnConsumptionTracking();

  const buildState = (empireId, population, improvementId) => {
    const empire = createEmpire(empireId, 'Sustain Test', 50, {}, {}, { population });
    const improvement = {
      id: improvementId,
      empireId,
      name: 'Population Relay',
      state: 'ACTIVE',
      completedAtTick: 0,
      ticksSinceSustained: 0,
      sustainmentCost: { biomass: 5 },
      productionOutputs: {},
      productionBank: {},
      productionBankThreshold: 10,
      requisitionUpkeep: 0,
      modifiers: {}
    };
    const state = {
      turn: 12,
      empires: [empire],
      armies: [],
      coalitionEconomy: { requisition: 500 },
      coalitionModifiers: { rationing_add: 0, rationing_mult: 1.0, supply_efficiency: 0 },
      market: { biomass: { price: 1.0 } },
      marketOrders: { buyOrders: [], sellOffers: [] },
      improvements: {
        queue: [improvement],
        requests: [],
        pendingSustainmentDemand: {},
        pendingSustainmentNeedsByImprovement: {},
        fulfilledSustainmentReceipts: {}
      }
    };
    return { state, improvement };
  };

  const low = buildState('e10a', 1_000, 'imp_10a');
  processImprovementSustainmentPreMarket(low.state, low.improvement);
  const lowNeed = low.state.improvements.pendingSustainmentNeedsByImprovement.imp_10a.biomass;

  const high = buildState('e10b', 2_000, 'imp_10b');
  processImprovementSustainmentPreMarket(high.state, high.improvement);
  const highNeed = high.state.improvements.pendingSustainmentNeedsByImprovement.imp_10b.biomass;

  assert(approxEqual(highNeed, lowNeed * 2, 1e-6), 'Improvement sustainment doubles when population doubles');
}
console.log();

// ─── Test 11: Improvement does NOT degrade at moderate sustainment ────────────
console.log('=== Test 11: Improvement stays ACTIVE with moderate (50%) sustainment ===');
{
  initializeTurnConsumptionTracking();

  const empire = createEmpire('e9', 'Test', 50, {}, {}, { population: 1000 });
  const improvement = {
    id: 'imp_9',
    empireId: 'e9',
    name: 'Test Relay',
    state: 'ACTIVE',
    completedAtTick: 0,
    ticksSinceSustained: 0,
    sustainmentCost: { biomass: 5 },
    productionOutputs: {},
    productionBank: {},
    productionBankThreshold: 10,
    requisitionUpkeep: 0,
    modifiers: {}
  };

  const state = {
    turn: 5,
    empires: [empire],
    armies: [],
    coalitionEconomy: { requisition: 500 },
    coalitionModifiers: { rationing_add: 0, rationing_mult: 1.0, supply_efficiency: 0 },
    market: { biomass: { price: 1.0 } },
    marketOrders: { buyOrders: [], sellOffers: [] },
    improvements: {
      queue: [improvement],
      requests: [],
      pendingSustainmentDemand: {},
      pendingSustainmentNeedsByImprovement: {},
      fulfilledSustainmentReceipts: {}
    }
  };

  // Provide 50% of needed sustainment receipts (above the 20% degradation threshold)
  const THRESHOLD = FULFILLMENT_CONSTANTS.IMPROVEMENT_DEGRADATION_FULFILLMENT_THRESHOLD;
  // We need to know exact demand to set 50% above threshold
  // Just set receipts to cover exactly 50% by doing pre-market then partial fill
  processImprovementSustainmentPreMarket(state, improvement);

  // Manually credit 50% into fulfilled receipts (simulating market partial fill)
  const needed = Object.values(state.improvements.pendingSustainmentNeedsByImprovement?.imp_9 || {})[0] || 0;
  state.improvements.fulfilledSustainmentReceipts['e9'] = { biomass: needed * 0.5 };

  processImprovementSustainmentPostMarket(state);

  // 50% fulfillment is above the 20% degradation threshold → should NOT degrade
  assert(improvement.state === 'ACTIVE', 'Improvement stays ACTIVE at 50% sustainment fulfillment (above degradation threshold)');
  assert((improvement.ticksSinceSustained || 0) === 0, 'ticksSinceSustained is not incremented above degradation threshold');
}
console.log();

// ─── Test 12: Improvement DOES degrade at very low sustainment ────────────────
console.log('=== Test 12: Improvement degrades after sustained ticks at <20% sustainment ===');
{
  initializeTurnConsumptionTracking();

  const empire = createEmpire('e10', 'Test', 50, {}, {}, { population: 1000 });
  const improvement = {
    id: 'imp_10',
    empireId: 'e10',
    name: 'Test Relay',
    state: 'ACTIVE',
    completedAtTick: 0,
    ticksSinceSustained: 0,
    sustainmentCost: { biomass: 5 },
    productionOutputs: {},
    productionBank: {},
    productionBankThreshold: 10,
    requisitionUpkeep: 0,
    modifiers: {}
  };

  const baseState = () => ({
    turn: 20,
    empires: [empire],
    armies: [],
    coalitionEconomy: { requisition: 500 },
    coalitionModifiers: { rationing_add: 0, rationing_mult: 1.0, supply_efficiency: 0 },
    market: { biomass: { price: 1.0 } },
    marketOrders: { buyOrders: [], sellOffers: [] },
    improvements: {
      queue: [improvement],
      requests: [],
      pendingSustainmentDemand: {},
      pendingSustainmentNeedsByImprovement: {},
      fulfilledSustainmentReceipts: {}
    }
  });

  // Run IMPROVEMENT_SUSTAINMENT_TICKS turns with 0% sustainment (nothing in receipts)
  for (let tick = 0; tick < IMPROVEMENT_SUSTAINMENT_TICKS; tick++) {
    initializeTurnConsumptionTracking();
    const state = baseState();
    state.turn = 20 + tick;
    state.improvements.queue = [improvement];
    processImprovementSustainmentPreMarket(state, improvement);
    // No receipts → 0% fulfillment
    processImprovementSustainmentPostMarket(state);
  }

  assert(improvement.state === 'DEGRADED', `Improvement degrades after ${IMPROVEMENT_SUSTAINMENT_TICKS} ticks at 0% sustainment`);
}
console.log();

// ─── Test 13: Improvement restores when sustainment rises above threshold ─────
console.log('=== Test 13: Degraded improvement restores when sustainment exceeds threshold ===');
{
  initializeTurnConsumptionTracking();

  const empire = createEmpire('e11', 'Test', 50, {}, {}, { population: 1000 });
  const improvement = {
    id: 'imp_11',
    empireId: 'e11',
    name: 'Restored Relay',
    state: 'DEGRADED',
    degradedSince: 10,
    completedAtTick: 0,
    ticksSinceSustained: IMPROVEMENT_SUSTAINMENT_TICKS,
    sustainmentCost: { biomass: 5 },
    productionOutputs: {},
    productionBank: {},
    productionBankThreshold: 10,
    requisitionUpkeep: 0,
    modifiers: {}
  };

  const state = {
    turn: 25,
    empires: [empire],
    armies: [],
    coalitionEconomy: { requisition: 500 },
    coalitionModifiers: { rationing_add: 0, rationing_mult: 1.0, supply_efficiency: 0 },
    market: { biomass: { price: 1.0 } },
    marketOrders: { buyOrders: [], sellOffers: [] },
    improvements: {
      queue: [improvement],
      requests: [],
      pendingSustainmentDemand: {},
      pendingSustainmentNeedsByImprovement: {},
      fulfilledSustainmentReceipts: {}
    }
  };

  processImprovementSustainmentPreMarket(state, improvement);

  // Credit full receipts so fulfillment = 100%
  const needed = Object.values(state.improvements.pendingSustainmentNeedsByImprovement?.imp_11 || {})[0] || 0;
  state.improvements.fulfilledSustainmentReceipts['e11'] = { biomass: needed };

  processImprovementSustainmentPostMarket(state);

  assert(improvement.state === 'ACTIVE', 'Improvement restores to ACTIVE when sustainment reaches 100%');
  assert(improvement.ticksSinceSustained === 0, 'ticksSinceSustained resets to 0 after restoration');
}
console.log();

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('============================================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('============================================================');

if (testsFailed > 0) {
  process.exit(1);
}

console.log('[PASS] ALL TESTS PASSED');
