import { getLogger } from '../../../modules/logger.js';
import { RATIONING_CONSTANTS, FULFILLMENT_CONSTANTS } from '../../constants.js';
import { applyDemandCommodityMultiplier } from '../../economyBalance.js';
import { getSupplyEfficiencyMultiplier, getEmpireSupplyEfficiency } from '../../economyTick/ordersPhase.js';
import { IMPROVEMENT_SUSTAINMENT_SCALE, IMPROVEMENT_SUSTAINMENT_TICKS } from '../types.js';
import { nextOrderId } from './orderIds.js';
import { createBuyOrder } from '../../marketEconomy.js';
import { CONSUMPTION_SOURCES, recordConsumption } from '../../consumptionToRequisition.js';

const SUSTAINMENT_ORDER_PRIORITY = 800;
const SUSTAINMENT_ORDER_MAX_DURATION = 6;
export const IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE = 'improvement_sustainment_pool';
const QUANTITY_PRECISION = 1000;
const QUANTITY_EPSILON = 1 / QUANTITY_PRECISION;

function normalizeQty(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
  return rounded > QUANTITY_EPSILON ? rounded : 0;
}

function ensureSustainmentLedgers(state) {
  if (!state.improvements) {
    state.improvements = {};
  }
  if (!state.improvements.pendingSustainmentDemand) {
    state.improvements.pendingSustainmentDemand = {};
  }
  if (!state.improvements.pendingSustainmentNeedsByImprovement) {
    state.improvements.pendingSustainmentNeedsByImprovement = {};
  }
  if (!state.improvements.fulfilledSustainmentReceipts) {
    state.improvements.fulfilledSustainmentReceipts = {};
  }
  return state.improvements;
}

function getEmpireLedger(state, ledgerKey, empireId) {
  const improvements = ensureSustainmentLedgers(state);
  if (!improvements[ledgerKey][empireId]) {
    improvements[ledgerKey][empireId] = {};
  }
  return improvements[ledgerKey][empireId];
}

function getLedgerValue(state, ledgerKey, empireId, commodity) {
  const ledger = getEmpireLedger(state, ledgerKey, empireId);
  return ledger[commodity] || 0;
}

function setLedgerValue(state, ledgerKey, empireId, commodity, value) {
  const ledger = getEmpireLedger(state, ledgerKey, empireId);
  const normalized = normalizeQty(value);
  if (normalized > 0) {
    ledger[commodity] = normalized;
  } else {
    delete ledger[commodity];
  }
}

function addLedgerValue(state, ledgerKey, empireId, commodity, value) {
  const normalized = normalizeQty(value);
  if (normalized <= 0) return 0;
  const nextValue = getLedgerValue(state, ledgerKey, empireId, commodity) + normalized;
  setLedgerValue(state, ledgerKey, empireId, commodity, nextValue);
  return normalizeQty(nextValue);
}

function beginSustainmentCycle(state) {
  const improvements = ensureSustainmentLedgers(state);
  if (improvements.sustainmentCycleTurn === state.turn) {
    return;
  }

  improvements.sustainmentCycleTurn = state.turn;
  improvements.sustainmentResolvedTurn = null;
  improvements.pendingSustainmentDemand = {};
  improvements.pendingSustainmentNeedsByImprovement = {};
}

function consumeRequisition(state, amount) {
  const normalized = normalizeQty(amount);
  if (normalized <= 0) return 0;
  if (!state.coalitionEconomy) {
    state.coalitionEconomy = { requisition: 0 };
  }
  const available = Number.isFinite(state.coalitionEconomy.requisition) ? state.coalitionEconomy.requisition : 0;
  const used = normalizeQty(Math.min(available, normalized));
  state.coalitionEconomy.requisition = normalizeQty(available - used);
  return used;
}

export function creditSustainmentReceipts(state, empireId, commodity, qty) {
  addLedgerValue(state, 'fulfilledSustainmentReceipts', empireId, commodity, qty);
}

