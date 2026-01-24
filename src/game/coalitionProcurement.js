/**
 * Coalition Procurement and Supply Conversion System
 *
 * Manages coalition-level commodity procurement from market surplus
 * and batch conversion to requisition using milli-requisition precision.
 * Commodities accumulate in a bank; only when the bank is full do we convert.
 */

import { getLogger } from '../modules/logger.js';
import { THETA_PRESETS, COMMODITY_DEFINITIONS, MILLI_PER_UNIT_BY_TIER, BATCH_SIZE_UNITS, BATCH_BONUS_MILLI } from './types.js';

const logger = getLogger();

/**
 * Coalition allowance and procurement settings
 */
export const ALLOWANCE_PER_TICK = 1000;
export const ALLOWANCE_CAP_TICKS = 4;
export const RESERVE_FLOOR_CREDITS = 1500;
export const BANK_THRESHOLD = 1000; // Units needed in bank before conversion triggers
export const BANK_ROLLOVER_THRESHOLD = 25000; // When bank reaches this, convert to requisition
export const ROLLOVER_REQUISITION_MULTIPLIER = 12; // Requisition gained per rollover
export const STARTING_REQUISITION = 500; // Initial requisition for improvement construction

/**
 * Process bank rollover: when bank >= BANK_ROLLOVER_THRESHOLD,
 * reset bank and add ROLLOVER_REQUISITION_MULTIPLIER requisition
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @returns {number} Number of requisition added (0 or 1)
 */
export function processBankRollover(coalitionEconomy) {
  if (!coalitionEconomy.bank) coalitionEconomy.bank = 0;
  if (!coalitionEconomy.requisition) coalitionEconomy.requisition = 0;

  let requisitionAdded = 0;
  while (coalitionEconomy.bank >= BANK_ROLLOVER_THRESHOLD) {
    coalitionEconomy.bank -= BANK_ROLLOVER_THRESHOLD;
    coalitionEconomy.requisition += ROLLOVER_REQUISITION_MULTIPLIER;
    requisitionAdded += ROLLOVER_REQUISITION_MULTIPLIER;
  }

  if (requisitionAdded > 0) {
    logger.debug(`Bank rollover: +${requisitionAdded} requisition (bank: ${coalitionEconomy.bank})`);
  }

  return requisitionAdded;
}

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
     const sellerA = a.seller_id || a.owner_id || '';
     const sellerB = b.seller_id || b.owner_id || '';
     if (sellerA !== sellerB) return sellerA.localeCompare(sellerB);
     return (a.id || '').localeCompare(b.id || '');
   });

  let spent = 0;
  const purchasesByCommodity = {};
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

    // Execute purchase - add to bank
    coalitionEconomy.stockpile_bank[offer.commodity_id] =
      (coalitionEconomy.stockpile_bank[offer.commodity_id] || 0) + buyQty;

    offer.qty -= buyQty;
    spent += cost;
    remainingSpend -= cost;

    purchasesByCommodity[offer.commodity_id] = (purchasesByCommodity[offer.commodity_id] || 0) + buyQty;
  }

  // Deduct from treasury and allowance
  coalitionEconomy.treasury_credits -= spent;
  coalitionEconomy.allowance_credits -= spent;

  // Create condensed log entry
  if (spent > 0) {
    const totalUnits = Object.values(purchasesByCommodity).reduce((sum, qty) => sum + qty, 0);
    const logEntry = `Coalition procurement: ${spent} credits -> ${totalUnits} units`;
    logger.debug(logEntry);
    return [logEntry];
  }

  logger.debug(`Coalition procurement completed: spent ${spent}/${targetSpend} credits`);
  return [];
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
 * Execute batch conversion from stockpile bank to coalition bank
 * Commodities accumulate in the bank; only when bank reaches BANK_THRESHOLD
 * do we move to ready and convert to bank.
 *
 * When bank reaches BANK_ROLLOVER_THRESHOLD, it converts to requisition.
 *
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @param {Object} config - Economy configuration
 * @returns {Array} Array of log entries (empty if no conversion happened)
 */
