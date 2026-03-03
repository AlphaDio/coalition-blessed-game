import { ECONOMY_CONSTANTS, MARKET_CONSTANTS, RATIONING_CONSTANTS } from '../constants.js';
import { applyDemandCommodityMultiplier } from '../economyBalance.js';
import { getEmpireTechModifier } from '../empireModifiers.js';

export function getEffectiveRationing(state) {
  const baseRationing = RATIONING_CONSTANTS.BASE_RATIONING;
  const rationingAdd = state.coalitionModifiers?.rationing_add || 0;
  const rationingMult = state.coalitionModifiers?.rationing_mult || 1.0;
  return Math.max(
    RATIONING_CONSTANTS.MIN_RATIONING,
    Math.min(RATIONING_CONSTANTS.MAX_RATIONING, (baseRationing + rationingAdd) * rationingMult)
  );
}

/**
 * Coalition-level supply efficiency multiplier: (1 - supply_efficiency), clamped to [0, 1].
 */
export function getSupplyEfficiencyMultiplier(state) {
  const efficiency = Math.min(1, state.coalitionModifiers?.supply_efficiency || 0);
  return Math.max(0, 1 - efficiency);
}

/**
 * Empire-level supply efficiency (from definition + improvements). Combined with coalition
 * in callers: final mult = coalitionMult * (1 - min(1, empireEfficiency)).
 */
export function getEmpireSupplyEfficiency(empire, state) {
  const fromDefinition = empire.modifiers?.supply_efficiency || 0;
  const fromImprovements = state.improvements?.empireModifiers?.[empire.id]?.supply_efficiency || 0;
  const fromTech = getEmpireTechModifier(empire, 'supply_efficiency');
  return Math.min(1, fromDefinition + fromImprovements + fromTech);
}

function isArmyDamaged(army) {
  const maxMP = Number.isFinite(army?.mp?.max) ? army.mp.max : (army.manpower || 0);
  const currentMP = Number.isFinite(army?.mp?.current) ? army.mp.current : maxMP;
  return (maxMP - currentMP) > ECONOMY_CONSTANTS.ARMY_NEEDS_DAMAGE_GATE_EPSILON;
}

export function emitEmpireNeedsOrders(state, aggregateBuyOrder, effectiveRationing, supplyEfficiencyMultiplier = 1) {
  state.empires.forEach(empire => {
    if (!empire.needs || !empire.needs.per_pop) return;
    const population = empire.stats?.population || 0;
    const empireEff = getEmpireSupplyEfficiency(empire, state);
    const empireMult = Math.max(0, 1 - empireEff);

    if (!empire.economy_spend) {
      empire.economy_spend = { needs: 0, wants: 0, order_fees: 0 };
    }

    // Reset supply state for this tick
    if (!empire.supply_state) {
      empire.supply_state = { needs_demand: {}, wants_demand: {}, received: {}, needs_fulfillment: {}, wants_fulfillment: {} };
    }
    empire.supply_state.needs_demand = {};
    empire.supply_state.received = {};

    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const rawNeeded = qtyPerPop * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalNeeded = applyDemandCommodityMultiplier(commodity, rawNeeded);
      if (totalNeeded > 0) {
        empire.supply_state.needs_demand[commodity] = totalNeeded;
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('empire', empire.id, commodity, totalNeeded, maxPrice, 'needs', 1);
      }
    });
  });
}

export function emitEmpireWantsOrders(state, aggregateBuyOrder, effectiveRationing, supplyEfficiencyMultiplier = 1) {
  state.empires.forEach(empire => {
    if (!empire.wants || !empire.wants.per_pop) return;
    const population = empire.stats?.population || 0;
    const empireEff = getEmpireSupplyEfficiency(empire, state);
    const empireMult = Math.max(0, 1 - empireEff);

    // Ensure supply state exists (needs phase may not have created it for wants-only empires)
    if (!empire.supply_state) {
      empire.supply_state = { needs_demand: {}, wants_demand: {}, received: {}, needs_fulfillment: {}, wants_fulfillment: {} };
    }
    empire.supply_state.wants_demand = {};

    Object.entries(empire.wants.per_pop).forEach(([commodity, qtyPerPop]) => {
      const rawWanted = qtyPerPop * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalWanted = applyDemandCommodityMultiplier(commodity, rawWanted);
      if (totalWanted > 0) {
        empire.supply_state.wants_demand[commodity] = totalWanted;
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('empire', empire.id, commodity, totalWanted, maxPrice, 'wants', 0);
      }
    });
  });
}

export function emitArmyOrders(state, aggregateBuyOrder, effectiveRationing, supplyEfficiencyMultiplier = 1) {
  state.armies.forEach(army => {
    if (!army.demands) return;
    const empire = state.empires?.find(e => e.id === army.empireId);
    if (!empire) return;

    const maxMP = Number.isFinite(army?.mp?.max) ? army.mp.max : (army.manpower || 0);
    const currentMP = Number.isFinite(army?.mp?.current) ? army.mp.current : maxMP;
    const missingMP = Math.max(0, maxMP - currentMP);
    const empireEff = getEmpireSupplyEfficiency(empire, state);
    const empireMult = Math.max(0, 1 - empireEff);
    const needsActive = isArmyDamaged(army);

    // Ensure supply_state is initialized
    if (!army.supply_state) {
      army.supply_state = {
        needs_fulfillment: {},
        wants_fulfillment: {},
        shortages: {},
        received: {},
        needs_demand: {},
        wants_demand: {}
      };
    }

    // Reset received commodities for this tick
    army.supply_state.received = {};
    army.supply_state.needs_demand = {};
    army.supply_state.wants_demand = {};

    // Needs are only requested when army is damaged and replacing losses.
    Object.entries(army.demands.needs || {}).forEach(([commodity, qtyPerManpower]) => {
      const rawNeeded = needsActive
        ? qtyPerManpower * missingMP * effectiveRationing * supplyEfficiencyMultiplier * empireMult
        : 0;
      const totalNeeded = applyDemandCommodityMultiplier(commodity, rawNeeded);
      army.supply_state.needs_demand[commodity] = totalNeeded;

      if (totalNeeded > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice * MARKET_CONSTANTS.ARMY_NEEDS_PREMIUM;
        const tags = { army_id: army.id, demand_type: 'army_needs' };

        aggregateBuyOrder('empire', empire.id, commodity, totalNeeded, maxPrice, 'needs', 2, tags);
      }
    });

    // Wants are persistent and represent ongoing readiness/upgrade pressure.
    Object.entries(army.demands.wants || {}).forEach(([commodity, qtyPerManpower]) => {
      const rawWanted = qtyPerManpower * maxMP * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalWanted = applyDemandCommodityMultiplier(commodity, rawWanted);
      army.supply_state.wants_demand[commodity] = totalWanted;

      if (totalWanted > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice * MARKET_CONSTANTS.ARMY_WANTS_PREMIUM;
        const tags = { army_id: army.id, demand_type: 'army_wants' };

        aggregateBuyOrder('empire', empire.id, commodity, totalWanted, maxPrice, 'wants', 1, tags);
      }
    });
  });
}
