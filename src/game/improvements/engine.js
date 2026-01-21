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
import { createArmy, createUnit } from '../types.js';
import { refreshArmyAggregates } from '../armyComposition.js';
import { hasTag, empireHasTag } from '../../utils/tags.js';
import { getTieredImprovementRequests, generateImprovementSuggestions, canStartImprovement } from './definitions.js';
import {
  SUSTAINMENT_MAX_PRICE_MULTIPLIER,
  MODIFIER_ARMY_ORG_SCALE,
  MODIFIER_EMPIRE_APPROVAL_SCALE,
  POPULATION_GROWTH_SCALE,
  BIOLOGIC_TAG,
  BIOLOGIC_GROWTH_BONUS_MULTIPLIER,
  improvementHasTag
} from './types.js';

let orderIdCounter = 0;

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
  unitGrant = null,

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
    unitGrant,
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
    requiredLawId: request.requiredLawId || null,
    requiredLaws: request.requiredLaws || null,
    unitGrant: request.unitGrant || null,

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

  // Check supplies cost from empire's budget
  const empire = state.empires.find(e => e.id === empireId);
  if (!empire) {
    return { success: false, error: 'Empire not found', log: [] };
  }

  if (!empire.budget_credits) empire.budget_credits = 0;
  if (request.suppliesCost > 0 && empire.budget_credits < request.suppliesCost) {
    return {
      success: false,
      error: `Insufficient Empire Budget (need ${request.suppliesCost}, have ${empire.budget_credits})`,
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

  // Deduct supplies from empire budget (no refunds on cancellation)
  if (request.suppliesCost > 0) {
    empire.budget_credits -= request.suppliesCost;
  }

  // Create improvement instance
   const improvement = createImprovement(requestId, empireId, state.turn, request);
   improvements.queue.push(improvement);

   // Remove the request from the list
   const requestIdx = state.improvements.requests.findIndex(r => r.id === requestId);
   if (requestIdx !== -1) {
     state.improvements.requests.splice(requestIdx, 1);
   }

    logger.info(`Improvement started: ${improvement.name} (Empire: ${empireId}, Cost: ${request.suppliesCost} credits, Tier: ${improvement.tier})`);

   return {
     success: true,
     improvement,
     log: [`{green-fg}Started:{/green-fg} ${improvement.name} (cost: ${request.suppliesCost} cr, T${improvement.tier})`]
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
  const constructionValue = Math.max(0, effectiveConstruction);

   improvements.queue.forEach(improvement => {
     if (improvement.state === 'BUILDING') {
       // Advance build progress by construction value
       improvement.buildProgress += constructionValue;

       // Check if build is complete
       if (improvement.buildProgress >= improvement.build) {
         improvement.state = 'ACTIVE';
         const empire = state.empires.find(e => e.id === improvement.empireId);
         const empireName = empire ? empire.name : 'Unknown Empire';
         logger.info(`Improvement built: ${improvement.name} (${empireName})`);
         log.push(`{green-fg}Completed:{/green-fg} ${improvement.name} (${empireName}) is now ACTIVE`);
         const grantLog = grantImprovementUnits(state, improvement);
         log.push(...grantLog);
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

      let stockpile = empire.stockpiles[commodity] || 0;
      if (commodity === 'supplies') {
        stockpile = empire.budget_credits || 0;
      }

      if (stockpile >= qtyNeeded) {
        // Use empire resources
        if (commodity === 'supplies') {
          empire.budget_credits = (empire.budget_credits || 0) - qtyNeeded;
        } else {
          empire.stockpiles[commodity] -= qtyNeeded;
        }
      } else {
        // Insufficient stockpile, try to buy from market
        const remaining = qtyNeeded - stockpile;

        if (stockpile > 0) {
          if (commodity === 'supplies') {
            empire.budget_credits = 0;
          } else {
            empire.stockpiles[commodity] = 0;
          }
        }

        // Create market buy order if market exists
        if (state.market && state.market[commodity]) {
          const marketState = state.market[commodity];
          const maxPrice = marketState.price * SUSTAINMENT_MAX_PRICE_MULTIPLIER;

          // Create buy order with proper tagging
          const buyOrder = {
            id: `sustain_${orderIdCounter++}`,
            owner_type: 'empire',
            owner_id: empire.id,
            commodity,
            qty: remaining,
            max_price: maxPrice,
            priority: 800, // High priority for sustainment
            filled_qty: 0,
            fee: 1,
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

      // All production goes to empire stockpile
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
      }
      // Other modifiers can be stored and applied elsewhere as needed
    }
  });

  return { success: true };
}

/**
 * Grant units from improvement completion
 */
function grantImprovementUnits(state, improvement) {
  const log = [];
  if (!improvement.unitGrant || improvement.unitGrant.quantity <= 0) {
    return log;
  }

  const empire = state.empires.find(e => e.id === improvement.empireId);
  if (!empire) {
    return log;
  }

  const template = improvement.unitGrant.template || {};
  const quantity = improvement.unitGrant.quantity || 1;
  const unitName = improvement.unitGrant.name || `${improvement.name} Unit`;
  const targetArmyId = improvement.unitGrant.armyId || null;

  if (!state.armies) {
    state.armies = [];
  }
  if (!state.units) {
    state.units = [];
  }

  let targetArmy = null;
  if (targetArmyId) {
    targetArmy = state.armies.find(a => a.id === targetArmyId && a.empireId === empire.id);
  }

  if (!targetArmy) {
    const fallbackArmyId = `army_${empire.id}`;
    targetArmy = state.armies.find(a => a.id === fallbackArmyId);
    if (!targetArmy) {
      targetArmy = createArmy(
        fallbackArmyId,
        empire.id,
        `${empire.name} Expeditionary Forces`,
        55,
        60,
        0,
        50,
        50
      );
      state.armies.push(targetArmy);
    }
  }

  for (let i = 0; i < quantity; i += 1) {
    const unitId = `${improvement.id}_unit_${state.turn}_${i}`;
    const unitStats = template.stats || {};
    const unitDemands = template.demands || {};
    const unit = createUnit(
      unitId,
      targetArmy.id,
      empire.id,
      unitName,
      unitStats,
      unitDemands
    );
    state.units.push(unit);
    targetArmy.unitIds = targetArmy.unitIds || [];
    targetArmy.unitIds.push(unitId);
  }

  refreshArmyAggregates(state);
  log.push(`{green-fg}Force raised:{/green-fg} ${unitName} x${quantity} for ${empire.name}`);
  return log;
}