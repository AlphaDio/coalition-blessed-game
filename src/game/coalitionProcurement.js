/**
 * Coalition Procurement and Supply Conversion System
 *
 * Manages coalition-level commodity procurement from market surplus
 * and batch conversion to supplies using milli-supply precision.
 */

import { getLogger } from '../modules/logger.js';
import { THETA_PRESETS, COMMODITY_DEFINITIONS, MILLI_PER_UNIT_BY_TIER, BATCH_SIZE_UNITS } from './types.js';

const logger = getLogger();

/**
 * Coalition allowance and procurement settings
 */
export const ALLOWANCE_PER_TICK = 100;
export const ALLOWANCE_CAP_TICKS = 6;
export const RESERVE_FLOOR_CREDITS = 1500;

/**
 * Get reference price for a commodity (with fallbacks)
 */
function getReferencePrice(state, commodityId) {
  const market = state.market;
  if (!market) return null;

  // Priority: current price -> last price -> floor price
  return market.price_by_commodity[commodityId] ||
         market.last_price_by_commodity[commodityId] ||
         market.floor_price_by_commodity[commodityId] ||
         null;
}

/**
 * Refill coalition allowance credits each tick
 */
export function refillCoalitionAllowance(state) {
  const economy = state.coalitionEconomy;
  const maxAllowance = ALLOWANCE_PER_TICK * ALLOWANCE_CAP_TICKS;

  economy.allowance_credits = Math.min(
    economy.allowance_credits + ALLOWANCE_PER_TICK,
    maxAllowance
  );
}

/**
 * Calculate spend caps for coalition procurement
 */
export function calculateSpendCaps(state) {
  const economy = state.coalitionEconomy;

  const spendCap = Math.min(
    economy.allowance_credits,
    Math.max(0, economy.treasury_credits - RESERVE_FLOOR_CREDITS)
  );

  const targetSpend = Math.floor(spendCap * economy.procurement.spend_throttle);

  return { spendCap, targetSpend };
}

/**
 * Execute coalition procurement from post-clear market surplus
 */
export function executeCoalitionProcurement(state) {
  const economy = state.coalitionEconomy;
  const { spendCap, targetSpend } = calculateSpendCaps(state);

  if (targetSpend <= 0) {
    logger.debug('Coalition procurement: No spending capacity available');
    return { spent: 0, purchases: [] };
  }

  // Get eligible offers from post-clear surplus
  const eligibleOffers = getEligibleOffers(state);

  if (eligibleOffers.length === 0) {
    logger.debug('Coalition procurement: No eligible offers available');
    return { spent: 0, purchases: [] };
  }

  // Sort deterministically
  eligibleOffers.sort((a, b) => {
    if (a.ask_price !== b.ask_price) return a.ask_price - b.ask_price;
    if (a.qty !== b.qty) return b.qty - a.qty; // Higher qty first
    if (a.seller_id !== b.seller_id) return a.seller_id.localeCompare(b.seller_id);
    return a.offer_id.localeCompare(b.offer_id);
  });

  let spent = 0;
  const purchases = [];
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
    economy.stockpile_by_commodity[offer.commodity_id] =
      (economy.stockpile_by_commodity[offer.commodity_id] || 0) + buyQty;

    offer.qty -= buyQty;
    spent += cost;
    remainingSpend -= cost;

    purchases.push({
      tick: state.turn,
      commodity_id: offer.commodity_id,
      qty: buyQty,
      unit_price: offer.ask_price,
      total_cost: cost,
      seller_id: offer.seller_id,
      offer_id: offer.offer_id
    });

    logger.info(`Coalition procured ${buyQty} ${offer.commodity_id} for ${cost} credits`);
  }

  // Deduct from treasury and allowance
  economy.treasury_credits -= spent;
  economy.allowance_credits -= spent;

  logger.info(`Coalition procurement completed: spent ${spent}/${targetSpend} credits`);

  return { spent, purchases };
}

/**
 * Get eligible offers for coalition procurement
 */
function getEligibleOffers(state) {
  const economy = state.coalitionEconomy;
  const market = state.market;

  if (!market || !market.remaining_sell_offers_post_clear) {
    return [];
  }

  const eligible = [];

  for (const offer of market.remaining_sell_offers_post_clear) {
    if (offer.qty <= 0) continue;

    const commodityId = offer.commodity_id;
    const refPrice = getReferencePrice(state, commodityId);

    if (!refPrice) continue;

    const thetaPreset = economy.procurement.theta_preset_by_commodity[commodityId] || 'Balanced';
    const theta = THETA_PRESETS[thetaPreset];
    const threshold = refPrice * theta;

    if (offer.ask_price <= threshold) {
      eligible.push(offer);
    }
  }

  return eligible;
}

/**
 * Execute batch conversion from stockpiles to milli-supplies
 */
export function executeSupplyConversion(state) {
  const economy = state.coalitionEconomy;
  const conversions = [];

  for (const [commodityId, stockQty] of Object.entries(economy.stockpile_by_commodity)) {
    if (stockQty < BATCH_SIZE_UNITS) continue;

    const commodityDef = COMMODITY_DEFINITIONS[commodityId];
    if (!commodityDef) continue;

    const tier = commodityDef.tier;
    const milliPerUnit = MILLI_PER_UNIT_BY_TIER[tier];

    const convertQty = Math.floor(stockQty / BATCH_SIZE_UNITS) * BATCH_SIZE_UNITS;
    const gainMilli = convertQty * milliPerUnit;

    // Execute conversion
    economy.stockpile_by_commodity[commodityId] -= convertQty;
    economy.supply_milli += gainMilli;

    conversions.push({
      tick: state.turn,
      commodity_id: commodityId,
      convert_qty: convertQty,
      milli_gained: gainMilli,
      tier: tier
    });

    logger.info(`Coalition converted ${convertQty} ${commodityId} to ${gainMilli} milli-supplies`);
  }

  logger.info(`Supply conversion completed: ${conversions.length} batches processed`);

  return conversions;
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
 */
export function initializeCoalitionProcurement(state) {
  const economy = state.coalitionEconomy;

  // Set default theta presets for all commodities
  for (const commodityId of Object.keys(COMMODITY_DEFINITIONS)) {
    if (!economy.procurement.theta_preset_by_commodity[commodityId]) {
      economy.procurement.theta_preset_by_commodity[commodityId] = 'Balanced';
    }
  }
}