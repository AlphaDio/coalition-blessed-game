import { ECONOMY_CONSTANTS, SCOURGE_PREDICTION_CONSTANTS } from '../constants.js';
import { clampStat } from '../cohesion.js';
import { applyNegativeRequisitionCohesionPenalty } from '../economy.js';
import { checkInsurrections } from '../insurrection.js';
import { updateLawCooldowns } from '../laws.js';
import { checkEvent } from '../events.js';
import { DeterministicRNG } from '../../modules/rng.js';
import { getLogger } from '../../modules/logger.js';
import {
  processImprovementsTick,
  applyImprovementModifiers,
  removeExpiredSuggestions,
  processImprovementSustainmentPostMarket,
  refreshImprovementSuggestions
} from '../improvements/index.js';
import { getEventTitle, hasValidChoices } from '../../utils/events.js';
import { refreshArmyAggregates } from '../armyComposition.js';
import { processTechAccrual, createTechEvent } from '../technology.js';
import { processUnityAccrual, popNextUnityCelebrationEvent } from '../unity.js';
import { tickEmergencyLaws, getActiveEmergencyModifiers } from '../emergencyLaws.js';
import { calculateScourgePrediction } from '../scourgePrediction.js';
import { initializeTurnConsumptionTracking, processConsumptionToRequisition } from '../consumptionToRequisition.js';
import { applyHeroBudgetSiphon, applyHeroSpillover, tickHeroCooldowns, tickHeroMeters } from '../heroes.js';
import { generateHeroLawProposals } from '../lawProposals.js';
import { applyMissionSliderEffects, maybeSpawnDeepMission } from '../scourgeMissions.js';
import { applyThreatClimateBonuses, resetDynamicCoalitionModifiers } from '../scourgeThreat.js';
import { tickEmergencyPowers } from '../emergencyPowers.js';
import { applyEmergencyModifiers, applyEmergencyPowerDynamicModifiers } from './emergency.js';
import { applyDynamicScourgeModifierEffects, tickScourgeRecovery, resolvePendingScourgeAttack } from './scourge.js';
import { handleLawProcesses } from './lawPhase.js';
import { handleEconomyTick, processEmpireStockpileConsumption } from './economyPhase.js';
import { handleBattlePhase } from './battlePhase.js';
import { applyArmyPassiveStatModifiers, recoverArmyOrganization, replenishArmyManpower } from './armyPhase.js';
import { applyBasePopulationGrowth } from './population.js';
import { collectArmiesInBattle, isRegularArmy } from './armyUtils.js';

export { collectArmiesInBattle, isRegularArmy };

/**
 * Advances the game state by one turn, processing all game systems
 * @param {Object} state - The game state to advance
 * @param {Function} rng - Random number generator (default: Math.random)
 * @returns {Object} Object containing log messages: { log: string[] }
 */