export function allocateSustainmentFromLocalProduction(state, empireId, commodity, qty) {
  const normalizedQty = normalizeQty(qty);
  if (normalizedQty <= 0 || !empireId || !commodity || commodity === 'requisition') {
    return 0;
  }

  const pending = getLedgerValue(state, 'pendingSustainmentDemand', empireId, commodity);
  if (pending <= 0) {
    return 0;
  }

  const used = normalizeQty(Math.min(pending, normalizedQty));
  if (used <= 0) {
    return 0;
  }

  setLedgerValue(state, 'pendingSustainmentDemand', empireId, commodity, normalizeQty(pending - used));
  creditSustainmentReceipts(state, empireId, commodity, used);

  let remainingToTrim = used;
  const buyOrders = state.marketOrders?.buyOrders || [];
  buyOrders.forEach((order) => {
    if (remainingToTrim <= 0) return;
    if (order.owner_type !== 'empire') return;
    if (order.owner_id !== empireId) return;
    if (order.commodity !== commodity) return;
    if (order.tags?.purpose !== IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE) return;

    const filledQty = normalizeQty(order.filled_qty || 0);
    const openQty = normalizeQty((order.qty || 0) - filledQty);
    if (openQty <= 0) return;

    const trimmed = normalizeQty(Math.min(openQty, remainingToTrim));
    order.qty = normalizeQty(Math.max(filledQty, (order.qty || 0) - trimmed));
    if (order.turn_added_turn === state.turn && Number.isFinite(order.turn_added_qty)) {
      order.turn_added_qty = normalizeQty(Math.max(0, order.turn_added_qty - trimmed));
    }
    remainingToTrim = normalizeQty(remainingToTrim - trimmed);
  });

  return used;
}

function consumeSustainmentReceipts(state, empireId, commodity, qty) {
  const normalized = normalizeQty(qty);
  if (normalized <= 0) return 0;
  const available = getLedgerValue(state, 'fulfilledSustainmentReceipts', empireId, commodity);
  const used = normalizeQty(Math.min(available, normalized));
  if (used > 0) {
    setLedgerValue(state, 'fulfilledSustainmentReceipts', empireId, commodity, normalizeQty(available - used));
    recordConsumption(commodity, used, empireId, CONSUMPTION_SOURCES.IMPROVEMENT_SUSTAINMENT);
  }
  return used;
}

function calculateImprovementNeed(state, empire, commodity, qtyPerPopulation) {
  const population = empire.stats?.population || 1;
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
  const rawNeed = qtyPerPopulation
    * population
    * effectiveRationing
    * IMPROVEMENT_SUSTAINMENT_SCALE
    * supplyEfficiencyMultiplier
    * empireMult;
  const balancedNeed = applyDemandCommodityMultiplier(commodity, rawNeed);
  return normalizeQty(balancedNeed);
}

function upsertPooledSustainmentOrder(state, empireId, commodity, addedDemand) {
  const demandToAdd = normalizeQty(addedDemand);
  if (demandToAdd <= 0) return;
  if (!state.market || !state.market[commodity]) return;

  if (!state.marketOrders) {
    state.marketOrders = { buyOrders: [], sellOffers: [] };
  }

  const marketState = state.market[commodity];
  const maxPrice = marketState.price;

  const existing = state.marketOrders.buyOrders.find(order =>
    order.owner_type === 'empire' &&
    order.owner_id === empireId &&
    order.commodity === commodity &&
    order.tags?.purpose === IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE &&
    (order.filled_qty || 0) < order.qty
  );

  if (existing) {
    existing.qty = normalizeQty(existing.qty + demandToAdd);
    const currentTurnAdded = existing.turn_added_turn === state.turn
      ? (existing.turn_added_qty || 0)
      : 0;
    existing.turn_added_qty = normalizeQty(currentTurnAdded + demandToAdd);
    existing.turn_added_turn = state.turn;
    existing.max_price = maxPrice;
    existing.priority = Math.max(existing.priority || 0, SUSTAINMENT_ORDER_PRIORITY);
    existing.category = 'needs';
    existing.duration = 0;
    existing.max_duration = Number.isFinite(existing.max_duration)
      ? existing.max_duration
      : SUSTAINMENT_ORDER_MAX_DURATION;
    existing.fee = Number.isFinite(existing.fee) ? existing.fee : 1;
    existing.tags = {
      ...(existing.tags || {}),
      purpose: IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE,
      payer: empireId,
      beneficiary: empireId
    };
    return;
  }

  const buyOrder = createBuyOrder(
    nextOrderId('sustain_pool'),
    'empire',
    empireId,
    commodity,
    demandToAdd,
    maxPrice,
    SUSTAINMENT_ORDER_PRIORITY,
    SUSTAINMENT_ORDER_MAX_DURATION
  );
  buyOrder.category = 'needs';
  buyOrder.fee = 1;
  buyOrder.turn_added_qty = demandToAdd;
  buyOrder.turn_added_turn = state.turn;
  buyOrder.tags = {
    payer: empireId,
    beneficiary: empireId,
    purpose: IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE
  };
  state.marketOrders.buyOrders.push(buyOrder);
}

