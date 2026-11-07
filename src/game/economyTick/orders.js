import { createBuyOrder, createSellOffer } from '../marketEconomy.js';
import { markDemandBacklogOrder } from './backlog.js';
import { MARKET_CONSTANTS } from '../constants.js';

const DEFAULT_BUY_ORDER_MAX_DURATION = 3;
export const DEFAULT_SELL_ORDER_MAX_DURATION = 6;

function isFreshSellOffer(order, turn) {
  return order.turn_added_turn === turn && order.duration === 0;
}

// A delivery only adds to the current batch. Earlier batches keep aging even
// when the same producer lists more of the commodity on every turn.
export function addProductionSellOffer(offers, turn, ownerType, ownerId, commodity, qty, price, priority, maxDuration = DEFAULT_SELL_ORDER_MAX_DURATION) {
  let offer = offers.find(order => isFreshSellOffer(order, turn) &&
    order.owner_type === ownerType && order.owner_id === ownerId && order.commodity === commodity);
  if (!offer) {
    const id = `sell_${turn}_${ownerType}_${ownerId}_${commodity}`;
    offer = createSellOffer(id, ownerType, ownerId, commodity, 0, price, priority, maxDuration);
    offer.turn_added_turn = turn;
    offer.turn_added_qty = 0;
    offers.push(offer);
  }
  offer.qty += qty;
  offer.turn_added_qty = (offer.turn_added_qty || 0) + qty;
  offer.ask_price = price;
  offer.priority = Math.max(offer.priority || 0, priority);
  offer.max_duration = Math.max(offer.max_duration || 0, maxDuration);
  return offer;
}

export function createOrderAggregator(state) {
  const buyOrders = [];
  let orderIdCounter = 0;

  // Track which orders should persist (from aggregation with existing or new creation)
  const ordersToSave = new Set();

  // Improvement production may already have listed a fresh batch this turn.
  const existingBuyOrders = state.marketOrders?.buyOrders?.filter(o => (o.filled_qty || 0) < o.qty) || [];
  const existingSellOffers = state.marketOrders?.sellOffers?.filter(o => (o.filled_qty || 0) < o.qty) || [];
  const sellOffers = existingSellOffers.filter(order => isFreshSellOffer(order, state.turn));

  const existingOrderIds = new Set([
    ...existingBuyOrders.map(order => order.id),
    ...existingSellOffers.map(order => order.id)
  ]);

  function nextOrderId(prefix) {
    let id;
    do {
      id = `${prefix}_${orderIdCounter++}`;
    } while (existingOrderIds.has(id));
    existingOrderIds.add(id);
    return id;
  }

  existingBuyOrders.forEach(order => {
    if (order.turn_added_turn !== state.turn) {
      order.turn_added_qty = 0;
      order.turn_added_turn = state.turn;
    }
  });
  existingSellOffers.forEach(order => {
    if (!isFreshSellOffer(order, state.turn)) {
      order.turn_added_qty = 0;
    }
  });

  function serializeTags(tags) {
    if (!tags || typeof tags !== 'object') return '';
    const sortedEntries = Object.entries(tags)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(Object.fromEntries(sortedEntries));
  }

  function getBuyAggregationKey(order) {
    return [
      order.owner_type,
      order.owner_id,
      order.commodity,
      order.category,
      serializeTags(order.tags)
    ].join('|');
  }

  function aggregateSellOffer(ownerType, ownerId, commodity, qty, price, priority) {
    const offer = addProductionSellOffer(sellOffers, state.turn, ownerType, ownerId, commodity, qty, price, priority);
    ordersToSave.add(offer);
    return offer;
  }

  /**
   * Find existing buy order for owner+commodity+category and aggregate qty
   * Returns updated order with fixed market price and reset duration
   */
  function aggregateBuyOrder(ownerType, ownerId, commodity, newQty, newPrice, category, priority, tags = null) {
    const targetKey = [
      ownerType,
      ownerId,
      commodity,
      category,
      serializeTags(tags)
    ].join('|');

    // First check new orders created this tick
    let existing = buyOrders.find(o => getBuyAggregationKey(o) === targetKey && (o.filled_qty || 0) < o.qty);

    if (!existing) {
      const order = createBuyOrder(
        nextOrderId('buy'),
        ownerType,
        ownerId,
        commodity,
        newQty,
        newPrice,
        priority,
        DEFAULT_BUY_ORDER_MAX_DURATION
      );
      order.category = category;
      if (tags) order.tags = { ...tags };
      order.fee = MARKET_CONSTANTS.ORDER_POSTING_FEE;
      order.filled_qty = 0;
      order.turn_added_qty = newQty;
      order.turn_added_turn = state.turn;
      markDemandBacklogOrder(order, {
        type: tags?.army_id ? 'army_demand' : 'empire_demand',
        id: tags?.army_id || ownerId,
        category: category || 'needs'
      });
      buyOrders.push(order);
      ordersToSave.add(order);
      return order;
    }

    existing.max_price = newPrice;
    existing.qty = existing.qty + newQty;
    existing.turn_added_qty = (existing.turn_added_qty || 0) + newQty;
    existing.turn_added_turn = state.turn;
    existing.age = 0;
    existing.backlog_age = 0;
    existing.duration = 0;
    existing.qty_remaining = Math.max(0, existing.qty - (existing.filled_qty || 0));
    existing.quantity_remaining = existing.qty_remaining;

    // If from existing orders, move to buyOrders for this tick
    if (!buyOrders.includes(existing)) {
      buyOrders.push(existing);
    }
    ordersToSave.add(existing);

    return existing;
  }

  return {
    buyOrders,
    sellOffers,
    ordersToSave,
    existingBuyOrders,
    existingSellOffers,
    aggregateBuyOrder,
    aggregateSellOffer
  };
}
