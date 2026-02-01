/**
 * Improvements Engine
 *
 * Core logic for improvements system:
 * - Request and instance creation
 * - State management (accept, cancel, tick processing)
 * - Sustainment and production processing
 * - Modifier application
 */

import { getLogger } from '../../modules/logger.js';
import { IMPROVEMENTS_CONSTANTS, PRODUCTION_EFFICIENCY_CONSTANTS } from '../constants.js';
import { createArmy } from '../types.js';
import { refreshArmyAggregates } from '../armyComposition.js';
import { hasTag, empireHasTag } from '../../utils/tags.js';
import { getTieredImprovementRequests, generateImprovementSuggestions, generateReplacementSuggestion, canStartImprovement } from './definitions.js';
import {
  MODIFIER_ARMY_ORG_SCALE,
  MODIFIER_EMPIRE_APPROVAL_SCALE,
  POPULATION_GROWTH_SCALE,
  BIOLOGIC_TAG,
  BIOLOGIC_GROWTH_BONUS_MULTIPLIER,
  improvementHasTag,
  IMPROVEMENT_SUSTAINMENT_TICKS
} from './types.js';

let orderIdCounter = 0;

export const SUGGESTION_MAX_DURATION = 45; // ticks before a suggestion expires

/**
 * Create an improvement request (available to accept)
 */
export function createImprovementRequest(id, name, description, {
  suppliesCost = 0,
  build = 0,
  capacity = 1,
  sustainmentCost = {}, // { commodity_key: qty_per_tick }
  productionOutputs = {}, // { commodity_key: qty_per_tick }
  modifiers = {}, // { stat_key: value }
  tags = [],
  suggestedBy = null,
  requiredLawId = null,
  requiredLaws = null,
  armyGrant = null,        // { manpower: number } - creates army or adds to existing
  manpowerGrant = null,    // number - adds manpower to empire's army
  requiresNoArmy = false,  // If true, improvement only available to empires without an army
  requisitionUpkeep = 0,   // requisition cost per tick
  productionBankThreshold = 10, // multiplier of total production output per tick (10 = release when accumulated 10x per-tick)

  tier = 1,
  branch = 'general'
} = {}) {
  return {
    id,
    name,
    description,
    suppliesCost,
    build,
    capacity,
    sustainmentCost,
    productionOutputs,
    modifiers,
    tags,
    suggestedBy,
    requiredLawId,
    requiredLaws,
    armyGrant,
    manpowerGrant,
    requiresNoArmy,
    requisitionUpkeep,
    productionBankThreshold,
    tier,
    branch,
    requestedAt: null
  };
}

/**
 * Remove expired improvement suggestions (older than SUGGESTION_MAX_DURATION ticks)
 * @param {Object} state - Game state
 * @returns {number} Number of expired requests removed
 */
export function removeExpiredSuggestions(state) {
  if (!state.improvements?.requests || !state.turn) return 0;

  const expiredRequests = state.improvements.requests.filter(r =>
    r.requestedAt && (state.turn - r.requestedAt) > SUGGESTION_MAX_DURATION
  );

  const expiredIds = new Set(expiredRequests.map(r => r.id));
  state.improvements.requests = state.improvements.requests.filter(r => !expiredIds.has(r.id));

  return expiredRequests.length;
}

/**
 * Create an improvement instance (in queue or completed)
 */
