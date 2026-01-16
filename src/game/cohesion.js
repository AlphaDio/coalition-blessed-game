import { COHESION_TIERS } from './constants.js';

export function getCohesionTier(cohesion) {
  if (cohesion >= COHESION_TIERS.TIER_1.min && cohesion <= COHESION_TIERS.TIER_1.max) {
    return COHESION_TIERS.TIER_1;
  }
  if (cohesion >= COHESION_TIERS.TIER_2.min && cohesion <= COHESION_TIERS.TIER_2.max) {
    return COHESION_TIERS.TIER_2;
  }
  if (cohesion >= COHESION_TIERS.TIER_3.min && cohesion <= COHESION_TIERS.TIER_3.max) {
    return COHESION_TIERS.TIER_3;
  }
  return null; // Game over
}

export function clampCohesion(cohesion) {
  return Math.max(0, Math.min(100, cohesion));
}

export function clampApproval(approval) {
  return Math.max(-100, Math.min(100, approval));
}

export function clampStat(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
