import { createLawProcess } from '../types.js';
import {
  applyEventEffects,
  buildLawContext,
  checkBurialRule,
  checkPhaseAdvancement,
  filterEligibleEvents,
  MAX_PHASE_PROGRESS,
  pickEvents
} from '../lawEngine.js';
import { canStartLaw } from '../lawDefinitions.js';
import { clamp } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { updateCoalitionColor } from '../coalitionColor.js';
import {
  applyHeroLawPressure,
  applyHeroLawTension,
  runHeroPassives,
  triggerHeroAbilities
} from '../heroes.js';
import { filterLawLogs } from './logs.js';
import { getLawProgressSpeedMultiplier } from './progress.js';
import { applyLawImmediateEffects, applyLawModifiers, removeLawModifiers } from './modifiers.js';
import { calculateEmpireStances } from './stances.js';
import { getLawEvents } from './events.js';

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
  applyHeroLawTension(state, lawProcess, log);

  return { success: true, log };
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
    log.push(`  Stalemate pressure: ${oldProgress.toFixed(2)} â†’ ${lawProcess.phaseProgress.toFixed(2)}`);

    lawProcess.meters.momentum = clamp((lawProcess.meters.momentum || 0) + 0.015, 0, 1);
    lawProcess.meters.reject_pressure = clamp((lawProcess.meters.reject_pressure || 0) - 0.02, 0, 1);
  }

  if (lawProcess.phaseTicks >= 50 && lawProcess.phaseProgress < 0.4) {
    const progressSpeed = getLawProgressSpeedMultiplier(state);
    const nudge = clamp((0.03 + (lawProcess.phaseTicks - 50) * 0.003) * progressSpeed, 0.03, 0.08);
    const oldProgress = lawProcess.phaseProgress;
    lawProcess.phaseProgress = clamp(lawProcess.phaseProgress + nudge, 0, MAX_PHASE_PROGRESS);
    log.push(`  Deadlock nudge: ${oldProgress.toFixed(2)} â†’ ${lawProcess.phaseProgress.toFixed(2)}`);

    lawProcess.meters.momentum = clamp((lawProcess.meters.momentum || 0) + 0.025, 0, 1);
    lawProcess.meters.reject_pressure = clamp((lawProcess.meters.reject_pressure || 0) - 0.03, 0, 1);
  }

  // Hero phase-tick passives + law pressure
  runHeroPassives(state, lawProcess, lawDef, 'OnTick', log);
  applyHeroLawPressure(state, lawProcess, lawDef, log);
  applyHeroLawTension(state, lawProcess, log);
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
    applyHeroLawTension(state, lawProcess, log);

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
 * Update player influence (call each tick)
 * @param {Object} state - Game state
 */
export function updatePlayerInfluence(state) {
  state.playerInfluence = (state.playerInfluence || 0) + 1;
  state.influenceProgress = 0;
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
    const coalitionDelayMultiplier = state.coalitionModifiers?.tick_delay_multiplier || 1.0;
    const ticksNeeded = Math.max(1, Math.round(state.lawProcesses.length * tickDelayMultiplier * coalitionDelayMultiplier));

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
