import { COHESION_TIERS } from './constants.js';
import { clamp, clampStat, clampCohesion, clampApproval } from '../utils/math.js';

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

// Re-export utility functions for backward compatibility
export { clamp, clampStat, clampCohesion, clampApproval };
