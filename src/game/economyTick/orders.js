import { createBuyOrder } from '../marketEconomy.js';

export function createOrderAggregator(state) {
  const buyOrders = [];
  const sellOffers = [];
  let orderIdCounter = 0;

  // Track which orders should persist (from aggregation with existing or new creation)
  const ordersToSave = new Set();

  // Load existing orders for aggregation (but don't add to arrays yet)
  const existingBuyOrders = state.marketOrders?.buyOrders?.filter(o => (o.filled_qty || 0) < o.qty) || [];
  const existingSellOffers = state.marketOrders?.sellOffers?.filter(o => (o.filled_qty || 0) < o.qty) || [];
  existingBuyOrders.forEach(order => {
    if (order.turn_added_turn !== state.turn) {
      order.turn_added_qty = 0;
      order.turn_added_turn = state.turn;
    }
  });
  existingSellOffers.forEach(order => {
    if (order.turn_added_turn !== state.turn) {
      order.turn_added_qty = 0;
      order.turn_added_turn = state.turn;
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

  /**
   * Find existing sell offer for owner+commodity and aggregate qty
   * Returns updated offer with fixed market price and reset duration
   */
  function aggregateSellOffer(ownerType, ownerId, commodity, newQty, newPrice, priority) {
    // First check new orders created this tick
    let existing = sellOffers.find(o =>
      o.owner_type === ownerType &&
      o.owner_id === ownerId &&
      o.commodity === commodity &&
      (o.filled_qty || 0) < o.qty
    );

    // Then check existing orders from previous ticks
    if (!existing) {
      existing = existingSellOffers.find(o =>
        o.owner_type === ownerType &&
        o.owner_id === ownerId &&
        o.commodity === commodity &&
        (o.filled_qty || 0) < o.qty
      );
    }

    if (!existing) {
      const offer = {
        id: `sell_${orderIdCounter++}`,
        owner_type: ownerType,
        owner_id: ownerId,
        commodity,
        qty: newQty,
        ask_price: newPrice,
        priority,
        filled_qty: 0,
        fee: 0,
        turn_added_qty: newQty,
        turn_added_turn: state.turn,
        // Sell-side resource accumulation is market-centered and persistent.
        max_duration: 1000000,
        duration: 0
      };
      sellOffers.push(offer);
      ordersToSave.add(offer);
      return offer;
    }

    existing.ask_price = newPrice;
    existing.qty = existing.qty + newQty;
    existing.turn_added_qty = (existing.turn_added_qty || 0) + newQty;
    existing.turn_added_turn = state.turn;
    existing.duration = 0;
    existing.max_duration = Number.isFinite(existing.max_duration) ? existing.max_duration : 1000000;

    // If from existing orders, move to sellOffers for this tick
    if (!sellOffers.includes(existing)) {
      sellOffers.push(existing);
    }
    ordersToSave.add(existing);

    return existing;
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

    // Then check existing orders from previous ticks
    if (!existing) {
      existing = existingBuyOrders.find(o => getBuyAggregationKey(o) === targetKey && (o.filled_qty || 0) < o.qty);
    }

    if (!existing) {
      const order = createBuyOrder(
        `buy_${orderIdCounter++}`,
        ownerType,
        ownerId,
        commodity,
        newQty,
        newPrice,
        priority,
        1000000
      );
      order.category = category;
      if (tags) order.tags = { ...tags };
      order.fee = 1;
      order.filled_qty = 0;
      order.turn_added_qty = newQty;
      order.turn_added_turn = state.turn;
      order.max_duration = 1000000;
      buyOrders.push(order);
      ordersToSave.add(order);
      return order;
    }

    existing.max_price = newPrice;
    existing.qty = existing.qty + newQty;
    existing.turn_added_qty = (existing.turn_added_qty || 0) + newQty;
    existing.turn_added_turn = state.turn;
    existing.duration = 0;
    existing.max_duration = Number.isFinite(existing.max_duration) ? existing.max_duration : 1000000;

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
