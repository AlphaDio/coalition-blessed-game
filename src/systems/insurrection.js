// Insurrection spawning and internal battles

import { clamp } from '../state.js';

export const INSURRECTION_THRESHOLD = 80;
export const AGGRAVATION_DECAY = 2; // Per turn if well-funded
export const AGGRAVATION_INCREASE_UNDERFUNDED = 3; // Per turn if underfunded

export function updateAggravation(state) {
  state.armies.forEach(army => {
    const allocation = state.warFunds.allocations[army.id] || 0;
    const expectedShare = 100 / state.armies.length; // Fair share
    const isUnderfunded = allocation < expectedShare * 0.7; // 30% below fair share

    if (isUnderfunded) {
      army.aggravation = clamp(army.aggravation + AGGRAVATION_INCREASE_UNDERFUNDED, 0, 100);
    } else if (allocation > expectedShare * 1.2) {
      // Well-funded armies reduce aggravation
      army.aggravation = clamp(army.aggravation - AGGRAVATION_DECAY, 0, 100);
    }
  });
}

export function checkInsurrectionSpawning(state) {
  const aggravatedArmies = state.armies.filter(a => a.aggravation >= INSURRECTION_THRESHOLD);
  
  if (aggravatedArmies.length > 0 && state.insurrections.length === 0) {
    // Spawn new insurrection
    const insurrection = {
      id: `insurrection_${state.turn}`,
      armies: aggravatedArmies.map(a => a.id),
      strength: aggravatedArmies.reduce((sum, a) => sum + a.aggravation, 0) / aggravatedArmies.length
    };
    state.insurrections.push(insurrection);
    state.log.push(`INSURRECTION! ${aggravatedArmies.length} army/armies have rebelled`);
    return true;
  }
  return false;
}

export function resolveInsurrections(state, rng) {
  if (state.insurrections.length === 0) return;

  state.insurrections.forEach(insurrection => {
    const insurrectionArmies = state.armies.filter(a => insurrection.armies.includes(a.id));
    const loyalArmies = state.armies.filter(a => !insurrection.armies.includes(a.id));

    if (insurrectionArmies.length === 0 || loyalArmies.length === 0) {
      // Auto-resolve edge cases
      state.insurrections = state.insurrections.filter(i => i.id !== insurrection.id);
      return;
    }

    // Use battles system
    const { resolveInsurrectionBattle } = await import('./battles.js');
    const result = resolveInsurrectionBattle(state, loyalArmies, insurrectionArmies, rng);

    if (result.coalitionWins) {
      // Remove insurrection
      state.insurrections = state.insurrections.filter(i => i.id !== insurrection.id);
    }
  });
}
