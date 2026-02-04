import { RATIONING_CONSTANTS } from '../constants.js';

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
  return Math.min(1, fromDefinition + fromImprovements);
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

    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const totalNeeded = qtyPerPop * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      if (totalNeeded > 0) {
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

    Object.entries(empire.wants.per_pop).forEach(([commodity, qtyPerPop]) => {
      const totalWanted = qtyPerPop * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      if (totalWanted > 0) {
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
    const manpower = army.manpower || army.mp?.max || 0;
    const empire = state.empires?.find(e => e.id === army.empireId);
    const empireEff = empire ? getEmpireSupplyEfficiency(empire, state) : 0;
    const empireMult = Math.max(0, 1 - empireEff);

    // Ensure supply_state is initialized
    if (!army.supply_state) {
      army.supply_state = { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} };
    }

    // Reset received commodities for this tick
    army.supply_state.received = {};

    // Create buy orders for all army needs (no direct stockpile consumption)
    Object.entries(army.demands.needs || {}).forEach(([commodity, qtyPerManpower]) => {
      const totalNeeded = qtyPerManpower * manpower * effectiveRationing * supplyEfficiencyMultiplier * empireMult;

      if (totalNeeded > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('army', army.id, commodity, totalNeeded, maxPrice, 'needs', 0);
      }
    });

    // Create buy orders for all army wants (no direct stockpile consumption)
    Object.entries(army.demands.wants || {}).forEach(([commodity, qtyPerManpower]) => {
      const totalWanted = qtyPerManpower * manpower * effectiveRationing * supplyEfficiencyMultiplier * empireMult;

      if (totalWanted > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('army', army.id, commodity, totalWanted, maxPrice, 'wants', -1);
      }
    });
  });
}
