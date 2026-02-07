import { clearMarket } from '../marketEconomy.js';

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

  // Increment duration on all sell offers and separate expired ones
  const validSellOffers = [];
  const expiredSellOffers = [];

  allSellOffers.forEach(order => {
    order.duration = (order.duration || 0) + 1;
    const maxDuration = Number.isFinite(order.max_duration) ? order.max_duration : 3;

    if (order.duration > maxDuration) {
      expiredSellOffers.push(order);
    } else {
      validSellOffers.push(order);
    }
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
  // Move expired sell offers directly to stockpiles
  expiredSellOffers.forEach(order => {
    const remaining = order.qty - (order.filled_qty || 0);
    if (remaining <= 0) return;

    if (order.owner_type === 'empire') {
      const empire = state.empires.find(e => e.id === order.owner_id);
      if (empire) {
        if (!empire.stockpiles) empire.stockpiles = {};
        empire.stockpiles[order.commodity] = (empire.stockpiles[order.commodity] || 0) + remaining;
      }
    } else if (order.owner_type === 'coalition') {
      // Add to coalition bank if it's a coalition improvement
      const coalition = state.coalitionEconomy;
      if (!coalition.stockpile_bank) coalition.stockpile_bank = {};
      coalition.stockpile_bank[order.commodity] = (coalition.stockpile_bank[order.commodity] || 0) + remaining;
    }
  });
}

export function applyOrderFees(state, validBuyOrders, allSellOffers) {
  validBuyOrders.forEach(order => {
    if (order.owner_type !== 'empire') return;
    const empire = state.empires.find(e => e.id === order.owner_id);
    if (!empire) return;
    const fee = order.fee || 1;
    empire.budget_credits = (empire.budget_credits || 0) - fee;
    empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
    empire.economy_spend.order_fees += fee;
  });

  allSellOffers.forEach(order => {
    if (order.owner_type !== 'empire') return;
    const empire = state.empires.find(e => e.id === order.owner_id);
    if (!empire) return;
    const fee = order.fee || 1;
    empire.budget_credits = (empire.budget_credits || 0) - fee;
    empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
    empire.economy_spend.order_fees += fee;
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
  commodities.forEach(commodity => {
    const marketState = state.market[commodity.key];
    if (!marketState) return;

    const clearResult = clearMarket(validBuyOrders, validSellOffers, marketState);
    allTrades.push(...clearResult.trades);

    // Store post-clear remaining offers for coalition procurement
    marketState.remaining_sell_offers_post_clear = clearResult.unfilledSells;

    // Apply trades to entities
    clearResult.trades.forEach(trade => {
      // Find buyer and seller from the valid orders (not local buyOrders/sellOffers)
      const buyOrder = validBuyOrders.find(b => b.id === trade.buy_order_id);
      const sellOffer = validSellOffers.find(s => s.id === trade.sell_offer_id);

      if (buyOrder && sellOffer) {
        // Distribute to buyer
        if (buyOrder.owner_type === 'empire') {
          const empire = state.empires.find(e => e.id === buyOrder.owner_id);
          if (empire) {
            if (!empire.stockpiles) empire.stockpiles = {};
            empire.stockpiles[trade.commodity] = (empire.stockpiles[trade.commodity] || 0) + trade.qty;
            const tradeCost = trade.qty * trade.price;
            empire.budget_credits = (empire.budget_credits || 0) - tradeCost;
            const category = buyOrder.category === 'wants' ? 'wants' : 'needs';
            empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
            empire.economy_spend[category] += tradeCost;
          }
        } else if (buyOrder.owner_type === 'army') {
          const army = state.armies.find(a => a.id === buyOrder.owner_id);
          if (army) {
            if (!army.supply_state.received) army.supply_state.received = {};
            army.supply_state.received[trade.commodity] = (army.supply_state.received[trade.commodity] || 0) + trade.qty;
          }
        }

        // Pay seller
        if (sellOffer.owner_type === 'empire') {
          const empire = state.empires.find(e => e.id === sellOffer.owner_id);
          if (empire) {
            empire.budget_credits = (empire.budget_credits || 0) + (trade.qty * trade.price);
          }
        }
      }
    });

  });

  return allTrades;
}

export function saveMarketOrders(state, ordersToSave, validBuyOrders, validSellOffers, buyOrders, sellOffers) {
  // Only save orders that were created or aggregated this tick (tracked in ordersToSave)
  const savedBuyOrders = [...ordersToSave].filter(o => o.owner_type === 'empire' || o.owner_type === 'army');
  const buyOrdersToSave = savedBuyOrders.filter(o => (o.filled_qty || 0) < o.qty && buyOrders.includes(o));
  const sellOffersToSave = savedBuyOrders.filter(o => (o.filled_qty || 0) < o.qty && sellOffers.includes(o));

  // Also include orders from validBuyOrders/validSellOffers that are in ordersToSave
  const allValidBuyOrders = [...validBuyOrders, ...buyOrders].filter(o => ordersToSave.has(o) && (o.filled_qty || 0) < o.qty);
  const allValidSellOffers = [...validSellOffers, ...sellOffers].filter(o => ordersToSave.has(o) && (o.filled_qty || 0) < o.qty);

  // Remove duplicates by ID
  const uniqueBuyOrders = Array.from(new Map(allValidBuyOrders.map(o => [o.id, o])).values());
  const uniqueSellOffers = Array.from(new Map(allValidSellOffers.map(o => [o.id, o])).values());

  state.marketOrders = {
    buyOrders: uniqueBuyOrders,
    sellOffers: uniqueSellOffers
  };
}
