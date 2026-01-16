// Type definitions and initializers

export function createEmpire(id, name, initialApproval = 50, aidCapacity = 100, traits = {}) {
  return {
    id,
    name,
    approval: initialApproval,
    aidCapacity,
    traits
  };
}

export function createArmy(id, empireId, name, initialFervor = 50, initialOrg = 60, supplyNeed = 50) {
  return {
    id,
    empireId,
    name,
    fervor: initialFervor,
    organization: initialOrg,
    supplyNeed,
    aggravation: 0,
    warFundShare: 0
  };
}

export function createLaw(id, name, cost, cooldown = 0, effects = {}) {
  return {
    id,
    name,
    cost,
    cooldown,
    currentCooldown: 0,
    effects
  };
}

export function createEvent(id, title, text, choices = []) {
  return {
    id,
    title,
    text,
    choices
  };
}

export function createInsurrection(id, armies = [], strength = 0) {
  return {
    id,
    armies,
    strength,
    active: true
  };
}

export function createGameState() {
  return {
    coalitionCohesion: 75,
    scourgeCohesion: 80,
    scourgeFervor: 10,
    stockpiles: {
      supplies: 1000,
      alloys: 500,
      fuel: 300
    },
    empires: [],
    armies: [],
    laws: [],
    activeLaws: [],
    insurrections: [],
    events: [],
    activeEvent: null,
    turn: 1,
    log: [],
    pendingWarFundAllocation: null,
    selectedLawIndex: 0,
    selectedArmyIndex: 0,
    focus: 'main' // 'main', 'laws', 'warfunds', 'event'
  };
}
