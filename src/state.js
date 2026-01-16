// Core state management and utilities

export function initialState() {
  return {
    turn: 0,
    coalitionCohesion: 75,
    scourgeCohesion: 80,
    scourgeFervor: 10,
    stockpiles: {
      supplies: 1000,
      alloys: 500,
      fuel: 300
    },
    warFunds: {
      total: 100,
      allocations: {} // armyId -> percentage (0-100)
    },
    empires: [],
    armies: [],
    insurrections: [],
    laws: [],
    enactedLaws: [],
    events: [],
    currentEvent: null,
    log: [],
    gameOver: false,
    victory: false
  };
}

export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getCohesionTier(cohesion) {
  if (cohesion >= 67) return 1; // Stable
  if (cohesion >= 34) return 2; // Strained
  return 3; // Desperate
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}
