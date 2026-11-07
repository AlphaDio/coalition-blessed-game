import { clearMarket } from '../marketEconomy.js';
import { MARKET_CONSTANTS } from '../constants.js';
import { DEFAULT_SELL_ORDER_MAX_DURATION } from './orders.js';
import {
  IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE,
  creditSustainmentReceipts
} from '../improvements/engine/sustainment.js';
import { CONSUMPTION_SOURCES, recordConsumption } from '../consumptionToRequisition.js';
import {
  enforceMinorBudgetConstraints,
  applyMinorBuyTrade,
  applyMinorSellTrade
} from '../expeditions/economy.js';
import {
  addPressure,
  finalizeBacklogOrders,
  getPressureConfig,
  isDemandBacklogOrder,
  normalizeBacklogOrder,
  refreshMarketBacklogSnapshots,
  updateBacklogSnapshot
} from './backlog.js';

function ensureEmpireSpend(empire) {
  empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
  return empire.economy_spend;
}

const BUDGET_EPSILON = 1e-9;
const QUANTITY_PRECISION = 1e6;

function getOrderFee(order) {
  const fee = Number(order?.fee);
  return Number.isFinite(fee) ? Math.max(0, fee) : MARKET_CONSTANTS.ORDER_POSTING_FEE;
}

function getEmpireBudget(empire) {
  const budget = Number(empire?.budget_credits);
  return Number.isFinite(budget) ? Math.max(0, budget) : 0;
}

function compareBudgetPriority(a, b) {
  const priorityDelta = (Number(b?.priority) || 0) - (Number(a?.priority) || 0);
  if (priorityDelta !== 0) return priorityDelta;

  // Preserve essential needs ahead of wants when they share a priority tier.
  const categoryDelta = (b?.category === 'needs' ? 1 : 0) - (a?.category === 'needs' ? 1 : 0);
  if (categoryDelta !== 0) return categoryDelta;

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function normalizeOrderQuantity(value) {
  return Math.floor(Math.max(0, Number(value) || 0) * QUANTITY_PRECISION) / QUANTITY_PRECISION;
}

function getConsumptionSourceFromBuyOrder(buyOrder) {
  if (!buyOrder) return CONSUMPTION_SOURCES.UNKNOWN;
  const demandType = buyOrder.tags?.demand_type;
  if (demandType === 'army_needs') return CONSUMPTION_SOURCES.ARMY_NEEDS;
  if (demandType === 'army_wants') return CONSUMPTION_SOURCES.ARMY_WANTS;
  if (buyOrder.tags?.army_id) {
    return buyOrder.category === 'wants'
      ? CONSUMPTION_SOURCES.ARMY_WANTS
      : CONSUMPTION_SOURCES.ARMY_NEEDS;
  }
  return buyOrder.category === 'wants'
    ? CONSUMPTION_SOURCES.EMPIRE_WANTS
    : CONSUMPTION_SOURCES.EMPIRE_NEEDS;
}

function applyBuyTrade(state, trade, buyOrder, empiresById, armiesById) {
  if (buyOrder.owner_type === 'minor') {
    applyMinorBuyTrade(state, trade, buyOrder);
    return;
  }
  if (buyOrder.owner_type === 'empire') {
    const empire = empiresById.get(buyOrder.owner_id);
    if (!empire) return;

    const tradeCost = trade.qty * trade.price;
    empire.budget_credits = (empire.budget_credits || 0) - tradeCost;
    const category = buyOrder.category === 'wants' ? 'wants' : 'needs';
    ensureEmpireSpend(empire)[category] += tradeCost;

    if (buyOrder.tags?.purpose === IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE) {
      creditSustainmentReceipts(state, buyOrder.owner_id, trade.commodity, trade.qty);
      return;
    }

    const consumptionSource = getConsumptionSourceFromBuyOrder(buyOrder);
    recordConsumption(trade.commodity, trade.qty, buyOrder.owner_id, consumptionSource);

    const taggedArmyId = buyOrder.tags?.army_id;
    if (taggedArmyId) {
      const army = armiesById.get(taggedArmyId);
      if (army) {
        if (!army.supply_state) {
          army.supply_state = { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} };
        }
        if (!army.supply_state.received) army.supply_state.received = {};
        army.supply_state.received[trade.commodity] = (army.supply_state.received[trade.commodity] || 0) + trade.qty;
      }
    } else {
      // Track received quantities on the empire supply_state for fulfillment calculations
      if (!empire.supply_state) {
        empire.supply_state = { needs_demand: {}, wants_demand: {}, received: {}, needs_fulfillment: {}, wants_fulfillment: {} };
      }
      if (!empire.supply_state.received) empire.supply_state.received = {};
      empire.supply_state.received[trade.commodity] = (empire.supply_state.received[trade.commodity] || 0) + trade.qty;
      if (consumptionSource === CONSUMPTION_SOURCES.EMPIRE_NEEDS) {
        empire.supply_state.needs_received = empire.supply_state.needs_received || {};
        empire.supply_state.needs_received[trade.commodity] = (empire.supply_state.needs_received[trade.commodity] || 0) + trade.qty;
      } else if (consumptionSource === CONSUMPTION_SOURCES.EMPIRE_WANTS) {
        empire.supply_state.wants_received = empire.supply_state.wants_received || {};
        empire.supply_state.wants_received[trade.commodity] = (empire.supply_state.wants_received[trade.commodity] || 0) + trade.qty;
      }
    }
    return;
  }

  if (buyOrder.owner_type === 'army') {
    const army = armiesById.get(buyOrder.owner_id);
    if (!army) return;

    const consumptionSource = buyOrder.category === 'wants'
      ? CONSUMPTION_SOURCES.ARMY_WANTS
      : CONSUMPTION_SOURCES.ARMY_NEEDS;
    recordConsumption(trade.commodity, trade.qty, army.empireId, consumptionSource);

    if (!army.supply_state) {
      army.supply_state = { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} };
    }
    if (!army.supply_state.received) army.supply_state.received = {};
    army.supply_state.received[trade.commodity] = (army.supply_state.received[trade.commodity] || 0) + trade.qty;
  }
}

