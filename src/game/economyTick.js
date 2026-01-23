/**
 * Economy tick processor - runs the market economy pipeline each turn
 */

import { getLogger } from '../modules/logger.js';
import { DeterministicRNG } from '../modules/rng.js';
import { COALITION_ECONOMY, MARKET_CONSTANTS } from './constants.js';
import {
  loadEconomyConfig,
  initializeMarket,
  createBuyOrder,
  createSellOffer,
  updateMarketPrices,
  clearMarket,
  coalitionProcurement,
  computeArmyFulfillment
} from './marketEconomy.js';
import {
  refillCoalitionAllowance,
  executeCoalitionProcurement,
  executeSupplyConversion,
  initializeCoalitionProcurement
} from './coalitionProcurement.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let RESOURCES_DATA = null;

/**
 * Load resources data
 */
function loadResources() {
  if (RESOURCES_DATA) return RESOURCES_DATA;
  
  try {
    const resourcesPath = path.join(__dirname, '..', '..', 'modules', 'resources.yaml');
    const content = fs.readFileSync(resourcesPath, 'utf8');
    const doc = yaml.load(content);
    RESOURCES_DATA = doc.resources;
    return RESOURCES_DATA;
  } catch (error) {
    getLogger().warn(`Failed to load resources: ${error.message}`);
    return { tiers: {}, commodities: [] };
  }
}

/**
 * Process economy tick - runs the full pipeline
 */