export function createImprovement(requestId, empireId, startedAtTick, request) {
  const populationMultiplier = request.sustainmentCost ? Object.values(request.sustainmentCost).reduce((a, b) => a + b, 0) : 0;
  return {
    id: `${requestId}_${empireId}_${startedAtTick}`,
    requestId,
    empireId,
    name: request.name,
    description: request.description,
    suggestedBy: request.suggestedBy || empireId || null,

    // Tier and branch (for tier unlock tracking)
    tier: request.tier || 1,
    branch: request.branch || 'general',

    // Build phase
    buildProgress: 0,
    build: request.build,
    startedAtTick,

    // Runtime state
    state: 'BUILDING', // BUILDING | ACTIVE | DEGRADED
    capacity: request.capacity,

    // Costs and outputs
    sustainmentCost: { ...request.sustainmentCost },
    productionOutputs: { ...request.productionOutputs },
    modifiers: { ...request.modifiers },
    requisitionUpkeep: request.requisitionUpkeep || 0,
    requiredLawId: request.requiredLawId || null,
    requiredLaws: request.requiredLaws || null,
    armyGrant: request.armyGrant || null,
    manpowerGrant: request.manpowerGrant || null,

    // Stockpile for sustainment buffer (10 ticks worth)
    stockpile: {},
    maxStockpile: populationMultiplier > 0 ? populationMultiplier * IMPROVEMENT_SUSTAINMENT_TICKS : 0,

    // Production bank (accumulates before releasing to market)
    productionBank: {},
    productionBankThreshold: request.productionBankThreshold || 10, // multiplier for release threshold
    
    // Degradation tracking
    degradedSince: null,
    ticksSinceSustained: 0,
    completedAtTick: null, // Grace period before sustainment kicks in

    tags: [...request.tags]
  };
}

/**
 * Initialize improvements system in game state
 */
export function initializeImprovementsState() {
  return {
    requests: [], // Available improvement requests
    queue: [], // Improvements being built or active
    completed: [], // Archive of completed/removed improvements

    // Capacity limit (applies only to BUILDING improvements)
    maxTotalCapacity: 4,

    // Current utilization (BUILDING only)
    currentCapacity: 0
  };
}

/**
 * Get sample improvement requests (for testing)
 */
export function getSampleImprovementRequests() {
  return getTieredImprovementRequests();
}

/**
 * Initialize improvement suggestions with proper empire assignment
 */
export function initializeImprovementSuggestions(state, rng = Math.random) {
  if (!state.improvements) {
    state.improvements = {
      requests: [],
      queue: [],
      completed: [],
      maxTotalCapacity: 10,
      currentCapacity: 0
    };
  }
  state.improvements.requests = generateImprovementSuggestions(state, rng);
}

/**
 * Accept an improvement request (start building)
 */
export function acceptImprovementRequest(state, requestId, empireId) {
  const logger = getLogger();
  const request = state.improvements.requests.find(r => r.id === requestId);

  if (!request) {
    return { success: false, error: 'Request not found', log: [] };
  }

  // Check tier requirements for this empire (if tier is defined)
  if (request.tier && request.tier > 1) {
    const tierCheck = canStartImprovement(requestId, state, empireId);
    if (!tierCheck.canStart) {
      return { success: false, error: tierCheck.reason, log: [] };
    }
  }

  // Check requisition from coalition economy
  if (!state.coalitionEconomy) {
    return { success: false, error: 'Coalition economy not initialized', log: [] };
  }
  if (!state.coalitionEconomy.requisition) state.coalitionEconomy.requisition = 0;
  if (request.suppliesCost > 0 && state.coalitionEconomy.requisition < request.suppliesCost) {
    return {
      success: false,
      error: `Insufficient Requisition (need ${request.suppliesCost}, have ${state.coalitionEconomy.requisition})`,
      log: []
    };
  }

  // Check capacity limits (BUILDING improvements only)
  const improvements = state.improvements;
  const totalCapacity = improvements.queue
    .filter(i => i.state === 'BUILDING')
    .reduce((sum, i) => sum + i.capacity, 0);

  if (totalCapacity + request.capacity > improvements.maxTotalCapacity) {
    return {
      success: false,
      error: `Would exceed capacity limit (${totalCapacity + request.capacity}/${improvements.maxTotalCapacity})`,
      log: []
    };
  }

  // Deduct requisition from coalition economy (no refunds on cancellation)
  if (request.suppliesCost > 0) {
    state.coalitionEconomy.requisition -= request.suppliesCost;
  }

  // Create improvement instance
   const improvement = createImprovement(requestId, empireId, state.turn, request);
   improvements.queue.push(improvement);

   // Remove the request from the list
   const requestIdx = state.improvements.requests.findIndex(r => r.id === requestId);
   if (requestIdx !== -1) {
     state.improvements.requests.splice(requestIdx, 1);
   }

   // Generate a replacement suggestion for this empire
   const replacement = generateReplacementSuggestion(state, empireId);
   if (replacement) {
     state.improvements.requests.push(replacement);
     logger.debug(`Replacement suggestion added for ${empireId}: ${replacement.name}`);
   }

    logger.info(`Improvement started: ${improvement.name} (Empire: ${empireId}, Requisition: ${request.suppliesCost}, Tier: ${improvement.tier})`);

   return {
     success: true,
     improvement,
     log: [`{green-fg}Started:{/green-fg} ${improvement.name} (requisition: ${request.suppliesCost}, T${improvement.tier})`]
   };
}

