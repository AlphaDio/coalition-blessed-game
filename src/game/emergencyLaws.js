 /**
  * Emergency Laws System
  * 
  * Emergency laws provide powerful temporary modifiers but at significant resource costs.
  * Once enacted, they activate immediately and run for a set duration, consuming
  * requisition and commodities each tick. When the duration expires or resources run out,
  * the law expires and its modifiers are removed.
  * 
  * Emergency laws can be re-enacted after a cooldown period.
  */

import { getLogger } from '../modules/logger.js';

/**
 * Emergency law definitions
 * Each law has:
 * - id: Unique identifier
 * - name: Display name
 * - description: What it does
 * - duration: Number of ticks the law remains active
 * - cooldown: Ticks before the law can be re-enacted after expiring
 * - costs_per_tick: Resources consumed each tick { requisition, commodities: { key: qty } }
 * - modifiers: Powerful effects applied while active
 * - axis_vector: Ideological shift (affects coalition color)
 */
export const EMERGENCY_LAW_DEFINITIONS = [
  // === MILITARY EMERGENCY ===
  {
    id: 'emergency_total_mobilization',
    name: 'Total Mobilization Decree',
    description: 'All civilian production redirected to military. Armies gain massive combat bonuses but economy suffers.',
    duration: 50,
    cooldown: 100,
    costs_per_tick: {
      requisition: 25,
      commodities: {
        super_alloys: 5,
        biomass: 3
      }
    },
    modifiers: {
      army_damage_multiplier: 0.50,      // +50% army damage
      army_organization_bonus: 15,       // +15 organization
      army_fervor_bonus: 10,             // +10 fervor
      army_protection_bonus: 0.20,       // +20% damage reduction
      industrial_output: -0.30,          // -30% industrial output
      empire_approval: -5                // -5 approval per tick
    },
    axis_vector: {
      pacifist_militaristic: 0.8,
      authoritarian_liberal: -0.6,
      stoicist_hedonistic: -0.5
    }
  },

  // === ECONOMIC EMERGENCY ===
  {
    id: 'emergency_war_economy',
    name: 'War Economy Act',
    description: 'Economy converted to total war footing. Massive production boost but population suffers greatly.',
    duration: 60,
    cooldown: 120,
    costs_per_tick: {
      requisition: 30,
      commodities: {
        biomass: 5,
        rare_gases: 2,
        genomes: 1
      }
    },
    modifiers: {
      industrial_output: 0.75,           // +75% industrial output
      supply_efficiency: 0.35,           // +35% supply efficiency
      market_efficiency: 0.25,           // +25% market efficiency
      population_growth: -0.10,          // -10% population growth
      empire_approval: -8                // Heavy approval penalty
    },
    axis_vector: {
      stoicist_hedonistic: -0.7,
      authoritarian_liberal: -0.5,
      spiritual_materialistic: 0.4
    }
  },

  // === RESEARCH EMERGENCY ===
  {
    id: 'emergency_crash_research',
    name: 'Crash Research Program',
    description: 'All scientific resources redirected to breakthrough research. Rapid tech gains but very expensive.',
    duration: 30,
    cooldown: 90,
    costs_per_tick: {
      requisition: 40,
      commodities: {
        rare_gases: 4,
        genomes: 3,
        ancient_relics: 1,
        quantum_circuits: 1
      }
    },
    modifiers: {
      research_speed: 1.50,              // +150% research speed
      tech_points_per_tick: 5000,        // +5000 tech points per tick
      energy_production: 0.30,           // +30% energy (labs running hot)
      industrial_output: -0.20,          // -20% industrial output
      trade_income: -300                 // High opportunity cost
    },
    axis_vector: {
      spiritual_materialistic: 0.6,
      essentialist_constructivist: 0.4,
      natural_mechanical: 0.2
    }
  },

  // === SOCIAL EMERGENCY ===
  {
    id: 'emergency_martial_law',
    name: 'Martial Law Declaration',
    description: 'Military assumes direct control of civilian governance. Order restored but freedoms suspended.',
    duration: 45,
    cooldown: 90,
    costs_per_tick: {
      requisition: 20,
      commodities: {
        biomass: 4,
        psycho_implants: 2
      }
    },
    modifiers: {
      army_organization_bonus: 10,       // +10 organization
      supply_efficiency: 0.15,           // +15% supply efficiency
      cohesion_bonus: 3,                 // +3 cohesion per tick (forced unity)
      army_fervor_bonus: 8,              // +8 fervor (patriotic fervor)
      empire_approval: -10,              // Heavy approval penalty
      population_growth: -0.05           // Population suppressed
    },
    axis_vector: {
      authoritarian_liberal: -0.9,
      stoicist_hedonistic: -0.6,
      pacifist_militaristic: 0.4
    }
  },

  // === EXTREME EMERGENCY (T4 resource costs) ===
  {
    id: 'emergency_dark_matter_surge',
    name: 'Dark Matter Power Surge',
    description: 'Unleash dark matter reactors at maximum output. Incredible power across all systems but extremely dangerous and costly.',
    duration: 20,
    cooldown: 150,
    costs_per_tick: {
      requisition: 50,
      commodities: {
        wormhole_reactors: 2,
        dark_matter: 1,
        nano_machines: 3
      }
    },
    modifiers: {
      energy_production: 2.00,           // +200% energy
      industrial_output: 1.00,           // +100% industrial output
      army_damage_multiplier: 0.75,      // +75% army damage
      research_speed: 0.50,              // +50% research
      supply_efficiency: 0.30,           // +30% supply efficiency
      cohesion_drain: -5                 // Very destabilizing
    },
    axis_vector: {
      spiritual_materialistic: 0.8,
      natural_mechanical: 0.6,
      stoicist_hedonistic: 0.3
    }
  }
];

