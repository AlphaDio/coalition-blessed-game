// Scourge cohesion and fervor scaling

import { clamp } from '../state.js';

export const SCOURGE_FERVOR_GROWTH = 0.5; // Per turn
export const SCOURGE_FERVOR_MAX = 50;
export const SCOURGE_BATTLE_MULTIPLIER = 0.1; // Fervor * this = power bonus

export function updateScourgeFervor(state) {
  state.scourgeFervor = clamp(
    state.scourgeFervor + SCOURGE_FERVOR_GROWTH,
    0,
    SCOURGE_FERVOR_MAX
  );
  return state;
}

export function modifyScourgeCohesion(state, delta, reason = '') {
  const newCohesion = clamp(state.scourgeCohesion + delta, 0, 100);
  const change = newCohesion - state.coalitionCohesion;
  if (change !== 0) {
    state.log.push(`Scourge Cohesion ${delta > 0 ? '+' : ''}${delta.toFixed(1)} (${reason})`);
  }
  state.scourgeCohesion = newCohesion;
  return state;
}

export function getScourgeBattlePower(basePower, rng) {
  const fervorBonus = state.scourgeFervor * SCOURGE_BATTLE_MULTIPLIER;
  const noise = (rng() - 0.5) * 0.2; // ±10% random variation
  return basePower * (1 + fervorBonus + noise);
}