function applySellTrade(state, trade, sellOffer, empiresById) {
  if (sellOffer.owner_type === 'minor') {
    applyMinorSellTrade(state, trade, sellOffer);
    return;
  }
  if (sellOffer.owner_type !== 'empire') return;
  const empire = empiresById.get(sellOffer.owner_id);
  if (!empire) return;
  empire.budget_credits = (empire.budget_credits || 0) + (trade.qty * trade.price);
}

function mergeOrdersById(baseOrders, overridingOrders) {
  const merged = new Map();
  for (const order of baseOrders || []) {
    if (!order?.id) continue;
    merged.set(order.id, order);
  }
  for (const order of overridingOrders || []) {
    if (!order?.id) continue;
    merged.set(order.id, order);
  }
  return Array.from(merged.values());
}

function getRemainingQty(order) {
  return Math.max(0, (order?.qty || 0) - (order?.filled_qty || 0));
}

const DEFAULT_BUY_ORDER_MAX_DURATION = 3;
const LEGACY_PERSISTENT_ORDER_DURATION = 1000000;

function resolveOrderMaxDuration(order, fallback) {
  const configured = Number.isFinite(order?.max_duration)
    ? Math.floor(order.max_duration)
    : fallback;

  // Older saves used 1,000,000 as a persistent-order sentinel. Convert that
  // sentinel to a real finite lifetime so stale conditional orders can clear.
  if (configured >= LEGACY_PERSISTENT_ORDER_DURATION) return fallback;
  return Math.max(1, configured);
}

