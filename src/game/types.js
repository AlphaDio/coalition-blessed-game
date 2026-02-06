// Type definitions and initializers
import { TECH_CONSTANTS, IMPROVEMENTS_CONSTANTS } from './constants.js';

// Coalition procurement constants
export const THETA_PRESETS = {
  Scavenge: 0.80,
  Frugal: 0.90,
  Balanced: 1.00,
  Assertive: 1.10,
  Emergency: 1.25
};

export const COMMODITY_DEFINITIONS = {
  biomass: { tier: 'T1' },
  plasma_fuel: { tier: 'T1' },
  super_alloys: { tier: 'T2' },
  rare_gases: { tier: 'T2' },
  quantum_circuits: { tier: 'T3' },
  genomes: { tier: 'T3' },
  psycho_implants: { tier: 'T4' },
  ancient_relics: { tier: 'T4' }
};

export const MILLI_PER_UNIT_BY_TIER = {
  T1: 3,
  T2: 6,
  T3: 15,
  T4: 30
};

export const BATCH_SIZE_UNITS = 100;
export const BATCH_BONUS_MILLI = 0;

function createDefaultProcurement() {
  const thetaPresets = {};
  for (const commodityId of Object.keys(COMMODITY_DEFINITIONS)) {
    thetaPresets[commodityId] = 'Balanced';
  }
  return {
    spend_throttle: 0.8,
    theta_preset_by_commodity: thetaPresets
  };
}

function parseConsumptionRules(consumption) {
  if (!consumption) return [];
  return Object.entries(consumption).map(([commodity, rule]) => ({
    commodity,
    ...rule
  }));
}

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
      population: Math.max(1, stats.population ?? 1000),
      tech_rate_bonus: stats.tech_rate_bonus || 0,
      researchSpeedBonus: 0,
      approvalBonus: 0
    },
    tags: tags,
    modifiers: {
      intensity: modifiers.intensity || 1.0,
      axis_gates: modifiers.axis_gates || {},
      supply_efficiency: modifiers.supply_efficiency || 0
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
    stockpiles: stats.stockpiles || {},
    consumptionRules: parseConsumptionRules(stats.consumption),
    // Technology fields
    techPoints: 0,
    techThreshold: TECH_CONSTANTS.INITIAL_THRESHOLD,  // Points needed for next tech event
    technologies: [],      // Array of unlocked tech IDs
    techModifiers: {}      // Aggregate modifiers from unlocked technologies
  };
}

export function createArmy(id, empireId, name, initialFervor = 50, initialOrg = 60, initialAggravation = 0, initialCommand = 50, initialRecovery = 50, initialManpower = 10000) {
  return {
    id,
    empireId,
    name,
    fervor: initialFervor,
    fervorBonus: 0,
    protectionBonus: 0,
    resolveBonus: 0,
    killRateBonus: 0,
    timedFervorBonuses: [], // Array of {amount, expiresAt, source} for event-based fervor
    organization: initialOrg,
    supplyNeed: 0,
    aggravation: initialAggravation,
    
    // Manpower and economy fields (no longer derived from units)
    manpower: initialManpower,
    performance: {
      base: 1.0,
      current: 1.0,
      bonusMultiplier: 1.0
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
      current: initialManpower,
      max: initialManpower
    },
    mo: {
      current: 100,
      max: 100
    },
    
    // Combat stats
    dmgPerUnitMP: 1.0,
    dmgPerTickMO: 2.5,
    protection: 0.2,
    resolve: 0.3,
    killRate: 0.1,
    
    // Sustain stats: reinforcementRate = reserves joining during battle; recoveryRate = % of wounded that return after battle (0-100)
    woundedPool: 0,
    command: initialCommand,
    recovery: initialRecovery,
    recoveryRate: typeof initialRecovery === 'number' ? initialRecovery : 50,
    reinforcementRate: 100,
    
    // Replenishment modifiers
    replenishmentMultiplier: 1.0,  // Multiplicative modifier (e.g., 1.2 = +20%)
    replenishmentBonus: 0,          // Additive modifier (added after all multipliers)
    
    // Signature commodity for reinforcement (consumed from empire stockpile)
    signatureCommodity: null,
    signatureThreshold: 0
  };
}

