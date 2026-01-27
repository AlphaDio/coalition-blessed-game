/**
 * Consumption-Based Requisition System
 *
 * Converts empire commodity consumption directly into coalition requisition and credits.
 * When empires consume commodities from their stockpiles, the coalition receives:
 * - Requisition based on consumption value (share rate × consumption value / 1000)
 * - Credits from the coalition allowance (up to the allowance cap per tick)
 *
 * The system tracks consumption by commodity and calculates value based on market prices.
 */

import { getLogger } from '../modules/logger.js';

const logger = getLogger();

/**
 * Conversion rate: 1000 credits worth of commodities = 1 requisition
 */
export const CREDITS_PER_REQUISITION = 1000;

/**
 * Base coalition share of consumption value (as percentage)
 * Can be modified by multiplicative and additive modifiers
 */
export const COALITION_CONSUMPTION_SHARE_BASE = 0.10; // 10%

/**
 * Coalition allowance refill per tick
 */
export const ALLOWANCE_PER_TICK = 1000;

/**
 * Maximum allowance (in ticks worth)
 */
export const ALLOWANCE_CAP_TICKS = 4;
export const ALLOWANCE_MAX = ALLOWANCE_PER_TICK * ALLOWANCE_CAP_TICKS; // 4000

/**
 * Track consumption consumption during a turn phase
 * @type {Object} Map of commodity -> quantity consumed
 */
let turnConsumptionTracker = {};

/**
 * Initialize consumption tracking for a new turn
 */
export function initializeTurnConsumptionTracking() {
  turnConsumptionTracker = {};
}

/**
 * Record commodity consumption for requisition calculation
 * @param {string} commodityId - The commodity being consumed
 * @param {number} quantity - Amount of commodity consumed
 */
export function recordConsumption(commodityId, quantity) {
  if (quantity <= 0) return;
  turnConsumptionTracker[commodityId] = (turnConsumptionTracker[commodityId] || 0) + quantity;
}

/**
 * Get recorded consumption for a commodity
 * @param {string} commodityId - The commodity to check
 * @returns {number} Quantity consumed
 */
export function getRecordedConsumption(commodityId) {
  return turnConsumptionTracker[commodityId] || 0;
}

/**
 * Calculate the credit value of consumption based on market prices
 * @param {Object} market - The market state object (per-commodity market states)
 * @returns {number} Total credit value of recorded consumption
 */
export function calculateConsumptionValue(market) {
  let totalValue = 0;

  for (const [commodityId, quantity] of Object.entries(turnConsumptionTracker)) {
    if (quantity <= 0) continue;

    // Get market price for this commodity
    const commodityMarket = market[commodityId];
    let price = 1.0; // Default price

    if (commodityMarket) {
      // Use current market price if available
      price = commodityMarket.price || commodityMarket.last_price || 1.0;
    }

    const commodityValue = quantity * price;
    totalValue += commodityValue;
  }

  return totalValue;
}

/**
 * Calculate effective coalition share rate with modifiers
 * @param {Object} modifiers - Aggregate modifiers: { multiplicativeShare: 1.0, additiveShare: 0 }
 * @returns {number} Effective share rate (clamped between 0 and 1)
 */
export function calculateEffectiveShareRate(modifiers = {}) {
  let shareRate = COALITION_CONSUMPTION_SHARE_BASE;
  
  // Apply multiplicative modifier
  if (modifiers.multiplicativeShare) {
    shareRate *= modifiers.multiplicativeShare;
  }
  
  // Apply additive modifier
  if (modifiers.additiveShare) {
    shareRate += modifiers.additiveShare;
  }
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, shareRate));
}

/**
 * Process commodity consumption and convert to coalition requisition and credits.
 * Called at the end of turn phase after all consumption has been recorded.
 *
 * @param {Object} market - The market state object (containing per-commodity market states)
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @param {Object} modifiers - Optional modifiers: { multiplicativeShare, additiveShare }
 * @returns {Object} Consumption summary: { totalConsumed, coalitionValue, requisitionGained, creditsGained, creditsSpent }
 */
export function processConsumptionToRequisition(market, coalitionEconomy, modifiers = {}) {
  if (!coalitionEconomy) {
    return { totalConsumed: 0, coalitionValue: 0, requisitionGained: 0, creditsGained: 0, creditsSpent: 0 };
  }

  if (!coalitionEconomy.requisition) {
    coalitionEconomy.requisition = 0;
  }
  if (!coalitionEconomy.allowance_credits) {
    coalitionEconomy.allowance_credits = 0;
  }

  // Calculate total value of consumption
  const totalConsumedValue = calculateConsumptionValue(market);

  // Get effective share rate with modifiers
  const effectiveShareRate = calculateEffectiveShareRate(modifiers);

  // Coalition receives a percentage of consumption value as requisition
  const coalitionValue = totalConsumedValue * effectiveShareRate;

  // Convert credits to requisition (1000 credits = 1 requisition)
  const requisitionGained = coalitionValue / CREDITS_PER_REQUISITION;

  coalitionEconomy.requisition += requisitionGained;

  // Also grant credits from the allowance pool (up to what's available)
  // The coalition gets the same credit value, but it comes from allowance
  const creditsGranted = coalitionValue;
  const creditsSpent = Math.min(creditsGranted, coalitionEconomy.allowance_credits);
  coalitionEconomy.allowance_credits -= creditsSpent;

  if (requisitionGained > 0.001 || creditsSpent > 0.001) {
    const consumedCount = Object.values(turnConsumptionTracker).reduce((sum, qty) => sum + qty, 0);
    logger.debug(
      `Consumption conversion: ${totalConsumedValue.toFixed(2)} consumed value ` +
      `(${consumedCount} total units) @ ${(effectiveShareRate * 100).toFixed(1)}% share ` +
      `-> ${coalitionValue.toFixed(2)} credits ` +
      `-> +${requisitionGained.toFixed(3)} requisition, +${creditsSpent.toFixed(0)} credits from allowance`
    );
  }

  return {
    totalConsumed: Object.values(turnConsumptionTracker).reduce((sum, qty) => sum + qty, 0),
    coalitionValue: coalitionValue,
    requisitionGained: requisitionGained,
    creditsGranted: creditsGranted,
    creditsSpent: creditsSpent
  };
}

/**
 * Refill coalition allowance each tick
 * @param {Object} coalitionEconomy - The coalition economy state object
 */
export function refillCoalitionAllowance(coalitionEconomy) {
  if (!coalitionEconomy) return;
  
  coalitionEconomy.allowance_credits = Math.min(
    (coalitionEconomy.allowance_credits || 0) + ALLOWANCE_PER_TICK,
    ALLOWANCE_MAX
  );
}

/**
 * Get requisition display value
 */
export function getRequisitionDisplay(economy) {
  return {
    requisition_int: Math.floor(economy.requisition || 0),
    milli_remainder: Math.round(((economy.requisition || 0) % 1) * 1000)
  };
}
