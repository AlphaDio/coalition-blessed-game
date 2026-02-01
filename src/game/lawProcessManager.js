/**
 * Law Process Manager - Manages multiple concurrent law processes
 */

import { createLawProcess, createEmpireStance } from './types.js';
import { calculateReaction, getReactionTier } from './reactions.js';
import { 
  buildLawContext, 
  filterEligibleEvents, 
  pickEvents, 
  applyEventEffects,
  checkPhaseAdvancement,
  checkBurialRule,
  MAX_PHASE_PROGRESS,
  clampMeter
} from './lawEngine.js';
import { canStartLaw } from './lawDefinitions.js';
import { clamp, clampApproval, clampCohesion } from './cohesion.js';
import { getLogger } from '../modules/logger.js';
import { updateCoalitionColor } from './coalitionColor.js';
import { calculateLawReactions } from './reactions.js';
import { applyHeroLawPressure, runHeroPassives, triggerHeroAbilities } from './heroes.js';

/**
 * Get the law progress speed multiplier from coalition modifiers
 * @param {Object} state - Game state
 * @returns {number} Multiplier for law progress (1.0 = normal, 1.1 = 10% faster, etc.)
 */
function getLawProgressSpeedMultiplier(state) {
  const baseSpeed = 1.0;
  const modifierBonus = state.coalitionModifiers?.law_progress_speed || 0;
  const tempBonus = state.coalitionModifiers?.lawProgressBonus || 0;
  const dynamicBonus = state.coalitionModifiers?.dynamic?.law_progress_speed_bonus || 0;
  return baseSpeed + modifierBonus + tempBonus + dynamicBonus;
}


const LAW_UI_LOG_KEYWORDS = [
  '*** LAW ENACTED ***',
  '*** LAW FAILED',
  '*** LAW BURIED',
  'Phase advanced',
  'VOTING phase complete',
  'Hero Passive',
  'Hero pressure',
  'Hero Ability',
  'ERROR'
];

function filterLawLogs(logs) {
  return logs.filter(line => LAW_UI_LOG_KEYWORDS.some(keyword => line.includes(keyword)));
}

/**
 * Apply law modifiers to the coalition when a law is enacted
 * @param {Object} lawDef - Law definition
 * @param {Object} state - Game state
 * @returns {Array} Log messages
 */
