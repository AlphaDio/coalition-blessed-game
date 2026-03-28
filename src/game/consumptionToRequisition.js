/**
 * Consumption-Based Requisition System
 *
 * Converts empire commodity consumption directly into coalition requisition and credits.
 * Coalition gain is based on per-source consumption value:
 * - Empire needs/wants (market fills)
 * - Army needs/wants (empire-owned tagged market fills)
 * - Improvement sustainment (goods actually consumed from receipts)
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
export const COALITION_CONSUMPTION_SHARE_BASE = CONSUMPTION_REQUISITION_CONSTANTS.COALITION_CONSUMPTION_SHARE_BASE;

/**
 * Multiplier for requisition obtained from conversion (affects the conversion rate)
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
export const ALLOWANCE_MAX = ALLOWANCE_PER_TICK * ALLOWANCE_CAP_TICKS;

/**
 * Consumption requisition payout cadence.
 * Consumption-generated requisition is pooled and paid out every N turns.
 */
export const REQUISITION_POOL_TURNS = CONSUMPTION_REQUISITION_CONSTANTS.REQUISITION_POOL_TURNS || 15;

/**
 * Approval scaling for requisition contribution
 * At 0 approval: contribute APPROVAL_SCALE_MIN (50%)
 * At 100 approval: contribute APPROVAL_SCALE_MAX (200%)
 */
export const APPROVAL_SCALE_MIN = CONSUMPTION_REQUISITION_CONSTANTS.APPROVAL_SCALE_MIN;
export const APPROVAL_SCALE_MAX = CONSUMPTION_REQUISITION_CONSTANTS.APPROVAL_SCALE_MAX;

/**
 * Per-source weighting for consumption value before coalition share is applied.
 */
export const CONSUMPTION_SOURCE_MULTIPLIERS = CONSUMPTION_REQUISITION_CONSTANTS.SOURCE_MULTIPLIERS || {};

export const CONSUMPTION_SOURCES = Object.freeze({
  EMPIRE_NEEDS: 'empire_needs',
  EMPIRE_WANTS: 'empire_wants',
  ARMY_NEEDS: 'army_needs',
  ARMY_WANTS: 'army_wants',
  IMPROVEMENT_SUSTAINMENT: 'improvement_sustainment',
  UNKNOWN: 'unknown'
});

/**
 * Track consumption during a turn phase.
 * Map of empireId -> { byCommodity, bySource }
 */
let turnConsumptionTracker = {};

function normalizeSource(source) {
  if (!source) return CONSUMPTION_SOURCES.UNKNOWN;
  const normalized = String(source).trim().toLowerCase();
  if (!normalized) return CONSUMPTION_SOURCES.UNKNOWN;
  return normalized;
}

