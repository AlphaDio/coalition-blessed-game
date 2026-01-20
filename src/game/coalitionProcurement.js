/**
 * Coalition Procurement and Supply Conversion System
 *
 * Manages coalition-level commodity procurement from market surplus
 * and batch conversion to supplies using milli-supply precision.
 */

import { getLogger } from '../modules/logger.js';
import { THETA_PRESETS, COMMODITY_DEFINITIONS, MILLI_PER_UNIT_BY_TIER, BATCH_SIZE_UNITS, BATCH_BONUS_MILLI } from './types.js';

const logger = getLogger();

/**
 * Coalition allowance and procurement settings
 */
export const ALLOWANCE_PER_TICK = 100;
export const ALLOWANCE_CAP_TICKS = 6;
export const RESERVE_FLOOR_CREDITS = 1500;

/**
 * Refill coalition allowance credits each tick
 * @param {Object} coalitionEconomy - The coalition economy state object
 */
export function refillCoalitionAllowance(coalitionEconomy) {
  const maxAllowance = ALLOWANCE_PER_TICK * ALLOWANCE_CAP_TICKS;

  coalitionEconomy.allowance_credits = Math.min(
    coalitionEconomy.allowance_credits + ALLOWANCE_PER_TICK,
    maxAllowance
  );
}

/**
 * Calculate spend caps for coalition procurement
 * @param {Object} coalitionEconomy - The coalition economy state object
 */
export function calculateSpendCaps(coalitionEconomy) {
  const spendCap = Math.min(
    coalitionEconomy.allowance_credits,
    Math.max(0, coalitionEconomy.treasury_credits - RESERVE_FLOOR_CREDITS)
  );

  const targetSpend = Math.floor(spendCap * coalitionEconomy.procurement.spend_throttle);

  return { spendCap, targetSpend };
}

/**
 * Execute coalition procurement from post-clear market surplus
 * @param {Object} market - The market state object (containing per-commodity market states)
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @param {Object} config - Economy configuration
 * @returns {Array} Array of log entries for purchases made
 */
export function executeCoalitionProcurement(market, coalitionEconomy, config) {
  const { spendCap, targetSpend } = calculateSpendCaps(coalitionEconomy);

  if (targetSpend <= 0) {
    logger.debug('Coalition procurement: No spending capacity available');
    return [];
  }

  // Get eligible offers from post-clear surplus (per-commodity market structure)
  const eligibleOffers = getEligibleOffers(market, coalitionEconomy);

  if (eligibleOffers.length === 0) {
    logger.debug('Coalition procurement: No eligible offers available');
    return [];
  }

  // Sort deterministically
  eligibleOffers.sort((a, b) => {
    if (a.ask_price !== b.ask_price) return a.ask_price - b.ask_price;
    if (a.qty !== b.qty) return b.qty - a.qty; // Higher qty first
    if (a.seller_id !== b.seller_id) return a.seller_id.localeCompare(b.seller_id);
    return a.offer_id.localeCompare(b.offer_id);
  });

  let spent = 0;
  const logEntries = [];
  let remainingSpend = targetSpend;

  // Purchase loop
  for (const offer of eligibleOffers) {
    if (spent >= targetSpend) break;
    if (remainingSpend < offer.ask_price) break;

    const buyQty = Math.min(
      offer.qty,
      Math.floor(remainingSpend / offer.ask_price)
    );

    if (buyQty <= 0) continue;

    const cost = buyQty * offer.ask_price;

    // Execute purchase
    coalitionEconomy.stockpile_by_commodity[offer.commodity_id] =
      (coalitionEconomy.stockpile_by_commodity[offer.commodity_id] || 0) + buyQty;

    offer.qty -= buyQty;
    spent += cost;
    remainingSpend -= cost;

    const logEntry = `Coalition procured ${buyQty} ${offer.commodity_id} for ${cost} credits`;
    logEntries.push(logEntry);
    logger.debug(logEntry);
  }

  // Deduct from treasury and allowance
  coalitionEconomy.treasury_credits -= spent;
  coalitionEconomy.allowance_credits -= spent;

  logger.debug(`Coalition procurement completed: spent ${spent}/${targetSpend} credits`);

  return logEntries;
}