function applyLawModifiers(lawDef, state) {
  const log = [];
  const modifiers = lawDef.modifiers || {};

  // Ensure coalitionModifiers exists
  if (!state.coalitionModifiers) {
    state.coalitionModifiers = {
      industrial_output: 0,
      research_speed: 0,
      army_organization: 0,
      supply_efficiency: 0,
      empire_approval: 0,
      population_growth: 0,
      trade_income: 0,
      empire_production_multiplier: 0,
      cohesionModifier: 1.0,
      army_maintenance_cost_modifier: 1.0,
      relations_strength_modifier: 1.0,
      consumptionShareMultiplier: 1.0,
      consumptionShareBonus: 0
    };
  }
  
  // Apply empire approval modifier (applies each tick to all empires)
  if (modifiers.empire_approval) {
    state.coalitionModifiers.empire_approval += modifiers.empire_approval;
    log.push(`Empire approval: +${modifiers.empire_approval} per tick`);
  }
  
  // Apply trade income modifier
  if (modifiers.trade_income) {
    state.coalitionModifiers.trade_income += modifiers.trade_income;
    log.push(`Trade income: +${modifiers.trade_income} credits per tick`);
  }
  
  // Apply population growth modifier
  if (modifiers.population_growth) {
    state.coalitionModifiers.population_growth += modifiers.population_growth;
    log.push(`Population growth: +${modifiers.population_growth} per tick`);
  }
  
  // Apply industrial output modifier (percentage bonus)
  if (modifiers.industrial_output) {
    state.coalitionModifiers.industrial_output += modifiers.industrial_output;
    log.push(`Industrial output: +${(modifiers.industrial_output * 100).toFixed(1)}%`);
  }
  
  // Apply cohesion modifier (multiplier for cohesion recovery)
  if (modifiers.cohesionModifier) {
    state.coalitionModifiers.cohesionModifier *= modifiers.cohesionModifier;
    const bonus = ((modifiers.cohesionModifier - 1) * 100).toFixed(1);
    log.push(`Cohesion recovery: +${bonus}%`);
  }
  
  // Apply army maintenance cost modifier (multiplier, < 1.0 = cheaper)
  if (modifiers.army_maintenance_cost_modifier) {
    state.coalitionModifiers.army_maintenance_cost_modifier *= modifiers.army_maintenance_cost_modifier;
    const reduction = ((1 - modifiers.army_maintenance_cost_modifier) * 100).toFixed(0);
    log.push(`Army maintenance: -${reduction}%`);
  }
  
  // Apply relations strength modifier (multiplier for diplomacy improvements)
  if (modifiers.relations_strength_modifier) {
    state.coalitionModifiers.relations_strength_modifier *= modifiers.relations_strength_modifier;
    const bonus = ((modifiers.relations_strength_modifier - 1) * 100).toFixed(1);
    log.push(`Diplomacy strength: +${bonus}%`);
  }
  
  // Apply research speed modifier
  if (modifiers.research_speed) {
    state.coalitionModifiers.research_speed += modifiers.research_speed;
    log.push(`Research speed: +${(modifiers.research_speed * 100).toFixed(1)}%`);
  }
  
  // Apply supply efficiency modifier
  if (modifiers.supply_efficiency) {
    state.coalitionModifiers.supply_efficiency += modifiers.supply_efficiency;
    log.push(`Supply efficiency: +${(modifiers.supply_efficiency * 100).toFixed(1)}%`);
  }
  
  // Apply army organization modifier (immediate bonus to all armies)
  if (modifiers.army_organization) {
    state.coalitionModifiers.army_organization += modifiers.army_organization;
    log.push(`Army organization: +${modifiers.army_organization}`);
    
    // Apply immediate organization bonus to all armies
    if (state.armies) {
      state.armies.forEach(army => {
        if (army.organization !== undefined) {
          army.organization = Math.min(100, army.organization + modifiers.army_organization);
        }
      });
    }
   }

   // Apply empire production multiplier modifier (multiplies all empire production)
   if (modifiers.empire_production_multiplier) {
     state.coalitionModifiers.empire_production_multiplier += modifiers.empire_production_multiplier;
     log.push(`Empire production multiplier: +${(modifiers.empire_production_multiplier * 100).toFixed(0)}%`);
   }

   // Apply consumption share multiplier (increases coalition's share of empire consumption)
   if (modifiers.consumptionShareMultiplier) {
     state.coalitionModifiers.consumptionShareMultiplier = (state.coalitionModifiers.consumptionShareMultiplier || 1.0) * modifiers.consumptionShareMultiplier;
     log.push(`Coalition consumption share: ×${modifiers.consumptionShareMultiplier} (now ${(state.coalitionModifiers.consumptionShareMultiplier * 100).toFixed(0)}%)`);
   }

   // Apply consumption share bonus (additive increase to coalition's share)
   if (modifiers.consumptionShareBonus) {
     state.coalitionModifiers.consumptionShareBonus = (state.coalitionModifiers.consumptionShareBonus || 0) + modifiers.consumptionShareBonus;
     log.push(`Coalition consumption share: +${(modifiers.consumptionShareBonus * 100).toFixed(0)}%`);
   }

   // Apply immediate empire reactions based on law's axis vector
  if (lawDef.axis_vector && Object.keys(lawDef.axis_vector).length > 0 && state.empires) {
    const lawForReaction = {
      vector: lawDef.axis_vector,
      weights: {},
      tag_effects: []
    };
    
    // Fill weights from axis_vector
    Object.keys(lawDef.axis_vector).forEach(axis => {
      lawForReaction.weights[axis] = 1.0;
    });
    
    const reactions = calculateLawReactions(state.empires, lawForReaction);
    
    Object.entries(reactions).forEach(([empireId, reactionData]) => {
      const empire = state.empires.find(e => e.id === empireId);
      if (empire) {
        empire.approval = clampApproval(empire.approval + reactionData.approvalChange);
        const sign = reactionData.approvalChange >= 0 ? '+' : '';
        log.push(`${empire.name}: ${sign}${reactionData.approvalChange} approval`);
      }
    });
  }
  
  return log;
}