/**
 * Cancel an improvement (no refund)
 */
export function cancelImprovement(state, improvementId) {
  const logger = getLogger();
  const idx = state.improvements.queue.findIndex(i => i.id === improvementId);

  if (idx === -1) {
    return { success: false, error: 'Improvement not found', log: [] };
  }

  const improvement = state.improvements.queue[idx];
  state.improvements.queue.splice(idx, 1);
  state.improvements.completed.push({ ...improvement, cancelledAt: state.turn });

  logger.info(`Improvement cancelled: ${improvement.name} (No refund)`);

  return {
    success: true,
    log: [`{red-fg}Cancelled:{/red-fg} ${improvement.name} (No refund)`]
  };
}

/**
 * Process improvements each tick
 */
export function processImprovementsTick(state) {
  const logger = getLogger();
  const log = [];
  const improvements = state.improvements;

  // Update current capacity (BUILDING improvements only)
  improvements.currentCapacity = improvements.queue
    .filter(i => i.state === 'BUILDING')
    .reduce((sum, i) => sum + i.capacity, 0);

  // Get construction value (how much progress ALL building items get per tick)
  let effectiveConstruction = Number.isFinite(state.coalitionConstruction) ? state.coalitionConstruction : 1;
  
  // Apply modifiers from active improvements
  const activeImprovements = improvements.queue.filter(i => i.state === 'ACTIVE');
  let addModifier = 0;
  let multModifier = 1;
  
  activeImprovements.forEach(improvement => {
    const mods = improvement.modifiers || {};
    if (mods.coalition_construction_add) {
      addModifier += mods.coalition_construction_add;
    }
    if (mods.coalition_construction_mult) {
      multModifier *= (1 + mods.coalition_construction_mult);
    }
  });
  
  effectiveConstruction = (effectiveConstruction + addModifier) * multModifier;
  const dynamicBuildMult = state.coalitionModifiers?.dynamic?.improvement_build_speed_mult || 1.0;
  effectiveConstruction *= dynamicBuildMult;
  const constructionValue = Math.max(0, effectiveConstruction);

   improvements.queue.forEach(improvement => {
     if (improvement.state === 'BUILDING') {
       // Advance build progress by construction value
       improvement.buildProgress += constructionValue;

       // Check if build is complete
        if (improvement.buildProgress >= improvement.build) {
          improvement.state = 'ACTIVE';
          improvement.completedAtTick = state.turn; // Give grace period before sustainment
          const empire = state.empires.find(e => e.id === improvement.empireId);
         const empireName = empire ? empire.name : 'Unknown Empire';
         logger.info(`Improvement built: ${improvement.name} (${empireName})`);
         log.push(`{green-fg}Completed:{/green-fg} ${improvement.name} (${empireName}) is now ACTIVE`);
         const grantLog = grantImprovementUnits(state, improvement);
         log.push(...grantLog);
       }
    }

    if (improvement.state === 'ACTIVE' || improvement.state === 'DEGRADED') {
      // Release accumulated production from bank to market (happens first)
      const releaseResult = releaseProductionFromBank(state, improvement);
      log.push(...releaseResult.log);

      // Process requisition upkeep (only for ACTIVE improvements)
      if (improvement.state === 'ACTIVE' && improvement.requisitionUpkeep > 0) {
        if (!state.coalitionEconomy) {
          state.coalitionEconomy = { requisition: 0 };
        }
        if (state.coalitionEconomy.requisition === undefined || state.coalitionEconomy.requisition === null) {
          state.coalitionEconomy.requisition = 0;
        }

        // Allow requisition to go negative
        const prevRequisition = state.coalitionEconomy.requisition;
        state.coalitionEconomy.requisition -= improvement.requisitionUpkeep;

        // Only log if this is a significant upkeep cost
        if (improvement.requisitionUpkeep >= 5) {
          log.push(`{yellow-fg}Upkeep:{/yellow-fg} ${improvement.name} (-${improvement.requisitionUpkeep} requisition)`);
        }
      }

      // Process sustainment
      const sustainmentResult = processImprovementSustainment(state, improvement);
      log.push(...sustainmentResult.log);

      // Process production (only if ACTIVE) - accumulates in productionBank
      if (improvement.state === 'ACTIVE') {
        const productionResult = processImprovementProduction(state, improvement);
        log.push(...productionResult.log);
      }
    }
  });

  return { log };
}

