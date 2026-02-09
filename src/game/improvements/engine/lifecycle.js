import { getLogger } from '../../../modules/logger.js';
import { createImprovement } from './core.js';
import { canStartImprovement, generateReplacementSuggestion } from '../definitions.js';
import { triggerHeroPassives } from '../../heroes.js';

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
    const tierCheck = canStartImprovement(request.definitionId || request.id, state, empireId);
    if (!tierCheck.canStart) {
      return { success: false, error: tierCheck.reason, log: [] };
    }
  }

  // Check requisition from coalition economy
  if (!state.coalitionEconomy) {
    return { success: false, error: 'Coalition economy not initialized', log: [] };
  }
  if (!state.coalitionEconomy.requisition) state.coalitionEconomy.requisition = 0;

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
  const improvement = createImprovement(request.id, empireId, state.turn, request);
  improvements.queue.push(improvement);
  const activeLawProcess = (state.lawProcesses || []).find(lp => lp.phase !== 'ENACTED' && lp.phase !== 'BURIED') || null;
  const activeLawDef = activeLawProcess
    ? state.lawDefinitions?.find(def => def.id === activeLawProcess.lawId) || null
    : null;
  const passiveLog = [];
  triggerHeroPassives(state, 'IMPROVEMENT_STARTED', {
    empireId,
    improvement,
    lawProcess: activeLawProcess,
    lawDef: activeLawDef
  }, passiveLog);

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
    log: [
      `{green-fg}Started:{/green-fg} ${improvement.name} (requisition: ${request.suppliesCost}, T${improvement.tier})`,
      ...passiveLog
    ]
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
