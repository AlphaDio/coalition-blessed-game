/**
 * Market-based economy system
 * Implements supply/demand market with buy/sell orders, pricing, and fulfillment
 */

import { getLogger } from '../modules/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Economy system configuration
let ECONOMY_CONFIG = null;
const RUN_PRICE_MULTIPLIERS = [0.5, 1, 1.5, 2, 3];

/**
 * Load economy system configuration
 */
export function loadEconomyConfig() {
  if (ECONOMY_CONFIG) return ECONOMY_CONFIG;
  
  try {
    const configPath = path.join(__dirname, '..', '..', 'docs', 'input', 'economy_system.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    const doc = yaml.load(content);
    ECONOMY_CONFIG = doc.economy_system;
    return ECONOMY_CONFIG;
  } catch (error) {
    getLogger().warn(`Failed to load economy config, using defaults: ${error.message}`);
    ECONOMY_CONFIG = getDefaultEconomyConfig();
    return ECONOMY_CONFIG;
  }
}

function getDefaultEconomyConfig() {
  return {
    pricing: {
      params: {
        min_price: 0.01,
        max_price: 1000000,
        smoothing_k: 0.03,
        shortage_panic_cap: 4.0
      },
      tier_elasticity: {
        t1: 0.6,
        t2: 1.0,
        t3: 1.6,
        t4: 2.4
      }
    },
    fulfillment_and_performance: {
      needs: {
        threshold: 0.80,
        max_penalty: 0.35
      },
      wants: {
        max_bonus: 0.20
      }
    }
  };
}

/**
 * Create market state for a commodity
 */
export function createMarketState(
  commodityKey,
  initialPrice = 1.0,
  floorPrice = null,
  priceRange = null,
  options = {}
) {
  const resolvedFloorPrice = floorPrice || initialPrice;
  const baseFloorPrice = Number.isFinite(options.baseFloorPrice)
    ? options.baseFloorPrice
    : resolvedFloorPrice;
  const runPriceMultiplier = Number.isFinite(options.runPriceMultiplier)
    ? options.runPriceMultiplier
    : 1;
  return {
    commodity: commodityKey,
    price: initialPrice,
    last_price: initialPrice,
    floor_price: resolvedFloorPrice,
    base_floor_price: baseFloorPrice,
    run_price_multiplier: runPriceMultiplier,
    price_range: priceRange || { min: initialPrice, max: initialPrice },
    demand_qty: 0,
    supply_qty: 0,
    traded_qty: 0,
    flow_demand_qty_turn: 0,
    flow_supply_qty_turn: 0,
    flow_traded_qty_turn: 0,
    buy_orders: [],
    sell_offers: [],
    remaining_buy_offers_post_clear: [],
    remaining_sell_offers_post_clear: [],
    buy_backlog_total: 0
  };
}

/**
 * Create buy order
 */
export function createBuyOrder(id, ownerType, ownerId, commodity, qty, maxPrice, priority = 0, maxDuration = 3) {
  return {
    id,
    owner_type: ownerType, // 'coalition', 'empire', 'army'
    owner_id: ownerId,
    commodity,
    qty,
    max_price: maxPrice,
    priority,
    filled_qty: 0,
    duration: 0,
    max_duration: maxDuration
  };
}

/**
 * Create sell offer
 */
export function createSellOffer(id, ownerType, ownerId, commodity, qty, askPrice, priority = 0, maxDuration = 3) {
  return {
    id,
    owner_type: ownerType, // 'empire', 'coalition'
    owner_id: ownerId,
    commodity,
    qty,
    ask_price: askPrice,
    priority,
    filled_qty: 0,
    duration: 0,
    max_duration: maxDuration
  };
}

/**
 * Initialize market for all commodities
 * Prices start at floor_price with variance between 50% and 150% of floor,
 * after a seeded run multiplier has been applied.
 */
export function initializeMarket(commodities, rng = Math.random) {
  const market = {
    price_by_commodity: {},
    last_price_by_commodity: {},
    floor_price_by_commodity: {},
    price_multiplier_by_commodity: {},
    price_range_by_commodity: {},
    remaining_sell_offers_post_clear: [],
    remaining_buy_offers_post_clear: [],
    buy_backlog_by_commodity: {},
    buy_backlog_by_commodity_and_owner: {}
  };

  commodities.forEach(commodity => {
    const baseFloorPrice = commodity.floor_price || 1.0;
    const runPriceMultiplier = RUN_PRICE_MULTIPLIERS[Math.floor(rng() * RUN_PRICE_MULTIPLIERS.length)] || 1;
    // Randomize floor price by seed (85% to 115%)
    const floorVariance = 0.85 + rng() * 0.3;
    const randomizedBaseFloor = baseFloorPrice * floorVariance;
    const floorPrice = randomizedBaseFloor * runPriceMultiplier;
    // Random initial price between 50% and 150% of floor for reasonable starting range
    const varianceFactor = 0.5 + rng() * 1.0; // 0.5 to 1.5
    const initialPrice = floorPrice * varianceFactor;
    const priceRange = { min: floorPrice * 0.5, max: floorPrice * 1.5 };

    const marketState = createMarketState(commodity.key, initialPrice, floorPrice, priceRange, {
      baseFloorPrice: randomizedBaseFloor,
      runPriceMultiplier
    });
    market[commodity.key] = marketState;

    // Populate aggregate maps
    market.price_by_commodity[commodity.key] = initialPrice;
    market.last_price_by_commodity[commodity.key] = initialPrice;
    market.floor_price_by_commodity[commodity.key] = floorPrice;
    market.price_multiplier_by_commodity[commodity.key] = runPriceMultiplier;
    market.price_range_by_commodity[commodity.key] = priceRange;
  });

  return market;
}

/**
 * Clear market: match buy orders with sell offers
 * Uses order-level price matching: trades clear when buy.max_price >= sell.ask_price
 * Trades clear at the seller's ask_price (the lower price)
 */
export function clearMarket(buyOrders, sellOffers, marketState) {
  const commodity = marketState.commodity;

  const dedupeById = (orders) => Array.from(
    new Map((orders || []).map(order => [order.id, order])).values()
  );

  // Filter orders for this commodity and dedupe by order id.
  const relevantBuys = dedupeById(
    buyOrders.filter(o => o.commodity === commodity && (o.filled_qty || 0) < o.qty)
  );
  const relevantSells = dedupeById(
    sellOffers.filter(o => o.commodity === commodity && (o.filled_qty || 0) < o.qty)
  );
  
  // Sort by priority (higher first), then by price
  // Buys: highest max_price first (most willing to pay)
  // Sells: lowest ask_price first (cheapest first)
  relevantBuys.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.max_price - a.max_price;
  });
  
  relevantSells.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.ask_price - b.ask_price;
  });
  
  let totalDemand = relevantBuys.reduce((sum, o) => sum + (o.qty - (o.filled_qty || 0)), 0);
  let totalSupply = relevantSells.reduce((sum, o) => sum + (o.qty - (o.filled_qty || 0)), 0);
  const flowDemand = relevantBuys.reduce((sum, o) => {
    const added = Number.isFinite(o.turn_added_qty) ? o.turn_added_qty : 0;
    return sum + Math.max(0, added);
  }, 0);
  const flowSupply = relevantSells.reduce((sum, o) => {
    const added = Number.isFinite(o.turn_added_qty) ? o.turn_added_qty : 0;
    return sum + Math.max(0, added);
  }, 0);
  
  marketState.demand_qty = totalDemand;
  marketState.supply_qty = totalSupply;
  marketState.flow_demand_qty_turn = flowDemand;
  marketState.flow_supply_qty_turn = flowSupply;

  if (totalSupply === 0 || totalDemand === 0) {
    marketState.traded_qty = 0;
    marketState.flow_traded_qty_turn = 0;
    const unfilledBuys = relevantBuys.map(buy => ({
      ...buy,
      remaining: Math.max(0, buy.qty - (buy.filled_qty || 0))
    }));
    const unfilledSells = relevantSells.map(sell => ({
      ...sell,
      remaining: Math.max(0, sell.qty - (sell.filled_qty || 0))
    }));
    return { trades: [], unfilledBuys, unfilledSells };
  }

  const trades = [];
  const unfilledBuys = [];
  const unfilledSells = [];

  // Create a map of sell offers with remaining quantity
  const sellRemaining = new Map();
  for (const sell of relevantSells) {
    sellRemaining.set(sell.id, sell.qty - (sell.filled_qty || 0));
  }

  // Match buys with sells where buy.max_price >= sell.ask_price
  for (const buy of relevantBuys) {
    let buyRemaining = buy.qty - (buy.filled_qty || 0);
    if (buyRemaining <= 0) continue;

    // Find matching sells (where sell.ask_price <= buy.max_price)
    for (const sell of relevantSells) {
      if (buyRemaining <= 0) break;
      const sellQty = sellRemaining.get(sell.id) || 0;
      if (sellQty <= 0) continue;

      // Check if prices are compatible: buyer's max >= seller's ask
      if (buy.max_price >= sell.ask_price) {
        const tradeQty = Math.min(buyRemaining, sellQty);
        if (tradeQty <= 0) continue;

        // Update remaining quantities
        sellRemaining.set(sell.id, sellQty - tradeQty);
        buyRemaining -= tradeQty;

        // Record trade at seller's ask_price (the lower price)
        trades.push({
          buy_order_id: buy.id,
          sell_offer_id: sell.id,
          commodity,
          qty: tradeQty,
          price: sell.ask_price
        });

        // Update buy's filled_qty
        buy.filled_qty = (buy.filled_qty || 0) + tradeQty;
      }
    }

    // If buy wasn't fully filled, add to unfilled
    if (buyRemaining > 0) {
      unfilledBuys.push({ ...buy, remaining: buyRemaining });
    }
  }

  // Collect remaining sells
  for (const sell of relevantSells) {
    const sellQty = sellRemaining.get(sell.id) || 0;
    if (sellQty > 0) {
      unfilledSells.push({ ...sell, remaining: sellQty });
    }
  }

  marketState.traded_qty = trades.reduce((sum, t) => sum + t.qty, 0);
  marketState.flow_traded_qty_turn = marketState.traded_qty;

  return { trades, unfilledBuys, unfilledSells };
}

