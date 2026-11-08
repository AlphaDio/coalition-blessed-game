// Discovered powers trade in the ordinary commodity market, but have one
// output, one upkeep requirement, and their own finite currency budget.
import { refreshMarketBacklogSnapshots } from '../economyTick/backlog.js';

export function refreshExpeditionMarketSnapshots(state) {
  if (!state.market || !state.marketOrders) return;
  const offers = (state.marketOrders.sellOffers || [])
    .filter(order => order.qty > (order.filled_qty || 0))
    .map(order => ({ ...order, remaining: order.qty - (order.filled_qty || 0) }));
  state.market.remaining_sell_offers_post_clear = offers;
  for (const entry of Object.values(state.market)) {
    if (entry?.commodity) entry.remaining_sell_offers_post_clear = offers.filter(order => order.commodity === entry.commodity);
  }
  refreshMarketBacklogSnapshots(state, state.marketOrders.buyOrders || []);
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function minorCanTrade(minor) {
  return !!minor && !minor.war && minor.status !== 'HOSTILE';
}

export function cancelMinorOrders(state, minorId) {
  if (!state.marketOrders) return;
  for (const key of ['buyOrders', 'sellOffers']) {
    state.marketOrders[key] = (state.marketOrders[key] || []).filter(order =>
      order.owner_type !== 'minor' || order.owner_id !== minorId
    );
  }
  refreshExpeditionMarketSnapshots(state);
}

export function prepareMinorEconomy(state) {
  const minors = state.expeditions?.empires || [];
  const tradingIds = new Set(minors.filter(minorCanTrade).map(minor => minor.id));
  if (state.marketOrders) {
    // Sustainment is a daily requirement, not a promise to consume yesterday's
    // missing supplies again. Drop these orders without generating Coalition
    // pressure. Unsold production can accumulate until its ordinary expiry.
    state.marketOrders.buyOrders = (state.marketOrders.buyOrders || [])
      .filter(order => order.owner_type !== 'minor');
    state.marketOrders.sellOffers = (state.marketOrders.sellOffers || [])
      .filter(order => order.owner_type !== 'minor' || tradingIds.has(order.owner_id));
  }

  for (const minor of minors) {
    const previousFulfillment = Number.isFinite(minor.supplyState?.fulfillment)
      ? Math.max(0, Math.min(1, minor.supplyState.fulfillment))
      : 1;
    minor.budget_credits = nonNegative(minor.budget_credits);
    minor.supplyState = {
      commodity: minor.sustain?.commodity,
      demanded: nonNegative(minor.sustain?.amount),
      received: 0,
      fulfillment: previousFulfillment,
      output: 0
    };
  }
}

export function emitMinorEconomyOrders(state, aggregator) {
  for (const minor of state.expeditions?.empires || []) {
    if (!minorCanTrade(minor)) continue;

    const outputCommodity = minor.production?.commodity;
    const outputMarket = state.market?.[outputCommodity];
    const multiplier = Number.isFinite(minor.exportMultiplier)
      ? Math.max(0, minor.exportMultiplier)
      : 1;
    const fulfillment = Math.max(0.25, Math.min(1, minor.supplyState?.fulfillment ?? 1));
    const output = nonNegative(minor.production?.amount) * multiplier * fulfillment;
    if (outputMarket && output > 0) {
      aggregator.aggregateSellOffer('minor', minor.id, outputCommodity, output, outputMarket.price, 0);
      minor.supplyState.output = output;
    }

    const commodity = minor.sustain?.commodity;
    const market = state.market?.[commodity];
    const demand = nonNegative(minor.sustain?.amount);
    if (!market || demand <= 0) continue;

    const order = {
      id: `minor_sustain_${minor.id}_${state.turn}`,
      owner_type: 'minor',
      owner_id: minor.id,
      commodity,
      qty: demand,
      filled_qty: 0,
      max_price: market.price,
      priority: 0,
      category: 'needs',
      fee: 0,
      duration: 0,
      max_duration: 1,
      turn_added_qty: demand,
      turn_added_turn: state.turn
    };
    aggregator.buyOrders.push(order);
    aggregator.ordersToSave.add(order);
  }
}

export function enforceMinorBudgetConstraints(state, buyOrders, sellOffers) {
  const minorsById = new Map((state.expeditions?.empires || []).map(minor => [minor.id, minor]));
  const remaining = new Map();
  const blocked = [];
  for (const minor of minorsById.values()) {
    minor.budget_credits = nonNegative(minor.budget_credits);
    remaining.set(minor.id, minor.budget_credits);
  }

  const validBuyOrders = (buyOrders || []).filter(order =>
    order.owner_type !== 'minor' || minorCanTrade(minorsById.get(order.owner_id))
  );
  const minorOrders = validBuyOrders.filter(order => order.owner_type === 'minor')
    .slice().sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(a.id).localeCompare(String(b.id)));
  for (const order of minorOrders) {
    const available = remaining.get(order.owner_id) || 0;
    const price = Number(order.max_price);
    const requested = Math.max(0, nonNegative(order.qty) - nonNegative(order.filled_qty));
    const affordable = !Number.isFinite(price) || price < 0 ? 0
      : price === 0 ? requested : Math.min(requested, available / price);
    const allowed = Math.floor(affordable * 1e6) / 1e6;
    if (allowed < requested) {
      order.qty = nonNegative(order.filled_qty) + allowed;
      blocked.push({ order_id: order.id, empire_id: order.owner_id, owner_type: 'minor',
        commodity: order.commodity, category: 'needs', quantity: requested - allowed, reason: 'budget_commitment' });
    }
    remaining.set(order.owner_id, Math.max(0, available - allowed * (Number.isFinite(price) ? price : 0)));
  }
  const validSellOffers = (sellOffers || []).filter(order =>
    order.owner_type !== 'minor' || minorCanTrade(minorsById.get(order.owner_id))
  );
  return { validBuyOrders, validSellOffers, blocked };
}

export function applyMinorBuyTrade(state, trade, order) {
  const minor = (state.expeditions?.empires || []).find(entry => entry.id === order.owner_id);
  if (!minor) return;
  minor.budget_credits = Math.max(0, nonNegative(minor.budget_credits) - trade.qty * trade.price);
  if (!minor.supplyState) minor.supplyState = { received: 0 };
  minor.supplyState.received = nonNegative(minor.supplyState.received) + trade.qty;
}

export function applyMinorEconomyPostMarket(state) {
  for (const minor of state.expeditions?.empires || []) {
    const demand = nonNegative(minor.sustain?.amount);
    const received = nonNegative(minor.supplyState?.received);
    const fulfillment = demand <= 0 ? 1 : Math.max(0, Math.min(1, received / demand));
    minor.supplyState = { ...minor.supplyState, demanded: demand, received, fulfillment };
    const delta = fulfillment >= 1 - 1e-9 ? 0.1 : -0.75 * (1 - fulfillment);
    minor.approval = Math.max(0, Math.min(100, (Number(minor.approval) || 0) + delta));
  }
}
