import { getLogger } from '../../../modules/logger.js';
import { PRODUCTION_EFFICIENCY_CONSTANTS } from '../../constants.js';
import { applySupplyCommodityMultiplier } from '../../economyBalance.js';
import { nextOrderId } from './orderIds.js';
import { allocateSustainmentFromLocalProduction } from './sustainment.js';

const QUANTITY_PRECISION = 1000;
const QUANTITY_EPSILON = 1 / QUANTITY_PRECISION;

function normalizeQty(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
  return rounded > QUANTITY_EPSILON ? rounded : 0;
}

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
    const baseScaledQty = normalizeQty(
      commodity === 'requisition'
        ? efficiencyAdjustedQty
        : efficiencyAdjustedQty * population
    );
    const scaledQty = commodity === 'requisition'
      ? baseScaledQty
      : normalizeQty(applySupplyCommodityMultiplier(commodity, baseScaledQty));
    if (scaledQty <= 0) continue;

    // Special handling for requisition - add directly to coalition economy (bypass bank)
    if (commodity === 'requisition') {
      if (!state.coalitionEconomy) {
        state.coalitionEconomy = { requisition: 0 };
      }
      if (!state.coalitionEconomy.requisition) {
        state.coalitionEconomy.requisition = 0;
      }
      state.coalitionEconomy.requisition = normalizeQty((state.coalitionEconomy.requisition || 0) + scaledQty);
      log.push(`{blue-fg}Produced:{/blue-fg} ${scaledQty.toFixed(3)} ${commodity} -> coalition economy (direct)`);
      continue;
    }

    // Accumulate commodity in production bank (no log - only log when released)
    improvement.productionBank[commodity] = normalizeQty((improvement.productionBank[commodity] || 0) + scaledQty);
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

  const upsertEmpireSellOrder = (empireId, commodity, qty, askPrice) => {
    const normalizedQty = normalizeQty(qty);
    if (normalizedQty <= 0) return null;
    const existing = state.marketOrders.sellOffers.find(order =>
      order.owner_type === 'empire' &&
      order.owner_id === empireId &&
      order.commodity === commodity &&
      (order.filled_qty || 0) < order.qty
    );

    if (existing) {
      existing.qty = normalizeQty(existing.qty + normalizedQty);
      const currentTurnAdded = existing.turn_added_turn === state.turn
        ? (existing.turn_added_qty || 0)
        : 0;
      existing.turn_added_qty = normalizeQty(currentTurnAdded + normalizedQty);
      existing.turn_added_turn = state.turn;
      existing.ask_price = askPrice;
      existing.priority = Math.max(existing.priority || 0, 100);
      existing.duration = 0;
      existing.max_duration = Number.isFinite(existing.max_duration) ? existing.max_duration : 1000000;
      return existing;
    }

    const sellOffer = {
      id: nextOrderId('prod'),
      owner_type: 'empire',
      owner_id: empireId,
      commodity,
      qty: normalizedQty,
      ask_price: askPrice,
      filled_qty: 0,
      turn_added_qty: normalizedQty,
      turn_added_turn: state.turn,
      priority: 100,
      fee: 0,
      duration: 0,
      max_duration: 1000000
    };
    state.marketOrders.sellOffers.push(sellOffer);
    return sellOffer;
  };

  // Calculate threshold based on improvement's production output per tick (efficiency-adjusted)
  const population = empire.stats?.population || 1;
  let thresholdValue = 0;

  const baseEfficiency = PRODUCTION_EFFICIENCY_CONSTANTS.BASE_EFFICIENCY;
  const efficiencyAdd = state.coalitionModifiers?.production_efficiency_add || 0;
  const efficiencyMult = state.coalitionModifiers?.production_efficiency_mult || 1.0;
  const effectiveEfficiency = Math.max(
    PRODUCTION_EFFICIENCY_CONSTANTS.MIN_EFFICIENCY,
    Math.min(PRODUCTION_EFFICIENCY_CONSTANTS.MAX_EFFICIENCY, (baseEfficiency + efficiencyAdd) * efficiencyMult)
  );

  // Calculate what would be produced this tick (for threshold)
  for (const [commodity, qty] of Object.entries(improvement.productionOutputs || {})) {
    if (commodity !== 'requisition') {
      const efficiencyAdjustedQty = qty * effectiveEfficiency;
      const baseScaledQty = efficiencyAdjustedQty * population;
      thresholdValue += applySupplyCommodityMultiplier(commodity, baseScaledQty);
    }
  }

  // Apply the threshold multiplier
  const threshold = normalizeQty(thresholdValue * (improvement.productionBankThreshold || 1));

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

    const reservedForSustainment = allocateSustainmentFromLocalProduction(state, empire.id, commodity, qty);
    const qtyForMarket = normalizeQty(qty - reservedForSustainment);

    if (reservedForSustainment > 0) {
      log.push(`{blue-fg}Produced:{/blue-fg} ${reservedForSustainment.toFixed(3)} ${commodity} -> local sustainment`);
      logger.info(`Improvement produced: ${improvement.name} (${empire.name}) routed ${reservedForSustainment.toFixed(3)} ${commodity} to local sustainment.`);
    }

    if (qtyForMarket <= 0) {
      improvement.productionBank[commodity] = 0;
      continue;
    }

    // Get market price for this commodity
    const marketState = state.market?.[commodity];
    const sellPrice = marketState?.price || marketState?.floor_price || 1.0;
    const discountedPrice = sellPrice;

    const sellOrder = upsertEmpireSellOrder(empire.id, commodity, qtyForMarket, discountedPrice);
    if (!sellOrder) continue;
    // Log "Produced" when releasing to market
    log.push(`{blue-fg}Produced:{/blue-fg} ${qtyForMarket.toFixed(3)} ${commodity} -> market @ ${discountedPrice.toFixed(2)}`);
    logger.info(`Improvement produced: ${improvement.name} (${empire.name}) released ${qtyForMarket.toFixed(3)} ${commodity} to market.`);

    // Clear from bank after releasing
    improvement.productionBank[commodity] = 0;
  }

  return { log };
}