/**
 * Process sustainment for an improvement
 * Uses internal stockpile to buffer 10 ticks of sustainment needs
 */
export function processImprovementSustainment(state, improvement) {
  const logger = getLogger();
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);

  if (!empire) {
    // Empire no longer exists, degrade improvement
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Empire not found)`);
    }
    return { log };
  }

  // Check if sustainment is needed
  const sustainmentNeeds = improvement.sustainmentCost;
  let allSatisfied = true;
  const shortages = [];

  const population = empire.stats?.population || 1;

  const buyFromMarket = (commodity, qtyNeeded) => {
    if (qtyNeeded <= 0) return 0;
    const marketState = state.market?.[commodity];
    const sellOffers = state.marketOrders?.sellOffers;
    if (!marketState || !sellOffers || sellOffers.length === 0) return 0;

    const maxPrice = marketState.price;
    const availableSells = sellOffers
      .filter(sell => sell.commodity === commodity && (sell.qty - (sell.filled_qty || 0)) > 0)
      .filter(sell => (sell.ask_price || 0) <= maxPrice)
      .sort((a, b) => (a.ask_price || 0) - (b.ask_price || 0));

    let remaining = qtyNeeded;
    for (const sell of availableSells) {
      if (remaining <= 0) break;
      const remainingQty = sell.qty - (sell.filled_qty || 0);
      if (remainingQty <= 0) continue;

      const price = sell.ask_price || marketState.price || 1;
      const budget = Math.max(0, empire.budget_credits || 0);
      const affordable = Math.floor(Math.min(remainingQty, remaining, budget / price));
      if (affordable <= 0) continue;

      const cost = affordable * price;
      sell.filled_qty = (sell.filled_qty || 0) + affordable;
      empire.budget_credits = budget - cost;

      if (sell.owner_type === 'empire') {
        const seller = state.empires.find(e => e.id === sell.owner_id);
        if (seller) {
          seller.budget_credits = (seller.budget_credits || 0) + cost;
        }
      } else if (sell.owner_type === 'coalition') {
        if (!state.coalitionEconomy) state.coalitionEconomy = {};
        state.coalitionEconomy.treasury_credits = (state.coalitionEconomy.treasury_credits || 0) + cost;
      }

      remaining -= affordable;
    }

    return qtyNeeded - remaining;
  };

  for (const [commodity, qtyNeeded] of Object.entries(sustainmentNeeds)) {
    const scaledQty = Math.ceil(qtyNeeded * population);
    if (scaledQty <= 0) continue;

    // Initialize improvement stockpile for this commodity if needed
    if (!improvement.stockpile[commodity]) {
      improvement.stockpile[commodity] = 0;
    }

    // Initialize empire stockpile if needed
    if (!empire.stockpiles) empire.stockpiles = {};

    // Calculate max stockpile capacity (10 ticks worth)
    const maxStockpile = Math.ceil(scaledQty * IMPROVEMENT_SUSTAINMENT_TICKS);

    let remainingNeed = scaledQty;

    // Try to fulfill from market first
    if (commodity !== 'requisition') {
      const purchased = buyFromMarket(commodity, remainingNeed);
      remainingNeed -= purchased;
    }

    // Then consume from improvement's internal stockpile
    const currentStockpile = improvement.stockpile[commodity] || 0;
    if (remainingNeed > 0) {
      if (currentStockpile >= remainingNeed) {
        improvement.stockpile[commodity] -= remainingNeed;
        remainingNeed = 0;
      } else {
        improvement.stockpile[commodity] = 0;
        remainingNeed -= currentStockpile;
      }
    }
    const stockpileAfterUse = improvement.stockpile[commodity] || 0;

    // Then consume from empire stockpiles
    if (remainingNeed > 0) {
      let empireStockpile = empire.stockpiles[commodity] || 0;
      if (commodity === 'requisition') {
        empireStockpile = empire.budget_credits || 0;
      }

      if (empireStockpile >= remainingNeed) {
        if (commodity === 'requisition') {
          empire.budget_credits -= remainingNeed;
        } else {
          empire.stockpiles[commodity] -= remainingNeed;
        }
        const excessAvailable = empireStockpile - remainingNeed;

        // If we have room, try to top up the stockpile for future buffer
        // Only top up if empire has excess (at least 2 ticks worth extra)
        if (excessAvailable >= scaledQty * 2 && stockpileAfterUse < maxStockpile) {
          const amountToAdd = Math.min(maxStockpile - stockpileAfterUse, excessAvailable - scaledQty);
          if (amountToAdd > 0) {
            if (commodity === 'requisition') {
              empire.budget_credits -= amountToAdd;
            } else {
              empire.stockpiles[commodity] -= amountToAdd;
            }
            improvement.stockpile[commodity] += amountToAdd;
          }
        }
        remainingNeed = 0;
      } else {
        if (commodity === 'requisition') {
          empire.budget_credits = 0;
        } else {
          empire.stockpiles[commodity] = 0;
        }
        remainingNeed -= empireStockpile;
      }
    }

    if (remainingNeed > 0) {
      // Create market buy order if market exists
      if (state.market && state.market[commodity]) {
        const marketState = state.market[commodity];
        const maxPrice = marketState.price;

        const buyOrder = {
          id: `sustain_${orderIdCounter++}`,
          owner_type: 'empire',
          owner_id: empire.id,
          commodity,
          qty: remainingNeed,
          max_price: maxPrice,
          priority: 800,
          filled_qty: 0,
          fee: 1,
          tags: {
            originator: improvement.id,
            payer: empire.id,
            beneficiary: improvement.id,
            purpose: 'sustainment'
          }
        };

        if (!state.marketOrders) {
          state.marketOrders = { buyOrders: [], sellOffers: [] };
        }
        state.marketOrders.buyOrders.push(buyOrder);
      }

      allSatisfied = false;
      shortages.push(commodity);
    }
  }

  // Update improvement state based on sustainment success
  improvement.ticksSinceSustained++;

  // Skip sustainment check during grace period (first tick after completion)
  const inGracePeriod = improvement.completedAtTick && (state.turn - improvement.completedAtTick) < 1;

  if (allSatisfied) {
    improvement.ticksSinceSustained = 0;

    // Restore to ACTIVE if was DEGRADED
    if (improvement.state === 'DEGRADED') {
      improvement.state = 'ACTIVE';
      improvement.degradedSince = null;
      log.push(`{green-fg}Restored:{/green-fg} ${improvement.name} is now ACTIVE`);
      logger.info(`Improvement restored: ${improvement.name}`);
    }
  } else if (!inGracePeriod && improvement.ticksSinceSustained >= IMPROVEMENT_SUSTAINMENT_TICKS) {
    // Degrade after 10 ticks of failed sustainment
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Missing: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks)`);
      logger.warn(`Improvement degraded: ${improvement.name} - shortages: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks without sustainment`);
    }
  }

  return { log };
}