export function processEconomyTick(state) {
  const logger = getLogger();
  const log = [];
  
  // Load config and resources
  const config = loadEconomyConfig();
  const resources = loadResources();
  const commodities = resources.commodities || [];
  
  // Initialize market if needed
  if (!state.market) {
    const seed = Number.isFinite(state.rngSeed) ? state.rngSeed : 0;
    const rng = new DeterministicRNG(seed || 0);
    state.market = initializeMarket(commodities, rng.random.bind(rng));
    logger.info(`Market initialized (seed=${seed})`);
  }
  
  // Initialize coalition economy state if needed
  if (!state.coalitionEconomy) {
    state.coalitionEconomy = initializeCoalitionProcurement();
    logger.info('Coalition procurement initialized');
  }
  
   // Reset order books - start empty for new orders
  const buyOrders = [];
  const sellOffers = [];
  let orderIdCounter = 0;
  
   // Track which orders should persist (from aggregation with existing or new creation)
  const ordersToSave = new Set();
  
  // Load existing orders for aggregation (but don't add to arrays yet)
  const existingBuyOrders = state.marketOrders?.buyOrders?.filter(o => (o.filled_qty || 0) < o.qty) || [];
  const existingSellOffers = state.marketOrders?.sellOffers?.filter(o => (o.filled_qty || 0) < o.qty) || [];
  
  /**
   * Find existing sell offer for owner+commodity and aggregate qty
   * Returns updated offer with recalculated price and reset duration
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
        fee: 0
      };
      sellOffers.push(offer);
      ordersToSave.add(offer);
      return offer;
    }
    
    // Calculate weighted average price
    const existingRemaining = existing.qty - (existing.filled_qty || 0);
    const existingValue = existingRemaining * existing.ask_price;
    const newValue = newQty * newPrice;
    const totalValue = existingValue + newValue;
    const totalQty = existingRemaining + newQty;
    
    existing.ask_price = totalQty > 0 ? totalValue / totalQty : newPrice;
    existing.qty = totalQty;
    existing.duration = 0;
    
    // If from existing orders, move to sellOffers for this tick
    if (!sellOffers.includes(existing)) {
      sellOffers.push(existing);
    }
    ordersToSave.add(existing);
    
    return existing;
  }
  
  /**
   * Find existing buy order for owner+commodity+category and aggregate qty
   * Returns updated order with recalculated price and reset duration
   */
  function aggregateBuyOrder(ownerType, ownerId, commodity, newQty, newPrice, category, priority) {
    // First check new orders created this tick
    let existing = buyOrders.find(o => 
      o.owner_type === ownerType && 
      o.owner_id === ownerId && 
      o.commodity === commodity &&
      o.category === category &&
      (o.filled_qty || 0) < o.qty
    );
    
    // Then check existing orders from previous ticks
    if (!existing) {
      existing = existingBuyOrders.find(o => 
        o.owner_type === ownerType && 
        o.owner_id === ownerId && 
        o.commodity === commodity &&
        o.category === category &&
        (o.filled_qty || 0) < o.qty
      );
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
        100
      );
      order.category = category;
      order.fee = 1;
      order.filled_qty = 0;
      buyOrders.push(order);
      ordersToSave.add(order);
      return order;
    }
    
    // Calculate weighted average max_price
    const existingRemaining = existing.qty - (existing.filled_qty || 0);
    const existingValue = existingRemaining * existing.price;
    const newValue = newQty * newPrice;
    const totalValue = existingValue + newValue;
    const totalQty = existingRemaining + newQty;
    
    existing.price = totalQty > 0 ? totalValue / totalQty : newPrice;
    existing.qty = totalQty;
    existing.duration = 0;
    
    // If from existing orders, move to buyOrders for this tick
    if (!buyOrders.includes(existing)) {
      buyOrders.push(existing);
    }
    ordersToSave.add(existing);
    
    return existing;
  }
   
   // Step 1: Compute empire production
   state.empires.forEach(empire => {
    if (!empire.production || !empire.production.outputs_per_tick) return;

    const population = empire.stats?.population || 1;
    const empireMultiplier = empire.modifiers?.multiplication || 1.0;
    const productionMultiplier = (1 + (state.coalitionModifiers.empire_production_multiplier || 0)) * empireMultiplier;

     Object.entries(empire.production.outputs_per_tick).forEach(([commodity, qty]) => {
       if (qty > 0) {
         const modifiedQty = qty * population * productionMultiplier * (1 + (state.coalitionModifiers.industrial_output || 0));
         const marketPrice = state.market[commodity]?.price || 1.0;
         const askPrice = marketPrice * MARKET_CONSTANTS.SELL_PRICE_DISCOUNT;
         
         const sellOffer = aggregateSellOffer('empire', empire.id, commodity, modifiedQty, askPrice, 0);
        }
      });
   });
  
  // Step 2: Emit buy orders for empire needs
  state.empires.forEach(empire => {
    if (!empire.needs || !empire.needs.per_pop) return;
    const population = empire.stats?.population || 0;

    if (!empire.economy_spend) {
      empire.economy_spend = { needs: 0, wants: 0, order_fees: 0 };
    }

     Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
        const totalNeeded = qtyPerPop * population;
        if (totalNeeded > 0) {
          const marketPrice = state.market[commodity]?.price || 1.0;
          const maxPrice = marketPrice * MARKET_CONSTANTS.BUY_NEEDS_PREMIUM;
          
           const buyOrder = aggregateBuyOrder('empire', empire.id, commodity, totalNeeded, maxPrice, 'needs', 1);
         }
       });
    });

   // Step 2b: Emit buy orders for empire wants
  state.empires.forEach(empire => {
    if (!empire.wants || !empire.wants.per_pop) return;
    const population = empire.stats?.population || 0;

    Object.entries(empire.wants.per_pop).forEach(([commodity, qtyPerPop]) => {
        const totalWanted = qtyPerPop * population;
        if (totalWanted > 0) {
          const marketPrice = state.market[commodity]?.price || 1.0;
          const maxPrice = marketPrice * MARKET_CONSTANTS.BUY_WANTS_PREMIUM;
          
            const buyOrder = aggregateBuyOrder('empire', empire.id, commodity, totalWanted, maxPrice, 'wants', 0);
         }
       });
   });
  
  // Step 3: Emit buy orders for army needs/wants
  state.armies.forEach(army => {
    if (!army.demands) return;
    const manpower = army.manpower || army.mp?.max || 0;

    // Ensure supply_state is initialized
    if (!army.supply_state) {
      army.supply_state = { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} };
    }
    
    // Reset received commodities for this tick
    army.supply_state.received = {};
    
       // Create buy orders for all army needs (no direct stockpile consumption)
       Object.entries(army.demands.needs || {}).forEach(([commodity, qtyPerManpower]) => {
         const totalNeeded = qtyPerManpower * manpower;
         
         if (totalNeeded > 0) {
           const marketPrice = state.market[commodity]?.price || 1.0;
           const maxPrice = marketPrice * MARKET_CONSTANTS.ARMY_NEEDS_PREMIUM;
           
            const buyOrder = aggregateBuyOrder('army', army.id, commodity, totalNeeded, maxPrice, 'needs', 0);
         }
       });
       
       // Create buy orders for all army wants (no direct stockpile consumption)
       Object.entries(army.demands.wants || {}).forEach(([commodity, qtyPerManpower]) => {
         const totalWanted = qtyPerManpower * manpower;
         
         if (totalWanted > 0) {
           const marketPrice = state.market[commodity]?.price || 1.0;
           const maxPrice = marketPrice * MARKET_CONSTANTS.ARMY_WANTS_PREMIUM;
           
            const buyOrder = aggregateBuyOrder('army', army.id, commodity, totalWanted, maxPrice, 'wants', -1);
         }
       });
   });
  
  // Step 4: Compute market target prices
  updateMarketPrices(state.market, commodities, config);
  


  // Apply empire order posting fees
  let allBuyOrders = buyOrders.concat(state.marketOrders?.buyOrders || []);
  let allSellOffers = sellOffers.concat(state.marketOrders?.sellOffers || []);

  // Increment duration on all buy orders and separate expired ones
  const validBuyOrders = [];
  const expiredBuyOrders = [];

   allBuyOrders.forEach(order => {
     order.duration = (order.duration || 0) + 1;
     
     // Adaptive pricing: increase max_price slightly each tick (buy orders willing to pay more over time)
      const PRICE_ADAPTATION_RATE = 0.005; // 0.5% per tick
     order.max_price = (order.max_price || 1) * (1 + PRICE_ADAPTATION_RATE);
     
     if (order.duration >= order.max_duration) {
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
     
     // Adaptive pricing: decrease ask_price slightly each tick (sell orders willing to accept less over time)
      const PRICE_ADAPTATION_RATE = 0.005; // 0.5% per tick
     order.ask_price = (order.ask_price || 1) * (1 - PRICE_ADAPTATION_RATE);
     
     if (order.duration >= order.max_duration) {
       expiredSellOffers.push(order);
     } else {
       validSellOffers.push(order);
     }
   });

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

  // Reset empire spend tracking before market clearing
  state.empires.forEach(empire => {
    empire.economy_spend = empire.economy_spend || { needs: 0, wants: 0, order_fees: 0 };
    empire.economy_spend.needs = 0;
    empire.economy_spend.wants = 0;
  });
  
   // Step 6: Market clearing
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
    
    // Step 7: Apply leftovers to stockpiles
    clearResult.unfilledSells.forEach(sell => {
      if (sell.owner_type === 'empire') {
        const empire = state.empires.find(e => e.id === sell.owner_id);
        if (empire) {
          if (!empire.stockpiles) empire.stockpiles = {};
          const remaining = sell.qty - sell.filled_qty;
          if (remaining > 0) {
            empire.stockpiles[sell.commodity] = (empire.stockpiles[sell.commodity] || 0) + remaining;
          }
        }
      }
     });
    });

     // Step 6b: Save remaining valid orders to state.marketOrders
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
    
    // Step 7: Coalition procurement after market clear
   // Refill allowance
   refillCoalitionAllowance(state.coalitionEconomy);
   
    // Procure from post-clear surplus
    const procurementLog = executeCoalitionProcurement(state.market, state.coalitionEconomy, config);

     // Convert stockpiles to requisition
    const conversionLog = executeSupplyConversion(state.coalitionEconomy, config);

    // Compress logs: combine procurement and conversion into one line if both occurred
    if (procurementLog.length > 0 && conversionLog.length > 0) {
      log.push(`Coalition economy: ${procurementLog[0]}; ${conversionLog[0]}`);
    } else {
      if (procurementLog.length > 0) log.push(...procurementLog);
      if (conversionLog.length > 0) log.push(...conversionLog);
    }
   
   // Step 8: Compute army fulfillment and performance
  state.armies.forEach(army => {
    computeArmyFulfillment(army, config);
  });
  
   // Replenish coalition treasury
   state.coalitionEconomy.treasury_credits = (state.coalitionEconomy.treasury_credits || 0) + 
     config.coalition.procurement.budget_credits_per_tick;
   
    // Apply coalition modifiers from enacted laws
    if (state.coalitionModifiers && state.empires) {
      state.empires.forEach(empire => {
       // Trade income
       if (state.coalitionModifiers.trade_income) {
         empire.budget_credits = (empire.budget_credits || 0) + state.coalitionModifiers.trade_income;
       }
       
       // Empire approval
       if (state.coalitionModifiers.empire_approval) {
         empire.approval = Math.min(100, Math.max(0, empire.approval + state.coalitionModifiers.empire_approval));
       }
       
        // Population growth (from coalition modifiers - percentage based)
        if (state.coalitionModifiers.population_growth) {
          if (!empire.stats) empire.stats = {};
          const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : 0;
          if (currentPopulation <= 0) return;

          // Initialize growth bank if needed
          if (!empire.stats.population_growth_bank) {
            empire.stats.population_growth_bank = 0;
          }

          // Calculate growth for this tick
          const growthAmount = currentPopulation * state.coalitionModifiers.population_growth;
          empire.stats.population_growth_bank += growthAmount;

          // Apply growth only when bank reaches threshold
          if (empire.stats.population_growth_bank >= MARKET_CONSTANTS.POPULATION_GROWTH_BANK_THRESHOLD) {
            const bankedGrowth = Math.floor(empire.stats.population_growth_bank);
            empire.stats.population = Math.max(0, currentPopulation + bankedGrowth);
            empire.stats.population_growth_bank -= bankedGrowth;
          }
        }
     });
     
      // Industrial output is applied during production calculations (handled elsewhere)
    }
    
    // Apply army maintenance cost modifier (placeholder - deduct from empire budgets)
    // TODO: Implement proper army maintenance system
    if (state.coalitionModifiers.army_maintenance_cost_modifier && state.coalitionModifiers.army_maintenance_cost_modifier !== 1.0) {
      state.empires.forEach(empire => {
        const armies = state.armies.filter(a => a.owner_empire_id === empire.id);
        // Placeholder: reduce maintenance costs by modifier (assuming some base cost per army)
        // This is a stub until full army maintenance is implemented
        const baseMaintenancePerArmy = 10; // placeholder value
        const totalMaintenance = armies.length * baseMaintenancePerArmy * state.coalitionModifiers.army_maintenance_cost_modifier;
        if (totalMaintenance > 0) {
          empire.budget_credits = Math.max(0, (empire.budget_credits || 0) - totalMaintenance);
        }
      });
    }
    
     // Apply relations strength modifier (placeholder - boost relations between empires)
     // TODO: Implement proper diplomacy relations improvement system
     if (state.coalitionModifiers.relations_strength_modifier && state.coalitionModifiers.relations_strength_modifier !== 1.0) {
       if (state.diplomacy && state.diplomacy.relations) {
         Object.keys(state.diplomacy.relations).forEach(empireId => {
           if (state.diplomacy.relations[empireId]) {
             Object.keys(state.diplomacy.relations[empireId]).forEach(otherId => {
            if (empireId !== otherId) {
               // Placeholder: improve relations by modifier each tick
               const current = state.diplomacy.relations[empireId][otherId] || 0;
               const improvement = (state.coalitionModifiers.relations_strength_modifier - 1.0) * 0.1; // Small boost per tick
               state.diplomacy.relations[empireId][otherId] = Math.min(100, current + improvement);
             }
             });
           }
         });
       }
    }
    
    logger.debug(`Economy tick: ${allTrades.length} trades, ${buyOrders.length} buy orders, ${sellOffers.length} sell offers`);
   
   return { log, trades: allTrades.length };
}
