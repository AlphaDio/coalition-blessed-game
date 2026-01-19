// Core state management and utilities
import { getCohesionTier } from './game/cohesion.js';
import { clamp, randomInt, randomFloat } from './utils/math.js';

export function initialState() {
  return {
    turn: 0,
    coalitionCohesion: 75,
    scourgeCohesion: 80,
    scourgeFervor: 10,
    stockpiles: {
      supplies: 1000
    },
    empires: [],
    armies: [],
    insurrections: [],
    laws: [],
    enactedLaws: [],
    events: [],
    currentEvent: null,
    units: [],
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
