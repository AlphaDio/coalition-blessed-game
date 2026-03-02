// Scourge prediction system - helps players anticipate attacks and prepare
import { BATTLE_CONSTANTS, SCOURGE_PREDICTION_CONSTANTS } from './constants.js';
import { getCohesionTier } from './cohesion.js';

const TARGET_CLARITY_HIGH_GAP = 18;
const TARGET_CLARITY_MEDIUM_GAP = 10;
const TARGET_CLARITY_LOW_GAP = 4;

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
  if (targetSelection.source === 'calculated') {
    confidenceModifier = clampConfidenceModifier(
      confidenceModifier + getTargetClarityConfidenceAdjustment(targetSelection.analysis)
    );
  }

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

  const calculatedSelection = predictNextScourgeTargetByVulnerability(state, rng);
  return {
    empire: calculatedSelection.empire,
    source: 'calculated',
    analysis: calculatedSelection.analysis
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

  const weighted = candidates
    .map((empire) => buildScourgeTargetAssessment(state, empire))
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (Math.abs(scoreDiff) > 0.0001) {
        return scoreDiff;
      }
      return left.tieBreaker - right.tieBreaker;
    });

  const best = weighted[0] || null;
  const runnerUp = weighted[1] || null;

  return {
    empire: best?.empire || candidates[0] || null,
    analysis: {
      topScore: best?.score || 0,
      runnerUpScore: runnerUp?.score || 0,
      scoreGap: best && runnerUp ? best.score - runnerUp.score : best?.score || 0
    }
  };
}

function buildScourgeTargetAssessment(state, empire) {
  const approval = Number.isFinite(empire?.approval) ? empire.approval : 50;
  const stability = Number.isFinite(empire?.stability) ? empire.stability : 60;
  const empireArmies = (state.armies || []).filter((army) =>
    army &&
    army.empireId === empire.id &&
    !army.isScourge &&
    !army.isTemporary &&
    !army.tempArmy
  );
  const readyArmies = empireArmies.filter((army) =>
    (army.mp?.current || 0) > 0 &&
    (army.organization || 0) >= BATTLE_CONSTANTS.SCOURGE_TARGET_ARMY_ORG_MIN
  );

  const totalReadyMP = readyArmies.reduce((sum, army) => sum + (army.mp?.current || 0), 0);
  const avgReadyOrg = readyArmies.length > 0
    ? readyArmies.reduce((sum, army) => sum + (army.organization || 0), 0) / readyArmies.length
    : 0;
  const avgAggravation = empireArmies.length > 0
    ? empireArmies.reduce((sum, army) => sum + (army.aggravation || 0), 0) / empireArmies.length
    : 0;

  const approvalVulnerability = (100 - approval) * 0.35;
  const stabilityVulnerability = (100 - stability) * 0.30;
  const defenseWeakness = Math.max(0, 18 - Math.min(18, totalReadyMP / 1200));
  const organizationWeakness = Math.max(0, 10 - Math.min(10, avgReadyOrg / 10));
  const armyReadinessPenalty = readyArmies.length === 0 ? 6 : 0;
  const aggravationPressure = Math.min(8, avgAggravation / 10);
  const strategicValue = Math.min(6, empireArmies.length * 1.5);
  const isolationPressure = Math.max(0, 10 - Math.min(10, getAverageMutualSupport(state, empire.id) / 8));

  return {
    empire,
    score:
      approvalVulnerability +
      stabilityVulnerability +
      defenseWeakness +
      organizationWeakness +
      armyReadinessPenalty +
      aggravationPressure +
      strategicValue +
      isolationPressure,
    tieBreaker: getTargetTieBreaker(state, empire.id)
  };
}

function getAverageMutualSupport(state, empireId) {
  if (!state.empires || state.empires.length <= 1) {
    return 0;
  }

  let total = 0;
  let count = 0;
  for (const otherEmpire of state.empires) {
    if (!otherEmpire || otherEmpire.id === empireId) continue;
    const outgoing = Number(state.diplomacy?.relations?.[empireId]?.[otherEmpire.id] ?? 0);
    const incoming = Number(state.diplomacy?.relations?.[otherEmpire.id]?.[empireId] ?? 0);
    total += Math.max(0, Math.min(outgoing, incoming));
    count++;
  }

  return count > 0 ? total / count : 0;
}

function getTargetTieBreaker(state, empireId) {
  let hash = Number(state.turn) || 0;
  for (let index = 0; index < String(empireId).length; index++) {
    hash = ((hash * 31) + String(empireId).charCodeAt(index)) % 100000;
  }
  return hash;
}

function getTargetClarityConfidenceAdjustment(analysis) {
  const gap = Number(analysis?.scoreGap) || 0;
  if (gap >= TARGET_CLARITY_HIGH_GAP) {
    return 0.25;
  }
  if (gap >= TARGET_CLARITY_MEDIUM_GAP) {
    return 0.12;
  }
  if (gap <= TARGET_CLARITY_LOW_GAP) {
    return -0.08;
  }
  return 0;
}

/**
 * Calculate confidence modifier based on coalition cohesion and other factors
 * This represents how predictable the Scourge is being
 * @param {Object} state - Game state
 * @returns {number} Confidence modifier (1.0 = baseline)
 */
function calculateConfidenceModifier(state) {
  let modifier = SCOURGE_PREDICTION_CONSTANTS.BASE_CONFIDENCE_MODIFIER;

  const coalitionIntel = Number(state.coalitionIntel) || 0;
  const intelConfidenceBonus = coalitionIntel * SCOURGE_PREDICTION_CONSTANTS.INTEL_CONFIDENCE_PER_POINT;
  modifier += Math.max(
    -SCOURGE_PREDICTION_CONSTANTS.MAX_INTEL_CONFIDENCE_BONUS,
    Math.min(SCOURGE_PREDICTION_CONSTANTS.MAX_INTEL_CONFIDENCE_BONUS, intelConfidenceBonus)
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
  return clampConfidenceModifier(modifier);
}

function clampConfidenceModifier(value) {
  return Math.max(
    SCOURGE_PREDICTION_CONSTANTS.MIN_CONFIDENCE_MODIFIER,
    Math.min(SCOURGE_PREDICTION_CONSTANTS.MAX_CONFIDENCE_MODIFIER, value)
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

/**
 * Adjust coalition intel and immediately keep displayed prediction confidence in sync.
 * @param {Object} state - Game state
 * @param {number} amount - Intel delta
 * @returns {number} Applied intel delta
 */
export function applyCoalitionIntel(state, amount) {
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta === 0) {
    return 0;
  }

  state.coalitionIntel = (Number(state.coalitionIntel) || 0) + delta;

  if (state.scourgePrediction) {
    boostScourgePredictionConfidence(
      state,
      delta * SCOURGE_PREDICTION_CONSTANTS.INTEL_CONFIDENCE_PER_POINT
    );
  }

  return delta;
}