function advanceOrder(order, fallbackDuration, expiredOrders) {
  if (getRemainingQty(order) <= 0) return false;

  order.duration = (order.duration || 0) + 1;
  order.max_duration = resolveOrderMaxDuration(order, fallbackDuration);
  if (order.duration > order.max_duration) {
    expiredOrders.push(order);
    return false;
  }

  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getOrderEmpireId(order, armiesById) {
  if (!order) return null;
  if (order.owner_type === 'empire') return order.owner_id || null;
  if (order.owner_type === 'army') {
    const army = armiesById.get(order.owner_id);
    return army?.empireId || null;
  }
  return null;
}

/**
 * Enforce the empire currency boundary before market clearing.
 *
 * Empire budgets are a hard, non-negative purchasing limit. Coalition
 * requisition and treasury credits are intentionally not interchangeable with
 * empire budgets: normal commodity orders cannot draw from coalition-level
 * balances. Existing backlog orders are included here so
 * an order left on the book cannot fill after its owner has exhausted its
 * budget.
 */
export function enforceEmpireBudgetConstraints(state, validBuyOrders, validSellOffers) {
  const minorBudgetResult = enforceMinorBudgetConstraints(state, validBuyOrders, validSellOffers);
  validBuyOrders = minorBudgetResult.validBuyOrders;
  validSellOffers = minorBudgetResult.validSellOffers;
  const empiresById = new Map((state.empires || []).map(empire => [empire.id, empire]));
  const armiesById = new Map((state.armies || []).map(army => [army.id, army]));
  const budgetRemaining = new Map();
  const blocked = [...minorBudgetResult.blocked];

  empiresById.forEach((empire, empireId) => {
    const normalizedBudget = getEmpireBudget(empire);
    // Normalize legacy negative/invalid balances at the economy boundary so
    // they cannot compound into an unbounded debt state.
    empire.budget_credits = normalizedBudget;
    budgetRemaining.set(empireId, normalizedBudget);
  });

  const feeOrders = [
    ...(validBuyOrders || []).map(order => ({ order, kind: 'buy' })),
    ...(validSellOffers || []).map(order => ({ order, kind: 'sell' }))
  ].filter(({ order }) => order?.owner_type === 'empire' && empiresById.has(order.owner_id));

  feeOrders.sort((a, b) => {
    const empireDelta = String(a.order.owner_id).localeCompare(String(b.order.owner_id));
    if (empireDelta !== 0) return empireDelta;
    const priorityDelta = compareBudgetPriority(a.order, b.order);
    if (priorityDelta !== 0) return priorityDelta;
    return a.kind === b.kind ? 0 : (a.kind === 'buy' ? -1 : 1);
  });

  const feeAllowed = new Set();
  feeOrders.forEach(({ order }) => {
    const empireId = order.owner_id;
    const fee = getOrderFee(order);
    const available = budgetRemaining.get(empireId) || 0;
    if (fee <= available + BUDGET_EPSILON) {
      budgetRemaining.set(empireId, Math.max(0, available - fee));
      feeAllowed.add(order.id);
      return;
    }

    blocked.push({
      order_id: order.id,
      empire_id: empireId,
      commodity: order.commodity,
      category: order.category || null,
      quantity: getRemainingQty(order),
      reason: 'order_fee'
    });
  });

  const affordableBuyOrders = (validBuyOrders || []).filter(order => {
    if (order?.owner_type !== 'empire') return true;
    return feeAllowed.has(order.id);
  });
  const affordableSellOffers = (validSellOffers || []).filter(order => {
    if (order?.owner_type !== 'empire') return true;
    return feeAllowed.has(order.id);
  });

  // Reserve the maximum possible trade cost, not the current ask price. This
  // is conservative but guarantees that relation adjustments or malformed
  // seller prices cannot push a buyer below zero during settlement.
  const buyOrdersByPriority = affordableBuyOrders
    .filter(order => order?.owner_type === 'empire')
    .slice()
    .sort((a, b) => {
      const empireDelta = String(a.owner_id).localeCompare(String(b.owner_id));
      return empireDelta !== 0 ? empireDelta : compareBudgetPriority(a, b);
    });

  buyOrdersByPriority.forEach(order => {
    const empireId = getOrderEmpireId(order, armiesById);
    if (!empireId || !empiresById.has(empireId)) return;

    const remainingQty = getRemainingQty(order);
    if (remainingQty <= BUDGET_EPSILON) return;

    const maxPrice = Number(order.max_price);
    const available = budgetRemaining.get(empireId) || 0;
    const affordableQty = !Number.isFinite(maxPrice) || maxPrice < 0
      ? 0
      : maxPrice <= BUDGET_EPSILON
        ? remainingQty
        : Math.min(remainingQty, available / maxPrice);
    const allowedQty = normalizeOrderQuantity(affordableQty);
    const blockedQty = Math.max(0, remainingQty - allowedQty);

    if (blockedQty > BUDGET_EPSILON) {
      const filledQty = Math.max(0, Number(order.filled_qty) || 0);
      order.qty = filledQty + allowedQty;
      order.qty_remaining = allowedQty;
      order.quantity_remaining = allowedQty;
      blocked.push({
        order_id: order.id,
        empire_id: empireId,
        commodity: order.commodity,
        category: order.category || null,
        quantity: blockedQty,
        reason: 'budget_commitment'
      });
    }

    if (maxPrice > BUDGET_EPSILON && allowedQty > BUDGET_EPSILON) {
      budgetRemaining.set(empireId, Math.max(0, available - (allowedQty * maxPrice)));
    }
  });

  state.economyBudgetBlockedLastTick = blocked;

  return {
    validBuyOrders: affordableBuyOrders,
    validSellOffers: affordableSellOffers,
    budgetRemaining
  };
}

function getRelationValue(state, fromEmpireId, toEmpireId) {
  if (!fromEmpireId || !toEmpireId || fromEmpireId === toEmpireId) return 0;
  return state?.diplomacy?.relations?.[fromEmpireId]?.[toEmpireId] ?? 0;
}

function applyRelationAdjustedTradePrice(state, trade, buyOrder, sellOffer, armiesById) {
  const buyerEmpireId = getOrderEmpireId(buyOrder, armiesById);
  const sellerEmpireId = getOrderEmpireId(sellOffer, armiesById);
  if (!buyerEmpireId || !sellerEmpireId) return;

  const relation = clamp(getRelationValue(state, buyerEmpireId, sellerEmpireId), -100, 100);
  const swingCap = MARKET_CONSTANTS.RELATION_PRICE_SWING_CAP || 0;
  const relationMultiplier = 1 - ((relation / 100) * swingCap);
  const adjustedPrice = trade.price * relationMultiplier;
  const buyMaxPrice = Number.isFinite(buyOrder?.max_price) ? buyOrder.max_price : adjustedPrice;

  trade.price = Math.max(0, Math.min(adjustedPrice, buyMaxPrice));
}

export function applyOrderDurations(state, buyOrders, sellOffers) {
  const allBuyOrders = mergeOrdersById(state.marketOrders?.buyOrders || [], buyOrders);
  const allSellOffers = mergeOrdersById(state.marketOrders?.sellOffers || [], sellOffers);

  if (state.economyPressure?.last_expired && Array.isArray(state.economyPressure.last_expired)) {
    state.economyPressure.last_expired = [];
  }

  const validBuyOrders = [];
  const expiredBuyOrders = [];
  const cancelledBuyOrders = [];

  allBuyOrders.forEach(order => {
    if (isDemandBacklogOrder(order)) {
      normalizeBacklogOrder(order, state);
      if (!order.source_valid) {
        cancelledBuyOrders.push(order);
        return;
      }
      // Demand backlog age advances after allocation, not before it. This
      // keeps a newly-created demand item alive for its configured lifetime.
      validBuyOrders.push(order);
      return;
    }
    if (advanceOrder(order, DEFAULT_BUY_ORDER_MAX_DURATION, expiredBuyOrders)) {
      validBuyOrders.push(order);
    }
  });

  state.economyBacklogCancelledLastTick = cancelledBuyOrders.map(order => ({
    id: order.id,
    resource: order.commodity,
    quantity: Math.max(0, (order.qty || 0) - (order.filled_qty || 0)),
    source: order.source
  }));
  state.economyBacklogExpiredLastTick = [];
  expiredBuyOrders.forEach(order => {
    const quantity = Math.max(0, (order.qty || 0) - (order.filled_qty || 0));
    if (quantity <= 0 || !order.commodity || !order.category) return;
    const pressureAmount = addPressure(state, order.commodity, quantity, order.source || {
      type: `${order.owner_type || 'unknown'}_demand`,
      id: order.owner_id || null,
      category: order.category
    });
    state.economyBacklogExpiredLastTick.push({
      id: order.id,
      resource: order.commodity,
      quantity,
      source: order.source || null,
      pressure: getPressureConfig(order.commodity).key,
      amount: pressureAmount
    });
  });

  const validSellOffers = [];
  const expiredSellOffers = [];

  allSellOffers.forEach(order => {
    if (advanceOrder(order, DEFAULT_SELL_ORDER_MAX_DURATION, expiredSellOffers)) {
      validSellOffers.push(order);
    }
  });

  return {
    allBuyOrders,
    allSellOffers,
    validBuyOrders,
    validSellOffers,
    expiredBuyOrders,
    expiredSellOffers,
    cancelledBuyOrders
  };
}

export function applyOrderFees(state, validBuyOrders, allSellOffers) {
  const empiresById = new Map((state.empires || []).map(empire => [empire.id, empire]));

  validBuyOrders.forEach(order => {
    if (order.owner_type !== 'empire') return;
    const empire = empiresById.get(order.owner_id);
    if (!empire) return;
    const fee = getOrderFee(order);
    empire.budget_credits = Math.max(0, getEmpireBudget(empire) - fee);
    ensureEmpireSpend(empire).order_fees += fee;
  });

  allSellOffers.forEach(order => {
    if (order.owner_type !== 'empire') return;
    const empire = empiresById.get(order.owner_id);
    if (!empire) return;
    const fee = getOrderFee(order);
    empire.budget_credits = Math.max(0, getEmpireBudget(empire) - fee);
    ensureEmpireSpend(empire).order_fees += fee;
  });
}

export function resetEmpireSpend(state) {
  // Reset empire spend tracking before market clearing
  state.empires.forEach(empire => {
    empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
    empire.economy_spend.needs = 0;
    empire.economy_spend.wants = 0;
  });
}

export function clearMarkets(state, commodities, validBuyOrders, validSellOffers, options = {}) {
  if (!options.budgetsEnforced) {
    const budgetResult = enforceEmpireBudgetConstraints(state, validBuyOrders, validSellOffers);
    validBuyOrders = budgetResult.validBuyOrders;
    validSellOffers = budgetResult.validSellOffers;
  }

  const allTrades = [];
  const remainingSellOffersPostClear = [];
  const remainingBuyOrdersPostClear = [];
  const buyBacklogByCommodity = {};
  const buyBacklogByCommodityAndOwner = {};
  const buyOrdersById = new Map(validBuyOrders.map(order => [order.id, order]));
  const sellOffersById = new Map(validSellOffers.map(order => [order.id, order]));
  const empiresById = new Map((state.empires || []).map(empire => [empire.id, empire]));
  const armiesById = new Map((state.armies || []).map(army => [army.id, army]));

  commodities.forEach(commodity => {
    const marketState = state.market[commodity.key];
    if (!marketState) return;

    const clearResult = clearMarket(validBuyOrders, validSellOffers, marketState);

    // Keep per-commodity post-clear liquidity snapshots for UI/inspection.
    marketState.remaining_sell_offers_post_clear = clearResult.unfilledSells;
    marketState.remaining_buy_offers_post_clear = clearResult.unfilledBuys;
    marketState.buy_backlog_total = clearResult.unfilledBuys.reduce(
      (sum, order) => sum + getRemainingQty(order),
      0
    );

    remainingSellOffersPostClear.push(...clearResult.unfilledSells);
    remainingBuyOrdersPostClear.push(...clearResult.unfilledBuys);

    buyBacklogByCommodity[commodity.key] = marketState.buy_backlog_total;
    const ownerBacklog = {};
    clearResult.unfilledBuys.forEach(order => {
      const ownerKey = order.owner_id || 'unknown';
      ownerBacklog[ownerKey] = (ownerBacklog[ownerKey] || 0) + getRemainingQty(order);
    });
    buyBacklogByCommodityAndOwner[commodity.key] = ownerBacklog;

    // Apply trades to entities
    clearResult.trades.forEach(trade => {
      const buyOrder = buyOrdersById.get(trade.buy_order_id);
      const sellOffer = sellOffersById.get(trade.sell_offer_id);
      if (!buyOrder || !sellOffer) return;

      applyRelationAdjustedTradePrice(state, trade, buyOrder, sellOffer, armiesById);
      applyBuyTrade(state, trade, buyOrder, empiresById, armiesById);
      applySellTrade(state, trade, sellOffer, empiresById);
      allTrades.push(trade);
    });

  });

  if (state.market) {
    state.market.remaining_sell_offers_post_clear = remainingSellOffersPostClear;
    state.market.remaining_buy_offers_post_clear = remainingBuyOrdersPostClear;
    state.market.buy_backlog_by_commodity = buyBacklogByCommodity;
    state.market.buy_backlog_by_commodity_and_owner = buyBacklogByCommodityAndOwner;
  }

  return allTrades;
}

export function saveMarketOrders(state, ordersToSave, validBuyOrders, validSellOffers, buyOrders, sellOffers) {
  void ordersToSave;
  void buyOrders;
  void sellOffers;

  // Persist every still-active order exactly once by ID.
  const allValidBuyOrders = validBuyOrders.filter(order => getRemainingQty(order) > 0);
  const allValidSellOffers = validSellOffers.filter(order => getRemainingQty(order) > 0);

  // Remove duplicates by ID
  const uniqueBuyOrders = Array.from(new Map(allValidBuyOrders.map(o => [o.id, o])).values());
  const uniqueSellOffers = Array.from(new Map(allValidSellOffers.map(o => [o.id, o])).values());

  state.marketOrders = {
    buyOrders: uniqueBuyOrders,
    sellOffers: uniqueSellOffers
  };

  updateBacklogSnapshot(state, uniqueBuyOrders);
  refreshMarketBacklogSnapshots(state, uniqueBuyOrders);
}

/**
 * Age demand backlog only after the market has had a chance to allocate supply.
 * Expired quantities are converted to pressure; cancelled conditional demand is
 * discarded because its underlying commitment no longer exists.
 */
export function finalizeDemandBacklog(state, validBuyOrders) {
  return finalizeBacklogOrders(state, validBuyOrders);
}
