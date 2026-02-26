import { INSURRECTION_CONSTANTS } from './constants.js';
import { createInsurrection } from './types.js';
import { getLogger } from '../modules/logger.js';
import { isRegularArmy } from './turn/armyUtils.js';

export function checkInsurrections(state) {
  const logger = getLogger();
  const log = [];
  const activeInsurrections = (state.insurrections || []).filter(ins => ins?.active);
  
  // Check for armies that should rebel
  const rebelliousArmies = state.armies.filter(army =>
    isRegularArmy(army) &&
    army.aggravation >= INSURRECTION_CONSTANTS.THRESHOLD
  );
  
  if (rebelliousArmies.length > 0) {
    logger.debug(`Found ${rebelliousArmies.length} rebellious armies`, {
      armies: rebelliousArmies.map(a => ({ name: a.name, aggravation: a.aggravation }))
    });
  }
  
  if (rebelliousArmies.length > 0 && activeInsurrections.length === 0) {
    // Spawn new insurrection
    const avgAggravation = rebelliousArmies.reduce((sum, a) => sum + a.aggravation, 0) / rebelliousArmies.length;
    const insurrection = createInsurrection(
      `insurrection_${state.turn}`,
      rebelliousArmies.map(a => a.id),
      avgAggravation
    );
    state.insurrections.push(insurrection);
    // Reset aggravation after rebellion so the same armies don't instantly retrigger.
    rebelliousArmies.forEach(army => {
      army.aggravation = INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION;
    });
    logger.warn(`INSURRECTION! ${rebelliousArmies.length} armies rebel!`, {
      avgAggravation: avgAggravation.toFixed(1),
      armies: rebelliousArmies.map(a => a.name)
    });
    log.push(`INSURRECTION! ${rebelliousArmies.length} armies rebel!`);
  }
  
  // Remove resolved insurrections
  const beforeCount = state.insurrections.length;
  state.insurrections = state.insurrections.filter(ins => ins.active);
  if (state.insurrections.length < beforeCount) {
    logger.info(`Resolved ${beforeCount - state.insurrections.length} insurrection(s)`);
  }
  
  return { log };
}