// createUnit is DEPRECATED - units have been removed from the game
// Armies now directly manage manpower without separate unit entities
// This function is kept for backwards compatibility during migration
export function createUnit(id, armyId, empireId, name, stats = {}, demands = {}) {
  console.warn('createUnit is deprecated - units have been removed from the game');
  return null;
}

export function createHero(id, empireId, name, options = {}) {
  const modifiers = options.modifiers || {};
  return {
    id,
    empireId,
    name,
    tagline: options.tagline || '',
    tags: options.tags || [],
    values: options.values || {},
    status: options.status || 'ACTIVE',
    budget_share: options.budget_share ?? 0.1,
    charge: options.charge ?? 0,
    siphon_bank: options.siphon_bank ?? 0,
    ability_id: options.ability_id || null,
    passive: options.passive || {
      phase: 'DEBATE',
      cadence: 'OnStart',
      passive_id: null
    },
    meters: options.meters || {
      heat: 0,
      grievance: 0,
      popularity: 50
    },
    last_trigger_turn: options.last_trigger_turn ?? -1,
    cooldowns: options.cooldowns || { ability: 0 },
    modifiers: {
      dmgPerUnitMP: modifiers.dmgPerUnitMP || 0,
      dmgPerTickMO: modifiers.dmgPerTickMO || 0,
      killRate: modifiers.killRate || 0,
      recovery: modifiers.recovery || 0,
      organization: modifiers.organization || 0
    }
  };
}

/**
 * Create a technology definition
 * @param {string} id - Tech identifier (e.g., "advanced_metallurgy")
 * @param {string} name - Display name
 * @param {string} description - Flavor text describing the technology
 * @param {string} category - general | aligned | unique
 * @param {Object} requirements - Optional requirements (axis alignment, tags, etc.)
 * @param {Object} immediateEffects - One-time effects when unlocked
 * @param {Object} modifiers - Ongoing modifier bonuses
 * @returns {Object} Technology definition
 */
export function createTechnology(id, name, description, category = 'general', requirements = {}, immediateEffects = {}, modifiers = {}) {
  return {
    id,
    name,
    description,
    category,  // 'general' | 'aligned' | 'unique'
    requirements: {
      axis: requirements.axis || null,        // e.g., { axis: 'natural_mechanical', direction: 1, threshold: 0.3 }
      tags: requirements.tags || [],          // e.g., ['mechanical', 'hive']
      techs: requirements.techs || []         // prerequisite tech IDs
    },
    immediateEffects: {
      // One-time bonuses when tech is unlocked
      approval: immediateEffects.approval || 0,
      stability: immediateEffects.stability || 0,
      credits: immediateEffects.credits || 0,
      cohesion: immediateEffects.cohesion || 0
    },
    modifiers: {
      // Ongoing bonuses while tech is active
      research_speed: modifiers.research_speed || 0,
      industrial_output: modifiers.industrial_output || 0,
      army_organization: modifiers.army_organization || 0,
      supply_efficiency: modifiers.supply_efficiency || 0,
      trade_income: modifiers.trade_income || 0,
      market_efficiency: modifiers.market_efficiency || 0,
      population_growth: modifiers.population_growth || 0,
      empire_approval: modifiers.empire_approval || 0,
      energy_production: modifiers.energy_production || 0
    }
  };
}

