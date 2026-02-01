// Core state management and utilities
import { getCohesionTier } from './game/cohesion.js';
import { clamp, randomInt, randomFloat } from './utils/math.js';

export function initialState() {
  return {
    turn: 0,
    coalitionCohesion: 75,
    coalitionThreat: 0,
    coalitionGlory: 0,
    coalitionPrestige: 0,
    coalitionIntel: 0,
    missionSlider: 0,
    missionMeter: 0,
    scourgeCohesion: 80,
    scourgeFervor: 10,
    scourgeManpower: 100,
    scourgeRecoveryRate: 1,
    scourgeAttackCadence: 0,
    scourgeModifiers: [],
    scourgeNextAttackManpowerDamagePct: 0,
    pendingScourgeAttack: null,
    stockpiles: {
    },
    empires: [],
    armies: [],
    insurrections: [],
    laws: [],
    enactedLaws: [],
    events: [],
    currentEvent: null,
    heroes: [],
    diplomacy: { relations: {} },
    scourgeTargetEmpireId: null,
    log: [],
    gameOver: false,
    victory: false
  };
}

export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Re-export commonly used utilities
export { clamp, randomInt, randomFloat, getCohesionTier };
