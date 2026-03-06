import { COHESION_TIERS, COHESION_PACING } from './constants.js';
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

function getPacingScale() {
  const baseline = Number(COHESION_PACING?.BASELINE_TICKS) || 1000;
  const target = Number(COHESION_PACING?.TARGET_TICKS) || 2000;
  if (baseline <= 0 || target <= 0) {
    return 1;
  }
  return baseline / target;
}

/**
 * Scale cohesion deltas so aggregate gains/losses match long-run pacing targets.
 * Positive values are gains, negative values are losses.
 */
export function scaleCohesionDelta(rawDelta) {
  const delta = Number(rawDelta);
  if (!Number.isFinite(delta) || delta === 0) {
    return 0;
  }

  const scaled = delta * getPacingScale();
  const minAbs = Math.max(0, Number(COHESION_PACING?.MIN_DELTA_ABS) || 0);
  if (minAbs > 0 && Math.abs(scaled) < minAbs) {
    return Math.sign(scaled) * minAbs;
  }
  return scaled;
}

export function applyScaledCoalitionCohesionDelta(state, rawDelta) {
  const delta = scaleCohesionDelta(rawDelta);
  state.coalitionCohesion = clampCohesion((state.coalitionCohesion || 0) + delta);
  return delta;
}

export function applyScaledScourgeCohesionDelta(state, rawDelta) {
  const delta = scaleCohesionDelta(rawDelta);
  state.scourgeCohesion = clampStat((state.scourgeCohesion || 0) + delta, 0, 100);
  return delta;
}

// Re-export utility functions for backward compatibility
export { clamp, clampStat, clampCohesion, clampApproval };
