import { getLogger } from '../../modules/logger.js';
import { DeterministicRNG } from '../../modules/rng.js';
import { MARKET_CONSTANTS } from '../constants.js';
import {
  loadEconomyConfig,
  initializeMarket,
  coalitionProcurement
} from '../marketEconomy.js';
import { loadResources } from './resources.js';
import { createOrderAggregator } from './orders.js';
import { emitEmpireProduction } from './production.js';
import {
  emitEmpireNeedsOrders,
  emitEmpireWantsOrders,
  emitArmyOrders,
  getEffectiveRationing
} from './ordersPhase.js';
import {
  applyOrderDurations,
  applyExpiredSellOffers,
  applyOrderFees,
  resetEmpireSpend,
  clearMarkets,
  saveMarketOrders
} from './ordersLifecycle.js';
import { applyPostMarketUpdates } from './postTick.js';

/**
 * Economy tick processor - runs the market economy pipeline each turn
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
    state.coalitionEconomy = {
      requisition: 500,
      treasury_credits: 10000,
      allowance_credits: 1000
    };
    logger.info('Coalition economy initialized');
  }

  // Reset order books - start empty for new orders
  const {
    buyOrders,
    sellOffers,
    ordersToSave,
    aggregateBuyOrder,
    aggregateSellOffer
  } = createOrderAggregator(state);

  // Step 1: Compute empire production
  emitEmpireProduction(state, aggregateSellOffer);

  // Calculate effective rationing with modifiers (applies to all consumption)
  const effectiveRationing = getEffectiveRationing(state);

  // Step 2: Emit buy orders for empire needs/wants
  emitEmpireNeedsOrders(state, aggregateBuyOrder, effectiveRationing);
  emitEmpireWantsOrders(state, aggregateBuyOrder, effectiveRationing);

  // Step 3: Emit buy orders for army needs/wants
  emitArmyOrders(state, aggregateBuyOrder, effectiveRationing);

  // Apply empire order posting fees
  const {
    allBuyOrders,
    allSellOffers,
    validBuyOrders,
    validSellOffers,
    expiredSellOffers
  } = applyOrderDurations(state, buyOrders, sellOffers);

  applyExpiredSellOffers(state, expiredSellOffers);
  applyOrderFees(state, validBuyOrders, allSellOffers);
  resetEmpireSpend(state);

  // Step 6: Market clearing
  const allTrades = clearMarkets(state, commodities, validBuyOrders, validSellOffers);

  // Step 6b: Save remaining valid orders to state.marketOrders
  saveMarketOrders(state, ordersToSave, validBuyOrders, validSellOffers, buyOrders, sellOffers);

  // Coalition procurement (market, sell offers with updated filled_qty, coalition state, config)
  coalitionProcurement(state.market, validSellOffers, state.coalitionEconomy, config);

  // Step 7-8: Apply post-market updates
  applyPostMarketUpdates(state, config);

  logger.debug(`Economy tick: ${allTrades.length} trades, ${buyOrders.length} buy orders, ${sellOffers.length} sell offers`);

  return { log, trades: allTrades.length };
}
