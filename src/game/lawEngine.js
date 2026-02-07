/**
 * Law Enactment Engine - Core event-driven law process resolution
 * Implements deterministic 3-phase law process using the existing event system
 * 
 * The law process goes through three phases:
 * 1. DEBATE - Initial discussion and stance formation
 * 2. FALLOUT - Consequences and reactions emerge
 * 3. VOTING - Final decision phase
 * 
 * Each phase has a progress threshold of 1.0, and events drive progress forward.
 * MAX_PHASE_PROGRESS is set to 2.0 to allow for flexibility in event weighting.
 */

import { clamp } from './cohesion.js';

/**
 * Phase progression thresholds
 * Each phase must accumulate 1.0 progress to advance to the next phase
 */
export const PHASE_THRESHOLDS = {
  DEBATE: 1.0,    // Progress needed to move from DEBATE to FALLOUT
  FALLOUT: 1.0,   // Progress needed to move from FALLOUT to VOTING
  VOTING: 1.0     // Progress needed to complete VOTING phase
};

/**
 * Phase names in order
 */
export const PHASE_ORDER = ['DEBATE', 'FALLOUT', 'VOTING'];

/**
 * Event budget per resolution cycle
 * Controls how many events can occur during law resolution
 * Reduced to halve overall event cadence
 */
export const EVENT_BUDGET = {
  MAJOR_EVENT_CHANCE: 0.5, // Chance to fire a major event per cycle
  MINOR_EVENT_CHANCE: 1,   // Chance to fire minor events per cycle
  MINOR_EVENTS_MAX: 1      // Maximum number of minor events per cycle
};


/**
 * Maximum phase progress value
 * Set to 2.0 to allow events to provide varying amounts of progress (0.2-0.5 typically)
 * This prevents any single event from completing an entire phase
 */
export const MAX_PHASE_PROGRESS = 2.0;

/**
 * Global phase progress multiplier
 * Lower values slow law enactment; target ~150-200 ticks per law
 * (to match influence generation of +1/tick with 100 cost per law)
 */
export const PHASE_PROGRESS_MULTIPLIER = 0.045;


/**
 * Clamp meter values to 0..1 range
 */
export function clampMeter(value) {
  return clamp(value, 0, 1);
}

/**
 * Build a law context for event browsing
 * @param {Object} lawProcess - Current law process state
 * @param {Object} lawDefinition - Law definition
 * @param {Object} state - Game state
 * @returns {Object} Context for event filtering and evaluation
 */
export function buildLawContext(lawProcess, lawDefinition, state) {
  return {
    lawProcess,
    lawDefinition,
    coalition: state,
    empires: state.empires,
    phase: lawProcess.phase,
    meters: lawProcess.meters,
    empireStances: lawProcess.empireStances
  };
}

/**
 * Filter events eligible for current law context
 * @param {Array} allEvents - All available events
 * @param {Object} context - Law context
 * @returns {Array} Eligible events
 */
export function filterEligibleEvents(allEvents, context) {
  return allEvents.filter(event => {
    // Must be law-scoped
    if (event.scope !== 'LAW') return false;
    
    // Must match current phase
    const phaseTags = event.phase_tags || [];
    if (!phaseTags.includes(context.phase)) return false;
    
    // Check triggers if present
    if (event.triggers) {
      return evaluateTriggers(event.triggers, context);
    }
    
    return true;
  });
}

/**
 * Evaluate event triggers against context
 * @param {Array} triggers - Event trigger conditions
 * @param {Object} context - Law context
 * @returns {boolean} True if all triggers pass
 */
export function evaluateTriggers(triggers, context) {
  for (const trigger of triggers) {
    if (trigger.type === 'meter_above') {
      const meterValue = context.meters[trigger.meter] || 0;
      if (meterValue <= trigger.threshold) return false;
    }
    
    if (trigger.type === 'meter_below') {
      const meterValue = context.meters[trigger.meter] || 0;
      if (meterValue >= trigger.threshold) return false;
    }
    
    if (trigger.type === 'rejects_at_least') {
      if (context.lawProcess.rejects < trigger.count) return false;
    }
    
    if (trigger.type === 'phase_progress_above') {
      if (context.lawProcess.phaseProgress <= trigger.threshold) return false;
    }
    
    if (trigger.type === 'empire_stance') {
      const empire = context.empires.find(e => e.id === trigger.empireId);
      if (!empire) return false;
      const stance = context.empireStances[trigger.empireId];
      if (!stance || stance.stance_tier !== trigger.tier) return false;
    }
  }
  
  return true;
}

/**
 * Compute final selection weight for an event
 * 
 * METER PRIMARY EFFECTS (decoupled):
 * - Momentum: boosts APPROVE/ADVANCE events (positive progress)
 * - Reject_Pressure: boosts REJECT/STALL events (negative progress, hard rejects)
 * - Legitimacy: no direct weight effect (affects unrest consequences)
 * - Unrest: boosts EXTERNALITY events (negative spillover)
 * 
 * @param {Object} event - Event template
 * @param {Object} context - Law context
 * @returns {number} Final weight for selection
 */
