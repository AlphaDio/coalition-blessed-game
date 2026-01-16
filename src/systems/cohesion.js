// Coalition cohesion tiers and game over logic

import { getCohesionTier, clamp } from '../state.js';

export const COHESION_TIERS = {
  STABLE: { min: 67, max: 100, name: 'Stable' },
  STRAINED: { min: 34, max: 66, name: 'Strained' },
  DESPERATE: { min: 1, max: 33, name: 'Desperate' }
};

export function getCohesionTierInfo(cohesion) {
  const tier = getCohesionTier(cohesion);
  const tierData = Object.values(COHESION_TIERS)[tier - 1];
  return {
    tier,
    name: tierData.name,
    cohesion
  };
}

export function checkGameOver(state) {
  if (state.coalitionCohesion <= 0) {
    return { gameOver: true, victory: false, reason: 'Coalition collapsed' };
  }
  if (state.scourgeCohesion <= 0) {
    return { gameOver: true, victory: true, reason: 'Scourge defeated' };
  }
  return { gameOver: false };
}

export function modifyCohesion(state, delta, reason = '') {
  const newCohesion = clamp(state.coalitionCohesion + delta, 0, 100);
  const change = newCohesion - state.coalitionCohesion;
  if (change !== 0) {
    state.log.push(`Coalition Cohesion ${change > 0 ? '+' : ''}${change.toFixed(1)} (${reason})`);
  }
  state.coalitionCohesion = newCohesion;
  return state;
}

export function getTierPenalty(tier) {
  // Tier 1: no penalty, Tier 2: -5%, Tier 3: -15%
  return tier === 2 ? 0.05 : tier === 3 ? 0.15 : 0;
}

export function getEventFrequencyModifier(tier) {
  // Higher tier = more events (desperation)
  return tier === 3 ? 1.5 : tier === 2 ? 1.2 : 1.0;
}
