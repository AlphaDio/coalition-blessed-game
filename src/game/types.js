// Type definitions and initializers

export function createEmpire(id, name, initialApproval = 50, aidCapacity = 100, traits = {}, values = {}, stats = {}, tags = [], modifiers = {}) {
  return {
    id,
    name,
    approval: initialApproval,
    aidCapacity,
    traits,
    values: values,
    stats: {
      population: stats.population || 1000,
      influence: stats.influence || 50
    },
    tags: tags,
    modifiers: {
      intensity: modifiers.intensity || 1.0,
      axis_gates: modifiers.axis_gates || {}
    }
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

export function createLaw(id, name, cost, cooldown = 0, effects = {}, vector = {}, weights = {}, tag_effects = []) {
  return {
    id,
    name,
    cost,
    cooldown,
    currentCooldown: 0,
    effects,
    vector: vector,
    weights: weights,
    tag_effects: tag_effects
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
    focus: 'main', // 'main', 'laws', 'warfunds', 'event'
    paused: false, // Real-time game pause state
    gameSpeed: 1 // Game speed multiplier (0.5 = slow, 1 = normal, 2 = fast)
  };
}