export function createLaw(id, name, cost, tier = 0, effects = {}, vector = {}, weights = {}, tag_effects = []) {
  return {
    id,
    name,
    cost,
    tier,
    cooldown: 0, // Default cooldown (can be set by effects)
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
      progress_per_event: modifiers.progress_per_event || 1.0, // Multiplier for event progress
      army_maintenance_cost_modifier: modifiers.army_maintenance_cost_modifier || 1.0, // Multiplier for army maintenance costs (< 1.0 = cheaper)
      relations_strength_modifier: modifiers.relations_strength_modifier || 1.0, // Multiplier for diplomacy relations improvements
      ...modifiers // Include any additional modifiers like industrial_output, empire_approval, etc.
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
      legitimacy: 0.75 // 0..1, perceived validity
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

export function createEvent(id, title, text, choices = [], variables = null) {
  return {
    id,
    title,
    text,
    choices,
    variables  // Selector definitions for dynamic targeting
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
    threatClimate: { activeSlots: 0, activeBonusList: [] },
    stockpiles: {
    },
      empires: [],
      armies: [],
      heroes: [],
      heroRoster: [],
      heroRecruitmentState: {},
    diplomacy: { relations: {} },
    scourgeTargetEmpireId: null,
    
    // Scourge prediction system
    scourgePrediction: {
      targetEmpireId: null,          // Predicted next target
      estimatedTurnsToNextBattle: null, // Estimated turns until battle (null = very uncertain)
      confidenceModifier: 1.0,        // 1.0 = baseline certainty, >1.0 = more certain, <1.0 = less certain
      confidenceLevel: 'low',         // 'low' | 'medium' | 'high' based on modifier
      uncertaintyRange: { min: null, max: null } // Range of possible turn counts
    },
    
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
    paused: true, // Real-time game pause state
    gameSpeed: 1, // Game speed multiplier (0.5 = slow, 1 = normal, 2 = fast)
    rngSeed: seed, // Seed for deterministic content variation
    
    // Law enactment system
    playerInfluence: 0, // Influence currency for starting laws
    influenceProgress: 0, // Progress toward next influence point (0..100 ticks)
    lawDefinitions: [], // Available law definitions
    lawProcesses: [], // In-flight law processes
    powerSystemPolicy: null, // Current voting power system
    enactedLaws: [], // Array of enacted law IDs (removed from available options)
    enactedLawsByCategory: {}, // Map category -> active lawId
    enactedLawsHistory: [], // Array of law IDs ever enacted (for tier unlocks)
    lawTierUnlocks: { 1: true, 2: false, 3: false },
    
    // Coalition global modifiers (from laws, improvements, etc.)
    coalitionModifiers: {
      industrial_output: 0,
      research_speed: 0,
      army_organization: 0,
      supply_efficiency: 0,
      empire_approval: 0,
      population_growth: 0,
      trade_income: 0,
      market_efficiency: 0,
      empire_production_multiplier: 0,
      cohesionModifier: 1.0,
      army_maintenance_cost_modifier: 1.0,
      relations_strength_modifier: 1.0,
      tick_delay_multiplier: 1.0,
      hero_siphon_efficiency_mult: 0,
      hero_siphon_efficiency_add: 0,
      lawProgressBonus: 0,
      industrialOutputBonus: 0,
      law_progress_speed: 0,
      glory_gain_multiplier: 1.0,
      // Production efficiency modifiers (affect base production efficiency)
      production_efficiency_add: 0,    // Additive bonus to base efficiency (0.01 = +1%)
      production_efficiency_mult: 1.0, // Multiplicative bonus to efficiency (1.5 = 50% more)
      // Rationing modifiers (affect base consumption rationing)
      rationing_add: 0,                // Additive bonus to base rationing (0.01 = +1%)
      rationing_mult: 1.0,             // Multiplicative bonus to rationing (1.5 = 50% more consumption allowed)
      dynamic: {
        law_progress_speed_bonus: 0,
        improvement_build_speed_mult: 1.0,
        requisition_gen_mult: 1.0
      }
    },

    // Emergency laws system - timed powerful modifiers with resource costs
    activeEmergencyLaws: [],     // Active emergency law instances
    emergencyLawCooldowns: {},   // Map of lawId -> tick when cooldown ends
    activeEmergencyPowers: [],   // Active emergency power instances

    // Coalition economy system (requisition generation from empire consumption)
    coalitionEconomy: {
      requisition: 500, // Starting requisition for purchasing improvements
      treasury_credits: 10000, // Coalition treasury (long-term storage)
      allowance_credits: 1000, // Coalition allowance (refilled each tick, spent on consumption conversions)
      bank: 0,
      stockpile_bank: {},
      stockpile_ready: {},
      procurement: createDefaultProcurement()
      // Coalition generates requisition from empire commodity consumption (base 10% of value at 1000 credits = 1 req)
      // and credits from the allowance pool (up to allowance cap per tick)
      // Modifiable by multiplicativeShare and additiveShare modifiers
    },
    
    // Market economy system (updated with floor prices)
    market: null, // Market state per commodity (initialized on first economy tick)
    marketOrders: null, // Accumulated market orders for this tick (buyOrders, sellOffers)
    
    // Improvements system
    coalitionConstruction: IMPROVEMENTS_CONSTANTS.COALITION_CONSTRUCTION, // Build progress added to ALL building improvements per tick
    improvements: null, // Improvements queue and requests (initialized in index.js)

    // Timed modifiers from events
    timedModifiers: [] // Array of {key, value, expiresAt}
  };
}

/**
 * Clean up expired timed fervor bonuses for an army
 * Removes bonuses where expiresAt <= currentTurn
 * @param {Object} army - Army object
 * @param {number} currentTurn - Current game turn
 * @returns {Array} Array of expired bonuses that were removed
 */
export function cleanupExpiredFervorBonuses(army, currentTurn) {
  if (!army.timedFervorBonuses || !Array.isArray(army.timedFervorBonuses)) {
    return [];
  }
  
  const expired = [];
  army.timedFervorBonuses = army.timedFervorBonuses.filter(bonus => {
    if (bonus.expiresAt <= currentTurn) {
      expired.push(bonus);
      return false; // Remove expired bonus
    }
    return true; // Keep active bonus
  });
  
  return expired;
}

/**
 * Clean up expired timed modifiers for the entire state
 * Reverts modifier changes and removes expired entries
 * @param {Object} state - Game state
 * @returns {Array} Array of expired modifiers that were reverted
 */
export function cleanupExpiredTimedModifiers(state) {
  if (!state.timedModifiers || !Array.isArray(state.timedModifiers)) {
    return [];
  }
  
  const expired = [];
  const remaining = [];
  
  state.timedModifiers.forEach(modifier => {
    if (modifier.expiresAt <= state.turn) {
      // Revert the modifier
      if (state.coalitionModifiers && state.coalitionModifiers[modifier.key] !== undefined) {
        state.coalitionModifiers[modifier.key] -= modifier.value;
      }
      expired.push(modifier);
    } else {
      remaining.push(modifier);
    }
  });
  
  state.timedModifiers = remaining;
  return expired;
}

/**
 * Clean up all expired bonuses and modifiers for the entire state
 * Call this once per turn to maintain system integrity
 * @param {Object} state - Game state
 * @returns {Object} Summary of cleanup {fervorBonuses: [], timedModifiers: []}
 */
export function cleanupAllExpiredBonuses(state) {
  const summary = {
    fervorBonuses: [],
    timedModifiers: []
  };
  
  // Clean fervor bonuses for all armies
  if (state.armies && Array.isArray(state.armies)) {
    state.armies.forEach(army => {
      const expired = cleanupExpiredFervorBonuses(army, state.turn);
      summary.fervorBonuses.push(...expired);
    });
  }
  
  // Clean timed modifiers
  summary.timedModifiers = cleanupExpiredTimedModifiers(state);
  
  return summary;
}

/**
 * Migrate saved game state to current schema
 * Adds missing fields that may not exist in older saves
 * @param {Object} state - Game state (potentially from a save file)
 * @returns {Object} Migrated state with all required fields
 */
export function migrateGameState(state) {
  if (!state) return state;
  
  // Migrate armies - ensure replenishment fields exist
  if (state.armies && Array.isArray(state.armies)) {
    state.armies.forEach(army => {
      // Add missing replenishment fields with defaults
      if (army.replenishmentMultiplier === undefined) {
        army.replenishmentMultiplier = 1.0;
      }
      if (army.replenishmentBonus === undefined) {
        army.replenishmentBonus = 0;
      }
      
      // Ensure timed fervor bonuses array exists
      if (!Array.isArray(army.timedFervorBonuses)) {
        army.timedFervorBonuses = [];
      }
    });
  }
  
  // Ensure state has timedModifiers array for expired modifier cleanup
  if (!Array.isArray(state.timedModifiers)) {
    state.timedModifiers = [];
  }

  if (!Array.isArray(state.enactedLaws)) {
    state.enactedLaws = [];
  }
  if (!state.enactedLawsByCategory || typeof state.enactedLawsByCategory !== 'object') {
    state.enactedLawsByCategory = {};
  }
  if (!Array.isArray(state.enactedLawsHistory)) {
    state.enactedLawsHistory = [...state.enactedLaws];
  }
  if (!state.lawTierUnlocks || typeof state.lawTierUnlocks !== 'object') {
    state.lawTierUnlocks = { 1: true, 2: false, 3: false };
  }
  if (state.coalitionThreat === undefined) {
    state.coalitionThreat = 0;
  }
  if (state.coalitionGlory === undefined) {
    state.coalitionGlory = 0;
  }
  if (state.coalitionPrestige === undefined) {
    state.coalitionPrestige = 0;
  }
  if (state.coalitionIntel === undefined) {
    state.coalitionIntel = 0;
  }
  if (state.missionSlider === undefined) {
    state.missionSlider = 0;
  }
  if (state.missionMeter === undefined) {
    state.missionMeter = 0;
  }
  if (state.scourgeManpower === undefined) {
    state.scourgeManpower = 100;
  }
  if (state.scourgeRecoveryRate === undefined) {
    state.scourgeRecoveryRate = 1;
  }
  if (state.scourgeAttackCadence === undefined) {
    state.scourgeAttackCadence = 0;
  }
  if (state.scourgeNextAttackManpowerDamagePct === undefined) {
    state.scourgeNextAttackManpowerDamagePct = 0;
  }
  if (!Array.isArray(state.scourgeModifiers)) {
    state.scourgeModifiers = [];
  }
  if (state.pendingScourgeAttack === undefined) {
    state.pendingScourgeAttack = null;
  }
  if (!state.threatClimate || typeof state.threatClimate !== 'object') {
    state.threatClimate = { activeSlots: 0, activeBonusList: [] };
  }
  if (!Array.isArray(state.activeEmergencyPowers)) {
    state.activeEmergencyPowers = [];
  }
  if (!state.coalitionModifiers) {
    state.coalitionModifiers = {};
  }
  if (state.coalitionModifiers.glory_gain_multiplier === undefined) {
    state.coalitionModifiers.glory_gain_multiplier = 1.0;
  }
  if (state.coalitionModifiers.market_efficiency === undefined) {
    state.coalitionModifiers.market_efficiency = 0;
  }
  if (state.coalitionModifiers.tick_delay_multiplier === undefined) {
    state.coalitionModifiers.tick_delay_multiplier = 1.0;
  }
  if (state.coalitionModifiers.law_progress_speed === undefined) {
    state.coalitionModifiers.law_progress_speed = 0;
  }
  if (!state.coalitionModifiers.dynamic || typeof state.coalitionModifiers.dynamic !== 'object') {
    state.coalitionModifiers.dynamic = {
      law_progress_speed_bonus: 0,
      improvement_build_speed_mult: 1.0,
      requisition_gen_mult: 1.0
    };
  }
  
  return state;
}
