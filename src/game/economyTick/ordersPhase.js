import { ECONOMY_BALANCE_CONSTANTS, ECONOMY_CONSTANTS, MARKET_CONSTANTS, RATIONING_CONSTANTS } from '../constants.js';
import { applyDemandCommodityMultiplier } from '../economyBalance.js';
import { getEmpireTechModifier } from '../empireModifiers.js';
import { getArmyPopulationDemandMultiplier, getEmpireEffectiveDemandPopulation } from '../consumptionScaling.js';
import { CONSUMPTION_SOURCES, recordConsumption } from '../consumptionToRequisition.js';

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
 * Seed finite essential reserves for new games, sized to initial demand.
 */
export function initializeStarterNeedsStockpiles(state) {
  const coalitionEconomy = state?.coalitionEconomy;
  if (!coalitionEconomy || state.turn !== 1 || coalitionEconomy.starter_stockpiles_initialized) {
    return;
  }

  const reserveTurns = Math.max(0, Number(ECONOMY_CONSTANTS.STARTER_NEEDS_RESERVE_TURNS) || 0);
  const effectiveRationing = getEffectiveRationing(state);
  const supplyEfficiencyMultiplier = getSupplyEfficiencyMultiplier(state);
  const demandMultiplier = Math.max(0, ECONOMY_CONSTANTS.EMPIRE_NEEDS_WANTS_DEMAND_MULTIPLIER || 1);

  state.empires.forEach(empire => {
    if (!empire.needs?.per_pop) return;

    const population = getEmpireEffectiveDemandPopulation(empire.stats?.population || 0);
    const empireEff = getEmpireSupplyEfficiency(empire, state);
    const empireMult = Math.max(0, 1 - empireEff);
    empire.stockpiles = empire.stockpiles || {};

    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const rawNeeded = qtyPerPop * population * demandMultiplier * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalNeeded = applyDemandCommodityMultiplier(commodity, rawNeeded, state);
      if (totalNeeded <= 0) return;

      const existingStockpile = Number.isFinite(empire.stockpiles[commodity])
        ? empire.stockpiles[commodity]
        : 0;
      empire.stockpiles[commodity] = Math.max(existingStockpile, totalNeeded * reserveTurns);
    });
  });

  coalitionEconomy.starter_stockpiles_initialized = true;
}

/** Use reserves only for essential demand the market could not meet. */
export function consumeStarterNeedsStockpiles(state, buyOrders) {
  for (const empire of state.empires) {
    for (const [commodity, demand] of Object.entries(empire.supply_state?.needs_demand || {})) {
      const received = empire.supply_state.needs_received?.[commodity] || 0;
      const available = Math.max(0, Number(empire.stockpiles?.[commodity]) || 0);
      const amount = Math.min(available, Math.max(0, demand - received));
      if (amount <= 0) continue;

      empire.stockpiles[commodity] = available - amount;
      empire.supply_state.received[commodity] = (empire.supply_state.received[commodity] || 0) + amount;
      empire.supply_state.needs_received[commodity] = received + amount;
      empire.supply_state.needs_reserve_used[commodity] = amount;
      recordConsumption(commodity, amount, empire.id, CONSUMPTION_SOURCES.EMPIRE_NEEDS);

      // The reserve satisfies demand, so it must not also remain as backlog.
      let remaining = amount;
      for (const order of buyOrders) {
        if (remaining <= 0) break;
        if (order.owner_type !== 'empire' || order.owner_id !== empire.id ||
            order.commodity !== commodity || order.category !== 'needs' || order.tags?.army_id ||
            order.tags?.purpose) continue;
        const unfilled = Math.max(0, order.qty - (order.filled_qty || 0));
        const covered = Math.min(remaining, unfilled);
        order.qty -= covered;
        remaining -= covered;
      }
    }
  }
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
    // Reset supply state for this tick
    if (!empire.supply_state) {
      empire.supply_state = { needs_demand: {}, wants_demand: {}, received: {}, needs_fulfillment: {}, wants_fulfillment: {} };
    }
    empire.supply_state.needs_demand = {};
    empire.supply_state.received = {};
    empire.supply_state.needs_received = {};
    empire.supply_state.wants_received = {};
    empire.supply_state.needs_reserve_used = {};

    if (!empire.needs || !empire.needs.per_pop) return;
    const population = getEmpireEffectiveDemandPopulation(empire.stats?.population || 0);
    const demandMultiplier = Math.max(0, ECONOMY_CONSTANTS.EMPIRE_NEEDS_WANTS_DEMAND_MULTIPLIER || 1);
    const empireEff = getEmpireSupplyEfficiency(empire, state);
    const empireMult = Math.max(0, 1 - empireEff);

    if (!empire.economy_spend) {
      empire.economy_spend = { needs: 0, wants: 0, order_fees: 0 };
    }

    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const rawNeeded = qtyPerPop * population * demandMultiplier * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalNeeded = applyDemandCommodityMultiplier(commodity, rawNeeded, state);
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
  const activeByEmpire = new Map();
  for (const improvement of state.improvements?.queue || []) {
    if (improvement.state === 'ACTIVE') {
      activeByEmpire.set(improvement.empireId, (activeByEmpire.get(improvement.empireId) || 0) + 1);
    }
  }
  state.empires.forEach(empire => {
    if (!empire.wants || !empire.wants.per_pop) return;
    const population = getEmpireEffectiveDemandPopulation(empire.stats?.population || 0);
    const demandMultiplier = Math.max(0, ECONOMY_CONSTANTS.EMPIRE_NEEDS_WANTS_DEMAND_MULTIPLIER || 1);
    const developmentBonus = Math.min(
      ECONOMY_BALANCE_CONSTANTS.MAX_DEVELOPMENT_WANTS_BONUS,
      (activeByEmpire.get(empire.id) || 0) * ECONOMY_BALANCE_CONSTANTS.WANTS_BONUS_PER_ACTIVE_IMPROVEMENT
    );
    const empireEff = getEmpireSupplyEfficiency(empire, state);
    const empireMult = Math.max(0, 1 - empireEff);

    // Ensure supply state exists (needs phase may not have created it for wants-only empires)
    if (!empire.supply_state) {
      empire.supply_state = { needs_demand: {}, wants_demand: {}, received: {}, needs_fulfillment: {}, wants_fulfillment: {} };
    }
    empire.supply_state.wants_demand = {};

    Object.entries(empire.wants.per_pop).forEach(([commodity, qtyPerPop]) => {
      const rawWanted = qtyPerPop * population * demandMultiplier * (1 + developmentBonus) *
        effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalWanted = applyDemandCommodityMultiplier(commodity, rawWanted, state);
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

    const population = Math.max(1000, Number(empire.stats?.population || 0));
    // Armies inherit demand pressure from their empire's population base with
    // diminishing scaling so large populations do not explode market volumes.
    const populationDemandMultiplier = getArmyPopulationDemandMultiplier(population);
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
        ? qtyPerManpower * missingMP * populationDemandMultiplier * effectiveRationing * supplyEfficiencyMultiplier * empireMult
        : 0;
      const totalNeeded = applyDemandCommodityMultiplier(commodity, rawNeeded, state);
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
      const rawWanted = qtyPerManpower * maxMP * populationDemandMultiplier * effectiveRationing * supplyEfficiencyMultiplier * empireMult;
      const totalWanted = applyDemandCommodityMultiplier(commodity, rawWanted, state);
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
