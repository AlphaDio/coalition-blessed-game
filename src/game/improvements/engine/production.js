import { getLogger } from '../../../modules/logger.js';
import { PRODUCTION_EFFICIENCY_CONSTANTS } from '../../constants.js';
import { applySupplyCommodityMultiplier } from '../../economyBalance.js';
import { addProductionSellOffer, DEFAULT_SELL_ORDER_MAX_DURATION } from '../../economyTick/orders.js';
import { allocateSustainmentFromLocalProduction, calculateImprovementNeed } from './sustainment.js';

const QUANTITY_PRECISION = 1000;
const QUANTITY_EPSILON = 1 / QUANTITY_PRECISION;

function normalizeQty(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
  return rounded > QUANTITY_EPSILON ? rounded : 0;
}

function normalizeSignedQty(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
  return Math.abs(rounded) > QUANTITY_EPSILON ? rounded : 0;
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
      if (!Number.isFinite(state.coalitionEconomy.requisition)) {
        state.coalitionEconomy.requisition = 0;
      }
      // Requisition is an account balance, so production must repay debt instead
      // of passing the signed balance through the positive-only quantity helper.
      state.coalitionEconomy.requisition = normalizeSignedQty(
        state.coalitionEconomy.requisition + scaledQty
      );
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
 * Only releases when the surplus-based threshold is met.
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

  // Local sustainment can draw from the bank every turn. Waiting for a market
  // batch first can degrade a project before it can use its own production.
  for (const [commodity, qty] of Object.entries(improvement.productionBank || {})) {
    const used = allocateSustainmentFromLocalProduction(state, empire.id, commodity, qty);
    if (used > 0) {
      improvement.productionBank[commodity] = normalizeQty(qty - used);
      logger.debug(`${improvement.name}: ${used.toFixed(3)} ${commodity} reserved for local sustainment`);
    }
  }

  // Batch the expected surplus, not output already needed to run the project.
  // Otherwise a small valuable output can wait indefinitely behind an input
  // that the project consumes as quickly as it produces.
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
      const output = normalizeQty(applySupplyCommodityMultiplier(commodity, baseScaledQty));
      const ownInput = calculateImprovementNeed(state, empire, commodity, improvement.sustainmentCost?.[commodity] || 0);
      thresholdValue += Math.max(0, output - ownInput);
    }
  }

  // Apply the threshold multiplier
  const bankTurns = improvement.productionBankThreshold || 1;
  const threshold = normalizeQty(thresholdValue * bankTurns);

  // Check if total accumulated production meets threshold
  let totalAccumulated = 0;
  for (const qty of Object.values(improvement.productionBank || {})) {
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
  // Let each batch bridge the normal bank release interval.
  const maxDuration = Math.max(DEFAULT_SELL_ORDER_MAX_DURATION, Math.ceil(bankTurns));
  for (const [commodity, qty] of Object.entries(improvement.productionBank || {})) {
    if (qty <= 0) continue;

    const qtyForMarket = normalizeQty(qty);
    if (qtyForMarket <= 0) continue;

    // Get market price for this commodity
    const marketState = state.market?.[commodity];
    const sellPrice = marketState?.price || marketState?.floor_price || 1.0;
    addProductionSellOffer(state.marketOrders.sellOffers, state.turn, 'empire', empire.id,
      commodity, qtyForMarket, sellPrice, 100, maxDuration);
    // Log "Produced" when releasing to market
    log.push(`{blue-fg}Produced:{/blue-fg} ${qtyForMarket.toFixed(3)} ${commodity} -> market @ ${sellPrice.toFixed(2)}`);
    logger.info(`Improvement produced: ${improvement.name} (${empire.name}) released ${qtyForMarket.toFixed(3)} ${commodity} to market.`);

    // Clear from bank after releasing
    improvement.productionBank[commodity] = 0;
  }

  return { log };
}