function normalizeSourceFilter(sources) {
  if (sources === null || sources === undefined) {
    return null;
  }

  const sourceList = Array.isArray(sources) ? sources : [sources];
  const normalized = sourceList
    .map(source => normalizeSource(source))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

function ensureEmpireConsumptionLedger(empireId) {
  const key = String(empireId);
  if (!turnConsumptionTracker[key]) {
    turnConsumptionTracker[key] = {
      byCommodity: {},
      bySource: {}
    };
  }
  return turnConsumptionTracker[key];
}

function getCommodityPrice(market, commodityId) {
  const commodityMarket = market?.[commodityId];
  if (!commodityMarket) return 1.0;
  if (Number.isFinite(commodityMarket.price)) return commodityMarket.price;
  if (Number.isFinite(commodityMarket.last_price)) return commodityMarket.last_price;
  return 1.0;
}

function getSourceMultiplier(source, sourceMultipliers = {}) {
  if (Number.isFinite(sourceMultipliers[source])) {
    return Math.max(0, sourceMultipliers[source]);
  }
  if (Number.isFinite(CONSUMPTION_SOURCE_MULTIPLIERS[source])) {
    return Math.max(0, CONSUMPTION_SOURCE_MULTIPLIERS[source]);
  }
  return 1.0;
}

/**
 * Initialize consumption tracking for a new turn.
 */
export function initializeTurnConsumptionTracking() {
  turnConsumptionTracker = {};
}

/**
 * Record commodity consumption for requisition calculation.
 * @param {string} commodityId - The commodity being consumed
 * @param {number} quantity - Amount of commodity consumed
 * @param {string} empireId - ID of the empire consuming the commodity
 * @param {string} source - Consumption source
 */
export function recordConsumption(commodityId, quantity, empireId, source = CONSUMPTION_SOURCES.UNKNOWN) {
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  if (!commodityId || empireId === null || empireId === undefined) return;

  const normalizedSource = normalizeSource(source);
  const ledger = ensureEmpireConsumptionLedger(empireId);

  ledger.byCommodity[commodityId] = (ledger.byCommodity[commodityId] || 0) + quantity;
  if (!ledger.bySource[normalizedSource]) {
    ledger.bySource[normalizedSource] = {};
  }
  ledger.bySource[normalizedSource][commodityId] = (ledger.bySource[normalizedSource][commodityId] || 0) + quantity;
}

/**
 * Get recorded consumption for a commodity from an empire.
 * @param {string} commodityId - The commodity to check
 * @param {string} empireId - Optional empire ID
 * @param {string|null} source - Optional source filter
 * @returns {number} Quantity consumed
 */
export function getRecordedConsumption(commodityId, empireId, source = null) {
  const normalizedSource = source ? normalizeSource(source) : null;

  if (empireId) {
    const ledger = turnConsumptionTracker[String(empireId)];
    if (!ledger) return 0;
    if (normalizedSource) {
      return ledger.bySource?.[normalizedSource]?.[commodityId] || 0;
    }
    return ledger.byCommodity?.[commodityId] || 0;
  }

  let total = 0;
  for (const ledger of Object.values(turnConsumptionTracker)) {
    if (normalizedSource) {
      total += ledger.bySource?.[normalizedSource]?.[commodityId] || 0;
    } else {
      total += ledger.byCommodity?.[commodityId] || 0;
    }
  }
  return total;
}

/**
 * Get this-turn consumption totals by commodity for a single empire.
 * Aggregates across all recorded consumption sources unless filtered.
 * @param {string} empireId - Empire identifier
 * @param {string|string[]|null} sources - Optional source filter
 * @returns {Object} commodity -> quantity consumed this turn
 */
export function getEmpireTurnConsumptionByCommodity(empireId, sources = null) {
  const ledger = turnConsumptionTracker[String(empireId)];
  if (!ledger?.byCommodity || typeof ledger.byCommodity !== 'object') {
    return {};
  }

  const normalizedSources = normalizeSourceFilter(sources);
  if (!normalizedSources) {
    return { ...ledger.byCommodity };
  }

  const totals = {};
  normalizedSources.forEach(source => {
    Object.entries(ledger.bySource?.[source] || {}).forEach(([commodityId, quantity]) => {
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      totals[commodityId] = (totals[commodityId] || 0) + quantity;
    });
  });

  return totals;
}

/**
 * Calculate weighted credit value of recorded consumption.
 * @param {Object} market - The market state object (per-commodity market states)
 * @param {string} empireId - Optional empire ID
 * @param {string|null} source - Optional source filter
 * @param {Object} sourceMultipliers - Optional source multipliers override
 * @returns {number} Total weighted credit value of recorded consumption
 */
export function calculateConsumptionValue(market, empireId, source = null, sourceMultipliers = {}) {
  const normalizedSource = source ? normalizeSource(source) : null;
  let totalValue = 0;

  const empireKeys = empireId
    ? [String(empireId)]
    : Object.keys(turnConsumptionTracker);

  for (const key of empireKeys) {
    const ledger = turnConsumptionTracker[key];
    if (!ledger) continue;

    const sourceEntries = normalizedSource
      ? { [normalizedSource]: ledger.bySource?.[normalizedSource] || {} }
      : (ledger.bySource || {});

    for (const [sourceKey, sourceCommodities] of Object.entries(sourceEntries)) {
      const sourceMultiplier = getSourceMultiplier(sourceKey, sourceMultipliers);
      for (const [commodityId, quantity] of Object.entries(sourceCommodities || {})) {
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        const price = getCommodityPrice(market, commodityId);
        totalValue += quantity * price * sourceMultiplier;
      }
    }
  }

  return totalValue;
}

/**
 * Calculate effective coalition share rate with modifiers.
 * @param {Object} modifiers - Aggregate modifiers: { multiplicativeShare: 1.0, additiveShare: 0 }
 * @returns {number} Effective share rate (clamped between 0 and 1)
 */
export function calculateEffectiveShareRate(modifiers = {}) {
  let shareRate = COALITION_CONSUMPTION_SHARE_BASE;

  if (Number.isFinite(modifiers.multiplicativeShare)) {
    shareRate *= modifiers.multiplicativeShare;
  }

  if (Number.isFinite(modifiers.additiveShare)) {
    shareRate += modifiers.additiveShare;
  }

  return Math.max(0, Math.min(1, shareRate));
}

/**
 * Process commodity consumption and convert to coalition requisition and credits.
 * @param {Object} market - The market state object
 * @param {Object} coalitionEconomy - The coalition economy state object
 * @param {Object} modifiers - Optional modifiers: { multiplicativeShare, additiveShare, requisitionMultiplier, sourceMultipliers, requisitionPoolTurns }
 * @param {Array} empires - Array of empire objects
 * @returns {Object} Consumption summary
 */
export function processConsumptionToRequisition(market, coalitionEconomy, modifiers = {}, empires = []) {
  if (!coalitionEconomy) {
    return {
      totalConsumed: 0,
      coalitionValue: 0,
      weightedConsumptionValue: 0,
      requisitionGenerated: 0,
      requisitionGained: 0,
      requisitionPoolBalance: 0,
      requisitionPoolTurns: 0,
      requisitionPoolPayoutTurns: REQUISITION_POOL_TURNS,
      creditsGranted: 0,
      creditsSpent: 0,
      sourceBreakdown: {}
    };
  }

  if (!Number.isFinite(coalitionEconomy.requisition)) {
    coalitionEconomy.requisition = 0;
  }
  if (!Number.isFinite(coalitionEconomy.allowance_credits)) {
    coalitionEconomy.allowance_credits = 0;
  }
  if (!Number.isFinite(coalitionEconomy.consumption_requisition_pool)) {
    coalitionEconomy.consumption_requisition_pool = 0;
  }
  if (!Number.isFinite(coalitionEconomy.consumption_requisition_pool_turns)) {
    coalitionEconomy.consumption_requisition_pool_turns = 0;
  }

  const effectiveShareRate = calculateEffectiveShareRate(modifiers);
  const requisitionMultiplier = Number.isFinite(modifiers.requisitionMultiplier)
    ? modifiers.requisitionMultiplier
    : 1.0;
  const requisitionPoolPayoutTurns = Math.max(
    1,
    Math.floor(Number.isFinite(modifiers.requisitionPoolTurns) ? modifiers.requisitionPoolTurns : REQUISITION_POOL_TURNS)
  );
  const sourceMultipliers = {
    ...CONSUMPTION_SOURCE_MULTIPLIERS,
    ...(modifiers.sourceMultipliers || {})
  };
  const empiresById = new Map((empires || []).map(empire => [String(empire.id), empire]));

  let totalRequisitionGenerated = 0;
  let totalCreditsGranted = 0;
  let totalCreditsSpent = 0;
  let totalConsumedRawValue = 0;
  let totalConsumedWeightedValue = 0;
  let totalConsumedUnits = 0;
  const sourceBreakdown = {};

  for (const [empireId, ledger] of Object.entries(turnConsumptionTracker)) {
    const empire = empiresById.get(String(empireId));
    const empireName = empire?.name || `Empire ${empireId}`;
    const approval = Number.isFinite(empire?.approval) ? empire.approval : 50;

    let empireUnits = 0;
    let empireRawValue = 0;
    let empireWeightedValue = 0;

    for (const [source, commodities] of Object.entries(ledger.bySource || {})) {
      const sourceMultiplier = getSourceMultiplier(source, sourceMultipliers);
      for (const [commodityId, quantity] of Object.entries(commodities || {})) {
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        const price = getCommodityPrice(market, commodityId);
        const rawValue = quantity * price;
        const weightedValue = rawValue * sourceMultiplier;

        empireUnits += quantity;
        empireRawValue += rawValue;
        empireWeightedValue += weightedValue;

        if (!sourceBreakdown[source]) {
          sourceBreakdown[source] = {
            quantity: 0,
            rawValue: 0,
            weightedValue: 0
          };
        }
        sourceBreakdown[source].quantity += quantity;
        sourceBreakdown[source].rawValue += rawValue;
        sourceBreakdown[source].weightedValue += weightedValue;
      }
    }

    if (empireWeightedValue <= 0) continue;

    totalConsumedUnits += empireUnits;
    totalConsumedRawValue += empireRawValue;
    totalConsumedWeightedValue += empireWeightedValue;

    const coalitionValue = empireWeightedValue * effectiveShareRate;
    const approvalNormalized = Math.max(0, Math.min(1, approval / 100));
    const approvalScale = APPROVAL_SCALE_MIN + approvalNormalized * (APPROVAL_SCALE_MAX - APPROVAL_SCALE_MIN);
    const scaledCoalitionValue = coalitionValue * CONVERSION_REQUISITION_MULTIPLIER * approvalScale;

    let requisitionGenerated = (scaledCoalitionValue / CREDITS_PER_REQUISITION) * requisitionMultiplier;
    if (!Number.isFinite(requisitionGenerated)) {
      logger.warn(`Invalid requisition gain (${requisitionGenerated}) for ${empireName}, clamping to 0`);
      requisitionGenerated = 0;
    }

    totalRequisitionGenerated += requisitionGenerated;

    const creditsGranted = scaledCoalitionValue;
    const creditsSpent = Math.min(creditsGranted, coalitionEconomy.allowance_credits);
    coalitionEconomy.allowance_credits -= creditsSpent;
    totalCreditsGranted += creditsGranted;
    totalCreditsSpent += creditsSpent;

    if (requisitionGenerated > 0.001 || creditsSpent > 0.001) {
      logger.debug(
        `[${empireName}] Consumption conversion: ${empireRawValue.toFixed(2)} raw value ` +
        `(${empireWeightedValue.toFixed(2)} weighted, ${empireUnits.toFixed(2)} units) ` +
        `@ ${(effectiveShareRate * 100).toFixed(1)}% share ` +
        `-> ${coalitionValue.toFixed(2)} base credits ` +
        `-> ${scaledCoalitionValue.toFixed(2)} credits (${CONVERSION_REQUISITION_MULTIPLIER}x multiplier x ${(approvalScale * 100).toFixed(0)}% approval scale) ` +
        `-> +${requisitionGenerated.toFixed(3)} requisition pooled, +${creditsSpent.toFixed(0)} credits from allowance`
      );
    }
  }

  if (totalRequisitionGenerated > 0) {
    coalitionEconomy.consumption_requisition_pool += totalRequisitionGenerated;
  }
  coalitionEconomy.consumption_requisition_pool_turns += 1;

  let totalRequisitionGained = 0;
  if (coalitionEconomy.consumption_requisition_pool_turns >= requisitionPoolPayoutTurns) {
    totalRequisitionGained = coalitionEconomy.consumption_requisition_pool;
    coalitionEconomy.requisition += totalRequisitionGained;
    coalitionEconomy.consumption_requisition_pool = 0;
    coalitionEconomy.consumption_requisition_pool_turns = 0;
  }

  return {
    totalConsumed: totalConsumedUnits,
    coalitionValue: totalConsumedRawValue,
    weightedConsumptionValue: totalConsumedWeightedValue,
    requisitionGenerated: totalRequisitionGenerated,
    requisitionGained: totalRequisitionGained,
    requisitionPoolBalance: coalitionEconomy.consumption_requisition_pool,
    requisitionPoolTurns: coalitionEconomy.consumption_requisition_pool_turns,
    requisitionPoolPayoutTurns,
    creditsGranted: totalCreditsGranted,
    creditsSpent: totalCreditsSpent,
    sourceBreakdown
  };
}

/**
 * Refill coalition allowance each tick.
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
 * Get requisition display value.
 */
export function getRequisitionDisplay(economy) {
  return {
    requisition_int: Math.floor(economy.requisition || 0),
    milli_remainder: Math.round(((economy.requisition || 0) % 1) * 1000)
  };
}
