// Scourge prediction system - helps players anticipate attacks and prepare
import { SCOURGE_PREDICTION_CONSTANTS } from './constants.js';
import { getCohesionTier } from './cohesion.js';

/**
 * Calculate the predicted next Scourge battle and target
 * Uses a deterministic but uncertain estimation based on game state
 * @param {Object} state - Game state
 * @param {Function} rng - Random number generator
 * @returns {Object} Prediction with target, estimated turns, and confidence
 */
export function calculateScourgePrediction(state, rng) {
  if (!state.empires || state.empires.length === 0) {
    return createBlankPrediction();
  }

  // Predict the next target empire
  const targetSelection = selectScourgeTargetEmpire(state, rng);
  const targetEmpire = targetSelection?.empire;
  if (!targetEmpire) {
    return createBlankPrediction();
  }

  // Calculate target confidence modifier based on current game state
  let confidenceModifier = calculateConfidenceModifier(state);

  // Estimate when the next battle will occur
  const estimatedTurns = estimateTurnsToNextBattle(state, confidenceModifier, rng);

  // Determine the confidence level label
  let confidenceLevel = getConfidenceLevel(confidenceModifier);

  // Calculate uncertainty range based on confidence
  let uncertaintyRange = getUncertaintyRange(confidenceModifier);

  if (targetSelection.source === 'pending' || targetSelection.source === 'directed') {
    confidenceModifier = SCOURGE_PREDICTION_CONSTANTS.MAX_CONFIDENCE_MODIFIER;
    confidenceLevel = 'high';
    uncertaintyRange = getUncertaintyRange(SCOURGE_PREDICTION_CONSTANTS.MAX_CONFIDENCE_MODIFIER);
  }

  return {
    targetEmpireId: targetEmpire.id,
    estimatedTurnsToNextBattle: estimatedTurns,
    confidenceModifier,
    confidenceLevel,
    uncertaintyRange,
    targetingMode: targetSelection.source,
    directTargetIntelCost: SCOURGE_PREDICTION_CONSTANTS.DIRECT_TARGET_INTEL_COST
  };
}

/**
 * Select which empire will be the next Scourge target.
 * Pending attacks and intel directives override the default vulnerability logic.
 * @param {Object} state - Game state
 * @param {Function} rng - Random number generator
 * @returns {{empire: Object|null, source: string}} Selected target and source mode
 */
export function selectScourgeTargetEmpire(state, rng = Math.random) {
  if (!state.empires || state.empires.length === 0) {
    return { empire: null, source: 'calculated' };
  }

  const pendingEmpireId = state.pendingScourgeAttack?.targetEmpireId;
  if (pendingEmpireId) {
    const pendingEmpire = state.empires.find(empire => empire.id === pendingEmpireId);
    if (pendingEmpire) {
      return { empire: pendingEmpire, source: 'pending' };
    }
  }

  const directedEmpireId = state.scourgeDirectedTargetEmpireId;
  if (directedEmpireId) {
    const directedEmpire = state.empires.find(empire => empire.id === directedEmpireId);
    if (directedEmpire) {
      return { empire: directedEmpire, source: 'directed' };
    }
  }

  return {
    empire: predictNextScourgeTargetByVulnerability(state, rng),
    source: 'calculated'
  };
}

/**
 * Predict which empire will be the next Scourge target using normal targeting logic.
 * Uses a deterministic method based on empire properties.
 * @param {Object} state - Game state
 * @param {Function} rng - Random number generator
 * @returns {Object|null} Predicted target empire
 */
