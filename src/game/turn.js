import { ECONOMY_CONSTANTS, BATTLE_CONSTANTS } from './constants.js';
import { clampCohesion, clampStat, clampApproval } from './cohesion.js';
import { consumeSupplies } from './economy.js';
import { processEconomyTick } from './economyTick.js';
import { checkInsurrections } from './insurrection.js';
import { updateLawCooldowns } from './laws.js';
import { checkEvent } from './events.js';
import { startScourgeBattle, handleScourgeBattleEnd, startInsurrectionBattle, handleInsurrectionBattleEnd } from './battles.js';
import { getCohesionTier } from './cohesion.js';
import { resolveAllLawProcesses, updatePlayerInfluence } from './lawProcessManager.js';
import { DeterministicRNG } from '../modules/rng.js';
import { simulateBattleTick, getActiveBattles } from './frontBattles.js';
import { getLogger } from '../modules/logger.js';
import { processImprovementsTick, applyImprovementModifiers } from './improvements.js';

function isTemporaryArmy(army) {
  return (
    army.id.startsWith('_scourge') ||
    army.id.startsWith('_coalition_combined') ||
    army.id.startsWith('_insurrection')
  );
}

export function isRegularArmy(army) {
  return !isTemporaryArmy(army);
}

export function collectArmiesInBattle(activeBattles) {
  const armiesInBattle = new Set();

  activeBattles.forEach(front => {
    addBattleArmyId(armiesInBattle, front.leftArmyId);
    addBattleArmyId(armiesInBattle, front.rightArmyId);

    addBattleArmyIds(armiesInBattle, front.participatingArmyIds);
    addBattleArmyIds(armiesInBattle, front.rebelliousArmyIds);
    addBattleArmyIds(armiesInBattle, front.loyalArmyIds);
  });

  return armiesInBattle;
}

function addBattleArmyId(armiesInBattle, armyId) {
  if (armyId) armiesInBattle.add(armyId);
}

function addBattleArmyIds(armiesInBattle, armyIds) {
  if (!armyIds) return;
  armyIds.forEach(id => addBattleArmyId(armiesInBattle, id));
}

function getEventTitle(event) {
  return event.title || event.name || event.id || 'Unknown Event';
}

function getBattleWinner(leftArmy, rightArmy) {
  if (!leftArmy || !rightArmy) return null;

  if (leftArmy.mp.current <= 0) {
    return 'right';
  }

  if (rightArmy.mp.current <= 0) {
    return 'left';
  }

  return null;
}

function collectRebelliousArmyIds(insurrections) {
  if (!insurrections || !Array.isArray(insurrections)) {
    return new Set();
  }

  const rebelliousArmyIds = new Set();
  insurrections.forEach(insurrection => {
    if (insurrection && insurrection.active && insurrection.armies) {
      insurrection.armies.forEach(armyId => rebelliousArmyIds.add(armyId));
    }
  });

  return rebelliousArmyIds;
}

function getBattleChance(cohesionTierName) {
  if (cohesionTierName === 'Strained') return 0.02;
  if (cohesionTierName === 'Desperate') return 0.03;
  return 0.01;
}

function partitionInsurrectionArmies(armies, rebelliousArmyIds) {
  const rebelliousArmies = [];
  const opposingArmies = [];

  armies.forEach(army => {
    if (rebelliousArmyIds.has(army.id)) {
      rebelliousArmies.push(army);
      return;
    }

    if (army.organization > 30 && isRegularArmy(army)) {
      opposingArmies.push(army);
    }
  });

  return { rebelliousArmies, opposingArmies };
}

function handleLawProcesses(state, rng, log, logger) {
  if (state.lawProcesses && state.lawProcesses.length > 0) {
    logger.debug(`Resolving ${state.lawProcesses.length} law process(es)`);
    const lawLogs = resolveAllLawProcesses(state, rng);
    if (lawLogs.length > 0) {
      log.push(...lawLogs);
    }
    return;
  }

  if (state.playerInfluence !== undefined) {
    const prevInfluence = state.playerInfluence;
    updatePlayerInfluence(state);
    if (state.playerInfluence > prevInfluence) {
      logger.info(`Player influence increased to ${state.playerInfluence}`);
    }
  }
}

function handleEconomyTick(state, log, logger) {
  try {
    const economyResult = processEconomyTick(state);
    if (economyResult.log && economyResult.log.length > 0) {
      log.push(...economyResult.log);
    }
    logger.debug(`Economy tick: ${economyResult.trades} trades executed`);
  } catch (error) {
    logger.error(`Economy tick failed: ${error.message}`, { error });
    const supplyLog = consumeSupplies(state);
    log.push(...supplyLog.log);
  }
}

