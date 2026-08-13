#!/usr/bin/env node

import { createBuyOrder } from '../src/game/marketEconomy.js';
import {
  PERSISTENCE_POLICIES,
  finalizeBacklogOrders,
  getMaxBacklogAge,
  getPersistencePolicy,
  markDemandBacklogOrder
} from '../src/game/economyTick/backlog.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${message}`);
  } else {
    failed++;
    console.log(`[FAIL] ${message}`);
  }
}

function makeOrder(id, commodity, qty, policy, maxAge = undefined) {
  const order = createBuyOrder(id, 'coalition', 'coalition', commodity, qty, 10, 1, 3);
  order.category = 'needs';
  order.persistence_policy = policy;
  if (maxAge !== undefined) order.max_backlog_age = maxAge;
  markDemandBacklogOrder(order, { type: 'coalition_demand', id: 'coalition', category: 'needs' }, { conditional: false });
  return order;
}

function makeState(turn = 1) {
  return {
    turn,
    empires: [],
    armies: [],
    improvements: { queue: [] },
    economyPressure: {
      by_resource: {},
      by_type: {},
      total: 0,
      last_expired: [],
      history: []
    }
  };
}

console.log('Demand Persistence, Backlog, and Pressure Tests');

assert(getPersistencePolicy('biomass') === PERSISTENCE_POLICIES.PERISHABLE,
  'Biomass uses the perishable persistence policy');
assert(getMaxBacklogAge('biomass', PERSISTENCE_POLICIES.PERISHABLE) === 1,
  'Perishable biomass backlog lasts one turn');
assert(getPersistencePolicy('plasma_fuel') === PERSISTENCE_POLICIES.DEFERRED,
  'Plasma fuel uses deferred persistence');

{
  const state = makeState();
  const order = makeOrder('perishable_1', 'biomass', 10, PERSISTENCE_POLICIES.PERISHABLE);
  const result = finalizeBacklogOrders(state, [order]);
  assert(result.activeOrders.length === 0, 'Unmet perishable backlog is removed on expiry');
  assert(state.economyPressure.by_resource.biomass === 10, 'Expired biomass becomes biomass pressure');
  assert(state.economyPressure.by_type.biomass_pressure === 10, 'Biomass pressure is indexed by pressure key');
}

{
  const state = makeState();
  const order = makeOrder('deferred_1', 'plasma_fuel', 8, PERSISTENCE_POLICIES.DEFERRED, 3);
  let result = finalizeBacklogOrders(state, [order]);
  assert(result.activeOrders[0]?.age === 1, 'Deferred backlog ages after the first unmet turn');
  result = finalizeBacklogOrders(state, result.activeOrders);
  assert(result.activeOrders[0]?.age === 2, 'Deferred backlog remains expected while within its age');
  result = finalizeBacklogOrders(state, result.activeOrders);
  assert(result.expiredOrders.length === 1, 'Deferred backlog expires at its configured maximum age');
  assert(state.economyPressure.by_resource.plasma_fuel === 8, 'Deferred expiry contributes its unresolved quantity to pressure');
}

{
  const state = makeState();
  const order = makeOrder('persistent_1', 'super_alloys', 12, PERSISTENCE_POLICIES.PERSISTENT);
  let result = finalizeBacklogOrders(state, [order]);
  result = finalizeBacklogOrders(state, result.activeOrders);
  result = finalizeBacklogOrders(state, result.activeOrders);
  assert(result.activeOrders[0]?.age === 3, 'Persistent backlog continues aging for diagnostics');
  assert(result.expiredOrders.length === 0, 'Persistent backlog never expires through age alone');
  assert(state.economyPressure.total === 0, 'Persistent unmet demand does not create expiry pressure');
}

{
  const state = makeState();
  const order = makeOrder('partial_1', 'biomass', 10, PERSISTENCE_POLICIES.PERISHABLE);
  order.filled_qty = 4;
  const result = finalizeBacklogOrders(state, [order]);
  assert(state.economyPressure.by_resource.biomass === 6, 'Only unresolved quantity contributes pressure after a partial fill');
  assert(result.expiredOrders[0]?.quantity_remaining === 6, 'Expired backlog records its remaining quantity');
}

{
  const state = makeState();
  const order = makeOrder('cancelled_1', 'biomass', 10, PERSISTENCE_POLICIES.PERSISTENT);
  order.conditional = true;
  order.source = { type: 'empire_demand', id: 'missing_empire', category: 'needs' };
  const result = finalizeBacklogOrders(state, [order]);
  assert(result.cancelledOrders.length === 1, 'Invalid conditional demand is cancelled immediately');
  assert(state.economyPressure.total === 0, 'Cancelled conditional demand does not become expiry pressure');
}

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