/**
 * Get eligible offers for coalition procurement
 * @param {Object} market - The market state object (containing per-commodity market states)
 * @param {Object} coalitionEconomy - The coalition economy state object
 */
function getEligibleOffers(market, coalitionEconomy) {
  if (!market) {
    return [];
  }

  const eligible = [];

  // Iterate over per-commodity market states
  for (const [commodityId, commodityMarket] of Object.entries(market)) {
    // Skip non-object entries or metadata
    if (!commodityMarket || typeof commodityMarket !== 'object') continue;
    if (!commodityMarket.remaining_sell_offers_post_clear) continue;

    const refPrice = commodityMarket.price || commodityMarket.last_price || commodityMarket.floor_price || null;
    if (!refPrice) continue;

    for (const offer of commodityMarket.remaining_sell_offers_post_clear) {
      if (offer.qty <= 0) continue;

      // Ensure commodity_id is set on the offer
      const offerId = offer.commodity_id || offer.commodity || commodityId;

      const thetaPreset = coalitionEconomy.procurement.theta_preset_by_commodity[offerId] || 'Balanced';
      const theta = THETA_PRESETS[thetaPreset];
      const threshold = refPrice * theta;

      if (offer.ask_price <= threshold) {
        eligible.push({
          ...offer,
          commodity_id: offerId
        });
      }
    }
  }

  return eligible;
}

/**
 * Execute batch conversion from stockpiles to milli-supplies
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @param {Object} config - Economy configuration
 * @returns {Array} Array of log entries for conversions made
 */
export function executeSupplyConversion(coalitionEconomy, config) {
  const logEntries = [];
  let totalConvertedUnits = 0;

  for (const [commodityId, stockQty] of Object.entries(coalitionEconomy.stockpile_by_commodity)) {
    if (stockQty < BATCH_SIZE_UNITS) continue;

    const commodityDef = COMMODITY_DEFINITIONS[commodityId];
    if (!commodityDef) continue;

    const tier = commodityDef.tier;
    const milliPerUnit = MILLI_PER_UNIT_BY_TIER[tier];

    const convertQty = Math.floor(stockQty / BATCH_SIZE_UNITS) * BATCH_SIZE_UNITS;
    const gainMilli = convertQty * milliPerUnit;

    // Execute conversion
    coalitionEconomy.stockpile_by_commodity[commodityId] -= convertQty;
    coalitionEconomy.supply_milli += gainMilli;
    totalConvertedUnits += convertQty;

    const logEntry = `Coalition converted ${convertQty} ${commodityId} to ${gainMilli} milli-supplies`;
    logEntries.push(logEntry);
    logger.debug(logEntry);
  }

  // Add batch conversion bonus
  const batchBonus = Math.floor(totalConvertedUnits / BATCH_SIZE_UNITS) * BATCH_BONUS_MILLI;
  if (batchBonus > 0) {
    coalitionEconomy.supply_milli += batchBonus;
    logger.debug(`Coalition gained ${batchBonus} milli-supplies from batch conversion bonus`);
  }

  logger.debug(`Supply conversion completed: ${logEntries.length} commodity batches processed, ${Math.floor(totalConvertedUnits / BATCH_SIZE_UNITS)} total batches`);

  return logEntries;
}

/**
 * Get supplies display value (integer supplies from milli)
 */
export function getSuppliesDisplay(economy) {
  return {
    supplies_int: Math.floor(economy.supply_milli / 1000),
    milli_remainder: economy.supply_milli % 1000
  };
}

/**
 * Initialize coalition procurement settings with defaults
 * @returns {Object} A new coalition economy state object with default values
 */
export function initializeCoalitionProcurement() {
  const coalitionEconomy = {
    treasury_credits: 0,
    allowance_credits: 0,
    supply_milli: 0,
    stockpile_by_commodity: {},
    procurement: {
      spend_throttle: 0.8,
      theta_preset_by_commodity: {}
    }
  };

  // Set default theta presets for all commodities
  for (const commodityId of Object.keys(COMMODITY_DEFINITIONS)) {
    coalitionEconomy.procurement.theta_preset_by_commodity[commodityId] = 'Balanced';
  }

  return coalitionEconomy;
}