export function computeEventWeight(event, context) {
  let weight = event.base_weight || 1.0;
  const nature = event.nature || 'NEUTRAL';
  
  const momentum = context.meters.momentum || 0.5;
  const rejectPressure = context.meters.reject_pressure || 0.3;
  const unrest = context.meters.unrest || 0.2;
  
  // MOMENTUM: Primary effect - boosts positive progress events
  // Higher momentum = more likely to get APPROVE/ADVANCE events
  if (nature === 'APPROVE' || nature === 'ADVANCE') {
    weight *= 1 + (momentum * 1.0);  // 1x to 2x at full momentum
  }
  
  // REJECT_PRESSURE: Primary effect - boosts negative progress events
  // Higher pressure = more likely to get REJECT/STALL events and hard rejects
  if (nature === 'REJECT' || nature === 'STALL') {
    weight *= 1 + (rejectPressure * 1.5);  // 1x to 2.5x at full pressure
  }
  
  // UNREST: Primary effect - boosts externality events
  // High unrest causes negative spillover effects
  if (nature === 'EXTERNALITY') {
    weight *= 1 + (unrest * 2.0);  // 1x to 3x at full unrest
  }
  
  return Math.max(0, weight);
}

// applyContextBias removed - cross-coupling eliminated
// Each meter now has ONE primary effect in computeEventWeight:
// - Momentum: boosts APPROVE/ADVANCE only
// - Reject_Pressure: boosts REJECT/STALL only  
// - Unrest: boosts EXTERNALITY only
// - Legitimacy: affects unrest consequences (see applyUnrestExternalities)

/**
 * Pick events using seeded weighted random selection
 * @param {Array} eligibleEvents - Events to choose from
 * @param {Object} context - Law context
 * @param {Object} rng - Seeded RNG instance
 * @returns {Object} Selected events { major: Event|null, minors: Array }
 */
export function pickEvents(eligibleEvents, context, rng) {
  const majorEvents = eligibleEvents.filter(e => e.tier === 'MAJOR');
  const minorEvents = eligibleEvents.filter(e => e.tier === 'MINOR');
  
  const selectedMajor = rng.random() < EVENT_BUDGET.MAJOR_EVENT_CHANCE
    ? weightedPick(majorEvents, context, rng)
    : null;
  
  const selectedMinors = [];
  const minorBudget = Math.min(EVENT_BUDGET.MINOR_EVENTS_MAX, minorEvents.length);
  
  if (rng.random() < EVENT_BUDGET.MINOR_EVENT_CHANCE) {
    for (let i = 0; i < minorBudget; i++) {
    const minor = weightedPick(minorEvents, context, rng);
      if (minor && !selectedMinors.includes(minor)) {
        selectedMinors.push(minor);
      }
    }
  }
  
  return {
    major: selectedMajor,
    minors: selectedMinors
  };
}

/**
 * Weighted random pick from events
 * @param {Array} events - Events to choose from
 * @param {Object} context - Law context
 * @param {Object} rng - Seeded RNG
 * @returns {Object|null} Selected event or null
 */
export function weightedPick(events, context, rng) {
  if (events.length === 0) return null;
  
  const weights = events.map(e => computeEventWeight(e, context));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  if (totalWeight <= 0) return null;
  
  const roll = rng.random() * totalWeight;
  let cumulative = 0;
  
  for (let i = 0; i < events.length; i++) {
    cumulative += weights[i];
    if (roll <= cumulative) {
      return events[i];
    }
  }
  
  return events[events.length - 1];
}

/**
 * Apply event effects to law process
 * @param {Object} event - Selected event
 * @param {Object} lawProcess - Current law process
 * @param {Object} state - Game state
 * @returns {Object} Log of applied effects
 */
export function applyEventEffects(event, lawProcess, state) {
  const log = [];
  
  if (!event.effects) return log;
  
  // Apply meter deltas
  if (event.effects.meters) {
    Object.entries(event.effects.meters).forEach(([meter, delta]) => {
      const oldValue = lawProcess.meters[meter] || 0;
      const newValue = clampMeter(oldValue + delta);
      lawProcess.meters[meter] = newValue;
      const deltaLabel = delta >= 0 ? `+${delta.toFixed(2)}` : `${delta.toFixed(2)}`;
      log.push(`  ${meter}: ${oldValue.toFixed(2)} → ${newValue.toFixed(2)} (${deltaLabel})`);
    });
  }

  // Apply progress delta
  if (event.effects.progress !== undefined) {
    const oldProgress = lawProcess.phaseProgress;
    const adjustedDelta = event.effects.progress * PHASE_PROGRESS_MULTIPLIER;
    const newProgress = clamp(
      oldProgress + adjustedDelta,
      0,
      MAX_PHASE_PROGRESS
    );

    lawProcess.phaseProgress = newProgress;
    const deltaLabel = adjustedDelta >= 0 ? `+${adjustedDelta.toFixed(3)}` : `${adjustedDelta.toFixed(3)}`;
    log.push(`  Phase progress: ${oldProgress.toFixed(2)} → ${newProgress.toFixed(2)} (${deltaLabel})`);
  }

  // Apply empire-specific effects
  if (event.effects.empire_relations) {
    Object.entries(event.effects.empire_relations).forEach(([empireId, delta]) => {
      const empire = state.empires.find(e => e.id === empireId);
      if (empire) {
        // This could affect approval or other stats
        const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
        log.push(`  ${empire.name} relations: ${deltaLabel}`);
      }
    });
  }

  
  return log;
}