/**
 * Create an active emergency law instance
 * @param {string} lawId - Emergency law definition ID
 * @param {number} startTick - Game tick when activated
 * @returns {Object} Active emergency law state
 */
export function createActiveEmergencyLaw(lawId, startTick = 0) {
  const def = EMERGENCY_LAW_DEFINITIONS.find(l => l.id === lawId);
  if (!def) {
    throw new Error(`Unknown emergency law: ${lawId}`);
  }
  
  return {
    lawId,
    name: def.name,
    startTick,
    remainingDuration: def.duration,
    totalDuration: def.duration,
    active: true,
    modifiers: { ...def.modifiers },
    costs_per_tick: JSON.parse(JSON.stringify(def.costs_per_tick)),
    resourcesConsumed: {
      supplies: 0,
      commodities: {}
    }
  };
}

/**
 * Get emergency law definition by ID
 * @param {string} lawId - Law ID
 * @returns {Object|null} Law definition or null
 */
export function getEmergencyLawDef(lawId) {
  return EMERGENCY_LAW_DEFINITIONS.find(l => l.id === lawId) || null;
}

/**
 * Check if an emergency law can be activated
 * @param {string} lawId - Law ID to check
 * @param {Object} state - Game state
 * @returns {Object} { canActivate: boolean, reason: string }
 */
export function canActivateEmergencyLaw(lawId, state) {
  const def = getEmergencyLawDef(lawId);
  if (!def) {
    return { canActivate: false, reason: 'Unknown emergency law' };
  }
  
  // Check if law is currently active
  const activeEmergencyLaws = state.activeEmergencyLaws || [];
  if (activeEmergencyLaws.some(l => l.lawId === lawId && l.active)) {
    return { canActivate: false, reason: 'Law is already active' };
  }
  
  // Check cooldown
  const cooldowns = state.emergencyLawCooldowns || {};
  const cooldownEnd = cooldowns[lawId] || 0;
  if (state.turn < cooldownEnd) {
    const remaining = cooldownEnd - state.turn;
    return { canActivate: false, reason: `On cooldown (${remaining} ticks remaining)` };
  }
  
   // Check if we have enough resources for at least one tick
   const costs = def.costs_per_tick;
   
    // Check requisition
    if ((state.coalitionEconomy?.requisition || 0) < costs.requisition) {
      return { canActivate: false, reason: `Insufficient requisition (need ${costs.requisition}/tick)` };
    }
  
  // Check commodities (from coalition economy stockpiles)
  const coalitionStockpiles = state.coalitionEconomy?.stockpiles || {};
  for (const [commodity, qty] of Object.entries(costs.commodities || {})) {
    const available = coalitionStockpiles[commodity] || 0;
    if (available < qty) {
      return { canActivate: false, reason: `Insufficient ${commodity} (need ${qty}/tick, have ${available})` };
    }
  }
  
  return { canActivate: true, reason: '' };
}

