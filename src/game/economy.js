import { ECONOMY_CONSTANTS } from './constants.js';
import { clampStat } from './cohesion.js';
import { getLogger } from '../modules/logger.js';

/**
 * Consumes supplies based on army needs
 * Applies penalties if supplies are insufficient
 * @param {Object} state - The game state
 * @returns {Object} { log: string[] } - Log messages
 */
export function consumeSupplies(state) {
  const logger = getLogger();
  const log = [];
  let totalNeeded = 0;
  
  state.armies.forEach(army => {
    totalNeeded += army.supplyNeed;
  });
  
  logger.debug(`Supply consumption: needed=${totalNeeded.toFixed(1)}, available=${state.stockpiles.supplies}`);
  
  if (state.stockpiles.supplies >= totalNeeded) {
    state.stockpiles.supplies -= totalNeeded;
    logger.debug(`Supplies consumed: ${totalNeeded.toFixed(1)}, remaining=${state.stockpiles.supplies.toFixed(1)}`);
  } else {
    // Shortage
    const hadSupplies = state.stockpiles.supplies;
    const shortage = totalNeeded - hadSupplies;
    state.stockpiles.supplies = 0;
    
    state.armies.forEach(army => {
      if (army.supplyNeed > 0) {
        const shortageRatio = shortage / totalNeeded;
        army.organization = clampStat(army.organization - ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_ORG_PENALTY * shortageRatio);
        army.aggravation = clampStat(army.aggravation + ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_AGGRAVATION_INCREASE * shortageRatio);
      }
    });
    
    logger.warn(`Supply shortage! Needed ${totalNeeded.toFixed(1)}, had ${hadSupplies.toFixed(1)}, shortage=${shortage.toFixed(1)}`);
    log.push(`Supply shortage! Organizations and Aggravation affected.`);
  }
  
  return { log };
}
