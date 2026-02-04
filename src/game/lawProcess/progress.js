/**
 * Get the law progress speed multiplier from coalition modifiers
 * @param {Object} state - Game state
 * @returns {number} Multiplier for law progress (1.0 = normal, 1.1 = 10% faster, etc.)
 */
export function getLawProgressSpeedMultiplier(state) {
  const baseSpeed = 1.0;
  const modifierBonus = state.coalitionModifiers?.law_progress_speed || 0;
  const tempBonus = state.coalitionModifiers?.lawProgressBonus || 0;
  const dynamicBonus = state.coalitionModifiers?.dynamic?.law_progress_speed_bonus || 0;
  return baseSpeed + modifierBonus + tempBonus + dynamicBonus;
}