function predictNextScourgeTargetByVulnerability(state, rng) {
  if (!state.empires || state.empires.length === 0) return null;

  // If there's already a current target, predict after that
  let candidates = state.empires.filter(e => e.id !== state.scourgeTargetEmpireId);
  if (candidates.length === 0) candidates = state.empires;

  // Weight candidates by vulnerability (lower cohesion = more vulnerable = more likely to be targeted)
  // Also prefer empires with lower approval or stability
  const weighted = candidates.map(empire => {
    // Lower approval = higher vulnerability
    const approvalVulnerability = 100 - empire.approval;
    
    // Lower stability = higher vulnerability
    const stabilityVulnerability = 100 - empire.stability;
    
    // Empires with more armies might be prioritized differently
    const armyCount = state.armies?.filter(a => a.empireId === empire.id).length || 0;
    
    // Combine factors: targeting prefers vulnerable empires but still maintains some randomness
    const vulnerability = (approvalVulnerability * 0.4) + (stabilityVulnerability * 0.4) + (armyCount * 2);
    
    return {
      empire,
      vulnerability,
      // Deterministic seed based on turn and empire id for consistency
      seed: (state.turn * 7919 + empire.id.charCodeAt(0)) % 1000
    };
  });

  // Sort by vulnerability (higher = more likely) and seed for determinism
  weighted.sort((a, b) => {
    const vulnDiff = b.vulnerability - a.vulnerability;
    if (Math.abs(vulnDiff) > 5) return vulnDiff; // Strong vulnerability difference wins
    return a.seed - b.seed; // Use seed for secondary sort (deterministic)
  });

  // Pick from top candidates with slight randomness
  const numTopCandidates = Math.ceil(weighted.length * 0.3);
  const topCandidates = weighted.slice(0, Math.max(1, numTopCandidates));
  
  // Use rng to pick one, but weight toward the top
  const selectedIndex = Math.floor(Math.pow(rng(), 0.5) * topCandidates.length);
  return topCandidates[selectedIndex]?.empire || candidates[0];
}

/**
 * Calculate confidence modifier based on coalition cohesion and other factors
 * This represents how predictable the Scourge is being
 * @param {Object} state - Game state
 * @returns {number} Confidence modifier (1.0 = baseline)
 */
function calculateConfidenceModifier(state) {
  let modifier = SCOURGE_PREDICTION_CONSTANTS.BASE_CONFIDENCE_MODIFIER;

  const coalitionIntel = Math.max(0, Number(state.coalitionIntel) || 0);
  modifier += Math.min(
    SCOURGE_PREDICTION_CONSTANTS.MAX_INTEL_CONFIDENCE_BONUS,
    coalitionIntel * SCOURGE_PREDICTION_CONSTANTS.INTEL_CONFIDENCE_PER_POINT
  );

  // Cohesion tier affects predictability
  const tier = getCohesionTier(state.coalitionCohesion);
  if (tier?.name === 'Stable') {
    modifier += SCOURGE_PREDICTION_CONSTANTS.STABLE_BONUS;
  } else if (tier?.name === 'Strained') {
    modifier += SCOURGE_PREDICTION_CONSTANTS.STRAINED_PENALTY;
  } else if (tier?.name === 'Desperate') {
    modifier += SCOURGE_PREDICTION_CONSTANTS.DESPERATE_PENALTY;
  }

  // Scourge fervor affects predictability (higher fervor = more chaotic/less predictable)
  const fervorUnpredictability = (state.scourgeFervor / 50) * 0.1; // Up to +0.1 unpredictability
  modifier -= fervorUnpredictability;

  // Number of armies available affects predictability
  const armyCount = state.armies?.filter(a => a.organization > 30).length || 0;
  const avgArmyOrg =
    armyCount > 0
      ? state.armies.filter(a => a.organization > 30).reduce((sum, a) => sum + a.organization, 0) / armyCount
      : 0;

  // Higher organization = more predictable (organized response visible to Scourge)
  if (avgArmyOrg > 70) {
    modifier += 0.1;
  } else if (avgArmyOrg < 40) {
    modifier -= 0.1;
  }

  // Law modifiers can improve prediction (some laws help intel gathering)
  if (state.activeLaws && state.activeLaws.length > 0) {
    // Each active law that might relate to intelligence could add bonus
    const intelRelatedLaws = state.activeLaws.filter(
      law => law.lawId && (law.lawId.includes('intell') || law.lawId.includes('scout') || law.lawId.includes('fortif'))
    );
    modifier += intelRelatedLaws.length * 0.05;
  }

  // Clamp to valid range
  return Math.max(
    SCOURGE_PREDICTION_CONSTANTS.MIN_CONFIDENCE_MODIFIER,
    Math.min(SCOURGE_PREDICTION_CONSTANTS.MAX_CONFIDENCE_MODIFIER, modifier)
  );
}

