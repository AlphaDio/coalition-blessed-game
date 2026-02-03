import { getLogger } from '../../../modules/logger.js';
import { PRODUCTION_EFFICIENCY_CONSTANTS } from '../../constants.js';
import { nextOrderId } from './orderIds.js';

/**
 * Process production outputs for an improvement
 * Accumulates in production bank, held until threshold is met
 */
export function processImprovementProduction(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);

  if (!empire) return { log };

  const population = empire.stats?.population || 1;

  // Calculate effective production efficiency with modifiers
  const baseEfficiency = PRODUCTION_EFFICIENCY_CONSTANTS.BASE_EFFICIENCY;
  const efficiencyAdd = state.coalitionModifiers?.production_efficiency_add || 0;
  const efficiencyMult = state.coalitionModifiers?.production_efficiency_mult || 1.0;
  const effectiveEfficiency = Math.max(
    PRODUCTION_EFFICIENCY_CONSTANTS.MIN_EFFICIENCY,
    Math.min(PRODUCTION_EFFICIENCY_CONSTANTS.MAX_EFFICIENCY, (baseEfficiency + efficiencyAdd) * efficiencyMult)
  );

  // Initialize production bank if needed
  if (!improvement.productionBank) {
    improvement.productionBank = {};
  }

  // Process production outputs - accumulate in production bank
  for (const [commodity, qty] of Object.entries(improvement.productionOutputs)) {
    // Apply production efficiency to base quantity before scaling
    const efficiencyAdjustedQty = qty * effectiveEfficiency;
    const scaledQty = commodity === 'requisition'
      ? Math.floor(efficiencyAdjustedQty)
      : Math.floor(efficiencyAdjustedQty * population);
    if (scaledQty <= 0) continue;

    // Special handling for requisition - add directly to coalition economy (bypass bank)
    if (commodity === 'requisition') {
      if (!state.coalitionEconomy) {
        state.coalitionEconomy = { requisition: 0 };
      }
      if (!state.coalitionEconomy.requisition) {
        state.coalitionEconomy.requisition = 0;
      }
      state.coalitionEconomy.requisition += scaledQty;
      log.push(`{blue-fg}Produced:{/blue-fg} ${scaledQty} ${commodity} -> coalition economy (direct)`);
      continue;
    }

    // Accumulate commodity in production bank (no log - only log when released)
    improvement.productionBank[commodity] = (improvement.productionBank[commodity] || 0) + scaledQty;
  }

  return { log };
}

/**
 * Release accumulated production from improvement's bank to the market as sell offers
 * Only releases when threshold is met (based on production output per tick)
 */
export function releaseProductionFromBank(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  const logger = getLogger();

  if (!empire) return { log };

  // Initialize market orders if needed
  if (!state.marketOrders) {
    state.marketOrders = { buyOrders: [], sellOffers: [] };
  }

  // Calculate threshold based on improvement's production output per tick
  const population = empire.stats?.population || 1;
  let thresholdValue = 0;

  // Calculate what would be produced this tick (for threshold)
  for (const [commodity, qty] of Object.entries(improvement.productionOutputs || {})) {
    if (commodity !== 'requisition') {
      thresholdValue += Math.floor(qty * population);
    }
  }

  // Apply the threshold multiplier
  const threshold = thresholdValue * (improvement.productionBankThreshold || 1);

  // Check if total accumulated production meets threshold
  let totalAccumulated = 0;
  for (const qty of Object.values(improvement.productionBank)) {
    totalAccumulated += qty;
  }

  // Only release if threshold is met
  if (totalAccumulated < threshold) {
    // Threshold not met, don't release
    // Log to file/Logs view only (not in-game log) to reduce noise
    const holdMessage = threshold > 0 ? `(${totalAccumulated}/${Math.ceil(threshold)} to release)` : '';
    if (totalAccumulated > 0) {
      logger.debug(`Holding: ${improvement.name} production bank accumulating ${holdMessage}`);
    }
    return { log };
  }

  // Release all accumulated production from bank to market
  for (const [commodity, qty] of Object.entries(improvement.productionBank)) {
    if (qty <= 0) continue;

    // Get market price for this commodity
    const marketState = state.market?.[commodity];
    const sellPrice = marketState?.price || marketState?.floor_price || 1.0;
    const discountedPrice = sellPrice;

    const sellOffer = {
      id: nextOrderId('prod'),
      owner_type: 'empire',
      owner_id: empire.id,
      commodity,
      qty: qty,
      ask_price: discountedPrice,
      filled_qty: 0,
      priority: 100, // Normal priority
      fee: 0,
      tags: {
        originator: improvement.id,
        producer: improvement.id,
        beneficiary: empire.id,
        purpose: 'production'
      }
    };

    state.marketOrders.sellOffers.push(sellOffer);
    // Log "Produced" when releasing to market
    log.push(`{blue-fg}Produced:{/blue-fg} ${qty} ${commodity} -> market @ ${discountedPrice.toFixed(2)}`);
    logger.info(`Improvement produced: ${improvement.name} (${empire.name}) released ${qty} ${commodity} to market.`);

    // Clear from bank after releasing
    improvement.productionBank[commodity] = 0;
  }

  return { log };
}
