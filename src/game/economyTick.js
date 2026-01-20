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
    const resourcesPath = path.join(__dirname, '..', '..', 'docs', 'input', 'resources.yaml');
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
  
  // Reset order books
  const buyOrders = [];
  const sellOffers = [];
  let orderIdCounter = 0;
  
  // Step 1: Compute empire production
  state.empires.forEach(empire => {
    if (!empire.production || !empire.production.outputs_per_tick) return;
    
    Object.entries(empire.production.outputs_per_tick).forEach(([commodity, qty]) => {
      if (qty > 0) {
        // Apply industrial_output modifier
        const modifiedQty = qty * (1 + (state.coalitionModifiers.industrial_output || 0));
        
        // Create sell offer at market price (or slightly below for competitiveness)
        const marketPrice = state.market[commodity]?.price || 1.0;
        const askPrice = marketPrice * MARKET_CONSTANTS.SELL_PRICE_DISCOUNT; // Slightly below market
        
        const sellOffer = createSellOffer(
          `sell_${orderIdCounter++}`,
          'empire',
          empire.id,
          commodity,
          modifiedQty,
          askPrice,
          0
        );
        sellOffer.fee = 1;
        sellOffers.push(sellOffer);
      }
    });
  });
  
  // Step 2: Emit buy orders for empire needs
  state.empires.forEach(empire => {
    if (!empire.needs || !empire.needs.per_pop) return;
    const population = empire.stats?.population || 0;

    // Ensure stockpiles is initialized
    if (!empire.stockpiles) empire.stockpiles = {};
    if (!empire.economy_spend) {
      empire.economy_spend = { needs: 0, wants: 0, order_fees: 0 };
    }

    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const totalNeeded = qtyPerPop * population;
      if (totalNeeded > 0) {
        // Check stockpile first
        const stockpiled = empire.stockpiles[commodity] || 0;
        const neededFromMarket = Math.max(0, totalNeeded - stockpiled);

        if (neededFromMarket > 0) {
          const marketPrice = state.market[commodity]?.price || 1.0;
          const maxPrice = marketPrice * MARKET_CONSTANTS.BUY_NEEDS_PREMIUM; // Pay premium for needs

          const buyOrder = createBuyOrder(
            `buy_empire_${orderIdCounter++}`,
            'empire',
            empire.id,
            commodity,
            neededFromMarket,
            maxPrice,
            1 // Higher priority for needs
          );
          buyOrder.category = 'needs';
          buyOrder.fee = 1;
          buyOrders.push(buyOrder);
        }

        // Consume from stockpile
        if (stockpiled > 0) {
          const consumed = Math.min(stockpiled, totalNeeded);
          empire.stockpiles[commodity] = stockpiled - consumed;
        }
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
        const maxPrice = marketPrice * MARKET_CONSTANTS.BUY_WANTS_PREMIUM; // Lower premium for wants

        const buyOrder = createBuyOrder(
          `buy_empire_want_${orderIdCounter++}`,
          'empire',
          empire.id,
          commodity,
          totalWanted,
          maxPrice,
          0 // Normal priority for wants (lower than needs)
        );
        buyOrder.category = 'wants';
        buyOrder.fee = 1;
        buyOrders.push(buyOrder);
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
    
    // Check if empire can fulfill from stockpile first
    const empire = state.empires.find(e => e.id === army.owner_empire_id);
    if (empire && empire.stockpiles) {
      // Distribute empire surplus to armies
      const baseSurplusRatio = empire.allocation?.surplus_to_armies_ratio || 0.35;
      const stability = Number.isFinite(empire.stability) ? empire.stability : 60;
      const stabilityFactor = Math.max(0.5, Math.min(1.2, 0.7 + (stability / 100) * 0.5));
      const surplusRatio = baseSurplusRatio * stabilityFactor;
      
      Object.entries(army.demands.needs || {}).forEach(([commodity, qtyPerManpower]) => {
        const totalNeeded = qtyPerManpower * manpower;
        const stockpiled = empire.stockpiles[commodity] || 0;
        const availableForArmies = stockpiled * surplusRatio;
        
        if (availableForArmies > 0 && totalNeeded > 0) {
          const distributed = Math.min(availableForArmies, totalNeeded);
          empire.stockpiles[commodity] = stockpiled - distributed;
          army.supply_state.received[commodity] = (army.supply_state.received[commodity] || 0) + distributed;
        }
      });
      
      Object.entries(army.demands.wants || {}).forEach(([commodity, qtyPerManpower]) => {
        const totalWanted = qtyPerManpower * manpower;
        const stockpiled = empire.stockpiles[commodity] || 0;
        const availableForArmies = stockpiled * surplusRatio;
        
        if (availableForArmies > 0 && totalWanted > 0) {
          const distributed = Math.min(availableForArmies, totalWanted);
          empire.stockpiles[commodity] = stockpiled - distributed;
          army.supply_state.received[commodity] = (army.supply_state.received[commodity] || 0) + distributed;
        }
      });
    }
    
    // Create buy orders for unmet needs
    Object.entries(army.demands.needs || {}).forEach(([commodity, qtyPerManpower]) => {
      const totalNeeded = qtyPerManpower * manpower;
      const received = army.supply_state.received[commodity] || 0;
      const unmet = Math.max(0, totalNeeded - received);
      
      if (unmet > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice * MARKET_CONSTANTS.ARMY_NEEDS_PREMIUM; // Armies pay premium
        
        const buyOrder = createBuyOrder(
          `buy_army_${orderIdCounter++}`,
          'army',
          army.id,
          commodity,
          unmet,
          maxPrice,
          0
        );
        buyOrders.push(buyOrder);
      }
    });
    
    // Create buy orders for unmet wants
    Object.entries(army.demands.wants || {}).forEach(([commodity, qtyPerManpower]) => {
      const totalWanted = qtyPerManpower * manpower;
      const received = army.supply_state.received[commodity] || 0;
      const unmet = Math.max(0, totalWanted - received);
      
      if (unmet > 0) {
        const marketPrice = state.market[commodity]?.price || 1.0;
        const maxPrice = marketPrice * MARKET_CONSTANTS.ARMY_WANTS_PREMIUM; // Lower priority than needs
        
        const buyOrder = createBuyOrder(
          `buy_army_want_${orderIdCounter++}`,
          'army',
          army.id,
          commodity,
          unmet,
          maxPrice,
          -1 // Lower priority
        );
        buyOrders.push(buyOrder);
      }
    });
  });
  
  // Step 4: Compute market target prices
  updateMarketPrices(state.market, commodities, config);
  


  // Apply empire order posting fees
  const allBuyOrders = buyOrders.concat(state.marketOrders?.buyOrders || []);
  const allSellOffers = sellOffers.concat(state.marketOrders?.sellOffers || []);

  allBuyOrders.forEach(order => {
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
    
    const clearResult = clearMarket(buyOrders, sellOffers, marketState);
    allTrades.push(...clearResult.trades);
    
    // Store post-clear remaining offers for coalition procurement
    marketState.remaining_sell_offers_post_clear = clearResult.unfilledSells;
    
    // Apply trades to entities
    clearResult.trades.forEach(trade => {
      // Find buyer and seller
      const buyOrder = buyOrders.find(b => b.id === trade.buy_order_id);
      const sellOffer = sellOffers.find(s => s.id === trade.sell_offer_id);
      
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
   
   // Step 7: Coalition procurement after market clear
   // Refill allowance
   refillCoalitionAllowance(state.coalitionEconomy);
   
   // Procure from post-clear surplus
   const procurementLog = executeCoalitionProcurement(state.market, state.coalitionEconomy, config);
   if (procurementLog.length > 0) {
     log.push(...procurementLog);
   }
   
   // Convert stockpiles to supplies
   const conversionLog = executeSupplyConversion(state.coalitionEconomy, config);
   if (conversionLog.length > 0) {
     log.push(...conversionLog);
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
       
        // Population growth
        if (state.coalitionModifiers.population_growth) {
          if (!empire.stats) empire.stats = {};
          const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : 0;
          empire.stats.population = Math.max(0, Math.floor(currentPopulation * (1 + state.coalitionModifiers.population_growth)));
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
