/**
 * Tag utility functions for matching entity tags
 */

/**
 * Normalize a tag for case-insensitive comparison
 * @param {string} tag - Tag to normalize
 * @returns {string} Normalized tag
 */
export function normalizeTag(tag) {
  return String(tag || '').toLowerCase();
}

/**
 * Check if a tags array contains a specific tag (case-insensitive)
 * @param {Array} tags - Array of tags
 * @param {string} targetTag - Tag to find
 * @returns {boolean} True if tag is found
 */
export function hasTag(tags, targetTag) {
  if (!Array.isArray(tags)) return false;
  const normalizedTarget = normalizeTag(targetTag);
  return tags.some(tag => normalizeTag(tag) === normalizedTarget);
}

/**
 * Check if an empire has a specific tag (checks both tags array and traits object)
 * @param {Object} empire - Empire object
 * @param {string} tag - Tag to find
 * @returns {boolean} True if empire has the tag
 */
export function empireHasTag(empire, tag) {
  if (!empire) return false;
  if (hasTag(empire.tags, tag)) return true;
  const traits = empire.traits || {};
  return Object.keys(traits).some(trait => normalizeTag(trait) === normalizeTag(tag) && traits[trait]);
}

/**
 * Check if an entity (army, improvement, etc.) has a specific tag
 * @param {Object} entity - Entity object with tags property
 * @param {string} tag - Tag to find
 * @returns {boolean} True if entity has the tag
 */
export function entityHasTag(entity, tag) {
  if (!entity) return false;
  return hasTag(entity.tags, tag);
}
