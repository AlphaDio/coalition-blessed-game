// Type definitions and initializers

export function createEmpire(id, name, initialApproval = 50, traits = {}, values = {}, stats = {}, tags = [], modifiers = {}) {
  return {
    id,
    name,
    approval: initialApproval,
    stability: stats.stability ?? 60,
    color: stats.color,
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
    },
    // Economy fields
    budget_credits: stats.budget_credits || 10000,
    production: {
      outputs_per_tick: stats.production?.outputs_per_tick || {}
    },
    needs: {
      per_pop: stats.needs?.per_pop || {}
    },
    wants: {
      per_pop: stats.wants?.per_pop || {}
    },
    allocation: {
      surplus_to_armies_ratio: stats.allocation?.surplus_to_armies_ratio || 0.35,
      military_procurement_bias: stats.allocation?.military_procurement_bias || 0.15
    },
    stockpiles: stats.stockpiles || {}
  };
}

export function createArmy(id, empireId, name, initialFervor = 50, initialOrg = 60, supplyNeed = 50, initialCommand = 50, initialRecovery = 50) {
  return {
    id,
    empireId,
    name,
    fervor: initialFervor,
    organization: initialOrg,
    supplyNeed,
    aggravation: 0,
    
    // Economy fields
    manpower: supplyNeed * 100, // Convert supplyNeed to approximate manpower
    owner_empire_id: empireId,
    performance: {
      base: 1.0,
      current: 1.0
    },
    supply_state: {
      needs_fulfillment: {},
      wants_fulfillment: {},
      shortages: {},
      received: {} // Track received commodities this tick
    },
    demands: {
      needs: {}, // commodity_key -> qty_per_manpower_per_tick
      wants: {} // commodity_key -> qty_per_manpower_per_tick
    },
    
    // MP and MO pools for Front Battles
    mp: {
      current: 10000,
      max: 10000
    },
    mo: {
      current: 100,
      max: 100
    },
    
    // Combat stats (halved to make battles last twice as long)
    dmgPerUnitMP: 1.0,        // MP damage per engaged unit per tick (was 2.0)
    dmgPerTickMO: 2.5,        // Morale pressure per tick (was 5.0, NOT width-scaled)
    protection: 0.2,          // MP damage resistance (0..1)
    resolve: 0.3,             // MO damage resistance (0..1)
    killRate: 0.1,            // Fraction of MP damage that becomes permanent (0..1)
    
    // Sustain stats
    recoveryPool: 0,          // Temporary MP losses that can be recovered
    command: initialCommand,  // Command stat (0-100) - determines organization recovery speed
    recovery: initialRecovery, // Recovery stat (0-100) - determines MP recovery speed from recoveryPool
    reinforcementRate: 100    // Slower MP reinforcement per tick
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
 * @param {Object} modifiers - Law-specific modifiers (tick_delay_multiplier, enactment_chance_bonus, etc.)
 * @returns {Object} Law definition
 */
export function createLawDefinition(id, name, axis_vector = {}, law_tags = [], support_weights = {}, phase_tags = {}, modifiers = {}) {
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
    },
    modifiers: {
      tick_delay_multiplier: modifiers.tick_delay_multiplier || 1.0, // Multiplier for tick scheduling (< 1.0 = faster, > 1.0 = slower)
      enactment_chance_bonus: modifiers.enactment_chance_bonus || 0, // Bonus to enactment success (0.1 = +10%)
      progress_per_event: modifiers.progress_per_event || 1.0 // Multiplier for event progress
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
    phaseTicks: 0, // Resolutions spent in current phase
    stallTicks: 0, // Resolutions without progress in current phase
    pendingEvent: null, // ID of event waiting for player choice
    ticksSinceLastResolve: 0, // Counter for tick delay multiplier
    
    // Meters that bias event likelihood
    meters: {
      momentum: 0.6, // 0..1, forward drive (higher = more APPROVE/ADVANCE events)
      reject_pressure: 0.15, // 0..1, fragility/heat (lower = fewer REJECT events)
      unrest: 0.15, // 0..1, populace volatility
      polarization: 0.25, // 0..1, extremeness of empire positions
      legitimacy: 0.75, // 0..1, perceived validity
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

/**
 * Create a battle front for MP-axis battles
 * @param {string} id - Battle identifier
 * @param {string} leftArmyId - Army on the left side
 * @param {string} rightArmyId - Army on the right side
 * @param {number} battlefieldSize - Width affecting MP throughput
 * @param {number} startedAtTick - Game tick when battle started
 * @returns {Object} BattleFront
 */
export function createBattleFront(id, leftArmyId, rightArmyId, battlefieldSize = 1000, startedAtTick = 0) {
  return {
    id,
    state: 'ACTIVE', // ACTIVE | ENDED
    battlefieldSize,
    leftArmyId,
    rightArmyId,
    
    // Per-side battle flags
    moraleBroken: {
      left: false,
      right: false
    },
    
    // Bookkeeping
    permanentLosses: {
      left: 0,
      right: 0
    },
    startedAtTick,
    endedAtTick: null
  };
}

export function createGameState(seed = 0) {
  return {
    coalitionCohesion: 75,
    scourgeCohesion: 80,
    scourgeFervor: 10,
    stockpiles: {
      supplies: 1000
    },
    empires: [],
    armies: [],
    laws: [],
    activeLaws: [],
    insurrections: [],
    battleFronts: [],
    events: [],
    activeEvent: null,
    turn: 1,
    log: [],
    selectedLawIndex: 0,
    selectedArmyIndex: 0,
    focus: 'main', // 'main', 'laws', 'event'
    paused: false, // Real-time game pause state
    gameSpeed: 1, // Game speed multiplier (0.5 = slow, 1 = normal, 2 = fast)
    rngSeed: seed, // Seed for deterministic content variation
    
    // Law enactment system
    playerInfluence: 0, // Influence currency for starting laws
    influenceProgress: 0, // Progress toward next influence point (0..100 ticks)
    lawDefinitions: [], // Available law definitions
    lawProcesses: [], // In-flight law processes
    powerSystemPolicy: null, // Current voting power system
    
    // Market economy system
    market: null, // Market state per commodity (initialized on first economy tick)
    coalitionEconomy: null, // Coalition procurement and stockpiles (initialized on first economy tick)
    marketOrders: null, // Accumulated market orders for this tick (buyOrders, sellOffers)
    
    // Improvements system
    coalitionPotencyValue: 3, // Potency added per improvement
    improvements: null // Improvements queue and requests (initialized in index.js)
  };
}