/**
 * Execute full market clearing and update state with post-clear offers
 */
export function executeMarketClearing(state, buyOrders, sellOffers) {
  const market = state.market;
  const results = { totalTrades: 0, totalTradedQty: 0 };
  const remainingSellOffers = [];
  const remainingBuyOffers = [];
  const buyBacklogByCommodity = {};
  const buyBacklogByCommodityAndOwner = {};

  // Clear market for each commodity
  for (const commodityKey of Object.keys(market)) {
    if (commodityKey === 'price_by_commodity' || commodityKey === 'last_price_by_commodity' ||
        commodityKey === 'floor_price_by_commodity' || commodityKey === 'price_multiplier_by_commodity' ||
        commodityKey === 'price_range_by_commodity' ||
        commodityKey === 'remaining_sell_offers_post_clear' ||
        commodityKey === 'remaining_buy_offers_post_clear' ||
        commodityKey === 'buy_backlog_by_commodity' ||
        commodityKey === 'buy_backlog_by_commodity_and_owner') {
      continue;
    }

    const marketState = market[commodityKey];
    const { trades, unfilledBuys, unfilledSells } = clearMarket(buyOrders, sellOffers, marketState);
    marketState.remaining_sell_offers_post_clear = unfilledSells;
    marketState.remaining_buy_offers_post_clear = unfilledBuys;
    marketState.buy_backlog_total = unfilledBuys.reduce((sum, order) => sum + (order.remaining || 0), 0);

    remainingSellOffers.push(...unfilledSells);
    remainingBuyOffers.push(...unfilledBuys);
    buyBacklogByCommodity[commodityKey] = marketState.buy_backlog_total;

    const ownerBacklog = {};
    unfilledBuys.forEach(order => {
      ownerBacklog[order.owner_id] = (ownerBacklog[order.owner_id] || 0) + (order.remaining || 0);
    });
    buyBacklogByCommodityAndOwner[commodityKey] = ownerBacklog;

    results.totalTrades += trades.length;
    results.totalTradedQty += marketState.traded_qty;
  }

  market.remaining_sell_offers_post_clear = remainingSellOffers;
  market.remaining_buy_offers_post_clear = remainingBuyOffers;
  market.buy_backlog_by_commodity = buyBacklogByCommodity;
  market.buy_backlog_by_commodity_and_owner = buyBacklogByCommodityAndOwner;

  return results;
}