/**
 * Process production outputs for an improvement
 * Accumulates in production bank, held until threshold is met
 */
export function processImprovementProduction(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);

  if (!empire) return { log };

  const population = empire.stats?.population || 1;
  
  // Calculate effective production efficiency with modifiers
  const baseEfficiency = PRODUCTION_EFFICIENCY_CONSTANTS.BASE_EFFICIENCY;
  const efficiencyAdd = state.coalitionModifiers?.production_efficiency_add || 0;
  const efficiencyMult = state.coalitionModifiers?.production_efficiency_mult || 1.0;
  const effectiveEfficiency = Math.max(
    PRODUCTION_EFFICIENCY_CONSTANTS.MIN_EFFICIENCY,
    Math.min(PRODUCTION_EFFICIENCY_CONSTANTS.MAX_EFFICIENCY, (baseEfficiency + efficiencyAdd) * efficiencyMult)
  );

  // Initialize production bank if needed
  if (!improvement.productionBank) {
    improvement.productionBank = {};
  }

  // Process production outputs - accumulate in production bank
  for (const [commodity, qty] of Object.entries(improvement.productionOutputs)) {
    // Apply production efficiency to base quantity before scaling
    const efficiencyAdjustedQty = qty * effectiveEfficiency;
    const scaledQty = commodity === 'requisition'
      ? Math.floor(efficiencyAdjustedQty)
      : Math.floor(efficiencyAdjustedQty * population);
    if (scaledQty <= 0) continue;

    // Special handling for requisition - add directly to coalition economy (bypass bank)
    if (commodity === 'requisition') {
      if (!state.coalitionEconomy) {
        state.coalitionEconomy = { requisition: 0 };
      }
      if (!state.coalitionEconomy.requisition) {
        state.coalitionEconomy.requisition = 0;
      }
      state.coalitionEconomy.requisition += scaledQty;
      log.push(`{blue-fg}Produced:{/blue-fg} ${scaledQty} ${commodity} -> coalition economy (direct)`);
      continue;
    }

    // Accumulate commodity in production bank (no log - only log when released)
    improvement.productionBank[commodity] = (improvement.productionBank[commodity] || 0) + scaledQty;
  }

  return { log };
}

