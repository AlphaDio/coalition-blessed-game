import { ECONOMY_CONSTANTS } from './constants.js';
import { clampStat } from './cohesion.js';
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
    logger.debug(`Requisition consumed: ${totalNeeded.toFixed(1)}, remaining=${state.coalitionEconomy.requisition.toFixed(1)}`);
  } else {
    // Shortage
    const hadRequisition = requisition;
    const shortage = totalNeeded - hadRequisition;
    state.coalitionEconomy.requisition = 0;
    
    state.armies.forEach(army => {
      if (army.supplyNeed > 0) {
        const shortageRatio = shortage / totalNeeded;
        army.organization = clampStat(army.organization - ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_ORG_PENALTY * shortageRatio);
        army.aggravation = clampStat(army.aggravation + ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_AGGRAVATION_INCREASE * shortageRatio);
      }
    });
    
    logger.warn(`Requisition shortage! Needed ${totalNeeded.toFixed(1)}, had ${hadRequisition.toFixed(1)}, shortage=${shortage.toFixed(1)}`);
    log.push(`Requisition shortage! Organizations and Aggravation affected.`);
  }
  
  return { log };
}
