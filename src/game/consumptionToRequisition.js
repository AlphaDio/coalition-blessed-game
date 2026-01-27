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
import { CONSUMPTION_REQUISITION_CONSTANTS } from './constants.js';

const logger = getLogger();

/**
 * Conversion rate: 1000 credits worth of commodities = 1 requisition
 */
export const CREDITS_PER_REQUISITION = CONSUMPTION_REQUISITION_CONSTANTS.CREDITS_PER_REQUISITION;

/**
 * Base coalition share of consumption value (as percentage)
 * Can be modified by multiplicative and additive modifiers
 */
export const COALITION_CONSUMPTION_SHARE_BASE = CONSUMPTION_REQUISITION_CONSTANTS.COALITION_CONSUMPTION_SHARE_BASE; // 10%

/**
 * Multiplier for requisition obtained from conversion (affects the conversion rate)
 * 10x multiplier means consumption-based requisition is 10x more valuable
 */
export const CONVERSION_REQUISITION_MULTIPLIER = CONSUMPTION_REQUISITION_CONSTANTS.CONVERSION_REQUISITION_MULTIPLIER;

/**
 * Coalition allowance refill per tick
 */
export const ALLOWANCE_PER_TICK = CONSUMPTION_REQUISITION_CONSTANTS.ALLOWANCE_PER_TICK;

/**
 * Maximum allowance (in ticks worth)
 */
export const ALLOWANCE_CAP_TICKS = CONSUMPTION_REQUISITION_CONSTANTS.ALLOWANCE_CAP_TICKS;
export const ALLOWANCE_MAX = ALLOWANCE_PER_TICK * ALLOWANCE_CAP_TICKS; // 4000

/**
 * Track consumption during a turn phase
 * @type {Object} Map of empireId -> { commodity -> quantity consumed }
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
 * @param {string} empireId - ID of the empire consuming the commodity
 */
export function recordConsumption(commodityId, quantity, empireId) {
  if (quantity <= 0) return;
  
  // Initialize empire consumption tracker if needed
  if (!turnConsumptionTracker[empireId]) {
    turnConsumptionTracker[empireId] = {};
  }
  
  turnConsumptionTracker[empireId][commodityId] = (turnConsumptionTracker[empireId][commodityId] || 0) + quantity;
}

/**
 * Get recorded consumption for a commodity from an empire
 * @param {string} commodityId - The commodity to check
 * @param {string} empireId - ID of the empire (optional, returns total if not specified)
 * @returns {number} Quantity consumed
 */
export function getRecordedConsumption(commodityId, empireId) {
  if (empireId) {
    return (turnConsumptionTracker[empireId]?.[commodityId]) || 0;
  }
  
  // Return total across all empires if empireId not specified
  let total = 0;
  for (const empirConsumption of Object.values(turnConsumptionTracker)) {
    total += empirConsumption[commodityId] || 0;
  }
  return total;
}

/**
 * Calculate the credit value of consumption based on market prices
 * @param {Object} market - The market state object (per-commodity market states)
 * @param {string} empireId - Optional empire ID to calculate value for specific empire only
 * @returns {number} Total credit value of recorded consumption
 */
export function calculateConsumptionValue(market, empireId) {
  let totalValue = 0;
  
  const consumptionData = empireId ? turnConsumptionTracker[empireId] : {};

  for (const [commodityId, quantity] of Object.entries(consumptionData || {})) {
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
 * Requisition gained is multiplied by 10x and scaled by each empire's approval rating.
 *
 * @param {Object} market - The market state object (containing per-commodity market states)
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @param {Object} modifiers - Optional modifiers: { multiplicativeShare, additiveShare }
 * @param {Array} empires - Array of empire objects (needed to get approval ratings)
 * @returns {Object} Consumption summary: { totalConsumed, coalitionValue, requisitionGained, creditsGained, creditsSpent }
 */
export function processConsumptionToRequisition(market, coalitionEconomy, modifiers = {}, empires = []) {
  if (!coalitionEconomy) {
    return { totalConsumed: 0, coalitionValue: 0, requisitionGained: 0, creditsGained: 0, creditsSpent: 0 };
  }

  if (!coalitionEconomy.requisition) {
    coalitionEconomy.requisition = 0;
  }
  if (!coalitionEconomy.allowance_credits) {
    coalitionEconomy.allowance_credits = 0;
  }

  // Get effective share rate with modifiers
  const effectiveShareRate = calculateEffectiveShareRate(modifiers);

  let totalRequisitionGained = 0;
  let totalCreditsGranted = 0;
  let totalCreditsSpent = 0;
  let totalConsumedValue = 0;

  // Process consumption per empire to apply approval scaling
  for (const empireId in turnConsumptionTracker) {
    // Find the empire object to get approval rating
    const empire = empires.find(e => String(e.id) === String(empireId));
    if (!empire) continue;

    // Calculate consumption value for this empire
    const empireConsumptionValue = calculateConsumptionValue(market, empireId);
    totalConsumedValue += empireConsumptionValue;

    // Coalition receives a percentage of consumption value as requisition
    const coalitionValue = empireConsumptionValue * effectiveShareRate;

    // Apply 10x multiplier and scale by empire's approval rating
    // Approval ranges from 0-100, so this scales from 0% to 100% of the multiplied value
    const approvalScale = (empire.approval || 0) / 100;
    const scaledCoalitionValue = coalitionValue * CONVERSION_REQUISITION_MULTIPLIER * approvalScale;

    // Convert credits to requisition (1000 credits = 1 requisition)
    const requisitionGained = scaledCoalitionValue / CREDITS_PER_REQUISITION;

    coalitionEconomy.requisition += requisitionGained;
    totalRequisitionGained += requisitionGained;

    // Also grant credits from the allowance pool (up to what's available)
    const creditsGranted = scaledCoalitionValue;
    const creditsSpent = Math.min(creditsGranted, coalitionEconomy.allowance_credits);
    coalitionEconomy.allowance_credits -= creditsSpent;
    totalCreditsGranted += creditsGranted;
    totalCreditsSpent += creditsSpent;

    if (requisitionGained > 0.001 || creditsSpent > 0.001) {
      const consumedCount = Object.values(turnConsumptionTracker[empireId] || {}).reduce((sum, qty) => sum + qty, 0);
      logger.debug(
        `[${empire.name}] Consumption conversion: ${empireConsumptionValue.toFixed(2)} consumed value ` +
        `(${consumedCount} units) @ ${(effectiveShareRate * 100).toFixed(1)}% share ` +
        `-> ${coalitionValue.toFixed(2)} base credits ` +
        `-> ${scaledCoalitionValue.toFixed(2)} credits (10x multiplier × ${(approvalScale * 100).toFixed(1)}% approval) ` +
        `-> +${requisitionGained.toFixed(3)} requisition, +${creditsSpent.toFixed(0)} credits from allowance`
      );
    }
  }

  return {
    totalConsumed: Object.values(turnConsumptionTracker).reduce((sum, empireConsumption) => {
      return sum + Object.values(empireConsumption || {}).reduce((s, qty) => s + qty, 0);
    }, 0),
    coalitionValue: totalConsumedValue,
    requisitionGained: totalRequisitionGained,
    creditsGranted: totalCreditsGranted,
    creditsSpent: totalCreditsSpent
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
