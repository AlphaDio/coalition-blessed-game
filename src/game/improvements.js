/**
 * Improvements System
 * 
 * Implements a complete queue-based improvements system with:
 * - Requests feed (available improvements)
 * - Queue management with capacity concurrency
 * - Construction stat advances ALL building items each tick
 * - Sustainment via stockpile/market (empires pay to maintain)
 * - Degraded state when sustainment fails
 * - Production outputs (resources/modifiers)
 * - Economy order tagging (originator, payer, beneficiary)
 * - Stats and modifiers application
 * - Tiered progression (T1/T2/T3) with per-empire unlock tracking
 */

import { getLogger } from '../modules/logger.js';
import { canStartImprovement, getTieredImprovementRequests, generateImprovementSuggestions } from './improvementDefinitions.js';
import { hasTag, empireHasTag } from '../utils/tags.js';

// Constants for sustainment and modifier scaling
const SUSTAINMENT_MAX_PRICE_MULTIPLIER = 2.0; // Willing to pay up to 2x market price
const MODIFIER_ARMY_ORG_SCALE = 10; // Divide by 10 for gradual application
const MODIFIER_EMPIRE_APPROVAL_SCALE = 100; // Divide by 100 for gradual application
const POPULATION_GROWTH_SCALE = 100; // Convert percentage-based modifiers to ratios
const BIOLOGIC_TAG = 'biologic';
const BIOLOGIC_GROWTH_BONUS_MULTIPLIER = 1.5;

function improvementHasTag(improvement, tag) {
  if (!improvement) return false;
  return hasTag(improvement.tags, tag);
}

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
  suggestedBy = 'coalition',
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
    tier,
    branch
  };
}

/**
 * Create an improvement instance (in queue or completed)
 */
export function createImprovement(requestId, empireId, startedAtTick, request) {
  return {
    id: `${requestId}_${empireId}_${startedAtTick}`,
    requestId,
    empireId,
    name: request.name,
    description: request.description,
    suggestedBy: request.suggestedBy || empireId || 'coalition',
    
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
    
    // Degradation tracking
    degradedSince: null,
    ticksSinceSustained: 0,
    
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
  maxTotalCapacity: 5,
  
  // Current utilization (BUILDING only)
  currentCapacity: 0
  };
}

/**
 * Get available improvement requests (sample content)
 * Uses the new tiered improvement definitions.
 * Note: For dynamic suggestions based on empire tier access, use 
 * generateImprovementSuggestions() from improvementDefinitions.js instead.
 */
export function getSampleImprovementRequests() {
  return getTieredImprovementRequests();
}

/**
 * Initialize improvement suggestions with proper empire assignment
 * Call this after empires are set up in game state.
 * @param {Object} state - Game state with empires
 * @param {function} rng - Random number generator
 */
