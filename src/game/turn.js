import { ECONOMY_CONSTANTS } from './constants.js';
import { clampCohesion, clampStat } from './cohesion.js';
import { consumeSupplies } from './economy.js';
import { checkInsurrections } from './insurrection.js';
import { updateLawCooldowns } from './laws.js';
import { checkEvent } from './events.js';
import { resolveScourgeBattle, resolveInsurrectionBattle } from './battles.js';
import { getCohesionTier } from './cohesion.js';
import { resolveAllLawProcesses, updatePlayerInfluence } from './lawProcessManager.js';
import { DeterministicRNG } from '../modules/rng.js';
import { simulateBattleTick, getActiveBattles } from './frontBattles.js';
import { getLogger } from '../modules/logger.js';

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
  
  // 1. Apply pending actions (war funds already applied, laws handled separately)
  
  // 2. Resolve law processes (if any)
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
  
  // 3. Consume supplies
  const supplyLog = consumeSupplies(state);
  log.push(...supplyLog.log);
  
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
  let battleChance = 0.1;
  if (tier?.name === 'Strained') battleChance = 0.2;
  if (tier?.name === 'Desperate') battleChance = 0.3;
  
  logger.debug(`Battle check: tier=${tier?.name}, chance=${battleChance}`);
  
  // Simulate active front battles
  const activeBattles = getActiveBattles(state);
  if (activeBattles.length > 0) {
    logger.debug(`Processing ${activeBattles.length} active front battle(s)`);
  }
  activeBattles.forEach(front => {
    const battleLog = simulateBattleTick(front, state);
    log.push(...battleLog);
  });
  
  // Scourge battle (old system)
  const battleRoll = rng();
  if (battleRoll < battleChance && state.armies.length > 0) {
    const participatingArmies = state.armies.filter(a => a.organization > 30);
    logger.debug(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance}), ${participatingArmies.length} armies participating`);
    if (participatingArmies.length > 0) {
      const battleResult = resolveScourgeBattle(state, participatingArmies, rng);
      log.push(...battleResult.log);
      logger.info(`Scourge battle: ${battleResult.won ? 'Victory' : 'Defeat'}`);
    } else {
      logger.debug('Scourge battle skipped: no armies with sufficient organization');
    }
  }
  
  // Insurrection battle (old system)
  if (state.insurrections && Array.isArray(state.insurrections)) {
    state.insurrections.forEach(insurrection => {
      if (insurrection && insurrection.active) {
        // Use Set for O(1) lookup instead of O(n) includes() calls
        const rebelliousArmyIds = new Set(insurrection.armies || []);
        const rebelliousArmies = state.armies.filter(army => 
          rebelliousArmyIds.has(army.id)
        );
        const opposingArmies = state.armies.filter(army => 
          !rebelliousArmyIds.has(army.id) && army.organization > 30
        );
        
        if (opposingArmies.length > 0) {
          const battleResult = resolveInsurrectionBattle(state, insurrection, opposingArmies, rng);
          if (battleResult && battleResult.log) {
            log.push(...battleResult.log);
          }
        }
      }
    });
  }
  
  // 6. Update meters
  const prevFervor = state.scourgeFervor;
  state.scourgeFervor = clampStat(state.scourgeFervor + ECONOMY_CONSTANTS.SCOURGE_FERVOR_GROWTH, 0, 100);
  logger.debug(`Scourge fervor: ${prevFervor.toFixed(1)} -> ${state.scourgeFervor.toFixed(1)}`);
  
  // 7. Check insurrections
  const insurrectionLog = checkInsurrections(state);
  log.push(...insurrectionLog.log);
  
  // 8. Check win/lose conditions
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