/**
 * Estimate turns until next Scourge battle
 * @param {Object} state - Game state
 * @param {number} confidenceModifier - Current confidence modifier
 * @param {Function} rng - Random number generator
 * @returns {number|null} Estimated turns (null if no good estimate)
 */
function estimateTurnsToNextBattle(state, confidenceModifier, rng) {
  if (state.pendingScourgeAttack) {
    return 1;
  }

  // Get the base battle chance for the current cohesion tier
  const tier = getCohesionTier(state.coalitionCohesion);
  const baseBattleChance = getBattleChanceForTier(tier?.name);

  if (baseBattleChance === 0) return null;

  // Calculate expected value: average turns between battles = 1 / probability
  const expectedTurns = 1 / baseBattleChance;

  // Apply confidence modifier to reduce uncertainty
  // Higher modifier = more confident prediction = narrower spread
  const baseVariation = expectedTurns * 0.5; // Base ±50% variation
  const variationReduction = 1 - Math.min(0.7, (confidenceModifier - 1.0) * 0.5); // Reduce uncertainty with better confidence
  const actualVariation = baseVariation * variationReduction;

  // Add some randomness for non-determinism
  const noiseAmount = (rng() - 0.5) * 2 * actualVariation;
  const estimate = Math.max(1, Math.round(expectedTurns + noiseAmount));

  return estimate;
}

/**
 * Get battle chance for a given cohesion tier
 * Should match the game's actual battle chance calculation
 * @param {string} tierName - Cohesion tier name
 * @returns {number} Battle chance (0-1)
 */
function getBattleChanceForTier(tierName) {
  if (tierName === 'Strained') return 0.04;
  if (tierName === 'Desperate') return 0.06;
  return 0.02; // Stable
}

/**
 * Determine confidence level label
 * @param {number} confidenceModifier - Confidence modifier
 * @returns {string} Confidence level: 'low', 'medium', or 'high'
 */
function getConfidenceLevel(confidenceModifier) {
  if (confidenceModifier >= 1.5) return 'high';
  if (confidenceModifier >= 1.0) return 'medium';
  return 'low';
}

/**
 * Get uncertainty range based on confidence modifier
 * @param {number} confidenceModifier - Confidence modifier
 * @returns {Object} Range with min and max turn estimates
 */
function getUncertaintyRange(confidenceModifier) {
  if (confidenceModifier >= 1.5) {
    return { ...SCOURGE_PREDICTION_CONSTANTS.UNCERTAINTY_RANGE_HIGH };
  }
  if (confidenceModifier >= 1.0) {
    return { ...SCOURGE_PREDICTION_CONSTANTS.UNCERTAINTY_RANGE_MEDIUM };
  }
  return { ...SCOURGE_PREDICTION_CONSTANTS.UNCERTAINTY_RANGE_LOW };
}

/**
 * Create a blank prediction when unable to predict
 * @returns {Object} Blank prediction
 */
function createBlankPrediction() {
  return {
    targetEmpireId: null,
    estimatedTurnsToNextBattle: null,
    confidenceModifier: SCOURGE_PREDICTION_CONSTANTS.BASE_CONFIDENCE_MODIFIER,
    confidenceLevel: 'low',
    uncertaintyRange: { min: null, max: null },
    targetingMode: 'calculated',
    directTargetIntelCost: SCOURGE_PREDICTION_CONSTANTS.DIRECT_TARGET_INTEL_COST
  };
}

/**
 * Boost confidence modifier by a fixed amount (from laws, improvements, events)
 * @param {Object} state - Game state
 * @param {number} amount - Amount to add
 * @returns {Object} Updated state
 */
export function boostScourgePredictionConfidence(state, amount) {
  if (!state.scourgePrediction) return state;
  
  state.scourgePrediction.confidenceModifier = Math.max(
    SCOURGE_PREDICTION_CONSTANTS.MIN_CONFIDENCE_MODIFIER,
    Math.min(
      SCOURGE_PREDICTION_CONSTANTS.MAX_CONFIDENCE_MODIFIER,
      state.scourgePrediction.confidenceModifier + amount
    )
  );
  
  // Update confidence level
  state.scourgePrediction.confidenceLevel = getConfidenceLevel(state.scourgePrediction.confidenceModifier);
  
  return state;
}
