import { calculateReaction, getReactionTier } from '../reactions.js';
import { createEmpireStance } from '../types.js';

/**
 * Constants for support bias calculations
 */
const SUPPORT_BIAS_CONSTANTS = {
  // Normalization for population factor: log10(1000) â‰ˆ 3, log10(10000) â‰ˆ 4
  // Dividing by 4 gives us a 0.75-1.0 range for typical populations
  POPULATION_LOG_DIVISOR: 4,
  DEFAULT_POPULATION: 1000
};

/**
 * Calculate empire stances for a law
 * @param {Object} lawProcess - Law process
 * @param {Object} lawDef - Law definition
 * @param {Object} state - Game state
 */
export function calculateEmpireStances(lawProcess, lawDef, state) {
  state.empires.forEach(empire => {
    // Convert law definition to format expected by calculateReaction
    const lawForReaction = {
      vector: lawDef.axis_vector,
      weights: {}, // Could derive from axis_vector
      tag_effects: []
    };

    // Fill weights from axis_vector
    Object.keys(lawDef.axis_vector).forEach(axis => {
      lawForReaction.weights[axis] = 1.0;
    });

    // Calculate base reaction
    const reaction = calculateReaction(empire, lawForReaction);

    // Apply support weight biases
    const biasedScore = applyLawSupportBias(
      reaction.score,
      empire,
      lawDef,
      state
    );

    // Determine stance tier from biased score
    const stanceTier = getReactionTier(biasedScore);

    // Determine initial vote intent
    let voteIntent = 'abstain';
    if (stanceTier === 'laud' || stanceTier === 'approve') {
      voteIntent = 'support';
    } else if (stanceTier === 'denounce' || stanceTier === 'disapprove') {
      voteIntent = 'oppose';
    }

    const stance = createEmpireStance(empire.id, biasedScore, stanceTier.toUpperCase(), voteIntent);
    lawProcess.empireStances[empire.id] = stance;
  });
}

/**
 * Apply law support biases (population, security, economy incentives)
 * @param {number} baseScore - Base alignment score
 * @param {Object} empire - Empire
 * @param {Object} lawDef - Law definition
 * @param {Object} state - Game state
 * @returns {number} Biased score
 */
export function applyLawSupportBias(baseScore, empire, lawDef, state) {
  let bias = 0;

  // Population incentive - large empires support laws benefiting populace
  if (lawDef.support_weights.population_incentive) {
    const popFactor = Math.log10(empire.stats.population || SUPPORT_BIAS_CONSTANTS.DEFAULT_POPULATION)
                      / SUPPORT_BIAS_CONSTANTS.POPULATION_LOG_DIVISOR;
    bias += lawDef.support_weights.population_incentive * popFactor * 0.2;
  }

  // Security incentive - empires support security laws when under threat
  if (lawDef.support_weights.security_incentive) {
    // Could check for active wars, scourge threat, etc.
    const threatLevel = state.scourgeCohesion / 100; // Higher scourge = higher threat
    bias += lawDef.support_weights.security_incentive * threatLevel * 0.15;
  }

  // Economy incentive - empires support stabilization laws during recession
  if (lawDef.support_weights.economy_incentive) {
    // Could check stockpile levels, cohesion for economic stress
    const economicStress = (100 - state.coalitionCohesion) / 100;
    bias += lawDef.support_weights.economy_incentive * economicStress * 0.15;
  }

  return baseScore + bias;
}