function removeLawModifiers(lawDef, state) {
  const modifiers = lawDef.modifiers || {};
  if (!state.coalitionModifiers) {
    return;
  }

  if (modifiers.empire_approval) {
    state.coalitionModifiers.empire_approval -= modifiers.empire_approval;
  }
  if (modifiers.trade_income) {
    state.coalitionModifiers.trade_income -= modifiers.trade_income;
  }
  if (modifiers.population_growth) {
    state.coalitionModifiers.population_growth -= modifiers.population_growth;
  }
  if (modifiers.industrial_output) {
    state.coalitionModifiers.industrial_output -= modifiers.industrial_output;
  }
  if (modifiers.research_speed) {
    state.coalitionModifiers.research_speed -= modifiers.research_speed;
  }
  if (modifiers.supply_efficiency) {
    state.coalitionModifiers.supply_efficiency -= modifiers.supply_efficiency;
  }
  if (modifiers.empire_production_multiplier) {
    state.coalitionModifiers.empire_production_multiplier -= modifiers.empire_production_multiplier;
  }
  if (modifiers.cohesionModifier) {
    if (modifiers.cohesionModifier !== 0) {
      state.coalitionModifiers.cohesionModifier /= modifiers.cohesionModifier;
    }
  }
  if (modifiers.army_maintenance_cost_modifier) {
    if (modifiers.army_maintenance_cost_modifier !== 0) {
      state.coalitionModifiers.army_maintenance_cost_modifier /= modifiers.army_maintenance_cost_modifier;
    }
  }
  if (modifiers.relations_strength_modifier) {
    if (modifiers.relations_strength_modifier !== 0) {
      state.coalitionModifiers.relations_strength_modifier /= modifiers.relations_strength_modifier;
    }
  }
  if (modifiers.army_organization) {
    state.coalitionModifiers.army_organization -= modifiers.army_organization;
    if (state.armies) {
      state.armies.forEach(army => {
        if (army.organization !== undefined) {
          army.organization = Math.max(0, Math.min(100, army.organization - modifiers.army_organization));
        }
      });
    }
  }
}

function applyLawImmediateEffects(lawDef, state, log) {
  const effects = lawDef.immediate_effects || {};
  if (!effects || Object.keys(effects).length === 0) return;

  if (effects.cohesion) {
    const before = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion + effects.cohesion);
    log.push(`Cohesion: ${before.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)}`);
  }

  if (effects.coalition_credits) {
    if (!state.coalitionEconomy) {
      state.coalitionEconomy = { requisition: 0, treasury_credits: 0, allowance_credits: 0 };
    }
    state.coalitionEconomy.treasury_credits =
      (state.coalitionEconomy.treasury_credits || 0) + effects.coalition_credits;
    log.push(`Coalition credits: +${effects.coalition_credits}`);
  }

  if (effects.requisition) {
    if (!state.coalitionEconomy) {
      state.coalitionEconomy = { requisition: 0, treasury_credits: 0, allowance_credits: 0 };
    }
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + effects.requisition;
    log.push(`Requisition: +${effects.requisition}`);
  }

  if (effects.influence) {
    state.playerInfluence = (state.playerInfluence || 0) + effects.influence;
    log.push(`Influence: +${effects.influence}`);
  }

  if (effects.empire_approval && state.empires) {
    state.empires.forEach(empire => {
      empire.approval = clampApproval(empire.approval + effects.empire_approval);
    });
    log.push(`Empire approval: +${effects.empire_approval} (immediate)`);
  }
}

/**
 * Constants for support bias calculations
 */
const SUPPORT_BIAS_CONSTANTS = {

  // Normalization for population factor: log10(1000) ≈ 3, log10(10000) ≈ 4
  // Dividing by 4 gives us a 0.75-1.0 range for typical populations
  POPULATION_LOG_DIVISOR: 4,
  DEFAULT_POPULATION: 1000
};

/**
 * Start a new law process
 * @param {Object} state - Game state
 * @param {string} lawId - Law definition ID to start
 * @param {number} influenceCost - Influence cost (default 100)
 * @returns {Object} Result with success/error and log
 */
export function startLawProcess(state, lawId, influenceCost = 100) {
  const logger = getLogger();
  
  // Check prerequisites and enacted status
  const eligibility = canStartLaw(lawId, state);
  if (!eligibility.canStart) {
    logger.warn(`Cannot start law process: ${eligibility.reason}`, { lawId });
    return { 
      error: eligibility.reason,
      log: []
    };
  }
  
  const activeProcesses = (state.lawProcesses || []).filter(process =>
    process.phase !== 'ENACTED' && process.phase !== 'BURIED'
  );
  if (activeProcesses.length > 0) {
    logger.warn('Cannot start law process: another law is active', { lawId });
    return {
      error: 'Only one law can be enacted at a time',
      log: []
    };
  }

  // Check if player has enough influence
  if (state.playerInfluence < influenceCost) {
    logger.warn(`Cannot start law process: insufficient influence`, {
      needed: influenceCost,
      have: state.playerInfluence,
      lawId
    });
    return { 
      error: `Not enough influence (need ${influenceCost}, have ${state.playerInfluence})`,
      log: []
    };
  }
  
  // Find law definition
  const lawDef = state.lawDefinitions.find(l => l.id === lawId);
  if (!lawDef) {
    logger.error(`Law definition not found: ${lawId}`);
    return { 
      error: `Law definition not found: ${lawId}`,
      log: []
    };
  }
  
  logger.info(`Law started: ${lawDef.name} (Cost: ${influenceCost}, Remaining: ${state.playerInfluence - influenceCost})`);
  logger.debug(`Starting law process: ${lawDef.name}`, {
    lawId,
    influenceCost,
    remainingInfluence: state.playerInfluence - influenceCost
  });
  
  // Deduct influence
  state.playerInfluence -= influenceCost;
  
  // Create new law process
  const lawProcess = createLawProcess(lawId, state.turn);
  
  // Calculate initial empire stances
  calculateEmpireStances(lawProcess, lawDef, state);

  // Add to active processes
  state.lawProcesses.push(lawProcess);

  const log = [
    `Law process started: ${lawDef.name}`,
    `Influence spent: ${influenceCost} (remaining: ${state.playerInfluence})`,
    `Phase: ${lawProcess.phase}`
  ];

  // Apply immediate hero pressure when the law starts
  applyHeroLawPressure(state, lawProcess, lawDef, log);
  
  return { success: true, log };
}

