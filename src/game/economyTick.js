/**
 * Economy tick processor - runs the market economy pipeline each turn
 */

import { getLogger } from '../modules/logger.js';
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
    state.market = initializeMarket(commodities);
    logger.info('Market initialized');
  }
  
  // Initialize coalition economy state if needed
  if (!state.coalitionEconomy) {
    state.coalitionEconomy = {
      budget_credits: config.coalition.procurement.budget_credits_per_tick * 10, // Start with 10 ticks worth
      stockpiles: {},
      per_commodity_priority: {}
    };
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
        // Create sell offer at market price (or slightly below for competitiveness)
        const marketPrice = state.market[commodity]?.price || 1.0;
        const askPrice = marketPrice * 0.95; // 5% below market
        
        const sellOffer = createSellOffer(
          `sell_${orderIdCounter++}`,
          'empire',
          empire.id,
          commodity,
          qty,
          askPrice,
          0
        );
        sellOffers.push(sellOffer);
      }
    });
  });
  
  // Step 2: Emit buy orders for empire needs
  state.empires.forEach(empire => {
    if (!empire.needs || !empire.needs.per_pop) return;
    const population = empire.stats?.population || 0;
    
    Object.entries(empire.needs.per_pop).forEach(([commodity, qtyPerPop]) => {
      const totalNeeded = qtyPerPop * population;
      if (totalNeeded > 0) {
        // Check stockpile first
        const stockpiled = empire.stockpiles[commodity] || 0;
        const neededFromMarket = Math.max(0, totalNeeded - stockpiled);
        
        if (neededFromMarket > 0) {
          const marketPrice = state.market[commodity]?.price || 1.0;
          const maxPrice = marketPrice * 1.1; // Willing to pay 10% above market
          
          const buyOrder = createBuyOrder(
            `buy_empire_${orderIdCounter++}`,
            'empire',
            empire.id,
            commodity,
            neededFromMarket,
            maxPrice,
            1 // Higher priority for needs
          );
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
  
  // Step 3: Emit buy orders for army needs/wants
  state.armies.forEach(army => {
    if (!army.demands) return;
    const manpower = army.manpower || 0;
    
    // Reset received commodities for this tick
    army.supply_state.received = {};
    
    // Check if empire can fulfill from stockpile first
    const empire = state.empires.find(e => e.id === army.owner_empire_id);
    if (empire && empire.stockpiles) {
      // Distribute empire surplus to armies
      const surplusRatio = empire.allocation?.surplus_to_armies_ratio || 0.35;
      
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
        const maxPrice = marketPrice * 1.2; // Armies pay premium
        
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
        const maxPrice = marketPrice * 1.15; // Lower priority than needs
        
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
  
  // Step 5: Coalition procurement pass
  const procurementResult = coalitionProcurement(state.market, sellOffers, state.coalitionEconomy, config);
  if (procurementResult.purchases.length > 0) {
    log.push(`Coalition procured ${procurementResult.purchases.length} commodities (spent ${procurementResult.spent.toFixed(0)} credits)`);
  }
  
  // Step 6: Market clearing
  const allTrades = [];
  commodities.forEach(commodity => {
    const marketState = state.market[commodity.key];
    if (!marketState) return;
    
    const clearResult = clearMarket(buyOrders, sellOffers, marketState);
    allTrades.push(...clearResult.trades);
    
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
            empire.budget_credits = (empire.budget_credits || 0) - (trade.qty * trade.price);
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
  
  // Step 8: Compute army fulfillment and performance
  state.armies.forEach(army => {
    computeArmyFulfillment(army, config);
  });
  
  // Replenish coalition budget
  state.coalitionEconomy.budget_credits = (state.coalitionEconomy.budget_credits || 0) + 
    config.coalition.procurement.budget_credits_per_tick;
  
  logger.debug(`Economy tick: ${allTrades.length} trades, ${buyOrders.length} buy orders, ${sellOffers.length} sell offers`);
  
  return { log, trades: allTrades.length };
}
