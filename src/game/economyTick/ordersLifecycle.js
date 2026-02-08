import { clearMarket } from '../marketEconomy.js';
import {
  IMPROVEMENT_SUSTAINMENT_POOL_PURPOSE,
  creditSustainmentReceipts
} from '../improvements/engine/sustainment.js';

function ensureEmpireSpend(empire) {
  empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
  return empire.economy_spend;
}

function applyLegacySustainmentTrade(state, buyOrder, trade) {
  if (buyOrder.tags?.purpose !== 'sustainment') return;
  if (!buyOrder.tags?.originator || !state.improvements?.queue) return;

  const improvement = state.improvements.queue.find(i => i.id === buyOrder.tags.originator);
  if (!improvement) return;

  if (!improvement.sustainmentBuffer) {
    improvement.sustainmentBuffer = { ...(improvement.stockpile || {}) };
  }
  improvement.sustainmentBuffer[trade.commodity] =
    (improvement.sustainmentBuffer[trade.commodity] || 0) + trade.qty;
}

function applyBuyTrade(state, trade, buyOrder, empiresById, armiesById) {
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

    applyLegacySustainmentTrade(state, buyOrder, trade);
    return;
  }

  if (buyOrder.owner_type === 'army') {
    const army = armiesById.get(buyOrder.owner_id);
    if (!army) return;
    if (!army.supply_state.received) army.supply_state.received = {};
    army.supply_state.received[trade.commodity] = (army.supply_state.received[trade.commodity] || 0) + trade.qty;
  }
}

function applySellTrade(trade, sellOffer, empiresById) {
  if (sellOffer.owner_type !== 'empire') return;
  const empire = empiresById.get(sellOffer.owner_id);
  if (!empire) return;
  empire.budget_credits = (empire.budget_credits || 0) + (trade.qty * trade.price);
}

export function applyOrderDurations(state, buyOrders, sellOffers) {
  const allBuyOrders = buyOrders.concat(state.marketOrders?.buyOrders || []);
  const allSellOffers = sellOffers.concat(state.marketOrders?.sellOffers || []);

  // Increment duration on all buy orders and separate expired ones
  const validBuyOrders = [];
  const expiredBuyOrders = [];

  allBuyOrders.forEach(order => {
    order.duration = (order.duration || 0) + 1;
    const maxDuration = Number.isFinite(order.max_duration) ? order.max_duration : 3;

    if (order.duration > maxDuration) {
      expiredBuyOrders.push(order);
    } else {
      validBuyOrders.push(order);
    }
  });

  // Increment duration on all sell offers (sell-side accumulation is persistent)
  const validSellOffers = [];
  const expiredSellOffers = [];

  allSellOffers.forEach(order => {
    order.duration = (order.duration || 0) + 1;
    validSellOffers.push(order);
  });

  return {
    allBuyOrders,
    allSellOffers,
    validBuyOrders,
    validSellOffers,
    expiredBuyOrders,
    expiredSellOffers
  };
}

export function applyExpiredSellOffers(state, expiredSellOffers) {
  // Sell offers are persistent by design; no expiry side-effects.
  void state;
  void expiredSellOffers;
}

export function applyOrderFees(state, validBuyOrders, allSellOffers) {
  const empiresById = new Map((state.empires || []).map(empire => [empire.id, empire]));

  validBuyOrders.forEach(order => {
    if (order.owner_type !== 'empire') return;
    const empire = empiresById.get(order.owner_id);
    if (!empire) return;
    const fee = order.fee || 1;
    empire.budget_credits = (empire.budget_credits || 0) - fee;
    ensureEmpireSpend(empire).order_fees += fee;
  });

  allSellOffers.forEach(order => {
    if (order.owner_type !== 'empire') return;
    const empire = empiresById.get(order.owner_id);
    if (!empire) return;
    const fee = order.fee || 1;
    empire.budget_credits = (empire.budget_credits || 0) - fee;
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

export function clearMarkets(state, commodities, validBuyOrders, validSellOffers) {
  const allTrades = [];
  const buyOrdersById = new Map(validBuyOrders.map(order => [order.id, order]));
  const sellOffersById = new Map(validSellOffers.map(order => [order.id, order]));
  const empiresById = new Map((state.empires || []).map(empire => [empire.id, empire]));
  const armiesById = new Map((state.armies || []).map(army => [army.id, army]));

  commodities.forEach(commodity => {
    const marketState = state.market[commodity.key];
    if (!marketState) return;

    const clearResult = clearMarket(validBuyOrders, validSellOffers, marketState);
    allTrades.push(...clearResult.trades);

    // Keep per-commodity post-clear liquidity snapshots for UI/inspection.
    marketState.remaining_sell_offers_post_clear = clearResult.unfilledSells;

    // Apply trades to entities
    clearResult.trades.forEach(trade => {
      const buyOrder = buyOrdersById.get(trade.buy_order_id);
      const sellOffer = sellOffersById.get(trade.sell_offer_id);
      if (!buyOrder || !sellOffer) return;

      applyBuyTrade(state, trade, buyOrder, empiresById, armiesById);
      applySellTrade(trade, sellOffer, empiresById);
    });

  });

  return allTrades;
}

export function saveMarketOrders(state, ordersToSave, validBuyOrders, validSellOffers, buyOrders, sellOffers) {
  // Persist every still-active order, even if it was not touched this tick.
  const allValidBuyOrders = [...validBuyOrders, ...buyOrders].filter(o => (o.filled_qty || 0) < o.qty);
  const allValidSellOffers = [...validSellOffers, ...sellOffers].filter(o => (o.filled_qty || 0) < o.qty);

  // Remove duplicates by ID
  const uniqueBuyOrders = Array.from(new Map(allValidBuyOrders.map(o => [o.id, o])).values());
  const uniqueSellOffers = Array.from(new Map(allValidSellOffers.map(o => [o.id, o])).values());

  state.marketOrders = {
    buyOrders: uniqueBuyOrders,
    sellOffers: uniqueSellOffers
  };
}