/**
 * Finalize pooled sustainment orders for the current tick.
 */
export function finalizeImprovementSustainmentPreMarket(state) {
  if (!state.marketOrders?.buyOrders?.length) return;
  const improvements = ensureSustainmentLedgers(state);
  if (improvements.sustainmentCycleTurn !== state.turn) return;

  const clampedOrders = [];
  for (const order of state.marketOrders.buyOrders) {
    if (order.tags?.purpose !== IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE) {
      clampedOrders.push(order);
      continue;
    }

    if ((order.filled_qty || 0) < order.qty && state.market?.[order.commodity]) {
      order.max_price = state.market[order.commodity].price;
      order.priority = Math.max(order.priority || 0, SUSTAINMENT_ORDER_PRIORITY);
      order.category = 'needs';
      order.max_duration = Number.isFinite(order.max_duration)
        ? order.max_duration
        : SUSTAINMENT_ORDER_MAX_DURATION;
      order.fee = Number.isFinite(order.fee) ? order.fee : 1;
      order.qty = normalizeQty(order.qty);
      order.filled_qty = normalizeQty(order.filled_qty || 0);
      order.tags = {
        ...(order.tags || {}),
        purpose: IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE,
        payer: order.owner_id,
        beneficiary: order.owner_id
      };
    }

    if ((order.filled_qty || 0) < order.qty) {
      clampedOrders.push(order);
    }
  }

  state.marketOrders.buyOrders = clampedOrders;
}

