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
    maxTotalCapacity: 4,

    // Current utilization (BUILDING only)
    currentCapacity: 0
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
      maxTotalCapacity: 10,
      currentCapacity: 0
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

  const expiredIds = new Set(expiredRequests.map(r => r.id));
  state.improvements.requests = state.improvements.requests.filter(r => !expiredIds.has(r.id));

  return expiredRequests.length;
}