/**
 * Activate an emergency law
 * @param {string} lawId - Law ID to activate
 * @param {Object} state - Game state
 * @returns {Object} { success: boolean, message: string, activeLaw?: Object }
 */
export function activateEmergencyLaw(lawId, state) {
  const logger = getLogger();
  
  const check = canActivateEmergencyLaw(lawId, state);
  if (!check.canActivate) {
    return { success: false, message: check.reason };
  }
  
  const def = getEmergencyLawDef(lawId);
  const activeLaw = createActiveEmergencyLaw(lawId, state.turn);
  
  // Initialize arrays if needed
  if (!state.activeEmergencyLaws) {
    state.activeEmergencyLaws = [];
  }
  
  state.activeEmergencyLaws.push(activeLaw);
  
  logger.info(`Emergency Law ACTIVATED: ${def.name} (duration: ${def.duration} ticks)`);
  
  return {
    success: true,
    message: `${def.name} activated for ${def.duration} ticks`,
    activeLaw
  };
}

/**
 * Process one tick for all active emergency laws
 * Consumes resources and applies modifiers, expires laws when duration ends or resources run out
 * 
 * @param {Object} state - Game state
 * @returns {Object} { log: string[], expiredLaws: string[], modifierTotals: Object }
 */
export function tickEmergencyLaws(state) {
  const logger = getLogger();
  const log = [];
  const expiredLaws = [];
  const modifierTotals = {};
  
  const activeEmergencyLaws = state.activeEmergencyLaws || [];
  
  for (const activeLaw of activeEmergencyLaws) {
    if (!activeLaw.active) continue;
    
    const def = getEmergencyLawDef(activeLaw.lawId);
    if (!def) continue;
    
    // Try to consume resources
    const costs = activeLaw.costs_per_tick;
    let canAfford = true;
    let shortageReason = '';
    
     // Check requisition
    const currentRequisition = state.coalitionEconomy?.requisition || 0;
    if (currentRequisition < costs.requisition) {
      canAfford = false;
      shortageReason = `requisition shortage (need ${costs.requisition}, have ${currentRequisition})`;
    }
    
    // Check commodities
    const coalitionStockpiles = state.coalitionEconomy?.stockpiles || {};
    if (canAfford) {
      for (const [commodity, qty] of Object.entries(costs.commodities || {})) {
        const available = coalitionStockpiles[commodity] || 0;
        if (available < qty) {
          canAfford = false;
          shortageReason = `${commodity} shortage (need ${qty}, have ${available})`;
          break;
        }
      }
    }
    
    if (!canAfford) {
      // Expire due to resource shortage
      activeLaw.active = false;
      activeLaw.expiredReason = shortageReason;
      expiredLaws.push(activeLaw.lawId);
      
      // Set cooldown
      if (!state.emergencyLawCooldowns) {
        state.emergencyLawCooldowns = {};
      }
      state.emergencyLawCooldowns[activeLaw.lawId] = state.turn + def.cooldown;
      
      log.push(`{red-fg}EMERGENCY LAW EXPIRED:{/red-fg} ${def.name} - ${shortageReason}`);
      logger.info(`Emergency Law EXPIRED: ${def.name} - ${shortageReason}`);
      continue;
    }
    
     // Consume resources
     state.coalitionEconomy.requisition -= costs.requisition;
     activeLaw.resourcesConsumed.requisition += costs.requisition;
    
    for (const [commodity, qty] of Object.entries(costs.commodities || {})) {
      coalitionStockpiles[commodity] -= qty;
      if (!activeLaw.resourcesConsumed.commodities[commodity]) {
        activeLaw.resourcesConsumed.commodities[commodity] = 0;
      }
      activeLaw.resourcesConsumed.commodities[commodity] += qty;
    }
    
    // Aggregate modifiers
    for (const [modifier, value] of Object.entries(activeLaw.modifiers)) {
      if (!modifierTotals[modifier]) {
        modifierTotals[modifier] = 0;
      }
      modifierTotals[modifier] += value;
    }
    
    // Decrement duration
    activeLaw.remainingDuration--;
    
    if (activeLaw.remainingDuration <= 0) {
      // Expire due to duration
      activeLaw.active = false;
      activeLaw.expiredReason = 'duration ended';
      expiredLaws.push(activeLaw.lawId);
      
      // Set cooldown
      if (!state.emergencyLawCooldowns) {
        state.emergencyLawCooldowns = {};
      }
      state.emergencyLawCooldowns[activeLaw.lawId] = state.turn + def.cooldown;
      
      log.push(`{yellow-fg}EMERGENCY LAW ENDED:{/yellow-fg} ${def.name} (completed full duration)`);
      logger.info(`Emergency Law COMPLETED: ${def.name}`);
    }
  }
  
  // Clean up expired laws from active list to prevent unbounded growth
  // Remove inactive laws that have been expired for a while
  state.activeEmergencyLaws = activeEmergencyLaws.filter(l => l.active);
  
  return { log, expiredLaws, modifierTotals };
}

