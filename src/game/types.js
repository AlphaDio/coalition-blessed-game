// Type definitions and initializers
import {
  TECH_CONSTANTS,
  UNITY_CONSTANTS,
  IMPROVEMENTS_CONSTANTS,
  SCOURGE_PREDICTION_CONSTANTS,
  ARMY_EXPERIENCE_CONSTANTS
} from './constants.js';
import { clampPopulation, ensurePopulationStats } from './populationUtils.js';

function parseConsumptionRules(consumption) {
  if (!consumption) return [];
  return Object.entries(consumption).map(([commodity, rule]) => ({
    commodity,
    ...rule
  }));
}

function getArmyExperienceThreshold(level = 0) {
  const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
  const threshold = ARMY_EXPERIENCE_CONSTANTS.BASE_THRESHOLD
    * Math.pow(ARMY_EXPERIENCE_CONSTANTS.THRESHOLD_GROWTH_MULTIPLIER, normalizedLevel);
  return Math.max(1, Math.round(threshold));
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
      population: clampPopulation(stats.population ?? 1000),
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
      surplus_to_armies_ratio: stats.allocation?.surplus_to_armies_ratio || 0.35
    },
    stockpiles: stats.stockpiles || {},
    consumptionRules: parseConsumptionRules(stats.consumption),
    // Supply fulfillment tracking (needs/wants demand and fill ratios)
    supply_state: {
      needs_demand: {},
      wants_demand: {},
      received: {},
      needs_fulfillment: {},
      wants_fulfillment: {}
    },
    // Technology fields
    techPoints: 0,
    techThreshold: TECH_CONSTANTS.INITIAL_THRESHOLD,  // Points needed for next tech event
    technologies: [],      // Array of unlocked tech IDs
    techModifiers: {},     // Aggregate modifiers from unlocked technologies
    // Unity fields
    unityPoints: 0,
    unityThreshold: UNITY_CONSTANTS.INITIAL_THRESHOLD,
    unityLevel: 0,
    unityEffects: [],      // Ordered list of unlocked unity effect IDs
    unityModifiers: {}     // Aggregate modifiers from unlocked unity effects
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
      received: {}, // Track received commodities this tick
      needs_demand: {},
      wants_demand: {}
    },
    demands: {
      needs: {}, // commodity_key -> qty_per_manpower_per_tick
      wants: {} // commodity_key -> qty_per_manpower_per_tick
    },
    consumptionRules: [],
    consumptionEffectPools: {},
    consumptionMpGainMultiplier: 1.0,
    consumptionDamageAdd: 0,
    experience: 0,
    experienceLevel: 0,
    experienceThreshold: getArmyExperienceThreshold(0),
    experienceSurge: null,
    insurrectionTriggerStreak: 0,
    lastInsurrectionTurn: 0,
    
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
    recruitmentBank: 0,             // Fractional capacity growth from sustained supply fulfillment

    // Reinforcement scaling is market-driven via needs/wants fulfillment.
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
 * @param {Object} options - Extra metadata (tier)
 * @returns {Object} Technology definition
 */
