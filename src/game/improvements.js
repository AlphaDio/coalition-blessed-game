/**
 * Improvements System
 * 
 * Implements a complete queue-based improvements system with:
 * - Requests feed (available improvements)
 * - Queue management with capacity/potency concurrency
 * - Sustainment via stockpile/market (empires pay to maintain)
 * - Degraded state when sustainment fails
 * - Production outputs (resources/modifiers)
 * - Economy order tagging (originator, payer, beneficiary)
 * - Stats and modifiers application
 */

import { getLogger } from '../modules/logger.js';

// Constants for sustainment and modifier scaling
const SUSTAINMENT_MAX_PRICE_MULTIPLIER = 2.0; // Willing to pay up to 2x market price
const MODIFIER_ARMY_ORG_SCALE = 10; // Divide by 10 for gradual application
const MODIFIER_EMPIRE_APPROVAL_SCALE = 100; // Divide by 100 for gradual application

/**
 * Create an improvement request (available to accept)
 */
export function createImprovementRequest(id, name, description, {
  suppliesCost = 0,
  buildDuration = 0,
  capacity = 1,
  potency = 1,
  sustainmentCost = {}, // { commodity_key: qty_per_tick }
  productionOutputs = {}, // { commodity_key: qty_per_tick }
  modifiers = {}, // { stat_key: value }
  tags = []
} = {}) {
  return {
    id,
    name,
    description,
    suppliesCost,
    buildDuration,
    capacity,
    potency,
    sustainmentCost,
    productionOutputs,
    modifiers,
    tags
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
    
    // Build phase
    buildProgress: 0,
    buildDuration: request.buildDuration,
    startedAtTick,
    
    // Runtime state
    state: 'BUILDING', // BUILDING | ACTIVE | DEGRADED
    capacity: request.capacity,
    potency: request.potency,
    
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
    
    // Concurrency limits
    maxConcurrentBuilds: 3,
    maxTotalCapacity: 10,
    maxTotalPotency: 20,
    
    // Current utilization
    currentBuilds: 0,
    currentCapacity: 0,
    currentPotency: 0
  };
}

/**
 * Get available improvement requests (sample content)
 */
