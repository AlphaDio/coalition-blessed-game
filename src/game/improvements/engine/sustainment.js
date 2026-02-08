import { getLogger } from '../../../modules/logger.js';
import { RATIONING_CONSTANTS } from '../../constants.js';
import { getSupplyEfficiencyMultiplier, getEmpireSupplyEfficiency } from '../../economyTick/ordersPhase.js';
import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../types.js';
import { nextOrderId } from './orderIds.js';
import { createBuyOrder } from '../../marketEconomy.js';

const SUSTAINMENT_ORDER_PRIORITY = 800;
const SUSTAINMENT_ORDER_MAX_DURATION = 6;
const SUSTAINMENT_BACKLOG_TICKS = IMPROVEMENT_SUSTAINMENT_TICKS * 2;
export const IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE = 'improvement_sustainment_pool';

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
  if (value > 0) {
    ledger[commodity] = value;
  } else {
    delete ledger[commodity];
  }
}

function addLedgerValue(state, ledgerKey, empireId, commodity, value) {
  if (value <= 0) return 0;
  const nextValue = getLedgerValue(state, ledgerKey, empireId, commodity) + value;
  setLedgerValue(state, ledgerKey, empireId, commodity, nextValue);
  return nextValue;
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
  if (amount <= 0) return 0;
  if (!state.coalitionEconomy) {
    state.coalitionEconomy = { requisition: 0 };
  }
  const available = state.coalitionEconomy.requisition || 0;
  const used = Math.min(available, amount);
  state.coalitionEconomy.requisition = available - used;
  return used;
}

export function creditSustainmentReceipts(state, empireId, commodity, qty) {
  addLedgerValue(state, 'fulfilledSustainmentReceipts', empireId, commodity, qty);
}

function consumeSustainmentReceipts(state, empireId, commodity, qty) {
  if (qty <= 0) return 0;
  const available = getLedgerValue(state, 'fulfilledSustainmentReceipts', empireId, commodity);
  const used = Math.min(available, qty);
  if (used > 0) {
    setLedgerValue(state, 'fulfilledSustainmentReceipts', empireId, commodity, available - used);
  }
  return used;
}

function calculateImprovementNeed(state, empire, qtyPerPopulation) {
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
  return Math.ceil(qtyPerPopulation * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult);
}

function upsertPooledSustainmentOrder(state, empireId, commodity, addedDemand) {
  if (addedDemand <= 0) return;
  if (!state.market || !state.market[commodity]) return;

  if (!state.marketOrders) {
    state.marketOrders = { buyOrders: [], sellOffers: [] };
  }

  const marketState = state.market[commodity];
  const maxPrice = marketState.price;
  const totalDemand = getLedgerValue(state, 'pendingSustainmentDemand', empireId, commodity);
  const backlogCap = Math.max(totalDemand, Math.ceil(totalDemand * SUSTAINMENT_BACKLOG_TICKS));

  const existing = state.marketOrders.buyOrders.find(order =>
    order.owner_type === 'empire' &&
    order.owner_id === empireId &&
    order.commodity === commodity &&
    order.tags?.purpose === IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE &&
    (order.filled_qty || 0) < order.qty
  );

  if (existing) {
    const existingFilled = Math.max(0, existing.filled_qty || 0);
    const existingOutstanding = Math.max(0, existing.qty - existingFilled);
    const cappedOutstanding = Math.min(existingOutstanding, backlogCap);
    const room = Math.max(0, backlogCap - cappedOutstanding);
    const queuedNow = Math.min(addedDemand, room);

    // Clamp legacy oversized orders and grow only within the backlog guardrail.
    existing.qty = existingFilled + cappedOutstanding + queuedNow;
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

  const initialQty = Math.min(addedDemand, backlogCap);
  if (initialQty <= 0) return;

  const buyOrder = createBuyOrder(
    nextOrderId('sustain_pool'),
    'empire',
    empireId,
    commodity,
    initialQty,
    maxPrice,
    SUSTAINMENT_ORDER_PRIORITY,
    SUSTAINMENT_ORDER_MAX_DURATION
  );
  buyOrder.category = 'needs';
  buyOrder.fee = 1;
  buyOrder.tags = {
    payer: empireId,
    beneficiary: empireId,
    purpose: IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE
  };
  state.marketOrders.buyOrders.push(buyOrder);
}

/**
 * Clamp pooled sustainment orders to this turn's finalized demand map.
 * This retires stale outstanding quantities while preserving guarded backlog behavior.
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

    const demand = getLedgerValue(state, 'pendingSustainmentDemand', order.owner_id, order.commodity);
    const backlogCap = demand > 0 ? Math.max(demand, Math.ceil(demand * SUSTAINMENT_BACKLOG_TICKS)) : 0;
    const filled = Math.max(0, order.filled_qty || 0);
    const outstanding = Math.max(0, order.qty - filled);
    const clampedOutstanding = Math.min(outstanding, backlogCap);
    order.qty = filled + clampedOutstanding;

    if (clampedOutstanding > 0 && state.market?.[order.commodity]) {
      order.max_price = state.market[order.commodity].price;
      order.priority = Math.max(order.priority || 0, SUSTAINMENT_ORDER_PRIORITY);
      order.category = 'needs';
      order.duration = 0;
      order.max_duration = Number.isFinite(order.max_duration)
        ? order.max_duration
        : SUSTAINMENT_ORDER_MAX_DURATION;
      order.fee = Number.isFinite(order.fee) ? order.fee : 1;
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
  let allSatisfied = true;
  const shortages = [];

  for (const [commodity, needed] of Object.entries(pendingNeeds)) {
    let remainingNeed = needed;
    if (needed <= 0) continue;

    if (commodity !== 'requisition') {
      const fromReceipts = consumeSustainmentReceipts(state, empire.id, commodity, remainingNeed);
      remainingNeed -= fromReceipts;
    }

    if (remainingNeed > 0) {
      allSatisfied = false;
      shortages.push(commodity);
    }
  }

  // Skip degradation checks during the grace tick after completion.
  const inGracePeriod = improvement.completedAtTick && (state.turn - improvement.completedAtTick) < 1;
  if (inGracePeriod) {
    if (allSatisfied) {
      improvement.ticksSinceSustained = 0;
    }
    return { log };
  }

  if (allSatisfied) {
    improvement.ticksSinceSustained = 0;

    // Restore to ACTIVE if was DEGRADED
    if (improvement.state === 'DEGRADED') {
      improvement.state = 'ACTIVE';
      improvement.degradedSince = null;
      log.push(`{green-fg}Restored:{/green-fg} ${improvement.name} is now ACTIVE`);
      logger.info(`Improvement restored: ${improvement.name}`);
    }
  } else {
    improvement.ticksSinceSustained = (improvement.ticksSinceSustained || 0) + 1;
    if (improvement.state !== 'DEGRADED') {
      if (improvement.ticksSinceSustained >= IMPROVEMENT_SUSTAINMENT_TICKS) {
        improvement.state = 'DEGRADED';
        improvement.degradedSince = state.turn;
        log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Missing: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks)`);
        logger.warn(`Improvement degraded: ${improvement.name} - shortages: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks without sustainment`);
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
    const needed = calculateImprovementNeed(state, empire, qtyPerPopulation);
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
