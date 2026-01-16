import { ECONOMY_CONSTANTS } from './constants.js';
import { clampCohesion, clampStat } from './cohesion.js';
import { consumeSupplies } from './economy.js';
import { checkInsurrections } from './insurrection.js';
import { updateLawCooldowns } from './laws.js';
import { checkEvent } from './events.js';
import { resolveScourgeBattle, resolveInsurrectionBattle } from './battles.js';
import { getCohesionTier } from './cohesion.js';

export function advanceTurn(state, rng = Math.random) {
  const log = [`--- Turn ${state.turn} ---`];
  
  // 1. Apply pending actions (war funds already applied, laws handled separately)
  
  // 2. Consume supplies
  const supplyLog = consumeSupplies(state);
  log.push(...supplyLog.log);
  
  // 3. Update law cooldowns
  updateLawCooldowns(state);
  
  // 4. Check for events
  const event = checkEvent(state, rng);
  if (event) {
    state.activeEvent = event;
    log.push(`Event: ${event.title}`);
  }
  
  // 5. Check for battles
  const tier = getCohesionTier(state.coalitionCohesion);
  let battleChance = 0.1;
  if (tier?.name === 'Strained') battleChance = 0.2;
  if (tier?.name === 'Desperate') battleChance = 0.3;
  
  // Scourge battle
  if (rng() < battleChance && state.armies.length > 0) {
    const participatingArmies = state.armies.filter(a => a.organization > 30);
    if (participatingArmies.length > 0) {
      const battleResult = resolveScourgeBattle(state, participatingArmies, rng);
      log.push(...battleResult.log);
    }
  }
  
  // Insurrection battle
  state.insurrections.forEach(insurrection => {
    if (insurrection.active) {
      const rebelliousArmies = state.armies.filter(a => insurrection.armies.includes(a.id));
      const opposingArmies = state.armies.filter(a => !insurrection.armies.includes(a.id) && a.organization > 30);
      
      if (opposingArmies.length > 0) {
        const battleResult = resolveInsurrectionBattle(state, insurrection, opposingArmies, rng);
        log.push(...battleResult.log);
      }
    }
  });
  
  // 6. Update meters
  state.scourgeFervor = clampStat(state.scourgeFervor + ECONOMY_CONSTANTS.SCOURGE_FERVOR_GROWTH, 0, 100);
  
  // 7. Check insurrections
  const insurrectionLog = checkInsurrections(state);
  log.push(...insurrectionLog.log);
  
  // 8. Check win/lose conditions
  if (state.coalitionCohesion <= 0) {
    log.push('GAME OVER: Coalition collapsed!');
    state.gameOver = true;
    state.gameOverReason = 'Coalition Cohesion reached 0';
  } else if (state.scourgeCohesion <= 0) {
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