export function createTechnology(
  id,
  name,
  description,
  category = 'general',
  requirements = {},
  immediateEffects = {},
  modifiers = {},
  options = {}
) {
  return {
    id,
    name,
    description,
    category,  // 'general' | 'aligned' | 'unique'
    tier: Number.isFinite(options.tier) ? Math.max(1, Math.floor(options.tier)) : 1,
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
      army_fervor: modifiers.army_fervor || 0,
      army_damage_add: modifiers.army_damage_add || 0,
      army_damage_mult: modifiers.army_damage_mult || 0,
      army_replenishment_mult: modifiers.army_replenishment_mult || 0,
      army_consumption_mp_gain_mult: modifiers.army_consumption_mp_gain_mult || 0,
      supply_efficiency: modifiers.supply_efficiency || 0,
      trade_income: modifiers.trade_income || 0,
      market_efficiency: modifiers.market_efficiency || 0,
      population_growth: modifiers.population_growth || 0,
      empire_approval: modifiers.empire_approval || 0,
      energy_production: modifiers.energy_production || 0,
      law_progress_speed: modifiers.law_progress_speed || 0
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
    proposalId: null,
    sponsorHeroId: null,
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

export function createInsurrection(id, armies = [], strength = 0, options = {}) {
  return {
    id,
    armies,
    strength,
    active: true,
    sourceEmpireIds: Array.isArray(options.sourceEmpireIds) ? [...options.sourceEmpireIds] : [],
    targetEmpireId: options.targetEmpireId || null,
    createdAtTurn: Number.isFinite(Number(options.createdAtTurn)) ? Number(options.createdAtTurn) : null,
    resolvedAtTurn: null
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
    deepMissionCount: 0,
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
    scourgeDirectedTargetEmpireId: null,
    lastInsurrectionTurn: 0,
    insurrectionEmpireCooldowns: {},
    
    // Scourge prediction system
    scourgePrediction: {
      targetEmpireId: null,          // Predicted next target
      estimatedTurnsToNextBattle: null, // Estimated turns until battle (null = very uncertain)
      confidenceModifier: 1.0,        // 1.0 = baseline certainty, >1.0 = more certain, <1.0 = less certain
      confidenceLevel: 'low',         // 'low' | 'medium' | 'high' based on modifier
      uncertaintyRange: { min: null, max: null }, // Range of possible turn counts
      targetingMode: 'calculated',
      directTargetIntelCost: SCOURGE_PREDICTION_CONSTANTS.DIRECT_TARGET_INTEL_COST
    },
    
    laws: [],
    activeLaws: [],
    insurrections: [],
    battleFronts: [],
    events: [],
    activeEvent: null,
    unityPendingCelebrations: [],
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
    proposedLaws: [], // Hero-backed proposal pool for the player to select from
    lawProcesses: [], // In-flight law processes
    powerSystemPolicy: null, // Current voting power system
    enactedLaws: [], // Array of enacted law IDs (removed from available options)
    enactedLawsByCategory: {}, // Map category -> active lawId
    enactedLawsHistory: [], // Array of law IDs ever enacted (for tier unlocks)
    lawTierUnlocks: { 1: true, 2: false, 3: false, 4: false },
    
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
      consumptionShareMultiplier: 1.0,
      consumptionShareBonus: 0,
      requisition_uptick: 0,
      requisition_gain_multiplier: 1.0,
      consumptionSourceMultipliers: {},
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
    emergencyPowerUseCount: {},  // Map of powerId -> use count (for escalating costs)

    // Coalition economy system (requisition generation from empire consumption)
    coalitionEconomy: {
      requisition: 500, // Starting requisition for purchasing improvements
      treasury_credits: 10000, // Coalition treasury (long-term storage)
      allowance_credits: 1000, // Coalition allowance (refilled each tick, spent on consumption conversions)
      consumption_requisition_pool: 0, // Consumption requisition accrual pool (paid out in cadence)
      consumption_requisition_pool_turns: 0, // Turns progressed in current requisition payout cycle
      bank: 0
      // Coalition generates requisition from empire commodity consumption (base 10% of value at 1000 credits = 1 req)
      // and credits from the allowance pool (up to allowance cap per tick)
      // Modifiable by multiplicativeShare and additiveShare modifiers
    },

    // Per-empire pooled regular consumption for commodity effect triggers.
    consumptionEffectPools: {},
    
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

  if (state.empires && Array.isArray(state.empires)) {
    state.empires.forEach((empire) => {
      if (!empire.stats) {
        empire.stats = {};
      }
      if (empire.stats.population === undefined) {
        empire.stats.population = 1000;
      }
      ensurePopulationStats(empire);
      if (!Number.isFinite(empire.unityPoints) || empire.unityPoints < 0) {
        empire.unityPoints = 0;
      }
      if (!Number.isFinite(empire.unityLevel) || empire.unityLevel < 0) {
        empire.unityLevel = 0;
      } else {
        empire.unityLevel = Math.floor(empire.unityLevel);
      }
      if (!Array.isArray(empire.unityEffects)) {
        empire.unityEffects = [];
      }
      if (!empire.unityModifiers || typeof empire.unityModifiers !== 'object') {
        empire.unityModifiers = {};
      }
      const unityThresholdBaseline = Math.floor(
        UNITY_CONSTANTS.INITIAL_THRESHOLD * Math.pow((empire.unityLevel || 0) + 1, UNITY_CONSTANTS.THRESHOLD_EXPONENT)
      );
      if (!Number.isFinite(empire.unityThreshold) || empire.unityThreshold <= 0) {
        empire.unityThreshold = Math.max(1, unityThresholdBaseline);
      } else {
        empire.unityThreshold = Math.max(1, Math.round(empire.unityThreshold));
      }
      if ((empire.unityLevel || 0) >= UNITY_CONSTANTS.MAX_TIERS) {
        empire.unityThreshold = Number.MAX_SAFE_INTEGER;
        empire.unityPoints = 0;
      }
    });
  }
  
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
      if (army.consumptionMpGainMultiplier === undefined) {
        army.consumptionMpGainMultiplier = 1.0;
      }
      if (army.consumptionDamageAdd === undefined) {
        army.consumptionDamageAdd = 0;
      }
      if (!Number.isFinite(army.experience) || army.experience < 0) {
        army.experience = 0;
      }
      if (!Number.isFinite(army.experienceLevel) || army.experienceLevel < 0) {
        army.experienceLevel = 0;
      } else {
        army.experienceLevel = Math.floor(army.experienceLevel);
      }
      const minimumThreshold = getArmyExperienceThreshold(army.experienceLevel);
      if (!Number.isFinite(army.experienceThreshold) || army.experienceThreshold <= 0) {
        army.experienceThreshold = minimumThreshold;
      } else {
        army.experienceThreshold = Math.max(minimumThreshold, Math.round(army.experienceThreshold));
      }
      if (!army.experienceSurge || typeof army.experienceSurge !== 'object') {
        army.experienceSurge = null;
      } else {
        const ticksRemaining = Math.max(0, Math.floor(Number(army.experienceSurge.ticksRemaining) || 0));
        if (ticksRemaining <= 0) {
          army.experienceSurge = null;
        } else {
          army.experienceSurge = {
            level: Math.max(army.experienceLevel, Math.floor(Number(army.experienceSurge.level) || army.experienceLevel)),
            ticksRemaining,
            damageMult: Math.max(0, Number(army.experienceSurge.damageMult) || 0),
            killRateBonus: Math.max(0, Number(army.experienceSurge.killRateBonus) || 0),
            protectionBonus: Math.max(0, Number(army.experienceSurge.protectionBonus) || 0),
            resolveBonus: Math.max(0, Number(army.experienceSurge.resolveBonus) || 0)
          };
        }
      }
      if (!Number.isFinite(army.insurrectionTriggerStreak) || army.insurrectionTriggerStreak < 0) {
        army.insurrectionTriggerStreak = 0;
      } else {
        army.insurrectionTriggerStreak = Math.floor(army.insurrectionTriggerStreak);
      }
      if (!Number.isFinite(army.lastInsurrectionTurn) || army.lastInsurrectionTurn < 0) {
        army.lastInsurrectionTurn = 0;
      } else {
        army.lastInsurrectionTurn = Math.floor(army.lastInsurrectionTurn);
      }
      
      // Ensure timed fervor bonuses array exists
      if (!Array.isArray(army.timedFervorBonuses)) {
        army.timedFervorBonuses = [];
      }

      if (!army.supply_state || typeof army.supply_state !== 'object') {
        army.supply_state = {
          needs_fulfillment: {},
          wants_fulfillment: {},
          shortages: {},
          received: {},
          needs_demand: {},
          wants_demand: {}
        };
      } else {
        if (!army.supply_state.needs_fulfillment || typeof army.supply_state.needs_fulfillment !== 'object') {
          army.supply_state.needs_fulfillment = {};
        }
        if (!army.supply_state.wants_fulfillment || typeof army.supply_state.wants_fulfillment !== 'object') {
          army.supply_state.wants_fulfillment = {};
        }
        if (!army.supply_state.shortages || typeof army.supply_state.shortages !== 'object') {
          army.supply_state.shortages = {};
        }
        if (!army.supply_state.received || typeof army.supply_state.received !== 'object') {
          army.supply_state.received = {};
        }
        if (!army.supply_state.needs_demand || typeof army.supply_state.needs_demand !== 'object') {
          army.supply_state.needs_demand = {};
        }
        if (!army.supply_state.wants_demand || typeof army.supply_state.wants_demand !== 'object') {
          army.supply_state.wants_demand = {};
        }
      }
    });
  }

  if (!Array.isArray(state.insurrections)) {
    state.insurrections = [];
  } else {
    state.insurrections.forEach(insurrection => {
      if (!Array.isArray(insurrection.sourceEmpireIds)) {
        insurrection.sourceEmpireIds = [];
      }
      if (insurrection.targetEmpireId === undefined) {
        insurrection.targetEmpireId = null;
      }
      if (insurrection.createdAtTurn === undefined) {
        insurrection.createdAtTurn = null;
      }
      if (insurrection.resolvedAtTurn === undefined) {
        insurrection.resolvedAtTurn = null;
      }
    });
  }
  if (!Number.isFinite(state.lastInsurrectionTurn) || state.lastInsurrectionTurn < 0) {
    state.lastInsurrectionTurn = 0;
  } else {
    state.lastInsurrectionTurn = Math.floor(state.lastInsurrectionTurn);
  }
  if (!state.insurrectionEmpireCooldowns || typeof state.insurrectionEmpireCooldowns !== 'object' || Array.isArray(state.insurrectionEmpireCooldowns)) {
    state.insurrectionEmpireCooldowns = {};
  }
  
  // Ensure state has timedModifiers array for expired modifier cleanup
  if (!Array.isArray(state.timedModifiers)) {
    state.timedModifiers = [];
  }
  if (!Array.isArray(state.unityPendingCelebrations)) {
    state.unityPendingCelebrations = [];
  }

  if (!Array.isArray(state.enactedLaws)) {
    state.enactedLaws = [];
  }
  if (!Array.isArray(state.proposedLaws)) {
    state.proposedLaws = [];
  }
  if (!state.enactedLawsByCategory || typeof state.enactedLawsByCategory !== 'object') {
    state.enactedLawsByCategory = {};
  }
  if (state.lawProcesses && Array.isArray(state.lawProcesses)) {
    state.lawProcesses.forEach((lawProcess) => {
      if (lawProcess.proposalId === undefined) {
        lawProcess.proposalId = null;
      }
      if (lawProcess.sponsorHeroId === undefined) {
        lawProcess.sponsorHeroId = null;
      }
    });
  }
  if (state.heroes && Array.isArray(state.heroes)) {
    state.heroes.forEach((hero) => {
      hero.cooldowns = hero.cooldowns || {};
      if (!Number.isFinite(hero.cooldowns.ability)) {
        hero.cooldowns.ability = 0;
      }
      if (!Number.isFinite(hero.cooldowns.law_proposal)) {
        hero.cooldowns.law_proposal = 0;
      }
    });
  }
  if (!Array.isArray(state.enactedLawsHistory)) {
    state.enactedLawsHistory = [...state.enactedLaws];
  }
  if (!state.lawTierUnlocks || typeof state.lawTierUnlocks !== 'object') {
    state.lawTierUnlocks = { 1: true, 2: false, 3: false, 4: false };
  } else {
    state.lawTierUnlocks[1] = true;
    if (state.lawTierUnlocks[2] === undefined) {
      state.lawTierUnlocks[2] = false;
    }
    if (state.lawTierUnlocks[3] === undefined) {
      state.lawTierUnlocks[3] = false;
    }
    if (state.lawTierUnlocks[4] === undefined) {
      state.lawTierUnlocks[4] = false;
    }
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
  if (state.scourgeDirectedTargetEmpireId === undefined) {
    state.scourgeDirectedTargetEmpireId = null;
  }
  if (state.missionSlider === undefined) {
    state.missionSlider = 0;
  }
  if (state.missionMeter === undefined) {
    state.missionMeter = 0;
  }
  if (!Number.isFinite(state.deepMissionCount) || state.deepMissionCount < 0) {
    state.deepMissionCount = 0;
  } else {
    state.deepMissionCount = Math.floor(state.deepMissionCount);
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
  if (!state.scourgePrediction || typeof state.scourgePrediction !== 'object') {
    state.scourgePrediction = {
      targetEmpireId: null,
      estimatedTurnsToNextBattle: null,
      confidenceModifier: 1.0,
      confidenceLevel: 'low',
      uncertaintyRange: { min: null, max: null },
      targetingMode: 'calculated',
      directTargetIntelCost: SCOURGE_PREDICTION_CONSTANTS.DIRECT_TARGET_INTEL_COST
    };
  } else {
    if (state.scourgePrediction.targetingMode === undefined) {
      state.scourgePrediction.targetingMode = 'calculated';
    }
    if (!Number.isFinite(state.scourgePrediction.directTargetIntelCost)) {
      state.scourgePrediction.directTargetIntelCost = SCOURGE_PREDICTION_CONSTANTS.DIRECT_TARGET_INTEL_COST;
    }
  }
  if (!state.threatClimate || typeof state.threatClimate !== 'object') {
    state.threatClimate = { activeSlots: 0, activeBonusList: [] };
  }
  if (!Array.isArray(state.activeEmergencyPowers)) {
    state.activeEmergencyPowers = [];
  }
  if (!state.emergencyPowerUseCount || typeof state.emergencyPowerUseCount !== 'object') {
    state.emergencyPowerUseCount = {};
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
  if (state.coalitionModifiers.consumptionShareMultiplier === undefined) {
    state.coalitionModifiers.consumptionShareMultiplier = 1.0;
  }
  if (state.coalitionModifiers.consumptionShareBonus === undefined) {
    state.coalitionModifiers.consumptionShareBonus = 0;
  }
  if (state.coalitionModifiers.requisition_uptick === undefined) {
    state.coalitionModifiers.requisition_uptick = 0;
  }
  if (state.coalitionModifiers.requisition_gain_multiplier === undefined) {
    state.coalitionModifiers.requisition_gain_multiplier = 1.0;
  }
  if (!state.coalitionModifiers.consumptionSourceMultipliers || typeof state.coalitionModifiers.consumptionSourceMultipliers !== 'object') {
    state.coalitionModifiers.consumptionSourceMultipliers = {};
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
  if (!state.coalitionEconomy || typeof state.coalitionEconomy !== 'object') {
    state.coalitionEconomy = {
      requisition: 0,
      treasury_credits: 0,
      allowance_credits: 0,
      consumption_requisition_pool: 0,
      consumption_requisition_pool_turns: 0,
      bank: 0
    };
  } else {
    if (!Number.isFinite(state.coalitionEconomy.requisition)) {
      state.coalitionEconomy.requisition = 0;
    }
    if (!Number.isFinite(state.coalitionEconomy.treasury_credits)) {
      state.coalitionEconomy.treasury_credits = 0;
    }
    if (!Number.isFinite(state.coalitionEconomy.allowance_credits)) {
      state.coalitionEconomy.allowance_credits = 0;
    }
    if (!Number.isFinite(state.coalitionEconomy.consumption_requisition_pool)) {
      state.coalitionEconomy.consumption_requisition_pool = 0;
    }
    if (!Number.isFinite(state.coalitionEconomy.consumption_requisition_pool_turns)) {
      state.coalitionEconomy.consumption_requisition_pool_turns = 0;
    }
    if (!Number.isFinite(state.coalitionEconomy.bank)) {
      state.coalitionEconomy.bank = 0;
    }
  }
  if (!state.consumptionEffectPools || typeof state.consumptionEffectPools !== 'object' || Array.isArray(state.consumptionEffectPools)) {
    state.consumptionEffectPools = {};
  } else {
    Object.entries(state.consumptionEffectPools).forEach(([empireId, commodityPools]) => {
      if (!commodityPools || typeof commodityPools !== 'object' || Array.isArray(commodityPools)) {
        state.consumptionEffectPools[empireId] = {};
        return;
      }

      Object.entries(commodityPools).forEach(([commodity, pooledValue]) => {
        const normalized = Number(pooledValue);
        if (!Number.isFinite(normalized) || normalized <= 0) {
          delete state.consumptionEffectPools[empireId][commodity];
          return;
        }
        state.consumptionEffectPools[empireId][commodity] = normalized;
      });
    });
  }

  if (state.market && typeof state.market === 'object') {
    if (!Array.isArray(state.market.remaining_sell_offers_post_clear)) {
      state.market.remaining_sell_offers_post_clear = [];
    }
    if (!Array.isArray(state.market.remaining_buy_offers_post_clear)) {
      state.market.remaining_buy_offers_post_clear = [];
    }
    if (!state.market.buy_backlog_by_commodity || typeof state.market.buy_backlog_by_commodity !== 'object') {
      state.market.buy_backlog_by_commodity = {};
    }
    if (!state.market.buy_backlog_by_commodity_and_owner || typeof state.market.buy_backlog_by_commodity_and_owner !== 'object') {
      state.market.buy_backlog_by_commodity_and_owner = {};
    }

    Object.entries(state.market).forEach(([marketKey, marketState]) => {
      if (!marketState || typeof marketState !== 'object') return;
      if (marketKey === 'price_by_commodity' || marketKey === 'last_price_by_commodity' ||
          marketKey === 'floor_price_by_commodity' || marketKey === 'price_range_by_commodity' ||
          marketKey === 'remaining_sell_offers_post_clear' || marketKey === 'remaining_buy_offers_post_clear' ||
          marketKey === 'buy_backlog_by_commodity' || marketKey === 'buy_backlog_by_commodity_and_owner') {
        return;
      }

      if (!Array.isArray(marketState.remaining_sell_offers_post_clear)) {
        marketState.remaining_sell_offers_post_clear = [];
      }
      if (!Array.isArray(marketState.remaining_buy_offers_post_clear)) {
        marketState.remaining_buy_offers_post_clear = [];
      }
      if (!Number.isFinite(marketState.buy_backlog_total)) {
        marketState.buy_backlog_total = 0;
      }
      if (!Number.isFinite(marketState.flow_demand_qty_turn)) {
        marketState.flow_demand_qty_turn = 0;
      }
      if (!Number.isFinite(marketState.flow_supply_qty_turn)) {
        marketState.flow_supply_qty_turn = 0;
      }
      if (!Number.isFinite(marketState.flow_traded_qty_turn)) {
        marketState.flow_traded_qty_turn = 0;
      }
    });
  }

  if (state.improvements && typeof state.improvements === 'object') {
    if (Array.isArray(state.improvements.queue)) {
      state.improvements.queue.forEach(improvement => {
        if (!Number.isFinite(improvement?.unityOutput)) {
          improvement.unityOutput = 0;
        }
      });
    }
    if (!state.improvements.pendingSustainmentDemand || typeof state.improvements.pendingSustainmentDemand !== 'object') {
      state.improvements.pendingSustainmentDemand = {};
    }
    if (!state.improvements.pendingSustainmentNeedsByImprovement || typeof state.improvements.pendingSustainmentNeedsByImprovement !== 'object') {
      state.improvements.pendingSustainmentNeedsByImprovement = {};
    }
    if (!state.improvements.fulfilledSustainmentReceipts || typeof state.improvements.fulfilledSustainmentReceipts !== 'object') {
      state.improvements.fulfilledSustainmentReceipts = {};
    }
    if (state.improvements.sustainmentCycleTurn === undefined) {
      state.improvements.sustainmentCycleTurn = null;
    }
    if (state.improvements.sustainmentResolvedTurn === undefined) {
      state.improvements.sustainmentResolvedTurn = null;
    }
  }
  
  return state;
}
