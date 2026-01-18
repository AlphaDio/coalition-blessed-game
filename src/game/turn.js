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
  
  // Get IDs of armies currently in active battles
  const armiesInBattle = new Set();
  activeBattles.forEach(front => {
    if (front.leftArmyId) armiesInBattle.add(front.leftArmyId);
    if (front.rightArmyId) armiesInBattle.add(front.rightArmyId);
    
    // Also check for combined armies (Scourge/Insurrection battles)
    if (front.participatingArmyIds) {
      front.participatingArmyIds.forEach(id => armiesInBattle.add(id));
    }
    if (front.rebelliousArmyIds) {
      front.rebelliousArmyIds.forEach(id => armiesInBattle.add(id));
    }
    if (front.loyalArmyIds) {
      front.loyalArmyIds.forEach(id => armiesInBattle.add(id));
    }
  });
  
  // Filter out temporary armies
  const regularArmies = state.armies.filter(army => 
    !army.id.startsWith('_scourge') &&
    !army.id.startsWith('_coalition_combined') &&
    !army.id.startsWith('_insurrection')
  );
  
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
  
  // Get IDs of armies currently in active battles
  const armiesInBattle = new Set();
  activeBattles.forEach(front => {
    if (front.leftArmyId) armiesInBattle.add(front.leftArmyId);
    if (front.rightArmyId) armiesInBattle.add(front.rightArmyId);
    
    // Also check for combined armies (Scourge/Insurrection battles)
    if (front.participatingArmyIds) {
      front.participatingArmyIds.forEach(id => armiesInBattle.add(id));
    }
    if (front.rebelliousArmyIds) {
      front.rebelliousArmyIds.forEach(id => armiesInBattle.add(id));
    }
    if (front.loyalArmyIds) {
      front.loyalArmyIds.forEach(id => armiesInBattle.add(id));
    }
  });
  
  // Filter out temporary armies and armies in battle
  const regularArmies = state.armies.filter(army => 
    !army.id.startsWith('_scourge') &&
    !army.id.startsWith('_coalition_combined') &&
    !army.id.startsWith('_insurrection') &&
    !armiesInBattle.has(army.id)
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
  if (state.lawProcesses && state.lawProcesses.length > 0) {
    logger.debug(`Resolving ${state.lawProcesses.length} law process(es)`);
    const lawLogs = resolveAllLawProcesses(state, deterministicRng);
    if (lawLogs.length > 0) {
      log.push(...lawLogs);
    }
  } else if (state.playerInfluence !== undefined) {
    // Update player influence even if no law processes are active
    const prevInfluence = state.playerInfluence;
    updatePlayerInfluence(state);
    if (state.playerInfluence > prevInfluence) {
      logger.info(`Player influence increased to ${state.playerInfluence}`);
    }
  }
  
  // 2. Process economy tick (market economy system)
  try {
    const economyResult = processEconomyTick(state);
    if (economyResult.log && economyResult.log.length > 0) {
      log.push(...economyResult.log);
    }
    logger.debug(`Economy tick: ${economyResult.trades} trades executed`);
  } catch (error) {
    logger.error(`Economy tick failed: ${error.message}`, { error });
    // Fallback to old supply system if economy system fails
    const supplyLog = consumeSupplies(state);
    log.push(...supplyLog.log);
  }
  
  // 4. Update law cooldowns
  updateLawCooldowns(state);
  
  // 5. Check for events
  const event = checkEvent(state, rng);
  if (event) {
    // Only set as activeEvent if it has choices that require player input
    if (event.choices && Array.isArray(event.choices) && event.choices.length > 0) {
      state.activeEvent = event;
      const eventTitle = event.title || event.name || event.id || 'Unknown Event';
      logger.info(`Event triggered: ${eventTitle}`);
      log.push(`Event: ${eventTitle}`);
    } else {
      // Event was auto-resolved in checkEvent, just log it
      const eventTitle = event.title || event.name || event.id || 'Unknown Event';
      logger.info(`Event auto-resolved: ${eventTitle} (no choices)`);
      log.push(`Event: ${eventTitle} (auto-resolved)`);
    }
  }
  
  // 5. Check for battles
  const tier = getCohesionTier(state.coalitionCohesion);
  let battleChance = 0.01;  // 1% chance (was 10%)
  if (tier?.name === 'Strained') battleChance = 0.02;  // 2% chance (was 20%)
  if (tier?.name === 'Desperate') battleChance = 0.03;  // 3% chance (was 30%)
  
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
    let winnerSide = null;
    if (leftArmy && leftArmy.mp.current <= 0) {
      winnerSide = 'right';
    } else if (rightArmy && rightArmy.mp.current <= 0) {
      winnerSide = 'left';
    }
    
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
  
  // Check for new Scourge battle (only if no active Scourge battle exists)
  const activeScourgeBattles = activeBattles.filter(f => f.isScourgeBattle);
  if (activeScourgeBattles.length === 0) {
    const battleRoll = rng();
    if (battleRoll < battleChance && state.armies.length > 0) {
      // Get all rebellious army IDs from active insurrections
      const rebelliousArmyIds = new Set();
      if (state.insurrections && Array.isArray(state.insurrections)) {
        state.insurrections.forEach(insurrection => {
          if (insurrection && insurrection.active && insurrection.armies) {
            insurrection.armies.forEach(armyId => rebelliousArmyIds.add(armyId));
          }
        });
      }
      
      // Filter out temporary armies and rebellious armies
      const participatingArmies = state.armies.filter(a => 
        a.organization > 30 && 
        !a.id.startsWith('_scourge') && 
        !a.id.startsWith('_coalition_combined') &&
        !rebelliousArmyIds.has(a.id) // Exclude armies in insurrection
      );
      logger.info(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance.toFixed(3)}, ${participatingArmies.length} armies participating)`);
      logger.debug(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance}), ${participatingArmies.length} armies participating`);
      if (participatingArmies.length > 0) {
        const battleResult = startScourgeBattle(state, participatingArmies, rng);
        log.push(...battleResult.log);
      } else {
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
    }
  } else {
    logger.debug(`Scourge battle already active, skipping new battle trigger`);
  }
  
  // Check for insurrection battles (only if no active insurrection battle exists for this insurrection)
  if (state.insurrections && Array.isArray(state.insurrections)) {
    state.insurrections.forEach(insurrection => {
      if (insurrection && insurrection.active) {
        // Check if there's already an active battle for this insurrection
        const activeInsurrectionBattles = activeBattles.filter(f => 
          f.isInsurrectionBattle && f.insurrectionId === insurrection.id
        );
        
        if (activeInsurrectionBattles.length === 0) {
          // Use Set for O(1) lookup instead of O(n) includes() calls
          const rebelliousArmyIds = new Set(insurrection.armies || []);
          const rebelliousArmies = state.armies.filter(army => 
            rebelliousArmyIds.has(army.id)
          );
          const opposingArmies = state.armies.filter(army => 
            !rebelliousArmyIds.has(army.id) && 
            army.organization > 30 &&
            !army.id.startsWith('_scourge') &&
            !army.id.startsWith('_coalition_combined') &&
            !army.id.startsWith('_insurrection')
          );
          
          if (opposingArmies.length > 0 && rebelliousArmies.length > 0) {
            const battleResult = startInsurrectionBattle(state, insurrection, opposingArmies, rng);
            if (battleResult && battleResult.log && battleResult.front) {
              log.push(...battleResult.log);
            }
          }
        } else {
          logger.debug(`Insurrection battle already active for ${insurrection.id}, skipping new battle trigger`);
        }
      }
    });
  }
  
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