/**
 * Calculate empire stances for a law
 * @param {Object} lawProcess - Law process
 * @param {Object} lawDef - Law definition
 * @param {Object} state - Game state
 */
export function calculateEmpireStances(lawProcess, lawDef, state) {
  state.empires.forEach(empire => {
    // Convert law definition to format expected by calculateReaction
    const lawForReaction = {
      vector: lawDef.axis_vector,
      weights: {}, // Could derive from axis_vector
      tag_effects: []
    };
    
    // Fill weights from axis_vector
    Object.keys(lawDef.axis_vector).forEach(axis => {
      lawForReaction.weights[axis] = 1.0;
    });
    
    // Calculate base reaction
    const reaction = calculateReaction(empire, lawForReaction);
    
    // Apply support weight biases
    const biasedScore = applyLawSupportBias(
      reaction.score,
      empire,
      lawDef,
      state
    );
    
    // Determine stance tier from biased score
    const stanceTier = getReactionTier(biasedScore);
    
    // Determine initial vote intent
    let voteIntent = 'abstain';
    if (stanceTier === 'laud' || stanceTier === 'approve') {
      voteIntent = 'support';
    } else if (stanceTier === 'denounce' || stanceTier === 'disapprove') {
      voteIntent = 'oppose';
    }
    
    const stance = createEmpireStance(empire.id, biasedScore, stanceTier.toUpperCase(), voteIntent);
    lawProcess.empireStances[empire.id] = stance;
  });
}

/**
 * Apply law support biases (population, security, economy incentives)
 * @param {number} baseScore - Base alignment score
 * @param {Object} empire - Empire
 * @param {Object} lawDef - Law definition
 * @param {Object} state - Game state
 * @returns {number} Biased score
 */
export function applyLawSupportBias(baseScore, empire, lawDef, state) {
  let bias = 0;
  
  // Population incentive - large empires support laws benefiting populace
  if (lawDef.support_weights.population_incentive) {
    const popFactor = Math.log10(empire.stats.population || SUPPORT_BIAS_CONSTANTS.DEFAULT_POPULATION) 
                      / SUPPORT_BIAS_CONSTANTS.POPULATION_LOG_DIVISOR;
    bias += lawDef.support_weights.population_incentive * popFactor * 0.2;
  }
  
  // Security incentive - empires support security laws when under threat
  if (lawDef.support_weights.security_incentive) {
    // Could check for active wars, scourge threat, etc.
    const threatLevel = state.scourgeCohesion / 100; // Higher scourge = higher threat
    bias += lawDef.support_weights.security_incentive * threatLevel * 0.15;
  }
  
  // Economy incentive - empires support stabilization laws during recession
  if (lawDef.support_weights.economy_incentive) {
    // Could check stockpile levels, cohesion for economic stress
    const economicStress = (100 - state.coalitionCohesion) / 100;
    bias += lawDef.support_weights.economy_incentive * economicStress * 0.15;
  }
  
  return baseScore + bias;
}

/**
 * Resolve one tick for a single law process
 * @param {Object} lawProcess - Law process to resolve
 * @param {Object} state - Game state
 * @param {Object} rng - Seeded RNG
 * @returns {Object} Resolution log
 */
