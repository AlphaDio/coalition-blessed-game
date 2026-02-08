import { IMPROVEMENTS_CONSTANTS } from '../../constants.js';
import { getTieredImprovementRequests, generateImprovementSuggestions } from '../definitions.js';

export const SUGGESTION_MAX_DURATION = 45; // ticks before a suggestion expires

/**
 * Initialize improvements system in game state
 */
export function initializeImprovementsState() {
  return {
    requests: [], // Available improvement requests
    queue: [], // Improvements being built or active
    completed: [], // Archive of completed/removed improvements

    // Capacity limit (applies only to BUILDING improvements)
    maxTotalCapacity: IMPROVEMENTS_CONSTANTS.INITIAL_MAX_TOTAL_CAPACITY,

    // Current utilization (BUILDING only)
    currentCapacity: 0,

    // Sustainment ledgers (market-pooled sustainment model)
    pendingSustainmentDemand: {},
    pendingSustainmentNeedsByImprovement: {},
    fulfilledSustainmentReceipts: {},
    sustainmentCycleTurn: null,
    sustainmentResolvedTurn: null
  };
}

/**
 * Get sample improvement requests (for testing)
 */
export function getSampleImprovementRequests() {
  return getTieredImprovementRequests();
}

/**
 * Initialize improvement suggestions with proper empire assignment
 */
export function initializeImprovementSuggestions(state, rng = Math.random) {
  if (!state.improvements) {
    state.improvements = {
      requests: [],
      queue: [],
      completed: [],
      maxTotalCapacity: IMPROVEMENTS_CONSTANTS.INITIAL_MAX_TOTAL_CAPACITY,
      currentCapacity: 0,
      pendingSustainmentDemand: {},
      pendingSustainmentNeedsByImprovement: {},
      fulfilledSustainmentReceipts: {},
      sustainmentCycleTurn: null,
      sustainmentResolvedTurn: null
    };
  }
  state.improvements.requests = generateImprovementSuggestions(state, rng);
}

/**
 * Remove expired improvement suggestions (older than SUGGESTION_MAX_DURATION ticks)
 * @param {Object} state - Game state
 * @returns {number} Number of expired requests removed
 */
export function removeExpiredSuggestions(state) {
  if (!state.improvements?.requests || !state.turn) return 0;

  const expiredRequests = state.improvements.requests.filter(r =>
    r.requestedAt && (state.turn - r.requestedAt) > SUGGESTION_MAX_DURATION
  );

  const expiredKeys = new Set(expiredRequests.map(r => `${r.empireId || 'none'}:${r.id}`));
  state.improvements.requests = state.improvements.requests.filter(r => {
    const key = `${r.empireId || 'none'}:${r.id}`;
    return !expiredKeys.has(key);
  });

  return expiredRequests.length;
}
