/**
 * Market-based economy system
 * Implements supply/demand market with buy/sell orders, pricing, and fulfillment
 */

import { getLogger } from '../modules/logger.js';
import { getCommodityTier, loadEconomySystemConfig } from '../utils/fileLoader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Economy system configuration
let ECONOMY_CONFIG = null;

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
        smoothing_k: 0.25,
        shortage_panic_cap: 4.0
      },
      tier_elasticity: {
        t1: 0.6,
        t2: 1.0,
        t3: 1.6,
        t4: 2.4
      }
    },
    coalition: {
      procurement: {
        enabled: true,
        budget_credits_per_tick: 100,
        default_priority_by_tier: {
          t1: "-10%",
          t2: "10%",
          t3: "50%",
          t4: "90%"
        },
        stockpile_priority_levels: {
          "-90%": { theta: 0.10 },
          "-50%": { theta: 0.50 },
          "-10%": { theta: 0.90 },
          "10%": { theta: 1.10 },
          "50%": { theta: 1.50 },
          "90%": { theta: 1.90 }
        }
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
export function createMarketState(commodityKey, initialPrice = 1.0, floorPrice = null) {
  const resolvedFloorPrice = floorPrice || initialPrice;
  return {
    commodity: commodityKey,
    price: initialPrice,
    last_price: initialPrice,
    floor_price: resolvedFloorPrice,
    base_floor_price: resolvedFloorPrice,
    demand_qty: 0,
    supply_qty: 0,
    buy_orders: [],
    sell_offers: []
  };
}

/**
 * Create buy order
 */
export function createBuyOrder(id, ownerType, ownerId, commodity, qty, maxPrice, priority = 0) {
  return {
    id,
    owner_type: ownerType, // 'coalition', 'empire', 'army'
    owner_id: ownerId,
    commodity,
    qty,
    max_price: maxPrice,
    priority,
    filled_qty: 0
  };
}

/**
 * Create sell offer
 */
export function createSellOffer(id, ownerType, ownerId, commodity, qty, askPrice, priority = 0) {
  return {
    id,
    owner_type: ownerType, // 'empire', 'coalition'
    owner_id: ownerId,
    commodity,
    qty,
    ask_price: askPrice,
    priority,
    filled_qty: 0
  };
}

/**
 * Initialize market for all commodities
 * Prices start at floor_price with variance between 50% and 150% of floor
 */
export function initializeMarket(commodities, rng = Math.random) {
  const market = {};
  commodities.forEach(commodity => {
    const baseFloorPrice = commodity.floor_price || 1.0;
    // Randomize floor price by seed (85% to 115%)
    const floorVariance = 0.85 + rng() * 0.3;
    const floorPrice = baseFloorPrice * floorVariance;
    // Random initial price between 50% and 150% of floor for reasonable starting range
    const varianceFactor = 0.5 + rng() * 1.0; // 0.5 to 1.5
    const initialPrice = floorPrice * varianceFactor;
    market[commodity.key] = createMarketState(commodity.key, initialPrice, floorPrice);
  });
  return market;
}

/**
 * Compute target price based on supply/demand ratio
 */
export function computeTargetPrice(marketState, config) {
  const { demand_qty, supply_qty, last_price } = marketState;
  const { min_price, max_price, shortage_panic_cap } = config.pricing.params;
  
  if (supply_qty <= 0) {
    // No supply - price spikes
    return Math.min(max_price, last_price * shortage_panic_cap);
  }
  
  const ratio = demand_qty / supply_qty;
  const clampedRatio = Math.min(ratio, shortage_panic_cap);
  
  // Price moves proportionally to ratio (1.0 = balanced)
  const targetPrice = last_price * clampedRatio;
  
  return Math.max(min_price, Math.min(max_price, targetPrice));
}

/**
 * Apply price smoothing and enforce floor price bounds
 */
export function smoothPrice(marketState, targetPrice, config) {
  const { smoothing_k } = config.pricing.params;
  const smoothed = marketState.last_price * (1 - smoothing_k) + targetPrice * smoothing_k;
  
  // Enforce floor price bounds: 0% to 300% of floor price (0x to 3x)
  // This allows prices to drop to zero (free) or rise up to 3x the floor
  const floorPrice = marketState.floor_price || 1.0;
  const minPrice = 0; // Allow prices to drop to zero
  const maxPrice = floorPrice * 3.0; // Cap at 3x floor
  
  const boundedPrice = Math.max(minPrice, Math.min(maxPrice, smoothed));
  
  marketState.price = boundedPrice;
  marketState.last_price = boundedPrice;
  return boundedPrice;
}

/**
 * Get tier elasticity for a commodity
 */
export function getTierElasticity(commodity, config) {
  const tier = commodity.tier || 't1';
  return config.pricing.tier_elasticity[tier] || 1.0;
}

/**
 * Update market prices for all commodities
 */
export function updateMarketPrices(market, commodities, config) {
  commodities.forEach(commodity => {
    const marketState = market[commodity.key];
    if (!marketState) return;
    
    const targetPrice = computeTargetPrice(marketState, config);
    const elasticity = getTierElasticity(commodity, config);
    
    // Apply elasticity (higher elasticity = more price movement)
    const adjustedTarget = marketState.last_price + (targetPrice - marketState.last_price) * elasticity;
    
    smoothPrice(marketState, adjustedTarget, config);
    
    // Update volatility index (simple: track price change magnitude)
    const priceChange = Math.abs(marketState.price - marketState.last_price) / marketState.last_price;
    marketState.volatility_index = marketState.volatility_index * 0.9 + priceChange * 0.1;
  });
}

/**
 * Clear market: match buy orders with sell offers
 */
export function clearMarket(buyOrders, sellOffers, marketState) {
  const commodity = marketState.commodity;
  const clearingPrice = marketState.price;
  
  // Filter orders for this commodity
  const relevantBuys = buyOrders.filter(o => o.commodity === commodity && o.filled_qty < o.qty);
  const relevantSells = sellOffers.filter(o => o.commodity === commodity && o.filled_qty < o.qty);
  
  // Sort by priority (higher first), then by price
  relevantBuys.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.max_price - a.max_price;
  });
  
  relevantSells.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.ask_price - b.ask_price;
  });
  
  let totalDemand = relevantBuys.reduce((sum, o) => sum + (o.qty - o.filled_qty), 0);
  let totalSupply = relevantSells.reduce((sum, o) => sum + (o.qty - o.filled_qty), 0);
  
  marketState.demand_qty = totalDemand;
  marketState.supply_qty = totalSupply;
  
  if (totalSupply === 0 || totalDemand === 0) {
    marketState.traded_qty = 0;
    return { trades: [], unfilledBuys: relevantBuys, unfilledSells: relevantSells };
  }
  
  const trades = [];
  const unfilledBuys = [];
  const unfilledSells = [];
  
  if (totalSupply >= totalDemand) {
    // Surplus: fill all buys, remainder to sellers
    let remainingSupply = totalSupply;
    
    for (const buy of relevantBuys) {
      const needed = buy.qty - buy.filled_qty;
      const fillQty = Math.min(needed, remainingSupply);
      
      if (fillQty > 0 && buy.max_price >= clearingPrice) {
        buy.filled_qty += fillQty;
        remainingSupply -= fillQty;
        
        // Allocate fill across sellers pro-rata
        let remainingToAllocate = fillQty;
        for (const sell of relevantSells) {
          if (remainingToAllocate <= 0) break;
          if (sell.ask_price > clearingPrice) continue;
          
          const sellAvailable = sell.qty - sell.filled_qty;
          const sellRatio = sellAvailable / totalSupply;
          const sellFill = Math.min(remainingToAllocate, sellAvailable, sellRatio * fillQty);
          
          if (sellFill > 0) {
            sell.filled_qty += sellFill;
            remainingToAllocate -= sellFill;
            
            trades.push({
              buy_order_id: buy.id,
              sell_offer_id: sell.id,
              commodity,
              qty: sellFill,
              price: clearingPrice
            });
          }
        }
      } else {
        unfilledBuys.push(buy);
      }
    }
    
    // Remaining supply goes to seller stockpiles
    for (const sell of relevantSells) {
      const remaining = sell.qty - sell.filled_qty;
      if (remaining > 0) {
        unfilledSells.push({ ...sell, remaining });
      }
    }
  } else {
    // Shortage: pro-rata allocation to buyers
    const shortageRatio = totalSupply / totalDemand;
    
    for (const buy of relevantBuys) {
      if (buy.max_price < clearingPrice) {
        unfilledBuys.push(buy);
        continue;
      }
      
      const needed = buy.qty - buy.filled_qty;
      const allocatedQty = needed * shortageRatio;
      
      if (allocatedQty > 0) {
        buy.filled_qty += allocatedQty;
        
        // Allocate across sellers pro-rata
        let remainingToAllocate = allocatedQty;
        for (const sell of relevantSells) {
          if (remainingToAllocate <= 0) break;
          if (sell.ask_price > clearingPrice) continue;
          
          const sellAvailable = sell.qty - sell.filled_qty;
          const sellRatio = sellAvailable / totalSupply;
          const sellFill = Math.min(remainingToAllocate, sellAvailable, sellRatio * allocatedQty);
          
          if (sellFill > 0) {
            sell.filled_qty += sellFill;
            remainingToAllocate -= sellFill;
            
            trades.push({
              buy_order_id: buy.id,
              sell_offer_id: sell.id,
              commodity,
              qty: sellFill,
              price: clearingPrice
            });
          }
        }
      } else {
        unfilledBuys.push(buy);
      }
    }
  }
  
  marketState.traded_qty = trades.reduce((sum, t) => sum + t.qty, 0);
  
  return { trades, unfilledBuys, unfilledSells };
}

