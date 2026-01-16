import { REACTION_CONSTANTS } from './constants.js';
import { clamp } from '../utils/math.js';

/**
 * Calculate alignment score between empire values and law vector
 * @param {Object} empire - Empire with values, tags, and modifiers
 * @param {Object} law - Law with vector, weights, and tag_effects
 * @returns {Object} - { alignment, intensity, reaction, pressure }
 */
export function calculateReaction(empire, law) {
  // 1. Calculate base alignment from value axes
  let rawAlignment = 0;
  let totalWeight = 0;

  // Get all axes present in law vector
  const axes = Object.keys(law.vector || {});
  
  if (axes.length === 0) {
    // No vector data, fall back to neutral
    return {
      alignment: 0,
      intensity: 1.0,
      reaction: 'neutral',
      pressure: 0
    };
  }

  axes.forEach(axis => {
    const empireValue = empire.values?.[axis] || 0;
    const lawVector = law.vector[axis];
    const lawWeight = law.weights?.[axis] || 1.0;
    
    // Apply axis gate from empire modifiers (dampens certain axes)
    const axisGate = empire.modifiers?.axis_gates?.[axis] || 1.0;
    const effectiveWeight = lawWeight * axisGate;
    
    rawAlignment += empireValue * lawVector * effectiveWeight;
    totalWeight += effectiveWeight;
  });

  // Normalize alignment to [-1..+1]
  let alignment = totalWeight > 0 ? rawAlignment / totalWeight : 0;

  // 2. Apply tag effects
  let intensity = empire.modifiers?.intensity || 1.0;
  
  if (law.tag_effects && Array.isArray(law.tag_effects)) {
    law.tag_effects.forEach(tagEffect => {
      const hasTag = empire.tags?.includes(tagEffect.if_empire_has_tag);
      
      if (hasTag) {
        // Add alignment offset
        if (tagEffect.add_alignment !== undefined) {
          alignment += tagEffect.add_alignment;
        }
        
        // Multiply intensity
        if (tagEffect.multiply_intensity !== undefined) {
          intensity *= tagEffect.multiply_intensity;
        }
        
        // Note: gate_axis feature is defined in the schema but not yet implemented
        // To implement it properly would require recalculating alignment with the gate applied
        // For now, use empire.modifiers.axis_gates which applies during initial calculation
      }
    });
  }

  // Clamp alignment to [-1..+1]
  alignment = clamp(alignment, -1, 1);

  // 3. Calculate final score with intensity
  const score = alignment * intensity;

  // 4. Convert to discrete reaction
  const reaction = getReactionTier(score);

  // 5. Calculate power/pressure
  const population = empire.stats?.population || 1000;
  const influence = empire.stats?.influence || 50;
  const popExponent = REACTION_CONSTANTS.POWER_SCALING.POP_EXPONENT;
  const pressure = influence * Math.pow(population, popExponent);

  return {
    alignment,
    intensity,
    score,
    reaction,
    pressure
  };
}

/**
 * Convert alignment score to reaction tier
 * @param {number} score - Alignment score * intensity
 * @returns {string} - Reaction tier name
 */
export function getReactionTier(score) {
  const { LAUD, APPROVE, DISAPPROVE, DENOUNCE } = REACTION_CONSTANTS.THRESHOLDS;
  
  if (score >= LAUD) return 'laud';
  if (score >= APPROVE) return 'approve';
  if (score <= DENOUNCE) return 'denounce';
  if (score <= DISAPPROVE) return 'disapprove';
  return 'neutral';
}

/**
 * Calculate approval change based on reaction
 * @param {string} reaction - Reaction tier
 * @param {number} pressure - Empire's influence pressure
 * @returns {number} - Approval change
 */
export function getApprovalChange(reaction, pressure = 1) {
  const baseChanges = {
    'laud': 15,
    'approve': 8,
    'neutral': 0,
    'disapprove': -8,
    'denounce': -15
  };
  
  const baseChange = baseChanges[reaction] || 0;
  
  // Scale by pressure (normalized to reasonable range)
  // Pressure can be large, so we use a logarithmic scale
  // Using PRESSURE_LOG_DIVISOR to normalize log10(pressure) to ~0.2-1.5 range
  const pressureScale = Math.log10(pressure + 1) / REACTION_CONSTANTS.POWER_SCALING.PRESSURE_LOG_DIVISOR;
  const scaledChange = baseChange * clamp(pressureScale, 0.5, 2.0);
  
  return Math.round(scaledChange);
}

/**
 * Calculate empire reactions to a law and generate approval changes
 * @param {Array} empires - List of empires
 * @param {Object} law - Law being enacted
 * @returns {Object} - Map of empire ID to reaction data
 */
export function calculateLawReactions(empires, law) {
  const reactions = {};
  
  empires.forEach(empire => {
    const reaction = calculateReaction(empire, law);
    const approvalChange = getApprovalChange(reaction.reaction, reaction.pressure);
    
    reactions[empire.id] = {
      ...reaction,
      approvalChange
    };
  });
  
  return reactions;
}