/**
 * Compute army fulfillment and performance
 */
export function computeArmyFulfillment(army, config) {
  const { needs, wants } = army.demands || {};
  const supplyState = army.supply_state || {};
  const manpower = army.manpower || army.mp?.max || 0;
  const needsDemandMap = supplyState.needs_demand || {};
  const wantsDemandMap = supplyState.wants_demand || {};
  const receivedMap = supplyState.received || {};
  
  const needsFulfillment = {};
  const wantsFulfillment = {};
  const shortages = {};
  
  // Compute needs fulfillment
  if (needs) {
    Object.entries(needs).forEach(([commodity, neededPerManpower]) => {
      const fallbackDemand = neededPerManpower * manpower;
      const totalNeeded = Number.isFinite(needsDemandMap[commodity]) ? needsDemandMap[commodity] : fallbackDemand;
      const received = receivedMap[commodity] || 0;
      const fulfillment = totalNeeded > 0 ? Math.min(1.0, received / totalNeeded) : 1.0;
      
      needsFulfillment[commodity] = fulfillment;
      
      if (fulfillment < 1.0) {
        shortages[commodity] = totalNeeded - received;
      }
    });
  }
  
  // Compute wants fulfillment
  if (wants) {
    Object.entries(wants).forEach(([commodity, wantedPerManpower]) => {
      const fallbackDemand = wantedPerManpower * manpower;
      const totalWanted = Number.isFinite(wantsDemandMap[commodity]) ? wantsDemandMap[commodity] : fallbackDemand;
      const received = receivedMap[commodity] || 0;
      const fulfillment = totalWanted > 0 ? Math.min(1.0, received / totalWanted) : 1.0;
      
      wantsFulfillment[commodity] = fulfillment;
    });
  }
  
  // Update supply state
  army.supply_state = {
    needs_fulfillment: needsFulfillment,
    wants_fulfillment: wantsFulfillment,
    shortages,
    received: receivedMap,
    needs_demand: needsDemandMap,
    wants_demand: wantsDemandMap
  };
  
  // Compute performance impact
  const { threshold, max_penalty } = config.fulfillment_and_performance.needs;
  const { max_bonus } = config.fulfillment_and_performance.wants;
  
  let performanceModifier = 0;
  
  const needsValues = Object.values(needsFulfillment);
  const worstNeeds = needsValues.length > 0 ? Math.min(...needsValues) : 1.0;
  if (worstNeeds < threshold) {
    const penaltyRatio = (threshold - worstNeeds) / threshold;
    const severity = Math.pow(penaltyRatio, 1.5);
    performanceModifier -= max_penalty * severity;
  }
  
  // Wants: diminishing returns bonus
  Object.values(wantsFulfillment).forEach(fulfillment => {
    // Diminishing returns: sqrt(fulfillment) * max_bonus
    performanceModifier += Math.sqrt(fulfillment) * max_bonus;
  });
  
  // Clamp performance modifier
  performanceModifier = Math.max(-max_penalty, Math.min(max_bonus, performanceModifier));
  
  // Update army performance
  const basePerformance = army.performance?.base || 1.0;
  const bonusMultiplier = army.performance?.bonusMultiplier ?? 1.0;
  army.performance = {
    base: basePerformance,
    bonusMultiplier,
    current: basePerformance * (1 + performanceModifier) * bonusMultiplier
  };
  
  return { needsFulfillment, wantsFulfillment, shortages, performanceModifier };
}