export function resolveLawProcess(lawProcess, state, rng) {
  const log = [];
  
  // Skip if law is already finished
  if (lawProcess.phase === 'ENACTED' || lawProcess.phase === 'BURIED') {
    return log;
  }
  
  // Skip if waiting for player choice on a law event
  if (lawProcess.pendingEvent) {
    return log;
  }
  
  // Get law definition
  const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
  if (!lawDef) {
    log.push(`ERROR: Law definition not found for ${lawProcess.lawId}`);
    return log;
  }

  log.push(`\n=== Resolving Law: ${lawDef.name} (Phase: ${lawProcess.phase}) ===`);

  if (lawProcess.phaseTicks === 0) {
    runHeroPassives(state, lawProcess, lawDef, 'OnStart', log);
  }
  
  // Build context
  const context = buildLawContext(lawProcess, lawDef, state);
  
  // Get all law events (would normally come from state.events or a separate collection)
  const allLawEvents = getLawEvents(state, lawDef);
  
  // Filter eligible events
  const eligible = filterEligibleEvents(allLawEvents, context);
  log.push(`Eligible events: ${eligible.length}`);
  
  const preProgress = lawProcess.phaseProgress;

  if (eligible.length === 0) {
    log.push('No eligible events, advancing phase progress by default');
    const progressSpeed = getLawProgressSpeedMultiplier(state);
    lawProcess.phaseProgress = clamp(lawProcess.phaseProgress + 0.005 * progressSpeed, 0, MAX_PHASE_PROGRESS);
  } else {
    // Pick events
    const selected = pickEvents(eligible, context, rng);
    
    if (selected.major) {
      log.push(`\nMajor Event: ${selected.major.name}`);
      log.push(`  Nature: ${selected.major.nature || 'NEUTRAL'}`);
      
      // Check if event has choices (requires player interaction)
      if (selected.major.choices && Array.isArray(selected.major.choices) && selected.major.choices.length > 0) {
        log.push(`  Waiting for player choice...`);
        
        // Mark law process as having pending event
        lawProcess.pendingEvent = selected.major.id;
        
        // Set as active event for player to respond to
        state.activeEvent = {
          ...selected.major,
          title: selected.major.name,
          text: selected.major.description || selected.major.name,
          isLawEvent: true,
          lawProcessId: lawProcess.lawId,
          lawProcessPhase: lawProcess.phase
        };
        
        return log;
      }
      
      // Apply effects for auto-fire events
      const effectLog = applyEventEffects(selected.major, lawProcess, state);
      log.push(...effectLog);
      
      // Track reject
      if (selected.major.nature === 'REJECT') {
        lawProcess.rejects++;
        log.push(`  REJECT count: ${lawProcess.rejects}/4`);
        
        // Check burial
        if (checkBurialRule(lawProcess, state)) {
          const logger = getLogger();
          logger.info(`Law BURIED: ${lawDef.name} (4 rejects)`);
          log.push(`\n*** LAW BURIED (4 rejects) ***`);
          return log;
        }
      }
      
      // Record event in log
      lawProcess.eventLog.push({
        tick: state.turn,
        phase: lawProcess.phase,
        eventId: selected.major.id,
        nature: selected.major.nature
      });
    }
    
    // Apply minor events (they don't have choices)
    selected.minors.forEach(minor => {
      log.push(`\nMinor Event: ${minor.name}`);
      const effectLog = applyEventEffects(minor, lawProcess, state);
      log.push(...effectLog);
    });
  }


  const progressDelta = lawProcess.phaseProgress - preProgress;
  if (progressDelta <= 0.001) {
    lawProcess.stallTicks += 1;
  } else {
    lawProcess.stallTicks = 0;
  }

    if (lawProcess.stallTicks >= 15) {
      const progressSpeed = getLawProgressSpeedMultiplier(state);
      const push = clamp((0.02 + (lawProcess.stallTicks - 15) * 0.005) * progressSpeed, 0.02, 0.06);
      const oldProgress = lawProcess.phaseProgress;
      lawProcess.phaseProgress = clamp(lawProcess.phaseProgress + push, 0, MAX_PHASE_PROGRESS);
      log.push(`  Stalemate pressure: ${oldProgress.toFixed(2)} → ${lawProcess.phaseProgress.toFixed(2)}`);

      lawProcess.meters.momentum = clamp((lawProcess.meters.momentum || 0) + 0.015, 0, 1);
      lawProcess.meters.reject_pressure = clamp((lawProcess.meters.reject_pressure || 0) - 0.02, 0, 1);
    }

    if (lawProcess.phaseTicks >= 50 && lawProcess.phaseProgress < 0.4) {
      const progressSpeed = getLawProgressSpeedMultiplier(state);
      const nudge = clamp((0.03 + (lawProcess.phaseTicks - 50) * 0.003) * progressSpeed, 0.03, 0.08);
      const oldProgress = lawProcess.phaseProgress;
      lawProcess.phaseProgress = clamp(lawProcess.phaseProgress + nudge, 0, MAX_PHASE_PROGRESS);
      log.push(`  Deadlock nudge: ${oldProgress.toFixed(2)} → ${lawProcess.phaseProgress.toFixed(2)}`);

      lawProcess.meters.momentum = clamp((lawProcess.meters.momentum || 0) + 0.025, 0, 1);
      lawProcess.meters.reject_pressure = clamp((lawProcess.meters.reject_pressure || 0) - 0.03, 0, 1);
    }


  
    // Hero phase-tick passives + law pressure
    runHeroPassives(state, lawProcess, lawDef, 'OnTick', log);
    applyHeroLawPressure(state, lawProcess, lawDef, log);
    triggerHeroAbilities(state, lawProcess, log);

    // Track phase progress for deadlock detection
    lawProcess.phaseTicks += 1;

  // Check phase advancement
  if (checkPhaseAdvancement(lawProcess)) {
    lawProcess.phaseTicks = 0;
    lawProcess.stallTicks = 0;
    const logger = getLogger();
    const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
    const lawName = lawDef ? lawDef.name : lawProcess.lawId;
    logger.info(`Law phase: ${lawName} -> ${lawProcess.phase}`);
    log.push(`\n>>> Phase advanced to: ${lawProcess.phase}`);
  }

  
  // Check if VOTING completed
  if (lawProcess.phase === 'VOTING' && lawProcess.phaseProgress >= 1.0) {
    const logger = getLogger();
    log.push('\n>>> VOTING phase complete, enacting law...');

    // Apply immediate hero pressure when the law is enacted
    applyHeroLawPressure(state, lawProcess, lawDef, log);

    lawProcess.phase = 'ENACTED';

    // Reset temporary law progress bonus
    if (state.coalitionModifiers) {
      state.coalitionModifiers.lawProgressBonus = 0;
    }

    const category = lawDef.category || 'uncategorized';
    if (!state.enactedLawsByCategory || typeof state.enactedLawsByCategory !== 'object') {
      state.enactedLawsByCategory = {};
    }
    if (!Array.isArray(state.enactedLaws)) {
      state.enactedLaws = [];
    }
    if (!Array.isArray(state.enactedLawsHistory)) {
      state.enactedLawsHistory = [];
    }
    if (!state.lawTierUnlocks || typeof state.lawTierUnlocks !== 'object') {
      state.lawTierUnlocks = { 1: true, 2: false, 3: false };
    }

    const previousLawId = state.enactedLawsByCategory[category];
    if (previousLawId && previousLawId !== lawProcess.lawId) {
      const previousDef = state.lawDefinitions.find(l => l.id === previousLawId);
      if (previousDef) {
        removeLawModifiers(previousDef, state);
        log.push(`Replaced ${previousDef.name} (${category})`);
      }
    }

    state.enactedLawsByCategory[category] = lawProcess.lawId;
    state.enactedLaws = Object.values(state.enactedLawsByCategory);
    if (!state.enactedLawsHistory.includes(lawProcess.lawId)) {
      state.enactedLawsHistory.push(lawProcess.lawId);
    }
    if (!Array.isArray(state.activeLaws)) {
      state.activeLaws = [];
    }
    state.activeLaws = state.enactedLaws
      .map(lawId => {
        const def = state.lawDefinitions.find(l => l.id === lawId);
        if (!def) return null;
        return { lawId: def.id, category: def.category, modifiers: def.modifiers || {} };
      })
      .filter(Boolean);
    if (lawDef.tier === 1) state.lawTierUnlocks[2] = true;
    if (lawDef.tier === 2) state.lawTierUnlocks[3] = true;

    // Apply law modifiers to coalition
    const modifierLog = applyLawModifiers(lawDef, state);
    if (modifierLog.length > 0) {
      log.push('Law effects applied:');
      modifierLog.forEach(msg => log.push(`  ${msg}`));
    }
    applyLawImmediateEffects(lawDef, state, log);

    // Update Coalition coloration based on enacted laws
    updateCoalitionColor(state);
    logger.info(`Law ENACTED: ${lawDef.name}`);
    log.push('\n*** LAW ENACTED ***');
  }

  
  return log;
}