/**
 * Release accumulated production from improvement's bank to the market as sell offers
 * Only releases when threshold is met (based on production output per tick)
 */
export function releaseProductionFromBank(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  const logger = getLogger();

  if (!empire) return { log };

  // Initialize market orders if needed
  if (!state.marketOrders) {
    state.marketOrders = { buyOrders: [], sellOffers: [] };
  }

  // Calculate threshold based on improvement's production output per tick
  const population = empire.stats?.population || 1;
  let thresholdValue = 0;
  
  // Calculate what would be produced this tick (for threshold)
  for (const [commodity, qty] of Object.entries(improvement.productionOutputs || {})) {
    if (commodity !== 'requisition') {
      thresholdValue += Math.floor(qty * population);
    }
  }
  
  // Apply the threshold multiplier
  const threshold = thresholdValue * (improvement.productionBankThreshold || 1);

  // Check if total accumulated production meets threshold
  let totalAccumulated = 0;
  for (const qty of Object.values(improvement.productionBank)) {
    totalAccumulated += qty;
  }

  // Only release if threshold is met
  if (totalAccumulated < threshold) {
    // Threshold not met, don't release
    // Log to file/Logs view only (not in-game log) to reduce noise
    const holdMessage = threshold > 0 ? `(${totalAccumulated}/${Math.ceil(threshold)} to release)` : '';
    if (totalAccumulated > 0) {
      const logger = getLogger();
      logger.debug(`Holding: ${improvement.name} production bank accumulating ${holdMessage}`);
    }
    return { log };
  }

  // Release all accumulated production from bank to market
  for (const [commodity, qty] of Object.entries(improvement.productionBank)) {
    if (qty <= 0) continue;

    // Get market price for this commodity
    const marketState = state.market?.[commodity];
    const sellPrice = marketState?.price || marketState?.floor_price || 1.0;
    const discountedPrice = sellPrice;

    const sellOffer = {
      id: `prod_${orderIdCounter++}`,
      owner_type: 'empire',
      owner_id: empire.id,
      commodity,
      qty: qty,
      ask_price: discountedPrice,
      filled_qty: 0,
      priority: 100, // Normal priority
      fee: 0,
      tags: {
        originator: improvement.id,
        producer: improvement.id,
        beneficiary: empire.id,
        purpose: 'production'
      }
    };

    state.marketOrders.sellOffers.push(sellOffer);
    // Log "Produced" when releasing to market
    log.push(`{blue-fg}Produced:{/blue-fg} ${qty} ${commodity} -> market @ ${discountedPrice.toFixed(2)}`);
    logger.info(`Improvement produced: ${improvement.name} (${empire.name}) released ${qty} ${commodity} to market.`);
    
    // Clear from bank after releasing
    improvement.productionBank[commodity] = 0;
  }

  return { log };
}