/**
 * Coalition procurement: buy goods for coalition stockpiles
 */
export function coalitionProcurement(market, sellOffers, coalitionState, config) {
  if (!config.coalition.procurement.enabled) {
    return { purchases: [], spent: 0 };
  }
  
  const budget = coalitionState.budget_credits || config.coalition.procurement.budget_credits_per_tick;
  const priorityLevels = config.coalition.procurement.stockpile_priority_levels;
  const defaultPriorities = config.coalition.procurement.default_priority_by_tier;
  const perCommodityPriority = coalitionState.per_commodity_priority || {};
  
  const purchases = [];
  let spent = 0;
  
  // Get available sell offers sorted by price
  const availableSells = sellOffers
    .filter(sell => sell.filled_qty < sell.qty && sell.owner_type !== 'coalition')
    .sort((a, b) => a.ask_price - b.ask_price);
  
  for (const sell of availableSells) {
    if (spent >= budget) break;
    
    const marketState = market[sell.commodity];
    if (!marketState) continue;
    
    // Determine priority threshold
    const commodityPriority = perCommodityPriority[sell.commodity];
    const tier = getCommodityTier(sell.commodity);
    const priorityKey = commodityPriority || defaultPriorities[tier] || "10%";
    const theta = priorityLevels[priorityKey]?.theta || 1.0;
    
    const thresholdPrice = marketState.price * theta;
    
    if (sell.ask_price <= thresholdPrice) {
      const available = sell.qty - sell.filled_qty;
      const cost = sell.ask_price * available;
      const canAfford = Math.min(available, (budget - spent) / sell.ask_price);
      
      if (canAfford > 0) {
        const purchaseQty = Math.floor(canAfford);
        const purchaseCost = purchaseQty * sell.ask_price;
        
        sell.filled_qty += purchaseQty;
        spent += purchaseCost;
        
        // Add to coalition stockpiles
        if (!coalitionState.stockpiles) {
          coalitionState.stockpiles = {};
        }
        coalitionState.stockpiles[sell.commodity] = (coalitionState.stockpiles[sell.commodity] || 0) + purchaseQty;
        
        purchases.push({
          commodity: sell.commodity,
          qty: purchaseQty,
          price: sell.ask_price,
          cost: purchaseCost
        });
      }
    }
  }
  
  coalitionState.budget_credits = (coalitionState.budget_credits || 0) - spent;
  
  return { purchases, spent };
}

/**
 * Compute army fulfillment and performance
 */
export function computeArmyFulfillment(army, config) {
  const { needs, wants } = army.demands || {};
  const supplyState = army.supply_state || {};
  const manpower = army.manpower || army.mp?.max || 0;
  
  const needsFulfillment = {};
  const wantsFulfillment = {};
  const shortages = {};
  
  // Compute needs fulfillment
  if (needs) {
    Object.entries(needs).forEach(([commodity, neededPerManpower]) => {
      const totalNeeded = neededPerManpower * manpower;
      const received = supplyState.received?.[commodity] || 0;
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
      const totalWanted = wantedPerManpower * manpower;
      const received = supplyState.received?.[commodity] || 0;
      const fulfillment = totalWanted > 0 ? Math.min(1.0, received / totalWanted) : 1.0;
      
      wantsFulfillment[commodity] = fulfillment;
    });
  }
  
  // Update supply state
  army.supply_state = {
    needs_fulfillment: needsFulfillment,
    wants_fulfillment: wantsFulfillment,
    shortages
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