export function executeSupplyConversion(coalitionEconomy, config) {
  // Ensure bank and ready structures exist
  if (!coalitionEconomy.stockpile_bank) {
    coalitionEconomy.stockpile_bank = {};
  }
  if (!coalitionEconomy.stockpile_ready) {
    coalitionEconomy.stockpile_ready = {};
  }
  if (!coalitionEconomy.bank) {
    coalitionEconomy.bank = 0;
  }
  if (!coalitionEconomy.requisition) {
    coalitionEconomy.requisition = 0;
  }

  // Move commodities from bank to ready when threshold is reached (silent)
  for (const [commodityId, bankQty] of Object.entries(coalitionEconomy.stockpile_bank)) {
    if (bankQty >= BANK_THRESHOLD) {
      const readyBefore = coalitionEconomy.stockpile_ready[commodityId] || 0;
      coalitionEconomy.stockpile_ready[commodityId] = readyBefore + bankQty;
      coalitionEconomy.stockpile_bank[commodityId] = 0;
    }
  }

  // Convert from ready stockpiles to bank (logged)
  let totalConvertedUnits = 0;
  const conversionsByCommodity = {};

  for (const [commodityId, readyQty] of Object.entries(coalitionEconomy.stockpile_ready)) {
    if (readyQty < BATCH_SIZE_UNITS) continue;

    const commodityDef = COMMODITY_DEFINITIONS[commodityId];
    if (!commodityDef) continue;

    const tier = commodityDef.tier;
    const unitsPerBatch = MILLI_PER_UNIT_BY_TIER[tier];

    const convertQty = Math.floor(readyQty / BATCH_SIZE_UNITS) * BATCH_SIZE_UNITS;
    const gainBank = convertQty * unitsPerBatch;

    coalitionEconomy.stockpile_ready[commodityId] -= convertQty;
    coalitionEconomy.bank += gainBank;
    totalConvertedUnits += convertQty;

    conversionsByCommodity[commodityId] = (conversionsByCommodity[commodityId] || 0) + gainBank;
  }

   // Add batch conversion bonus
   const batchBonus = Math.floor(totalConvertedUnits / BATCH_SIZE_UNITS) * BATCH_BONUS_MILLI;
   if (batchBonus > 0) {
     coalitionEconomy.bank += batchBonus;
   }

   // Process bank rollover (convert excess bank to requisition)
   const rolloverResult = processBankRollover(coalitionEconomy);

   // Only log when conversion from READY to BANK occurred
   const totalGain = Object.values(conversionsByCommodity).reduce((sum, qty) => sum + qty, 0) + batchBonus;

   if (totalGain > 0) {
     let logEntry = `Coalition conversion: ${totalConvertedUnits} units -> ${totalGain} bank`;
     if (rolloverResult > 0) {
       logEntry += ` (+${rolloverResult} requisition)`;
     }
     if (batchBonus > 0 && batchBonus !== totalGain - Object.values(conversionsByCommodity).reduce((s, v) => s + v, 0)) {
       logEntry += ` (+${batchBonus} bonus)`;
     }
     logger.debug(logEntry);
     return [logEntry];
   }

  // No log entry if no conversion happened
  return [];
}

/**
 * Get requisition display value
 */
export function getRequisitionDisplay(economy) {
  return {
    requisition_int: Math.floor(economy.requisition || 0),
    milli_remainder: 0
  };
}

/**
 * Initialize coalition procurement settings with defaults
 * @returns {Object} A new coalition economy state object with default values
 */
export function initializeCoalitionProcurement(existingState = null) {
  const coalitionEconomy = {
    treasury_credits: 0,
    allowance_credits: 0,
    bank: 0,
    requisition: STARTING_REQUISITION, // Starting requisition for building improvements
    stockpile_bank: {},      // Accumulates purchased commodities
    stockpile_ready: {},     // Ready for conversion (reached threshold)
    procurement: {
      spend_throttle: 0.8,
      theta_preset_by_commodity: {}
    }
  };

  // Migrate from old stockpile_by_commodity structure
  if (existingState?.stockpile_by_commodity) {
    for (const [commodityId, qty] of Object.entries(existingState.stockpile_by_commodity)) {
      if (qty > 0) {
        if (qty >= BANK_THRESHOLD) {
          // Move to ready if it was already above threshold
          coalitionEconomy.stockpile_ready[commodityId] = qty;
        } else {
          // Move to bank
          coalitionEconomy.stockpile_bank[commodityId] = qty;
        }
      }
    }
  }

  // Set default theta presets for all commodities
  for (const commodityId of Object.keys(COMMODITY_DEFINITIONS)) {
    coalitionEconomy.procurement.theta_preset_by_commodity[commodityId] = 'Balanced';
  }

  return coalitionEconomy;
}