/**
 * Get law events (stub - would load from content)
 * @param {Object} state - Game state
 * @param {Object} lawDef - Law definition
 * @returns {Array} Law events
 */
function getLawEvents(state, lawDef) {
  // This would normally load from state.events filtered for scope: LAW
  // For now, return empty array - events will be loaded from modules
  return state.events.filter(e => e.scope === 'LAW') || [];
}

/**
 * Tally votes for a law
 * @param {Object} lawProcess - Law process
 * @param {Object} state - Game state
 * @returns {Object} Tally result with passed flag and log
 */
export function tallyVotes(lawProcess, state) {
  const log = [];
  const policy = state.powerSystemPolicy;
  
  if (!policy) {
    log.push('ERROR: No power system policy defined');
    return { passed: false, log };
  }
  
  // Get law definition to check for enactment bonus
  const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
  const enactmentBonus = lawDef?.modifiers?.enactment_chance_bonus || 0;
  
  let totalVotes = 0;
  let supportVotes = 0;
  let opposeVotes = 0;
  let abstainVotes = 0;
  
  state.empires.forEach(empire => {
    const stance = lawProcess.empireStances[empire.id];
    if (!stance) return;
    
    // Calculate votes for this empire
    const votes = calculateEmpireVotes(empire, policy, state);
    totalVotes += votes;
    
    // Apply vote intent
    if (stance.vote_intent === 'support') {
      supportVotes += votes;
    } else if (stance.vote_intent === 'oppose') {
      opposeVotes += votes;
    } else {
      abstainVotes += votes;
    }
    
    log.push(`  ${empire.name}: ${stance.vote_intent} (${votes} votes)`);
  });
  
  const quorumNeeded = totalVotes * policy.config.quorum_threshold;
  // Apply enactment bonus by reducing the threshold needed
  const basePassThreshold = policy.config.pass_threshold;
  const adjustedPassThreshold = Math.max(0, basePassThreshold - enactmentBonus);
  const votesNeeded = totalVotes * adjustedPassThreshold;
  const totalCast = supportVotes + opposeVotes;
  
  log.push(`\nVote Tally:`);
  log.push(`  Support: ${supportVotes}`);
  log.push(`  Oppose: ${opposeVotes}`);
  log.push(`  Abstain: ${abstainVotes}`);
  log.push(`  Quorum: ${totalCast}/${quorumNeeded.toFixed(1)} ${totalCast >= quorumNeeded ? '✓' : '✗'}`);
  
  if (enactmentBonus > 0) {
    const adjustedPercentage = (adjustedPassThreshold * 100).toFixed(0);
    const bonusPercentage = (enactmentBonus * 100).toFixed(0);
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} (${adjustedPercentage}% with +${bonusPercentage}% bonus) ${supportVotes >= votesNeeded ? '✓' : '✗'}`);
  } else {
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} ${supportVotes >= votesNeeded ? '✓' : '✗'}`);
  }
  
  const passed = totalCast >= quorumNeeded && supportVotes >= votesNeeded;
  
  return { passed, log, supportVotes, opposeVotes, abstainVotes };
}