export function getSampleImprovementRequests() {
  return [
    createImprovementRequest('factory_basic', 'Basic Factory', 'Produces Super Alloys from raw materials', {
      suppliesCost: 200,
      buildDuration: 10,
      capacity: 2,
      potency: 3,
      sustainmentCost: {
        biomass: 5,
        ice: 3
      },
      productionOutputs: {
        super_alloys: 15
      },
      modifiers: {
        industrial_output: 0.05
      },
      tags: ['industrial', 'production']
    }),
    
    createImprovementRequest('research_lab', 'Research Laboratory', 'Generates research points and rare gases', {
      suppliesCost: 300,
      buildDuration: 15,
      capacity: 3,
      potency: 5,
      sustainmentCost: {
        super_alloys: 3,
        rare_gases: 2
      },
      productionOutputs: {
        rare_gases: 8,
        quantum_circuits: 2
      },
      modifiers: {
        research_speed: 0.10,
        tech_level: 1
      },
      tags: ['science', 'research']
    }),
    
    createImprovementRequest('military_depot', 'Military Depot', 'Supplies armies and improves organization', {
      suppliesCost: 150,
      buildDuration: 8,
      capacity: 2,
      potency: 2,
      sustainmentCost: {
        super_alloys: 4,
        biomass: 6
      },
      productionOutputs: {
        // Injects into coalition stockpile
      },
      modifiers: {
        army_organization: 5,
        supply_efficiency: 0.08
      },
      tags: ['military', 'logistics']
    }),
    
    createImprovementRequest('medical_center', 'Medical Center', 'Improves population health and morale', {
      suppliesCost: 250,
      buildDuration: 12,
      capacity: 3,
      potency: 4,
      sustainmentCost: {
        biomass: 5,
        genomes: 3,
        psycho_implants: 1
      },
      productionOutputs: {
        genomes: 4
      },
      modifiers: {
        population_growth: 0.03,
        empire_approval: 2
      },
      tags: ['medical', 'civilian']
    }),
    
    createImprovementRequest('trade_hub', 'Trade Hub', 'Generates credits and facilitates market activity', {
      suppliesCost: 180,
      buildDuration: 10,
      capacity: 2,
      potency: 3,
      sustainmentCost: {
        ice: 4,
        rare_gases: 2
      },
      productionOutputs: {
        // Generates credits instead of commodities
      },
      modifiers: {
        trade_income: 500, // Credits per tick
        market_efficiency: 0.05
      },
      tags: ['economic', 'trade']
    })
  ];
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
  
  // Check supplies cost
  if (state.stockpiles.supplies < request.suppliesCost) {
    return { 
      success: false, 
      error: `Insufficient Supplies (need ${request.suppliesCost}, have ${state.stockpiles.supplies})`,
      log: []
    };
  }
  
  // Check concurrency limits
  const improvements = state.improvements;
  const building = improvements.queue.filter(i => i.state === 'BUILDING').length;
  
  if (building >= improvements.maxConcurrentBuilds) {
    return {
      success: false,
      error: `Max concurrent builds reached (${improvements.maxConcurrentBuilds})`,
      log: []
    };
  }
  
  // Check capacity/potency limits for active improvements
  const active = improvements.queue.filter(i => i.state === 'ACTIVE' || i.state === 'DEGRADED');
  const totalCapacity = active.reduce((sum, i) => sum + i.capacity, 0);
  const totalPotency = active.reduce((sum, i) => sum + i.potency, 0);
  
  if (totalCapacity + request.capacity > improvements.maxTotalCapacity) {
    return {
      success: false,
      error: `Would exceed capacity limit (${totalCapacity + request.capacity}/${improvements.maxTotalCapacity})`,
      log: []
    };
  }
  
  if (totalPotency + request.potency > improvements.maxTotalPotency) {
    return {
      success: false,
      error: `Would exceed potency limit (${totalPotency + request.potency}/${improvements.maxTotalPotency})`,
      log: []
    };
  }
  
  // Deduct supplies (no refunds on cancellation)
  state.stockpiles.supplies -= request.suppliesCost;
  
  // Create improvement instance
  const improvement = createImprovement(requestId, empireId, state.turn, request);
  improvements.queue.push(improvement);
  
  logger.info(`Improvement started: ${improvement.name} (Empire: ${empireId}, Cost: ${request.suppliesCost} Supplies)`);
  
  return {
    success: true,
    improvement,
    log: [`{green-fg}Started:{/green-fg} ${improvement.name} (${request.buildDuration} turns to complete)`]
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
  
  // Update current utilization counters
  improvements.currentBuilds = 0;
  improvements.currentCapacity = 0;
  improvements.currentPotency = 0;
  
  improvements.queue.forEach(improvement => {
    if (improvement.state === 'BUILDING') {
      improvements.currentBuilds++;
      
      // Advance build progress
      improvement.buildProgress++;
      
      // Check if build is complete
      if (improvement.buildProgress >= improvement.buildDuration) {
        improvement.state = 'ACTIVE';
        logger.info(`Improvement built: ${improvement.name}`);
        log.push(`{green-fg}Completed:{/green-fg} ${improvement.name} is now ACTIVE`);
      }
    }
    
    if (improvement.state === 'ACTIVE' || improvement.state === 'DEGRADED') {
      improvements.currentCapacity += improvement.capacity;
      improvements.currentPotency += improvement.potency;
      
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
        empire.stats.population = Math.floor(empire.stats.population * (1 + value / 100));
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
    potency: improvements.currentPotency,
    maxCapacity: improvements.maxTotalCapacity,
    maxPotency: improvements.maxTotalPotency,
    maxBuilds: improvements.maxConcurrentBuilds,
    availableRequests: improvements.requests.length
  };
}
