/**
 * Improvements UI Module
 *
 * UI rendering and statistics functions for improvements
 */

/**
 * Get improvement statistics for UI display
 */
export function getImprovementStats(state) {
  const improvements = state.improvements;
  const queue = improvements.queue;

  const building = queue.filter(i => i.state === 'BUILDING');
  const active = queue.filter(i => i.state === 'ACTIVE');
  const degraded = queue.filter(i => i.state === 'DEGRADED');

  return {
    total: queue.length,
    building: building.length,
    active: active.length,
    degraded: degraded.length,
    capacity: improvements.currentCapacity,
    maxCapacity: improvements.maxTotalCapacity,
    construction: state.coalitionConstruction,
    availableRequests: improvements.requests.length
  };
}