function handleBattlePhase(state, rng, log, logger) {
  const tier = getCohesionTier(state.coalitionCohesion);
  const battleChance = getBattleChance(tier?.name);

  logger.debug(`Battle check: tier=${tier?.name}, chance=${battleChance}`);

  // Simulate active front battles
  const activeBattles = getActiveBattles(state);
  if (activeBattles.length > 0) {
    logger.debug(`Processing ${activeBattles.length} active front battle(s)`);
  }

  // Process active battles (including Scourge battles)
  // Store battles that end during this tick
  const battlesEndedThisTick = [];
  activeBattles.forEach(front => {
    const wasActive = front.state === 'ACTIVE';
    const battleLog = simulateBattleTick(front, state);
    log.push(...battleLog);

    // Check if battle just ended
    if (wasActive && front.state === 'ENDED') {
      battlesEndedThisTick.push(front);
    }
  });

  // Handle battles that ended this turn
  battlesEndedThisTick.forEach(front => {
    // Determine winner from battle state
    const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
    const rightArmy = state.armies.find(a => a.id === front.rightArmyId);
    const winnerSide = getBattleWinner(leftArmy, rightArmy);

    if (winnerSide) {
      if (front.isScourgeBattle) {
        handleScourgeBattleEnd(state, front, winnerSide);
        log.push(`Scourge battle ended: ${winnerSide === 'left' ? 'Coalition Victory' : 'Scourge Victory'}`);
      } else if (front.isInsurrectionBattle) {
        handleInsurrectionBattleEnd(state, front, winnerSide);
        log.push(`Insurrection battle ended: ${winnerSide === 'left' ? 'Loyal Victory' : 'Rebellion Victory'}`);
      }
    }
  });

  triggerScourgeBattle(state, rng, battleChance, activeBattles, log, logger);
  triggerInsurrectionBattles(state, rng, activeBattles, log, logger);

  return activeBattles;
}

function triggerScourgeBattle(state, rng, battleChance, activeBattles, log, logger) {
  const activeScourgeBattles = activeBattles.filter(f => f.isScourgeBattle);
  if (activeScourgeBattles.length > 0) {
    logger.debug('Scourge battle already active, skipping new battle trigger');
    return;
  }

  const battleRoll = rng();
  if (battleRoll >= battleChance || state.armies.length === 0) {
    return;
  }

  const rebelliousArmyIds = collectRebelliousArmyIds(state.insurrections);
  const participatingArmies = state.armies.filter(army =>
    army.organization > 30 &&
    isRegularArmy(army) &&
    !rebelliousArmyIds.has(army.id)
  );

  logger.info(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance.toFixed(3)}, ${participatingArmies.length} armies participating)`);
  logger.debug(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance}), ${participatingArmies.length} armies participating`);
  if (participatingArmies.length > 0) {
    const battleResult = startScourgeBattle(state, participatingArmies, rng);
    log.push(...battleResult.log);
    return;
  }

  // No armies can fight - Scourge wins by default
  logger.warn('Scourge battle: No armies available! Scourge victory by default');
  const cohesionLoss = BATTLE_CONSTANTS.SCOURGE_LOSS_COHESION_LOSS;
  const prevCoalitionCohesion = state.coalitionCohesion;
  state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);

  const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
  state.empires.forEach(empire => {
    empire.approval = clampApproval(empire.approval - approvalLoss);
  });

  log.push(`Scourge victory (no armies available)! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), All Empires Approval -${approvalLoss}`);
  logger.info(`Scourge battle: Defeat (no armies)! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), All Empires Approval -${approvalLoss}`);
}

function triggerInsurrectionBattles(state, rng, activeBattles, log, logger) {
  if (!state.insurrections || !Array.isArray(state.insurrections)) {
    return;
  }

  state.insurrections.forEach(insurrection => {
    if (!insurrection || !insurrection.active) {
      return;
    }

    const activeInsurrectionBattles = activeBattles.filter(f =>
      f.isInsurrectionBattle && f.insurrectionId === insurrection.id
    );

    if (activeInsurrectionBattles.length > 0) {
      logger.debug(`Insurrection battle already active for ${insurrection.id}, skipping new battle trigger`);
      return;
    }

    const rebelliousArmyIds = new Set(insurrection.armies || []);
    const { rebelliousArmies, opposingArmies } = partitionInsurrectionArmies(
      state.armies,
      rebelliousArmyIds
    );

    if (opposingArmies.length === 0 || rebelliousArmies.length === 0) {
      return;
    }

    const battleResult = startInsurrectionBattle(state, insurrection, opposingArmies, rng);
    if (battleResult && battleResult.log && battleResult.front) {
      log.push(...battleResult.log);
    }
  });
}


