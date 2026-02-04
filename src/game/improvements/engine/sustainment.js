import { getLogger } from '../../../modules/logger.js';
import { RATIONING_CONSTANTS } from '../../constants.js';
import { getSupplyEfficiencyMultiplier, getEmpireSupplyEfficiency } from '../../economyTick/ordersPhase.js';
import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../types.js';
import { nextOrderId } from './orderIds.js';

/**
 * Process sustainment for an improvement
 * Uses internal stockpile to buffer 10 ticks of sustainment needs
 */
export function processImprovementSustainment(state, improvement) {
  const logger = getLogger();
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);

  if (!empire) {
    // Empire no longer exists, degrade improvement
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Empire not found)`);
    }
    return { log };
  }

  // Check if sustainment is needed
  const sustainmentNeeds = improvement.sustainmentCost;
  let allSatisfied = true;
  const shortages = [];

  const population = empire.stats?.population || 1;

  // Calculate effective rationing and supply efficiency (matches economyTick consumption)
  const baseRationing = RATIONING_CONSTANTS.BASE_RATIONING;
  const rationingAdd = state.coalitionModifiers?.rationing_add || 0;
  const rationingMult = state.coalitionModifiers?.rationing_mult || 1.0;
  const effectiveRationing = Math.max(
    RATIONING_CONSTANTS.MIN_RATIONING,
    Math.min(RATIONING_CONSTANTS.MAX_RATIONING, (baseRationing + rationingAdd) * rationingMult)
  );
  const supplyEfficiencyMultiplier = getSupplyEfficiencyMultiplier(state);
  const empireEff = getEmpireSupplyEfficiency(empire, state);
  const empireMult = Math.max(0, 1 - empireEff);

  const buyFromMarket = (commodity, qtyNeeded) => {
    if (qtyNeeded <= 0) return 0;
    const marketState = state.market?.[commodity];
    const sellOffers = state.marketOrders?.sellOffers;
    if (!marketState || !sellOffers || sellOffers.length === 0) return 0;

    const maxPrice = marketState.price;
    const availableSells = sellOffers
      .filter(sell => sell.commodity === commodity && (sell.qty - (sell.filled_qty || 0)) > 0)
      .filter(sell => (sell.ask_price || 0) <= maxPrice)
      .sort((a, b) => (a.ask_price || 0) - (b.ask_price || 0));

    let remaining = qtyNeeded;
    for (const sell of availableSells) {
      if (remaining <= 0) break;
      const remainingQty = sell.qty - (sell.filled_qty || 0);
      if (remainingQty <= 0) continue;

      const price = sell.ask_price || marketState.price || 1;
      const budget = Math.max(0, empire.budget_credits || 0);
      const affordable = Math.floor(Math.min(remainingQty, remaining, budget / price));
      if (affordable <= 0) continue;

      // Deduct from empire credits and reduce sell offer quantity
      empire.budget_credits -= affordable * price;
      sell.filled_qty = (sell.filled_qty || 0) + affordable;
      remaining -= affordable;
    }

    return qtyNeeded - remaining;
  };

  for (const [commodity, qty] of Object.entries(sustainmentNeeds)) {
    const needed = Math.ceil(qty * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult);

    if (needed <= 0) continue;

    // Check internal stockpile first
    const stockpile = improvement.stockpile[commodity] || 0;
    if (stockpile >= needed) {
      improvement.stockpile[commodity] -= needed;
      continue;
    }

    let remainingNeed = needed - stockpile;
    improvement.stockpile[commodity] = 0;

    // Use empire stockpile or requisition if available
    if (commodity === 'requisition') {
      const available = state.coalitionEconomy?.requisition || 0;
      const used = Math.min(available, remainingNeed);
      if (state.coalitionEconomy) {
        state.coalitionEconomy.requisition = available - used;
      }
      remainingNeed -= used;
    } else {
      const empireStockpile = empire.stockpiles?.[commodity] || 0;
      if (empireStockpile >= remainingNeed) {
        empire.stockpiles[commodity] -= remainingNeed;
        remainingNeed = 0;
      } else {
        empire.stockpiles[commodity] = 0;
        remainingNeed -= empireStockpile;
      }
    }

    // Attempt to buy remaining from market if possible
    if (remainingNeed > 0) {
      const bought = buyFromMarket(commodity, remainingNeed);
      if (bought > 0) {
        remainingNeed -= bought;
      }
    }

    // Restock internal stockpile if we have extra
    if (remainingNeed <= 0) {
      const remainingStockpileCapacity = improvement.maxStockpile - (improvement.stockpile[commodity] || 0);
      if (remainingStockpileCapacity > 0) {
        const empireStockpile = commodity === 'requisition'
          ? (state.coalitionEconomy?.requisition || 0)
          : (empire.stockpiles?.[commodity] || 0);

        const amountToAdd = Math.min(empireStockpile, remainingStockpileCapacity);
        if (amountToAdd > 0) {
          if (commodity === 'requisition') {
            if (!state.coalitionEconomy) {
              state.coalitionEconomy = { requisition: 0 };
            }
            state.coalitionEconomy.requisition = Math.max(0, (state.coalitionEconomy.requisition || 0) - amountToAdd);
          } else {
            if (!empire.stockpiles) {
              empire.stockpiles = {};
            }
            empire.stockpiles[commodity] -= amountToAdd;
          }
          improvement.stockpile[commodity] = (improvement.stockpile[commodity] || 0) + amountToAdd;
        }
      }
      continue;
    }

    // If still not satisfied, queue a market buy order
    if (remainingNeed > 0) {
      // Create market buy order if market exists
      if (state.market && state.market[commodity]) {
        const marketState = state.market[commodity];
        const maxPrice = marketState.price;

        const buyOrder = {
          id: nextOrderId('sustain'),
          owner_type: 'empire',
          owner_id: empire.id,
          commodity,
          qty: remainingNeed,
          max_price: maxPrice,
          priority: 800,
          filled_qty: 0,
          fee: 1,
          tags: {
            originator: improvement.id,
            payer: empire.id,
            beneficiary: improvement.id,
            purpose: 'sustainment'
          }
        };

        if (!state.marketOrders) {
          state.marketOrders = { buyOrders: [], sellOffers: [] };
        }
        state.marketOrders.buyOrders.push(buyOrder);
      }

      allSatisfied = false;
      shortages.push(commodity);
    }
  }

  // Update improvement state based on sustainment success
  improvement.ticksSinceSustained++;

  // Skip sustainment check during grace period (first tick after completion)
  const inGracePeriod = improvement.completedAtTick && (state.turn - improvement.completedAtTick) < 1;

  if (allSatisfied) {
    improvement.ticksSinceSustained = 0;

    // Restore to ACTIVE if was DEGRADED
    if (improvement.state === 'DEGRADED') {
      improvement.state = 'ACTIVE';
      improvement.degradedSince = null;
      log.push(`{green-fg}Restored:{/green-fg} ${improvement.name} is now ACTIVE`);
      logger.info(`Improvement restored: ${improvement.name}`);
    }
  } else if (!inGracePeriod && improvement.ticksSinceSustained >= IMPROVEMENT_SUSTAINMENT_TICKS) {
    // Degrade after 10 ticks of failed sustainment
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Missing: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks)`);
      logger.warn(`Improvement degraded: ${improvement.name} - shortages: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks without sustainment`);
    }
  }

  return { log };
}
