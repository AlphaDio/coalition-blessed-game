import { getOrderAvailable, consumeFromSellOrders } from '../marketOrderReserves.js';
import { refreshExpeditionMarketSnapshots } from './economy.js';

function reserveOrders(state, commodity) {
  const minors = new Map((state.expeditions?.empires || []).map(empire => [empire.id, empire]));
  return (state.marketOrders?.sellOffers || []).filter(order => {
    if (order.commodity !== commodity || getOrderAvailable(order) <= 0) return false;
    if (order.owner_type === 'empire') return state.empires?.some(empire => empire.id === order.owner_id);
    const minor = minors.get(order.owner_id);
    return order.owner_type === 'minor' && minor && !minor.war && minor.status !== 'HOSTILE';
  });
}

export function getExpeditionMaterialReserve(state, commodity) {
  return Math.max(0, state.stockpiles?.[commodity] || 0) +
    reserveOrders(state, commodity).reduce((sum, order) => sum + getOrderAvailable(order), 0);
}

// Reserve materials are purchased at the run's fixed market price. Coalition
// salvage is spent first; the producers receive payment for their actual goods.
export function quoteExpeditionCost(state, cost = {}) {
  let credits = 0;
  let reason = null;
  const requisition = cost.requisition || 0;
  if (requisition > 0 && (state.coalitionEconomy?.requisition || 0) < requisition) reason = 'Insufficient requisition';
  for (const [commodity, amount] of Object.entries(cost.materials || {})) {
    if (getExpeditionMaterialReserve(state, commodity) + 1e-9 < amount) {
      reason ||= `Need ${amount} ${commodity.replaceAll('_', ' ')} in Coalition stockpiles or market reserves`;
    }
    const owned = Math.max(0, state.stockpiles?.[commodity] || 0);
    credits += Math.max(0, amount - owned) * (state.market?.[commodity]?.price || 1);
  }
  if ((state.coalitionEconomy?.treasury_credits || 0) + 1e-9 < credits) reason ||= 'Insufficient treasury credits to buy reserved materials';
  return { ...structuredClone(cost), credits, reason, affordable: !reason };
}

export function spendExpeditionCost(state, cost) {
  const quote = quoteExpeditionCost(state, cost);
  if (!quote.affordable) return { success: false, error: quote.reason };
  state.coalitionEconomy.requisition -= cost.requisition || 0;
  state.stockpiles ||= {};
  for (const [commodity, amount] of Object.entries(cost.materials || {})) {
    const owned = Math.min(amount, Math.max(0, state.stockpiles[commodity] || 0));
    if (owned > 0) state.stockpiles[commodity] -= owned;
    let remaining = amount - owned;
    for (const order of reserveOrders(state, commodity)) {
      if (remaining <= 1e-9) break;
      const take = Math.min(remaining, getOrderAvailable(order));
      const payment = take * (state.market?.[commodity]?.price || 1);
      const owners = order.owner_type === 'empire' ? state.empires : state.expeditions.empires;
      const owner = owners.find(empire => empire.id === order.owner_id);
      owner.budget_credits = (owner.budget_credits || 0) + payment;
      state.coalitionEconomy.treasury_credits -= payment;
      consumeFromSellOrders([order], take);
      remaining -= take;
    }
  }
  refreshExpeditionMarketSnapshots(state);
  return { success: true };
}