/**
 * Apply improvement modifiers to game state
 */
export function applyImprovementModifiers(state) {
  const improvements = state.improvements;

  // Reset per-empire improvement modifiers each tick
  if (!improvements.empireModifiers) {
    improvements.empireModifiers = {};
  } else {
    improvements.empireModifiers = {};
  }

  // Collect all active improvement modifiers
  const activeImprovements = improvements.queue.filter(i => i.state === 'ACTIVE');

  // Apply modifiers to empires
  activeImprovements.forEach(improvement => {
    const empire = state.empires.find(e => e.id === improvement.empireId);
    if (!empire) return;

    if (!improvements.empireModifiers[empire.id]) {
      improvements.empireModifiers[empire.id] = {};
    }

    // Apply stat modifiers
    for (const [stat, value] of Object.entries(improvement.modifiers)) {
      if (stat === 'army_organization') {
        // Apply to all armies of this empire (small boost per tick)
        state.armies
          .filter(a => a.empireId === improvement.empireId)
          .forEach(army => {
            army.organization = Math.min(100, army.organization + value / MODIFIER_ARMY_ORG_SCALE);
          });
      } else if (stat === 'empire_approval') {
        // Very small boost per tick
        empire.approval = Math.min(100, Math.max(0, empire.approval + value / MODIFIER_EMPIRE_APPROVAL_SCALE));
      } else if (stat === 'trade_income') {
        // Generate credits
        empire.budget_credits = (empire.budget_credits || 0) + value;
      } else if (stat === 'population_growth') {
        const baseGrowth = value / POPULATION_GROWTH_SCALE;
        const biologicBoost = improvementHasTag(improvement, BIOLOGIC_TAG) && empireHasTag(empire, BIOLOGIC_TAG)
          ? BIOLOGIC_GROWTH_BONUS_MULTIPLIER
          : 1;
        const growthRate = baseGrowth * biologicBoost;
        if (growthRate !== 0) {
          const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : 1;
          // Ensure population never goes below 1 to prevent division by zero and game breaks
          empire.stats.population = Math.max(1, Math.floor(currentPopulation * (1 + growthRate)));
        }
      } else if (stat === 'army_fervor') {
        // Apply fervor bonus to all armies of this empire (gradual boost per tick)
        state.armies
          .filter(a => a.empireId === improvement.empireId)
          .forEach(army => {
            army.fervor = Math.min(100, army.fervor + value / MODIFIER_ARMY_ORG_SCALE);
          });
      } else if (stat === 'law_progress_speed') {
        // Store for use in law processing - accumulates to coalitionModifiers
        if (!state.coalitionModifiers.law_progress_speed) {
          state.coalitionModifiers.law_progress_speed = 0;
        }
        state.coalitionModifiers.law_progress_speed += value;
      } else if (stat === 'improvement_queue_capacity') {
        // Increase coalition improvement queue capacity
        if (!state.improvements.maxTotalCapacity) {
          state.improvements.maxTotalCapacity = IMPROVEMENTS_CONSTANTS.INITIAL_MAX_TOTAL_CAPACITY;
        }
        state.improvements.maxTotalCapacity += value;
      } else if (stat === 'hero_siphon_efficiency_mult' || stat === 'hero_siphon_efficiency_add') {
        // Store per-empire modifiers for hero siphon efficiency (applied in hero budget siphon)
        improvements.empireModifiers[empire.id][stat] =
          (improvements.empireModifiers[empire.id][stat] || 0) + value;
      }
      // Other modifiers can be stored and applied elsewhere as needed
    }
  });

  return { success: true };
}

