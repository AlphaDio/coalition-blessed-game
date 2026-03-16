import { getLogger } from '../../modules/logger.js';
import { checkBurialRule, clampMeter } from '../lawEngine.js';
import { clamp, applyScaledCoalitionCohesionDelta } from '../cohesion.js';
import { filterLawLogs } from './logs.js';

/**
 * Get law events (stub - would load from content)
 * @param {Object} state - Game state
 * @param {Object} lawDef - Law definition
 * @returns {Array} Law events
 */
export function getLawEvents(state, lawDef) {
  // This would normally load from state.events filtered for scope: LAW
  // For now, return empty array - events will be loaded from modules
  return state.events.filter(e => e.scope === 'LAW') || [];
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
      if (lawProcess.proposalId && Array.isArray(state.proposedLaws)) {
        const proposal = state.proposedLaws.find((entry) => entry.proposalId === lawProcess.proposalId);
        if (proposal) {
          proposal.status = 'WITHDRAWN';
        }
      }

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
      log.push(`  ${meter}: ${oldValue.toFixed(2)} â†’ ${newValue.toFixed(2)} (${deltaLabel})`);
    });
  }

  // Apply progress delta
  if (effects.progress !== undefined) {
    const oldProgress = lawProcess.phaseProgress;
    const newProgress = Math.max(0, Math.min(oldProgress + effects.progress, 2.0));
    lawProcess.phaseProgress = newProgress;
    const deltaLabel = effects.progress >= 0 ? `+${effects.progress.toFixed(2)}` : `${effects.progress.toFixed(2)}`;
    log.push(`  Phase progress: ${oldProgress.toFixed(2)} â†’ ${newProgress.toFixed(2)} (${deltaLabel})`);
  }


  // Apply game-state effects (used by enactment events and choice events)
  if (effects.coalitionCohesion && state) {
    const delta = applyScaledCoalitionCohesionDelta(state, effects.coalitionCohesion);
    log.push(`  Coalition cohesion: ${delta >= 0 ? "+" : ""}${delta}`);
  }

  if (effects.approval && state && Array.isArray(state.empires)) {
    state.empires.forEach(empire => {
      empire.approval = clamp(empire.approval + effects.approval, -100, 100);
    });
    log.push(`  All empire approval: ${effects.approval >= 0 ? "+" : ""}${effects.approval}`);
  }

  if (effects.requisition && state) {
    if (!state.coalitionEconomy) {
      state.coalitionEconomy = { requisition: 0, treasury_credits: 0, allowance_credits: 0, consumption_requisition_pool: 0, consumption_requisition_pool_turns: 0 };
    }
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + effects.requisition;
    log.push(`  Requisition: ${effects.requisition >= 0 ? "+" : ""}${effects.requisition}`);
  }

  if (effects.credits && state) {
    if (!state.coalitionEconomy) {
      state.coalitionEconomy = { requisition: 0, treasury_credits: 0, allowance_credits: 0, consumption_requisition_pool: 0, consumption_requisition_pool_turns: 0 };
    }
    state.coalitionEconomy.treasury_credits = (state.coalitionEconomy.treasury_credits || 0) + effects.credits;
    log.push(`  Treasury credits: ${effects.credits >= 0 ? "+" : ""}${effects.credits}`);
  }

  if (effects.coalitionIntel && state) {
    state.coalitionIntel = (state.coalitionIntel || 0) + effects.coalitionIntel;
    log.push(`  Coalition intel: ${effects.coalitionIntel >= 0 ? "+" : ""}${effects.coalitionIntel}`);
  }

  if (effects.influence && state) {
    state.playerInfluence = (state.playerInfluence || 0) + effects.influence;
    log.push(`  Influence: ${effects.influence >= 0 ? "+" : ""}${effects.influence}`);
  }

  return log;
}
