// Math utility functions

/**
 * Clamps a value between a minimum and maximum
 * @param {number} value - The value to clamp
 * @param {number} min - The minimum allowed value
 * @param {number} max - The maximum allowed value
 * @returns {number} The clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamps a stat value between 0 and 100 (or custom range)
 * @param {number} value - The value to clamp
 * @param {number} min - The minimum allowed value (default: 0)
 * @param {number} max - The maximum allowed value (default: 100)
 * @returns {number} The clamped value
 */
export function clampStat(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamps cohesion value between 0 and 100
 * @param {number} cohesion - The cohesion value to clamp
 * @returns {number} The clamped cohesion value
 */
export function clampCohesion(cohesion) {
  return Math.max(0, Math.min(100, cohesion));
}

/**
 * Clamps approval value between -100 and 100
 * @param {number} approval - The approval value to clamp
 * @returns {number} The clamped approval value
 */
export function clampApproval(approval) {
  return Math.max(-100, Math.min(100, approval));
}

/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} A random integer
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a random float between min and max
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} A random float
 */
export function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}