export function initializeImprovementSuggestions(state, rng = Math.random) {
  if (!state.improvements) {
    state.improvements = initializeImprovementsState();
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
  
  // Check supplies cost
  if (state.stockpiles.supplies < request.suppliesCost) {
    return { 
      success: false, 
      error: `Insufficient Supplies (need ${request.suppliesCost}, have ${state.stockpiles.supplies})`,
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
  
  // Deduct supplies (no refunds on cancellation)
  state.stockpiles.supplies -= request.suppliesCost;
  
  // Create improvement instance
  const improvement = createImprovement(requestId, empireId, state.turn, request);
  improvements.queue.push(improvement);
  
  logger.info(`Improvement started: ${improvement.name} (Empire: ${empireId}, Cost: ${request.suppliesCost} Supplies, Tier: ${improvement.tier})`);
  
  return {
    success: true,
    improvement,
    log: [`{green-fg}Started:{/green-fg} ${improvement.name} (build cost: ${request.build}, T${improvement.tier})`]
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
  const constructionValue = Number.isFinite(state.coalitionConstruction) ? state.coalitionConstruction : 1;
  
  improvements.queue.forEach(improvement => {
    if (improvement.state === 'BUILDING') {
      // Advance build progress by construction value
      improvement.buildProgress += constructionValue;
      
      // Check if build is complete
      if (improvement.buildProgress >= improvement.build) {
        improvement.state = 'ACTIVE';
        logger.info(`Improvement built: ${improvement.name}`);
        log.push(`{green-fg}Completed:{/green-fg} ${improvement.name} is now ACTIVE`);
      }
    }
    
    if (improvement.state === 'ACTIVE' || improvement.state === 'DEGRADED') {
      // Process sustainment
      const sustainmentResult = processImprovementSustainment(state, improvement);
      log.push(...sustainmentResult.log);
      
      // Process production (only if ACTIVE)
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
 * Empires use stockpiles first, then market buy orders
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
  
  for (const [commodity, qtyNeeded] of Object.entries(sustainmentNeeds)) {
    if (qtyNeeded <= 0) continue;
    
    const stockpile = empire.stockpiles[commodity] || 0;
    
    if (stockpile >= qtyNeeded) {
      // Use stockpile
      empire.stockpiles[commodity] -= qtyNeeded;
    } else {
      // Insufficient stockpile, try to buy from market
      const remaining = qtyNeeded - stockpile;
      
      if (stockpile > 0) {
        empire.stockpiles[commodity] = 0; // Use what we have
      }
      
      // Create market buy order if market exists
      if (state.market && state.market[commodity]) {
        const marketState = state.market[commodity];
        const maxPrice = marketState.price * SUSTAINMENT_MAX_PRICE_MULTIPLIER;
        
        // Create buy order with proper tagging
        const buyOrder = {
          id: `improvement_sustain_${improvement.id}_${commodity}_${state.turn}`,
          owner_type: 'empire',
          owner_id: empire.id,
          commodity: commodity,
          qty: remaining,
          max_price: maxPrice,
          priority: 800, // High priority for sustainment
          filled_qty: 0,
          tags: {
            originator: improvement.id,
            payer: empire.id,
            beneficiary: improvement.id,
            purpose: 'sustainment'
          }
        };
        
        // Add to market (will be processed during economy tick)
        if (!state.marketOrders) {
          state.marketOrders = { buyOrders: [], sellOffers: [] };
        }
        state.marketOrders.buyOrders.push(buyOrder);
        
        // For now, assume order fails (will be processed in economy tick)
        allSatisfied = false;
        shortages.push(commodity);
      } else {
        allSatisfied = false;
        shortages.push(commodity);
      }
    }
  }
  
  // Update improvement state based on sustainment success
  improvement.ticksSinceSustained++;
  
  if (allSatisfied) {
    improvement.ticksSinceSustained = 0;
    
    // Restore to ACTIVE if was DEGRADED
    if (improvement.state === 'DEGRADED') {
      improvement.state = 'ACTIVE';
      improvement.degradedSince = null;
      log.push(`{green-fg}Restored:{/green-fg} ${improvement.name} is now ACTIVE`);
      logger.info(`Improvement restored: ${improvement.name}`);
    }
  } else {
    // Degrade after 1 tick of failed sustainment
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Missing: ${shortages.join(', ')})`);
      logger.warn(`Improvement degraded: ${improvement.name} - shortages: ${shortages.join(', ')}`);
    }
  }
  
  return { log };
}

/**
 * Process production outputs for an improvement
 */
export function processImprovementProduction(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  
  if (!empire) return { log };
  
  // Process production outputs
  for (const [commodity, qty] of Object.entries(improvement.productionOutputs)) {
    if (qty <= 0) continue;
    
    // Inject into empire stockpile
    if (!empire.stockpiles[commodity]) {
      empire.stockpiles[commodity] = 0;
    }
    empire.stockpiles[commodity] += qty;
  }
  
  return { log };
}

/**
 * Apply improvement modifiers to game state
 */
export function applyImprovementModifiers(state) {
  const improvements = state.improvements;
  
  // Collect all active improvement modifiers
  const activeImprovements = improvements.queue.filter(i => i.state === 'ACTIVE');
  
  // Apply modifiers to empires
  activeImprovements.forEach(improvement => {
    const empire = state.empires.find(e => e.id === improvement.empireId);
    if (!empire) return;
    
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
          const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : 0;
          empire.stats.population = Math.max(0, Math.floor(currentPopulation * (1 + growthRate)));
        }
      }
      // Other modifiers can be stored and applied elsewhere as needed
    }

  });
  
  return { success: true };
}

/**
 * Get improvement statistics for UI display
 */
export function getImprovementStats(state) {
  const improvements = state.improvements;
  const queue = improvements.queue;
  
  const building = queue.filter(i => i.state === 'BUILDING');
  const active = queue.filter(i => i.state === 'ACTIVE');
  const degraded = queue.filter(i => i.state === 'DEGRADED');
  
  return {
    total: queue.length,
    building: building.length,
    active: active.length,
    degraded: degraded.length,
    capacity: improvements.currentCapacity,
    maxCapacity: improvements.maxTotalCapacity,
    construction: state.coalitionConstruction,
    availableRequests: improvements.requests.length
  };
}
