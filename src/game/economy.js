import { ECONOMY_CONSTANTS } from './constants.js';
import { clampStat, applyScaledCoalitionCohesionDelta } from './cohesion.js';
import { getLogger } from '../modules/logger.js';

/**
 * Consumes requisition based on army needs
 * Applies penalties if requisition is insufficient
 * @param {Object} state - The game state
 * @returns {Object} { log: string[] } - Log messages
 */
export function consumeRequisition(state) {
  const logger = getLogger();
  const log = [];
  let totalNeeded = 0;
  
  state.armies.forEach(army => {
    totalNeeded += army.supplyNeed || 0;
  });
  
  const requisition = state.coalitionEconomy?.requisition || 0;
  logger.debug(`Requisition consumption: needed=${totalNeeded.toFixed(1)}, available=${requisition}`);
  
  if (requisition >= totalNeeded) {
    state.coalitionEconomy.requisition = requisition - totalNeeded;
    const message = `Requisition consumed: ${totalNeeded.toFixed(1)}, remaining=${state.coalitionEconomy.requisition.toFixed(1)}`;
    logger.info(message);
    log.push(message);
  } else {
    // Shortage - allow requisition to go negative
    const hadRequisition = requisition;
    const shortage = totalNeeded - hadRequisition;
    state.coalitionEconomy.requisition = requisition - totalNeeded; // Can be negative
    
    state.armies.forEach(army => {
      if (army.supplyNeed > 0) {
        const shortageRatio = shortage / totalNeeded;
        army.organization = clampStat(army.organization - ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_ORG_PENALTY * shortageRatio);
        army.aggravation = clampStat(army.aggravation + ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_AGGRAVATION_INCREASE * shortageRatio);
      }
    });
    
    logger.warn(`Requisition shortage! Needed ${totalNeeded.toFixed(1)}, had ${hadRequisition.toFixed(1)}, shortage=${shortage.toFixed(1)}, requisition now: ${state.coalitionEconomy.requisition.toFixed(1)}`);
    const message = `Requisition shortage! Needed ${totalNeeded.toFixed(1)}, had ${hadRequisition.toFixed(1)}, shortage=${shortage.toFixed(1)}.`;
    logger.info(message);
    log.push(message);
  }
  
  return { log };
}

/**
 * Applies cohesion penalty based on negative requisition
 * For every NEGATIVE_REQUISITION_COHESION_DIVISOR points of negative requisition,
 * reduces cohesion by 1 point.
 * @param {Object} state - The game state
 * @returns {Object} { log: string[], cohesionLoss: number } - Log messages and cohesion loss amount
 */
export function applyNegativeRequisitionCohesionPenalty(state) {
  const logger = getLogger();
  const log = [];
  
  const requisition = state.coalitionEconomy?.requisition || 0;
  
  if (requisition < 0) {
    // Apply cohesion penalty based on configurable constant
    const cohesionLoss = Math.abs(requisition) / ECONOMY_CONSTANTS.NEGATIVE_REQUISITION_COHESION_DIVISOR;
    const prevCohesion = state.coalitionCohesion;
    const appliedCohesionDelta = applyScaledCoalitionCohesionDelta(state, -cohesionLoss);
    const appliedCohesionLoss = Math.abs(appliedCohesionDelta);
    
    if (appliedCohesionLoss > 0.01) { // Only log if significant
      logger.warn(`Negative requisition penalty: ${requisition.toFixed(1)} req -> -${appliedCohesionLoss.toFixed(2)} cohesion (${prevCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)})`);
      log.push(`{red-fg}Negative Requisition:{/red-fg} Coalition Cohesion ${prevCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCohesionLoss.toFixed(2)})`);
    }
    
    return { log, cohesionLoss: appliedCohesionLoss };
  }
  
  return { log, cohesionLoss: 0 };
}
