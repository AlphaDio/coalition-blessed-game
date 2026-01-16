import { INSURRECTION_CONSTANTS } from './constants.js';
import { createInsurrection } from './types.js';

export function checkInsurrections(state) {
  const log = [];
  
  // Check for armies that should rebel
  const rebelliousArmies = state.armies.filter(army => army.aggravation >= INSURRECTION_CONSTANTS.THRESHOLD);
  
  if (rebelliousArmies.length > 0 && state.insurrections.length === 0) {
    // Spawn new insurrection
    const insurrection = createInsurrection(
      `insurrection_${state.turn}`,
      rebelliousArmies.map(a => a.id),
      rebelliousArmies.reduce((sum, a) => sum + a.aggravation, 0) / rebelliousArmies.length
    );
    state.insurrections.push(insurrection);
    log.push(`INSURRECTION! ${rebelliousArmies.length} armies rebel!`);
  }
  
  // Remove resolved insurrections
  state.insurrections = state.insurrections.filter(ins => ins.active);
  
  return { log };
}