export function advanceTurn(state, rng = Math.random) {
  const logger = getLogger();
  const log = [`--- Turn ${state.turn} ---`];

  logger.debug(`Advancing turn ${state.turn}`, {
    coalitionCohesion: state.coalitionCohesion,
    scourgeCohesion: state.scourgeCohesion,
    activeBattles: (state.battleFronts || []).filter(f => f.state === 'ACTIVE').length,
    activeLaws: (state.lawProcesses || []).filter(lp => lp.phase !== 'ENACTED' && lp.phase !== 'BURIED').length
  });

  // Create deterministic RNG if using Math.random (for compatibility)
  const deterministicRng = (rng === Math.random)
    ? new DeterministicRNG(state.turn * 12345)
    : rng;

  // Create a callable RNG function for APIs that expect rng()
  const rngFn = (deterministicRng instanceof DeterministicRNG)
    ? () => deterministicRng.random()
    : deterministicRng;

  resetDynamicCoalitionModifiers(state);
  applyThreatClimateBonuses(state);
  applyDynamicScourgeModifierEffects(state, log);
  applyEmergencyPowerDynamicModifiers(state);
  tickScourgeRecovery(state);
  initializeTurnConsumptionTracking();

  // 1. Resolve law processes (if any)
  handleLawProcesses(state, deterministicRng, log, logger);

  // 2. Process improvements before market clearing so their orders can trade this turn.
  if (state.improvements) {
    const improvementResult = processImprovementsTick(state);
    if (improvementResult.log && improvementResult.log.length > 0) {
      log.push(...improvementResult.log);
    }

    // Apply improvement modifiers
    applyImprovementModifiers(state);
  }

  // 3. Process economy tick (market economy system)
  handleEconomyTick(state, log, logger);

  // 3.1. Resolve improvement sustainment after market clearing so same-turn fills count.
  if (state.improvements) {
    const sustainmentResult = processImprovementSustainmentPostMarket(state);
    if (sustainmentResult.log && sustainmentResult.log.length > 0) {
      log.push(...sustainmentResult.log);
    }
  }

  // 3.5. Refresh army stats from units after economy
  refreshArmyAggregates(state);
  applyArmyPassiveStatModifiers(state);

  // 4. Hero budget siphon, cooldowns, and meter drift
  applyHeroBudgetSiphon(state, log);
  tickHeroCooldowns(state);
  tickHeroMeters(state, log);
  generateHeroLawProposals(state, rngFn, log);

  // 4.5. Apply cohesion penalty for negative requisition
  const cohesionPenaltyResult = applyNegativeRequisitionCohesionPenalty(state);
  if (cohesionPenaltyResult.log && cohesionPenaltyResult.log.length > 0) {
    log.push(...cohesionPenaltyResult.log);
  }

  // Remove expired improvement suggestions (older than 45 ticks)
  const expiredCount = removeExpiredSuggestions(state);
  if (expiredCount > 0) {
    logger.debug(`Removed ${expiredCount} expired improvement suggestions`);
  }

  // Keep each empire filled to the configured suggestion count.
  if (
    state.empires &&
    state.improvements &&
    Array.isArray(state.improvements.requests)
  ) {
    const newSuggestions = refreshImprovementSuggestions(state, rngFn);
    newSuggestions.forEach(request => {
      const empire = state.empires.find(entry => entry.id === request.empireId);
      if (!empire) {
        return;
      }
      log.push(`${empire.name} suggests improvement: ${request.name}`);
      logger.debug(`${empire.name} suggested improvement: ${request.name}`);
    });
  }

  // 3.2. Process emergency laws tick (consume resources, apply modifiers, expire if needed)
  const emergencyResult = tickEmergencyLaws(state);
  if (emergencyResult.log && emergencyResult.log.length > 0) {
    log.push(...emergencyResult.log);
  }

  // Apply emergency law modifiers to game systems
  const emergencyModifiers = getActiveEmergencyModifiers(state);
  applyEmergencyModifiers(state, emergencyModifiers, log);

  const expiredPowers = tickEmergencyPowers(state);
  if (expiredPowers.length > 0) {
    log.push(`Emergency powers expired: ${expiredPowers.join(', ')}`);
  }

  // 3.4. Process technology accrual
  const empiresReachedTechThreshold = processTechAccrual(state);
  if (empiresReachedTechThreshold.length > 0 && !state.activeEvent) {
    // Create tech event for the first empire that reached threshold
    // (others will trigger on subsequent turns)
    const empireId = empiresReachedTechThreshold[0];
    const empire = state.empires.find(e => e.id === empireId);
    if (empire) {
      const techEvent = createTechEvent(empire, state, rngFn);
      if (techEvent) {
        state.activeEvent = techEvent;
        logger.info(`Tech event triggered for ${empire.name}`);
        log.push(`Technology breakthrough for ${empire.name}!`);
      }
    }
  }

  // 3.5. Process unity accrual and queue celebration events for unlocked effects.
  const unityResult = processUnityAccrual(state);
  if (unityResult.log && unityResult.log.length > 0) {
    log.push(...unityResult.log);
  }

  if (!state.activeEvent) {
    const unityCelebration = popNextUnityCelebrationEvent(state);
    if (unityCelebration) {
      state.activeEvent = unityCelebration;
      logger.info(`Unity celebration triggered for ${unityCelebration.empireId}`);
      log.push(`Unity celebration in ${unityCelebration.title}`);
    }
  }

  // 3.6. Apply baseline population growth
  applyBasePopulationGrowth(state);

  // 3.7. Process pooled empire consumption effects from regular consumption
  processEmpireStockpileConsumption(state, log);

  // 3.8. Convert tracked consumption to coalition requisition and credits
  // Build consumption share rate modifiers from active laws/effects
  const consumptionModifiers = {
    multiplicativeShare: state.coalitionModifiers?.consumptionShareMultiplier ?? 1.0,
    additiveShare: state.coalitionModifiers?.consumptionShareBonus ?? 0,
    requisitionMultiplier:
      (state.coalitionModifiers?.requisition_gain_multiplier ?? 1.0) *
      (state.coalitionModifiers?.dynamic?.requisition_gen_mult ?? 1.0),
    sourceMultipliers: state.coalitionModifiers?.consumptionSourceMultipliers || {}
  };

  const consumptionResult = processConsumptionToRequisition(state.market, state.coalitionEconomy, consumptionModifiers, state.empires);
  // Only log on requisition payout; pooled accrual stays silent to avoid per-turn noise.
  if (consumptionResult.requisitionGained > 0.001) {
    const message = `Coalition from consumption payout: +${consumptionResult.requisitionGained.toFixed(3)} req`;
    log.push(message);
    logger.info(message);
  }

  // Passive requisition uptick from enacted laws.
  const requisitionUptick = state.coalitionModifiers?.requisition_uptick ?? 0;
  if (Number.isFinite(requisitionUptick) && requisitionUptick !== 0) {
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + requisitionUptick;
  }

  applyMissionSliderEffects(state, log);
  const deepMission = maybeSpawnDeepMission(state, rngFn);
  if (deepMission) {
    state.activeEvent = deepMission;
    logger.info(`Deep mission triggered: ${deepMission.title}`);
    log.push(`Event: ${deepMission.title}`);
  }

  // 4. Update law cooldowns
  updateLawCooldowns(state);

  // 5. Check for events
  const event = (!state.pendingScourgeAttack || state.pendingScourgeAttack.ready)
    ? checkEvent(state, rng)
    : null;
  if (event && !state.activeEvent) {
    // Only set as activeEvent if it has choices that require player input
    const eventTitle = getEventTitle(event);
    if (hasValidChoices(event)) {
      state.activeEvent = event;
      logger.info(`Event triggered: ${eventTitle}`);
      log.push(`Event: ${eventTitle}`);
    } else {
      // Event was auto-resolved in checkEvent, just log it
      logger.info(`Event auto-resolved: ${eventTitle} (no choices)`);
      log.push(`Event: ${eventTitle} (auto-resolved)`);
    }
  }

  // 5. Check for battles
  if (!state.activeEvent) {
    resolvePendingScourgeAttack(state, rng, log, logger);
  }
  const activeBattles = handleBattlePhase(state, rng, log, logger);

  // 6. Replenish army manpower (for armies not in active battles); threshold-based growth logged to log
  replenishArmyManpower(state, activeBattles, log);

  // 6.5. Recover army organization (all armies, but slower during battles)
  recoverArmyOrganization(state, activeBattles);

  // 7. Update meters
  const prevFervor = state.scourgeFervor;
  state.scourgeFervor = clampStat(state.scourgeFervor + ECONOMY_CONSTANTS.SCOURGE_FERVOR_GROWTH, 0, 100);
  logger.debug(`Scourge fervor: ${prevFervor.toFixed(1)} -> ${state.scourgeFervor.toFixed(1)}`);

  // 7.5. Update Scourge prediction (next target and battle timing)
  if (!state.scourgePrediction) {
    state.scourgePrediction = {
      targetEmpireId: null,
      estimatedTurnsToNextBattle: null,
      confidenceModifier: 1.0,
      confidenceLevel: 'low',
      uncertaintyRange: { min: null, max: null },
      targetingMode: 'calculated',
      directTargetIntelCost: SCOURGE_PREDICTION_CONSTANTS.DIRECT_TARGET_INTEL_COST
    };
  }
  state.scourgePrediction = calculateScourgePrediction(state, rngFn);
  logger.debug(`Scourge prediction updated: target=${state.scourgePrediction.targetEmpireId}, ETA=${state.scourgePrediction.estimatedTurnsToNextBattle}, confidence=${state.scourgePrediction.confidenceLevel}`);

  // 8. Apply hero spillover then check insurrections
  applyHeroSpillover(state, log);
  const insurrectionLog = checkInsurrections(state);
  log.push(...insurrectionLog.log);

  // 9. Expire timed modifiers
  if (state.timedModifiers) {
    const expiredModifiers = state.timedModifiers.filter(modifier => modifier.expiresAt <= state.turn);
    expiredModifiers.forEach(modifier => {
      if (state.coalitionModifiers[modifier.key] !== undefined) {
        state.coalitionModifiers[modifier.key] -= modifier.value;
        logger.debug(`Timed modifier expired: ${modifier.key} ${modifier.value >= 0 ? '+' : ''}${modifier.value} removed`);
      }
    });
    state.timedModifiers = state.timedModifiers.filter(modifier => modifier.expiresAt > state.turn);
  }

  // 10. Check win/lose conditions
  if (state.coalitionCohesion <= 0) {
    logger.error('GAME OVER: Coalition collapsed!');
    log.push('GAME OVER: Coalition collapsed!');
    state.gameOver = true;
    state.gameOverReason = 'Coalition Cohesion reached 0';
  } else if (state.scourgeCohesion <= 0) {
    logger.info('VICTORY: Scourge defeated!');
    log.push('VICTORY: Scourge defeated!');
    state.gameOver = true;
    state.gameOverReason = 'Scourge Cohesion reached 0';
  }

  state.turn++;

  // Add to log history
  state.log.push(...log);

  // Keep log size manageable
  if (state.log.length > 100) {
    state.log = state.log.slice(-100);
  }

  return { log };
}
