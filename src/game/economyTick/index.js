import { getLogger } from '../../modules/logger.js';
import { DeterministicRNG } from '../../modules/rng.js';
import { GAME_INIT_CONSTANTS } from '../constants.js';
import {
  loadEconomyConfig,
  initializeMarket
} from '../marketEconomy.js';
import { loadResources } from './resources.js';
import { createOrderAggregator } from './orders.js';
import { emitEmpireProduction } from './production.js';
import {
  emitEmpireNeedsOrders,
  emitEmpireWantsOrders,
  emitArmyOrders,
  getEffectiveRationing,
  getSupplyEfficiencyMultiplier,
  initializeStarterNeedsStockpiles,
  consumeStarterNeedsStockpiles
} from './ordersPhase.js';
import {
  applyOrderDurations,
  applyOrderFees,
  enforceEmpireBudgetConstraints,
  resetEmpireSpend,
  clearMarkets,
  saveMarketOrders,
  finalizeDemandBacklog
} from './ordersLifecycle.js';
import { applyPostMarketUpdates } from './postTick.js';
import { triggerPressureGameplayEvents } from '../pressureEvents.js';
import {
  prepareMinorEconomy,
  emitMinorEconomyOrders,
  applyMinorEconomyPostMarket
} from '../expeditions/economy.js';

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
      requisition: GAME_INIT_CONSTANTS.INITIAL_REQUISITION,
      treasury_credits: GAME_INIT_CONSTANTS.INITIAL_TREASURY_CREDITS,
      consumption_requisition_pool: 0,
      consumption_requisition_pool_turns: 0,
      starter_stockpiles_initialized: false
    };
    logger.info('Coalition economy initialized');
  }

  prepareMinorEconomy(state);

  // Reset order books - start empty for new orders
  const {
    buyOrders,
    sellOffers,
    ordersToSave,
    aggregateBuyOrder,
    aggregateSellOffer
  } = createOrderAggregator(state);

  emitMinorEconomyOrders(state, { buyOrders, sellOffers, ordersToSave, aggregateSellOffer });

  // Seed finite reserves for essential needs in new games.
  initializeStarterNeedsStockpiles(state);

  // Step 1: Compute empire production
  emitEmpireProduction(state, aggregateSellOffer);

  // Calculate effective rationing and supply efficiency (supply_efficiency reduces consumption)
  const effectiveRationing = getEffectiveRationing(state);
  const supplyEfficiencyMultiplier = getSupplyEfficiencyMultiplier(state);

  // Step 2: Emit buy orders for empire needs/wants
  emitEmpireNeedsOrders(state, aggregateBuyOrder, effectiveRationing, supplyEfficiencyMultiplier);
  emitEmpireWantsOrders(state, aggregateBuyOrder, effectiveRationing, supplyEfficiencyMultiplier);

  // Step 3: Emit buy orders for army needs/wants
  emitArmyOrders(state, aggregateBuyOrder, effectiveRationing, supplyEfficiencyMultiplier);

  // Apply empire order posting fees
  const {
    validBuyOrders,
    validSellOffers
  } = applyOrderDurations(state, buyOrders, sellOffers);

  const budgetResult = enforceEmpireBudgetConstraints(state, validBuyOrders, validSellOffers);
  applyOrderFees(state, budgetResult.validBuyOrders, budgetResult.validSellOffers);
  resetEmpireSpend(state);

  // Step 6: Market clearing
  const allTrades = clearMarkets(
    state,
    commodities,
    budgetResult.validBuyOrders,
    budgetResult.validSellOffers,
    { budgetsEnforced: true }
  );

  consumeStarterNeedsStockpiles(state, budgetResult.validBuyOrders);

  // Demand ages only after this tick's supply allocation. Expired unmet
  // quantities become pressure instead of disappearing from the economy.
  const backlogResult = finalizeDemandBacklog(state, budgetResult.validBuyOrders);
  const pressureEventResult = triggerPressureGameplayEvents(
    state,
    state.economyPressure?.last_expired || []
  );

  // Step 6b: Save remaining valid orders to state.marketOrders
  saveMarketOrders(
    state,
    ordersToSave,
    backlogResult.activeOrders,
    budgetResult.validSellOffers,
    buyOrders,
    sellOffers
  );

  // Step 7-8: Apply post-market updates
  applyPostMarketUpdates(state, config);
  applyMinorEconomyPostMarket(state);

  logger.debug(`Economy tick: ${allTrades.length} trades, ${buyOrders.length} buy orders, ${sellOffers.length} sell offers`);

  return {
    log,
    trades: allTrades.length,
    pressureEvents: pressureEventResult.createdEvents
  };
}
