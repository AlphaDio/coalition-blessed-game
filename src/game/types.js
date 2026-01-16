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

/**
 * Create a law definition for the law enactment system
 * @param {string} id - Law identifier
 * @param {string} name - Law name
 * @param {Object} axis_vector - Position on ideological axes
 * @param {Array} law_tags - Tags like "biologic", "mechanical", "hive", "warped"
 * @param {Object} support_weights - Biases like population_incentive, security_incentive, economy_incentive
 * @param {Object} phase_tags - Event tags eligible in each phase (DEBATE, FALLOUT, VOTING)
 * @returns {Object} Law definition
 */
export function createLawDefinition(id, name, axis_vector = {}, law_tags = [], support_weights = {}, phase_tags = {}) {
  return {
    id,
    name,
    axis_vector,
    law_tags,
    support_weights: {
      population_incentive: support_weights.population_incentive || 0,
      security_incentive: support_weights.security_incentive || 0,
      economy_incentive: support_weights.economy_incentive || 0
    },
    phase_tags: {
      DEBATE: phase_tags.DEBATE || [],
      FALLOUT: phase_tags.FALLOUT || [],
      VOTING: phase_tags.VOTING || []
    }
  };
}

/**
 * Create a law process instance (runtime state for an in-flight law)
 * @param {string} lawId - Reference to law definition
 * @param {number} startTick - Game tick when law was started
 * @returns {Object} Law process state
 */
export function createLawProcess(lawId, startTick = 0) {
  return {
    lawId,
    phase: 'DEBATE', // DEBATE | FALLOUT | VOTING | ENACTED | BURIED
    phaseProgress: 0, // 0..1, advances to next phase at 1.0
    rejects: 0, // 0..4, burial at 4
    startTick,
    
    // Meters that bias event likelihood
    meters: {
      momentum: 0.5, // 0..1, forward drive
      reject_pressure: 0.3, // 0..1, fragility/heat
      unrest: 0.2, // 0..1, populace volatility
      polarization: 0.3, // 0..1, extremeness of empire positions
      legitimacy: 0.7, // 0..1, perceived validity
      economy_shock: 0.1 // 0..1, economic disruption
    },
    
    // Per-empire snapshots
    empireStances: {}, // Map: empireId -> { stance_score, stance_tier, vote_intent, modifiers }
    
    // Event log for this law
    eventLog: []
  };
}

/**
 * Create empire stance for a law process
 * @param {string} empireId - Empire identifier
 * @param {number} stance_score - Calculated stance score (-1 to 1)
 * @param {string} stance_tier - LAUD/APPROVE/NEUTRAL/DISAPPROVE/DENOUNCE
 * @param {string} vote_intent - support/oppose/abstain
 * @returns {Object} Empire stance
 */
export function createEmpireStance(empireId, stance_score = 0, stance_tier = 'NEUTRAL', vote_intent = 'abstain') {
  return {
    empireId,
    stance_score,
    stance_tier,
    vote_intent,
    modifiers: {
      bribed: 0,
      threatened: 0,
      scandalized: 0
    }
  };
}

/**
 * Create a power system policy (defines voting rules)
 * @param {string} id - Policy identifier
 * @param {string} name - Policy name
 * @param {string} type - equal_council | pressure_weighted | hegemonic
 * @param {Object} config - Configuration for vote allocation and quorum
 * @returns {Object} Power system policy
 */
export function createPowerSystemPolicy(id, name, type = 'equal_council', config = {}) {
  return {
    id,
    name,
    type,
    config: {
      base_votes_per_empire: config.base_votes_per_empire || 1,
      pressure_multiplier: config.pressure_multiplier || 0, // Used in pressure_weighted
      hegemonic_bonus: config.hegemonic_bonus || 0, // Used in hegemonic
      quorum_threshold: config.quorum_threshold || 0.5, // Fraction of total votes needed
      pass_threshold: config.pass_threshold || 0.5 // Fraction of votes needed to pass
    }
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
    gameSpeed: 1, // Game speed multiplier (0.5 = slow, 1 = normal, 2 = fast)
    
    // Law enactment system
    playerInfluence: 0, // Influence currency for starting laws
    influenceProgress: 0, // Progress toward next influence point (0..100 ticks)
    lawDefinitions: [], // Available law definitions
    lawProcesses: [], // In-flight law processes
    powerSystemPolicy: null // Current voting power system
  };
}