/**
 * Calculate votes for an empire based on power system
 * @param {Object} empire - Empire
 * @param {Object} policy - Power system policy
 * @param {Object} state - Game state
 * @returns {number} Number of votes
 */
export function calculateEmpireVotes(empire, policy, state) {
  let votes = policy.config.base_votes_per_empire || 1;
  
  if (policy.type === 'pressure_weighted') {
    // Votes increase with population
    const pressure = empire.stats.population || 1000;
    votes += Math.floor(pressure * policy.config.pressure_multiplier);
  } else if (policy.type === 'hegemonic') {
    // Top empire by population gets bonus
    const maxPopulation = Math.max(...state.empires.map(e => e.stats.population || 1000));
    if (empire.stats.population === maxPopulation) {
      votes += policy.config.hegemonic_bonus || 0;
    }
  }
  
  return votes;
}

/**
 * Update player influence (call each tick)
 * @param {Object} state - Game state
 */
export function updatePlayerInfluence(state) {
  state.playerInfluence = (state.playerInfluence || 0) + 1;
  state.influenceProgress = 0;
}

/**
 * Handle player choice for a law event
 * @param {Object} state - Game state
 * @param {string} lawId - Law process ID
 * @param {string} eventId - Event ID
 * @param {number} choiceIndex - Index of selected choice
 * @returns {Object} Result with success/error and log
 */
