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

export function emitEmpireNeedsOrders(state, aggregateBuyOrder, effectiveRationing) {
  state.empires.forEach(empire => {
    if (!empire.needs || !empire.needs.per_pop) return;
    const population = empire.stats?.population || 0;

    if (!empire.economy_spend) {
      empire.economy_spend = { needs: 0, wants: 0, order_fees: 0 };
    }

    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const totalNeeded = qtyPerPop * population * effectiveRationing;
      if (totalNeeded > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('empire', empire.id, commodity, totalNeeded, maxPrice, 'needs', 1);
      }
    });
  });
}

export function emitEmpireWantsOrders(state, aggregateBuyOrder, effectiveRationing) {
  state.empires.forEach(empire => {
    if (!empire.wants || !empire.wants.per_pop) return;
    const population = empire.stats?.population || 0;

    Object.entries(empire.wants.per_pop).forEach(([commodity, qtyPerPop]) => {
      const totalWanted = qtyPerPop * population * effectiveRationing;
      if (totalWanted > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('empire', empire.id, commodity, totalWanted, maxPrice, 'wants', 0);
      }
    });
  });
}

export function emitArmyOrders(state, aggregateBuyOrder, effectiveRationing) {
  state.armies.forEach(army => {
    if (!army.demands) return;
    const manpower = army.manpower || army.mp?.max || 0;

    // Ensure supply_state is initialized
    if (!army.supply_state) {
      army.supply_state = { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} };
    }

    // Reset received commodities for this tick
    army.supply_state.received = {};

    // Create buy orders for all army needs (no direct stockpile consumption)
    Object.entries(army.demands.needs || {}).forEach(([commodity, qtyPerManpower]) => {
      const totalNeeded = qtyPerManpower * manpower * effectiveRationing;

      if (totalNeeded > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('army', army.id, commodity, totalNeeded, maxPrice, 'needs', 0);
      }
    });

    // Create buy orders for all army wants (no direct stockpile consumption)
    Object.entries(army.demands.wants || {}).forEach(([commodity, qtyPerManpower]) => {
      const totalWanted = qtyPerManpower * manpower * effectiveRationing;

      if (totalWanted > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice;

        aggregateBuyOrder('army', army.id, commodity, totalWanted, maxPrice, 'wants', -1);
      }
    });
  });
}