/**
 * Advance to next phase if threshold reached
 * @param {Object} lawProcess - Current law process
 * @returns {boolean} True if phase advanced
 */
export function checkPhaseAdvancement(lawProcess) {
  const currentPhaseIndex = PHASE_ORDER.indexOf(lawProcess.phase);
  const threshold = PHASE_THRESHOLDS[lawProcess.phase];
  
  if (lawProcess.phaseProgress >= threshold && currentPhaseIndex < PHASE_ORDER.length - 1) {
    lawProcess.phase = PHASE_ORDER[currentPhaseIndex + 1];
    lawProcess.phaseProgress = 0;
    return true;
  }
  
  return false;
}

/**
 * LEGITIMACY: Primary effect - reduces unrest consequences and improves vote threshold
 * Higher legitimacy means the law process is seen as valid, reducing backlash.
 * 
 * @param {Object} lawProcess - Current law process
 * @returns {number} Unrest damage multiplier (0.3 to 1.0, lower = less damage)
 */
export function getLegitimacyUnrestReduction(lawProcess) {
  const legitimacy = lawProcess.meters.legitimacy || 0.5;
  // High legitimacy (1.0) = 0.3x unrest damage, Low legitimacy (0) = 1.0x
  return 1.0 - (legitimacy * 0.7);
}

/**
 * UNREST: Primary effect - produces negative externalities
 * Called each law tick when unrest is high.
 * 
 * @param {Object} lawProcess - Current law process
 * @param {Object} state - Game state
 * @returns {Object} Externality effects applied { cohesionLoss, approvalLoss, insurrectionRisk }
 */
export function applyUnrestExternalities(lawProcess, state) {
  const unrest = lawProcess.meters.unrest || 0;
  const legitimacy = lawProcess.meters.legitimacy || 0.5;
  
  // No effect below 0.3 unrest
  if (unrest < 0.3) {
    return { cohesionLoss: 0, approvalLoss: 0, insurrectionRisk: 0 };
  }
  
  // Legitimacy reduces unrest damage
  const damageMultiplier = getLegitimacyUnrestReduction(lawProcess);
  
  // Scale effects by unrest level above threshold
  const unrestSeverity = (unrest - 0.3) / 0.7;  // 0 to 1 for unrest 0.3 to 1.0
  
  // Cohesion loss: up to -2 per tick at max unrest
  const cohesionLoss = Math.floor(unrestSeverity * 2 * damageMultiplier);
  if (cohesionLoss > 0) {
    state.coalitionCohesion = clamp(state.coalitionCohesion - cohesionLoss, 0, 100);
  }
  
  // Approval loss to all empires: up to -3 per tick at max unrest
  const approvalLoss = Math.floor(unrestSeverity * 3 * damageMultiplier);
  if (approvalLoss > 0) {
    state.empires.forEach(empire => {
      empire.approval = clamp(empire.approval - approvalLoss, -100, 100);
    });
  }
  
  // Insurrection risk: increases army aggravation
  const insurrectionRisk = Math.floor(unrestSeverity * 5 * damageMultiplier);
  if (insurrectionRisk > 0 && state.armies) {
    state.armies.forEach(army => {
      if (!army.isScourge && !army.isInsurrection) {
        army.aggravation = clamp((army.aggravation || 0) + insurrectionRisk, 0, 100);
      }
    });
  }
  
  return { cohesionLoss, approvalLoss, insurrectionRisk };
}

/**
 * Check and enforce burial rule (4th reject)
 * @param {Object} lawProcess - Current law process
 * @param {Object} state - Game state
 * @returns {boolean} True if law was buried
 */
export function checkBurialRule(lawProcess, state) {
  if (lawProcess.rejects >= 4) {
    lawProcess.phase = 'BURIED';
    
    // Apply burial consequences
    // Supporters annoyed, opponents satisfied
    Object.entries(lawProcess.empireStances).forEach(([empireId, stance]) => {
      const empire = state.empires.find(e => e.id === empireId);
      if (!empire) return;
      
      if (stance.stance_tier === 'LAUD' || stance.stance_tier === 'APPROVE') {
        // Supporters lose approval
        empire.approval = clamp(empire.approval - 5, 0, 100);
      } else if (stance.stance_tier === 'DENOUNCE' || stance.stance_tier === 'DISAPPROVE') {
        // Opponents gain approval
        empire.approval = clamp(empire.approval + 3, 0, 100);
      }
    });
    
    return true;
  }
  
  return false;
}