export function handleLawEventChoice(state, lawId, eventId, choiceIndex) {
  const logger = getLogger();
  
  // Find the law process
  const lawProcess = state.lawProcesses.find(lp => lp.lawId === lawId);
  if (!lawProcess) {
    logger.error(`Law process not found: ${lawId}`);
    return { error: 'Law process not found', log: [] };
  }
  
  // Verify this is the pending event
  if (lawProcess.pendingEvent !== eventId) {
    logger.error(`Event ${eventId} is not the pending event for law ${lawId}`, {
      expected: lawProcess.pendingEvent,
      got: eventId
    });
    return { error: 'Event is not pending for this law', log: [] };
  }
  
  // Find the event in state.events
  const event = state.events.find(e => e.id === eventId);
  if (!event) {
    logger.error(`Event not found: ${eventId}`);
    return { error: 'Event not found', log: [] };
  }
  
  // Validate choice index
  if (!event.choices || choiceIndex < 0 || choiceIndex >= event.choices.length) {
    logger.error(`Invalid choice index: ${choiceIndex} for event ${eventId}`, {
      choicesCount: event.choices ? event.choices.length : 0
    });
    return { error: 'Invalid choice index', log: [] };
  }
  
  const choice = event.choices[choiceIndex];
  const log = [];
  
  log.push(`Law Event: ${event.name} - ${choice.text}`);
  
  // Apply choice effects to law process
  if (choice.effects) {
    const effectLog = applyLawEventChoiceEffects(choice.effects, lawProcess, state);
    log.push(...effectLog);
  }
  
  // Track reject if applicable
  if (event.nature === 'REJECT' && choice.effects && choice.effects.progress && choice.effects.progress < 0) {
    lawProcess.rejects++;
    log.push(`  REJECT count: ${lawProcess.rejects}/4`);
    
    // Check burial
    if (checkBurialRule(lawProcess, state)) {
      const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
      const lawName = lawDef ? lawDef.name : lawProcess.lawId;
      logger.info(`Law BURIED: ${lawName} (4 rejects)`);
      log.push(`\n*** LAW BURIED (4 rejects) ***`);
      
      // Clear pending event
      lawProcess.pendingEvent = null;
      state.activeEvent = null;
      
      return { success: true, log: filterLawLogs(log) };
    }
  }
  
  // Record event in log
  lawProcess.eventLog.push({
    tick: state.turn,
    phase: lawProcess.phase,
    eventId: event.id,
    nature: event.nature,
    choiceIndex
  });
  
  // Clear pending event
  lawProcess.pendingEvent = null;
  state.activeEvent = null;
  
  // Log law event effects at info level
  log.forEach(entry => logger.info(entry));
  
  return { success: true, log: filterLawLogs(log) };
}

/**
 * Apply law event choice effects (similar to applyEventEffects but for choices)
 * @param {Object} effects - Choice effects
 * @param {Object} lawProcess - Law process
 * @param {Object} state - Game state
 * @returns {Array} Log of applied effects
 */
function applyLawEventChoiceEffects(effects, lawProcess, state) {
  const log = [];
  
  // Apply meter deltas
  if (effects.meters) {
    Object.entries(effects.meters).forEach(([meter, delta]) => {
      const oldValue = lawProcess.meters[meter] || 0;
      const newValue = clampMeter(oldValue + delta);
      lawProcess.meters[meter] = newValue;
      const deltaLabel = delta >= 0 ? `+${delta.toFixed(2)}` : `${delta.toFixed(2)}`;
      log.push(`  ${meter}: ${oldValue.toFixed(2)} → ${newValue.toFixed(2)} (${deltaLabel})`);
    });
  }
  
  // Apply progress delta
  if (effects.progress !== undefined) {
    const oldProgress = lawProcess.phaseProgress;
    const newProgress = Math.max(0, Math.min(oldProgress + effects.progress, 2.0));
    lawProcess.phaseProgress = newProgress;
    const deltaLabel = effects.progress >= 0 ? `+${effects.progress.toFixed(2)}` : `${effects.progress.toFixed(2)}`;
    log.push(`  Phase progress: ${oldProgress.toFixed(2)} → ${newProgress.toFixed(2)} (${deltaLabel})`);
  }

  
  return log;
}

/**
 * Resolve all active law processes
 * @param {Object} state - Game state
 * @param {Object} rng - Seeded RNG
 * @returns {Array} Combined logs from all resolutions
 */
export function resolveAllLawProcesses(state, rng) {
  const logs = [];
  
  // Update player influence
  updatePlayerInfluence(state);
  
  // Early return if no law processes
  if (!state.lawProcesses || state.lawProcesses.length === 0) {
    return logs;
  }
  
  // Resolve each active law process
  state.lawProcesses.forEach((lawProcess, index) => {
    // Skip already finished laws
    if (lawProcess.phase === 'ENACTED' || lawProcess.phase === 'BURIED') {
      return;
    }
    
    // Get law definition to check for modifiers
    const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
    if (!lawDef) {
      return;
    }
    
    // Increment tick counter
    lawProcess.ticksSinceLastResolve++;
    
    // Calculate ticks needed based on tick_delay_multiplier
    // Note: Uses active law process count as base to distribute events fairly
    // Each law gets a turn proportionally based on its delay multiplier
    const tickDelayMultiplier = lawDef.modifiers?.tick_delay_multiplier || 1.0;
    const ticksNeeded = Math.max(1, Math.round(state.lawProcesses.length * tickDelayMultiplier));
    
    // Check if enough ticks have passed
    const shouldResolve = lawProcess.ticksSinceLastResolve >= ticksNeeded;
    
    if (shouldResolve) {
      lawProcess.ticksSinceLastResolve = 0; // Reset counter
      const log = resolveLawProcess(lawProcess, state, rng);
      logs.push(...filterLawLogs(log));
    }
  });
  
  return logs;
}