/**
 * Compute empire needs/wants fulfillment ratios from supply_state demand and received maps.
 * Stores results in empire.supply_state.needs_fulfillment / wants_fulfillment.
 * @param {Object} empire - The empire object
 * @returns {{ needsFulfillment: Object, wantsFulfillment: Object }} per-commodity fulfillment ratios
 */
export function computeEmpireFulfillment(empire) {
  const supplyState = empire.supply_state || {};
  const needsDemandMap = supplyState.needs_demand || {};
  const wantsDemandMap = supplyState.wants_demand || {};
  const receivedMap = supplyState.received || {};

  const needsFulfillment = {};
  const wantsFulfillment = {};

  for (const [commodity, totalNeeded] of Object.entries(needsDemandMap)) {
    const received = receivedMap[commodity] || 0;
    needsFulfillment[commodity] = totalNeeded > 0 ? Math.min(1.0, received / totalNeeded) : 1.0;
  }

  for (const [commodity, totalWanted] of Object.entries(wantsDemandMap)) {
    const received = receivedMap[commodity] || 0;
    wantsFulfillment[commodity] = totalWanted > 0 ? Math.min(1.0, received / totalWanted) : 1.0;
  }

  if (!empire.supply_state) {
    empire.supply_state = {};
  }
  empire.supply_state.needs_fulfillment = needsFulfillment;
  empire.supply_state.wants_fulfillment = wantsFulfillment;

  return { needsFulfillment, wantsFulfillment };
}
