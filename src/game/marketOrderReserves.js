/**
 * Shared helpers for reading/consuming outstanding market sell-order reserves.
 * Reserves are represented by the unfilled portion of empire sell offers.
 */

export function getOrderAvailable(order) {
  return Math.max(0, (order?.qty || 0) - (order?.filled_qty || 0));
}

export function getEmpireCommoditySellOrders(state, empireId, commodity) {
  return (state?.marketOrders?.sellOffers || []).filter(order =>
    order.owner_type === 'empire' &&
    order.owner_id === empireId &&
    order.commodity === commodity &&
    getOrderAvailable(order) > 0
  );
}

export function getCommodityReserveOrders(state, commodity) {
  return (state?.marketOrders?.sellOffers || []).filter(order =>
    order.owner_type === 'empire' &&
    order.commodity === commodity &&
    getOrderAvailable(order) > 0
  );
}

export function getCommodityReserveQty(state, commodity) {
  return getCommodityReserveOrders(state, commodity)
    .reduce((sum, order) => sum + getOrderAvailable(order), 0);
}

export function consumeFromSellOrders(orders, amountToConsume) {
  let remaining = Math.max(0, amountToConsume);
  let consumed = 0;

  for (const order of orders || []) {
    if (remaining <= 0) break;

    const available = getOrderAvailable(order);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    // Keep already-filled quantity intact; retire only from unfilled accumulation.
    order.qty = Math.max(order.filled_qty || 0, (order.qty || 0) - take);
    remaining -= take;
    consumed += take;
  }

  return consumed;
}

export function consumeCommodityReserve(state, commodity, amount) {
  const orders = getCommodityReserveOrders(state, commodity);
  return consumeFromSellOrders(orders, amount);
}