/**
 * Recover organization for all armies
 * Recovery rate is based on:
 * - Army Command stat (0-100, determines base recovery speed)
 * - Reduced during active battles (50% of normal rate)
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 */
function recoverArmyOrganization(state, activeBattles) {
  const logger = getLogger();
  
  const armiesInBattle = collectArmiesInBattle(activeBattles);

  const regularArmies = state.armies.filter(isRegularArmy);

  
  regularArmies.forEach(army => {
    // Skip if already at max organization
    if (army.organization >= 100) return;
    
    const inBattle = armiesInBattle.has(army.id);
    
    // Base recovery rate: Command stat (0-100) determines recovery per tick
    // Scale: 0 command = 0.1 per tick, 100 command = 1.0 per tick
    const baseRecoveryRate = 0.1 + ((army.command || 50) / 100) * 0.9;
    
    // During battles, recovery is slower (50% of normal rate)
    const effectiveRate = inBattle ? baseRecoveryRate * 0.5 : baseRecoveryRate;
    
    // Apply organization recovery
    const spaceAvailable = 100 - army.organization;
    const recovered = Math.min(effectiveRate, spaceAvailable);
    army.organization = clampStat(army.organization + recovered, 0, 100);
    
    // Debug logging for significant recovery
    if (recovered > 0.5) {
      logger.debug(`Organization recovery: ${army.name} +${recovered.toFixed(2)} org (command: ${(army.command || 50).toFixed(0)}, inBattle: ${inBattle}, new: ${army.organization.toFixed(1)})`);
    }
  });
}

/**
 * Replenish manpower for armies not currently in active battles
 * Replenishment rate is based on:
 * - Army fervor (higher fervor = faster replenishment)
 * - Empire size (population/influence - larger empires can replenish faster)
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 */
function replenishArmyManpower(state, activeBattles) {
  const logger = getLogger();
  
  const armiesInBattle = collectArmiesInBattle(activeBattles);

  const regularArmies = state.armies.filter(army =>
    isRegularArmy(army) && !armiesInBattle.has(army.id)
  );

  
  // Build empire lookup map
  const empireMap = new Map(state.empires.map(empire => [empire.id, empire]));
  
  regularArmies.forEach(army => {
    // Skip if already at max
    if (army.mp.current >= army.mp.max) return;
    
    const empire = empireMap.get(army.empireId);
    if (!empire) {
      logger.debug(`Army ${army.name} has no empire, skipping replenishment`);
      return;
    }
    
    // Base replenishment rate (per tick)
    const baseRate = army.reinforcementRate || 100;
    
    // Fervor modifier: 0.5x at 0 fervor, 1.5x at 100 fervor
    // Linear interpolation: 0.5 + (fervor / 100) * 1.0
    const fervorModifier = 0.5 + (army.fervor / 100) * 1.0;
    
    // Empire size modifier based on population
    // Normalize population: log10 scale, then scale to 0.5x - 2.0x range
    const population = empire.stats?.population || 1000;
    const logPopulation = Math.log10(Math.max(1, population));
    // Scale: 1000 (3.0) = 0.5x, 1M (6.0) = 1.0x, 1B (9.0) = 2.0x
    const populationModifier = Math.max(0.5, Math.min(2.0, 0.5 + (logPopulation - 3.0) / 3.0));
    
    // Calculate effective replenishment rate
    const effectiveRate = baseRate * fervorModifier * populationModifier;
    
    // Apply replenishment
    const spaceAvailable = army.mp.max - army.mp.current;
    const replenished = Math.min(effectiveRate, spaceAvailable);
    army.mp.current += replenished;
    
    // Debug logging for significant replenishment
    if (replenished > 50) {
      logger.debug(`Manpower replenishment: ${army.name} +${replenished.toFixed(0)} MP (fervor: ${army.fervor.toFixed(0)}, pop: ${population.toFixed(0)}, rate: ${effectiveRate.toFixed(0)})`);
    }
  });
}

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
  
  // 1. Resolve law processes (if any)
  handleLawProcesses(state, deterministicRng, log, logger);

  // 2. Process economy tick (market economy system)
  handleEconomyTick(state, log, logger);

  // 3. Process improvements tick
  if (state.improvements) {
    const improvementResult = processImprovementsTick(state);
    if (improvementResult.log && improvementResult.log.length > 0) {
      log.push(...improvementResult.log);
    }
    
    // Apply improvement modifiers
    applyImprovementModifiers(state);
  }
  
  // 4. Update law cooldowns
  updateLawCooldowns(state);
  
  // 5. Check for events
  const event = checkEvent(state, rng);
  if (event) {
    // Only set as activeEvent if it has choices that require player input
      const eventTitle = getEventTitle(event);
      if (event.choices && Array.isArray(event.choices) && event.choices.length > 0) {
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
  const activeBattles = handleBattlePhase(state, rng, log, logger);

  
  // 6. Replenish army manpower (for armies not in active battles)
  replenishArmyManpower(state, activeBattles);
  
  // 6.5. Recover army organization (all armies, but slower during battles)
  recoverArmyOrganization(state, activeBattles);
  
  // 7. Update meters
  const prevFervor = state.scourgeFervor;
  state.scourgeFervor = clampStat(state.scourgeFervor + ECONOMY_CONSTANTS.SCOURGE_FERVOR_GROWTH, 0, 100);
  logger.debug(`Scourge fervor: ${prevFervor.toFixed(1)} -> ${state.scourgeFervor.toFixed(1)}`);
  
  // 8. Check insurrections
  const insurrectionLog = checkInsurrections(state);
  log.push(...insurrectionLog.log);
  
  // 9. Check win/lose conditions
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