/**
 * Get aggregate modifiers from all active emergency laws
 * @param {Object} state - Game state
 * @returns {Object} Combined modifiers { modifier: totalValue }
 */
export function getActiveEmergencyModifiers(state) {
  const modifiers = {};
  const activeEmergencyLaws = state.activeEmergencyLaws || [];
  
  for (const activeLaw of activeEmergencyLaws) {
    if (!activeLaw.active) continue;
    
    for (const [modifier, value] of Object.entries(activeLaw.modifiers)) {
      if (!modifiers[modifier]) {
        modifiers[modifier] = 0;
      }
      modifiers[modifier] += value;
    }
  }
  
  return modifiers;
}

/**
 * Get currently active emergency laws
 * @param {Object} state - Game state
 * @returns {Array} Active emergency law instances
 */
export function getActiveEmergencyLaws(state) {
  return (state.activeEmergencyLaws || []).filter(l => l.active);
}

/**
 * Get emergency law cooldown status
 * @param {string} lawId - Law ID
 * @param {Object} state - Game state
 * @returns {Object} { onCooldown: boolean, remainingTicks: number }
 */
export function getEmergencyLawCooldown(lawId, state) {
  const cooldowns = state.emergencyLawCooldowns || {};
  const cooldownEnd = cooldowns[lawId] || 0;
  
  if (state.turn >= cooldownEnd) {
    return { onCooldown: false, remainingTicks: 0 };
  }
  
  return {
    onCooldown: true,
    remainingTicks: cooldownEnd - state.turn
  };
}

/**
 * Format emergency law for display
 * @param {Object} activeLaw - Active emergency law instance
 * @returns {string} Formatted display string
 */
export function formatEmergencyLaw(activeLaw) {
  const def = getEmergencyLawDef(activeLaw.lawId);
  if (!def) return activeLaw.lawId;
  
  const progress = Math.round((1 - activeLaw.remainingDuration / activeLaw.totalDuration) * 100);
  return `${def.name} [${activeLaw.remainingDuration}t left] (${progress}%)`;
}

/**
 * Get all available emergency laws (not on cooldown, not active)
 * @param {Object} state - Game state
 * @returns {Array} Available emergency law definitions
 */
export function getAvailableEmergencyLaws(state) {
  return EMERGENCY_LAW_DEFINITIONS.filter(def => {
    // Check if active
    const activeEmergencyLaws = state.activeEmergencyLaws || [];
    if (activeEmergencyLaws.some(l => l.lawId === def.id && l.active)) {
      return false;
    }
    
    // Check cooldown
    const cooldowns = state.emergencyLawCooldowns || {};
    const cooldownEnd = cooldowns[def.id] || 0;
    if (state.turn < cooldownEnd) {
      return false;
    }
    
    return true;
  });
}
