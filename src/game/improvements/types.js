// Constants for sustainment and modifier scaling
export const MODIFIER_ARMY_ORG_SCALE = 10; // Divide by 10 for gradual application
export const MODIFIER_EMPIRE_APPROVAL_SCALE = 100; // Divide by 100 for gradual application
export const POPULATION_GROWTH_SCALE = 100; // Convert percentage-based modifiers to ratios
export const BIOLOGIC_TAG = 'biologic';
export const BIOLOGIC_GROWTH_BONUS_MULTIPLIER = 1.5;
export const IMPROVEMENT_SUSTAINMENT_TICKS = 10; // Number of ticks of buffer before degradation
// Sustainment define values are scaled so "1-5" remains tame at typical populations.
// At population ~1000 with base rationing (0.10), demand ~= define value.
export const IMPROVEMENT_SUSTAINMENT_SCALE = 0.01;

/**
 * Check if an improvement has a specific tag
 */
export function improvementHasTag(improvement, tag) {
  if (!improvement) return false;
  return improvement.tags && improvement.tags.includes(tag);
}