function resolveSingleImprovementSustainment(state, improvement) {
  const logger = getLogger();
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  if (!empire) {
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Empire not found)`);
    }
    return { log };
  }

  const pendingNeeds = state.improvements.pendingSustainmentNeedsByImprovement?.[improvement.id] || {};
  let totalNeeded = 0;
  let totalReceived = 0;
  const shortages = [];

  for (const [commodity, needed] of Object.entries(pendingNeeds)) {
    let remainingNeed = needed;
    if (needed <= 0) continue;
    totalNeeded += needed;

    if (commodity !== 'requisition') {
      const fromReceipts = consumeSustainmentReceipts(state, empire.id, commodity, remainingNeed);
      remainingNeed -= fromReceipts;
      totalReceived += needed - remainingNeed;
    } else {
      // Requisition is consumed fully or not; count as received if no remainder
      totalReceived += needed;
    }

    if (remainingNeed > 0) {
      shortages.push(commodity);
    }
  }

  // Compute overall sustainment fulfillment ratio (1.0 when nothing is needed)
  const fulfillmentRatio = totalNeeded > 0 ? Math.min(1.0, totalReceived / totalNeeded) : 1.0;
  const degradationThreshold = FULFILLMENT_CONSTANTS.IMPROVEMENT_DEGRADATION_FULFILLMENT_THRESHOLD;

  // Skip degradation checks during the grace tick after completion.
  const inGracePeriod = improvement.completedAtTick && (state.turn - improvement.completedAtTick) < 1;
  if (inGracePeriod) {
    if (fulfillmentRatio >= degradationThreshold) {
      improvement.ticksSinceSustained = 0;
    }
    return { log };
  }

  if (fulfillmentRatio >= degradationThreshold) {
    // Sustainment is at or above the degradation threshold – reset unsustained counter
    improvement.ticksSinceSustained = 0;

    // Restore to ACTIVE if was DEGRADED
    if (improvement.state === 'DEGRADED') {
      improvement.state = 'ACTIVE';
      improvement.degradedSince = null;
      log.push(`{green-fg}Restored:{/green-fg} ${improvement.name} is now ACTIVE`);
      logger.info(`Improvement restored: ${improvement.name}`);
    }
  } else {
    // Sustainment is critically low – accumulate degradation ticks
    improvement.ticksSinceSustained = (improvement.ticksSinceSustained || 0) + 1;
    if (improvement.state !== 'DEGRADED') {
      if (improvement.ticksSinceSustained >= IMPROVEMENT_SUSTAINMENT_TICKS) {
        improvement.state = 'DEGRADED';
        improvement.degradedSince = state.turn;
        log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Sustainment: ${(fulfillmentRatio * 100).toFixed(0)}%, Missing: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks)`);
        logger.warn(`Improvement degraded: ${improvement.name} - fulfillment: ${(fulfillmentRatio * 100).toFixed(0)}%, shortages: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks without sufficient sustainment`);
      }
    }
  }

  return { log };
}

/**
 * Prepare per-improvement sustainment demand and pooled market orders before economy clearing.
 */
export function processImprovementSustainmentPreMarket(state, improvement) {
  beginSustainmentCycle(state);

  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  const needsByCommodity = {};
  state.improvements.pendingSustainmentNeedsByImprovement[improvement.id] = needsByCommodity;

  if (!empire) {
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Empire not found)`);
    }
    return { log };
  }

  const sustainmentNeeds = improvement.sustainmentCost || {};
  for (const [commodity, qtyPerPopulation] of Object.entries(sustainmentNeeds)) {
    const needed = calculateImprovementNeed(state, empire, commodity, qtyPerPopulation);
    if (needed <= 0) continue;

    let remainingNeed = needed;

    if (commodity === 'requisition') {
      const used = consumeRequisition(state, remainingNeed);
      remainingNeed -= used;
    } else {
      const fromReceipts = consumeSustainmentReceipts(state, empire.id, commodity, remainingNeed);
      remainingNeed -= fromReceipts;
    }

    if (remainingNeed <= 0) continue;

    needsByCommodity[commodity] = remainingNeed;
    if (commodity === 'requisition') continue;

    addLedgerValue(state, 'pendingSustainmentDemand', empire.id, commodity, remainingNeed);
    upsertPooledSustainmentOrder(state, empire.id, commodity, remainingNeed);
  }

  return { log };
}

/**
 * Resolve sustainment after market clearing so same-turn fills count before degradation checks.
 */
export function processImprovementSustainmentPostMarket(state) {
  const log = [];
  const improvements = ensureSustainmentLedgers(state);
  if (improvements.sustainmentCycleTurn !== state.turn) {
    return { log };
  }
  if (improvements.sustainmentResolvedTurn === state.turn) {
    return { log };
  }

  for (const improvement of improvements.queue || []) {
    if (improvement.state !== 'ACTIVE' && improvement.state !== 'DEGRADED') continue;
    const result = resolveSingleImprovementSustainment(state, improvement);
    if (result.log?.length) {
      log.push(...result.log);
    }
  }

  improvements.pendingSustainmentDemand = {};
  improvements.pendingSustainmentNeedsByImprovement = {};
  improvements.sustainmentResolvedTurn = state.turn;

  return { log };
}

/**
 * Backward-compatible alias for legacy callers during migration.
 */
export function processImprovementSustainment(state, improvement) {
  return processImprovementSustainmentPreMarket(state, improvement);
}