/**
 * Grant army/manpower from improvement completion
 * armyGrant creates a new army with specified manpower (if empire has no army)
 * manpowerGrant adds manpower to existing army
 */
function grantImprovementUnits(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  if (!empire) {
    return log;
  }

  // Handle armyGrant - creates a new army with specified manpower
  if (improvement.armyGrant && improvement.armyGrant.manpower > 0) {
    if (!state.armies) {
      state.armies = [];
    }

    const armyId = `army_${empire.id}`;
    const existingArmy = state.armies.find(a => a.empireId === empire.id && !a.id.startsWith('_'));

    if (!existingArmy) {
      // Create new army with specified manpower
      const newArmy = createArmy(
        armyId,
        empire.id,
        `${empire.name} Expeditionary Force`,
        55,  // fervor
        60,  // organization
        0,   // aggravation
        50,  // command
        50,  // recovery
        improvement.armyGrant.manpower
      );

      state.armies.push(newArmy);
      log.push(`{green-fg}Army raised:{/green-fg} ${newArmy.name} with ${improvement.armyGrant.manpower} manpower`);
    } else {
      // Empire already has an army - add manpower to it instead
      const manpowerToAdd = improvement.armyGrant.manpower;
      existingArmy.manpower += manpowerToAdd;
      existingArmy.mp.max += manpowerToAdd;
      existingArmy.mp.current += manpowerToAdd;
      log.push(`{green-fg}Reinforced:{/green-fg} ${existingArmy.name} +${manpowerToAdd} manpower`);
    }

    return log;
  }

  // Handle manpowerGrant - adds manpower to existing army
  if (improvement.manpowerGrant && improvement.manpowerGrant > 0) {
    if (!state.armies) {
      state.armies = [];
    }

    // Find the empire's army
    let targetArmy = state.armies.find(a => a.empireId === empire.id && !a.id.startsWith('_'));

    if (!targetArmy) {
      // Create a new army for this empire
      const armyId = `army_${empire.id}`;
      targetArmy = createArmy(
        armyId,
        empire.id,
        `${empire.name} Expeditionary Force`,
        55,  // fervor
        60,  // organization
        0,   // aggravation
        50,  // command
        50,  // recovery
        improvement.manpowerGrant
      );
      state.armies.push(targetArmy);
      log.push(`{green-fg}Army raised:{/green-fg} ${targetArmy.name} with ${improvement.manpowerGrant} manpower`);
    } else {
      // Add manpower to existing army
      targetArmy.manpower += improvement.manpowerGrant;
      targetArmy.mp.max += improvement.manpowerGrant;
      targetArmy.mp.current += improvement.manpowerGrant;
      log.push(`{green-fg}Reinforced:{/green-fg} ${targetArmy.name} +${improvement.manpowerGrant} manpower`);
    }

    return log;
  }

  return log;
}
