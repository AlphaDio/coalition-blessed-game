// Game constants - tunable numbers

export const COHESION_TIERS = {
  TIER_1: { min: 67, max: 100, name: 'Stable' },
  TIER_2: { min: 34, max: 66, name: 'Strained' },
  TIER_3: { min: 1, max: 33, name: 'Desperate' }
};

export const INITIAL_STATE = {
  coalitionCohesion: 75,
  scourgeCohesion: 80,
  scourgeFervor: 10,
  stockpiles: {
  },
  turn: 1
};

export const COALITION_ECONOMY = {
  INITIAL_BUDGET: 5000,           // Starting coalition credits
  BUDGET_PER_TICK: 100            // Credits gained per tick
};

export const MARKET_CONSTANTS = {
  SELL_PRICE_DISCOUNT: 0.95,      // Empires sell at 95% of market price
  BUY_NEEDS_PREMIUM: 1.1,         // Willing to pay 10% above market for needs
  BUY_WANTS_PREMIUM: 1.05,        // Willing to pay 5% above market for wants
  ARMY_NEEDS_PREMIUM: 1.2,        // Armies pay 20% above market for needs
  ARMY_WANTS_PREMIUM: 1.15,       // Armies pay 15% above market for wants
  SURPLUS_RATIO_THRESHOLD: 0.35,  // When stockpiles exceed this ratio, sell surplus
  SURPLUS_TARGET_RATIO: 0.7,      // Target stockpile ratio after selling
  SURPLUS_KEEP_RATIO: 0.5,        // Keep at least this much when selling
  POPULATION_GROWTH_BANK_THRESHOLD: 10 // Population growth accumulates to this threshold before applying
};

export const FRONT_BATTLE_MODIFIERS = {
  FERVOR_MIN: 0.8,                // 0 fervor = 0.8x damage
  FERVOR_RANGE: 1.0,              // 100 fervor = 0.8 + 1.0 = 1.8x damage
  ORG_MIN: 0.9,                   // 0 organization = 0.9x damage
  ORG_RANGE: 0.2                  // 100 organization = 0.9 + 0.2 = 1.1x damage
};

export const BATTLE_CONSTANTS = {
  ARMY_POWER_ORG_WEIGHT: 0.6,
  ARMY_POWER_FERVOR_WEIGHT: 0.4,
  SCOURGE_BASE_POWER: 80, // Increased from 50 to make battles more challenging
  SCOURGE_FERVOR_MULTIPLIER: 2.0,
  SCOURGE_RNG_RANGE: 20,
  SCOURGE_TURN_POWER_GROWTH: 0.0015,

  SCOURGE_TURN_MP_GROWTH: 12,
  INSURRECTION_RNG_RANGE: 15,
  WIN_ORG_LOSS: 5,
  WIN_FERVOR_GAIN: 3,
  LOSS_ORG_LOSS: 15,
  LOSS_FERVOR_LOSS: 5,
  SCOURGE_WIN_COHESION_LOSS: 4,
  SCOURGE_LOSS_COHESION_LOSS: 5,
  SCOURGE_WIN_APPROVAL_LOSS: 10,
  INSURRECTION_WIN_COHESION_LOSS: 3,
  INSURRECTION_LOSS_COHESION_LOSS: 12
};

export const ECONOMY_CONSTANTS = {
  ORG_PER_PERCENT_SHARE: 0.3,
  AGGRAVATION_REDUCTION_PER_PERCENT: 0.2,
  UNDERFUNDED_ORG_DECAY: 2,
  UNDERFUNDED_AGGRAVATION_INCREASE: 3,
  SUPPLY_SHORTAGE_ORG_PENALTY: 10,
  SUPPLY_SHORTAGE_AGGRAVATION_INCREASE: 5,
  SCOURGE_FERVOR_GROWTH: 0.02,
  NEGATIVE_REQUISITION_COHESION_DIVISOR: 250 // For every 250 req, lose 1 cohesion

};

export const INSURRECTION_CONSTANTS = {
  THRESHOLD: 80,
  RESOLVED_FERVOR_DROP: 20,
  RESOLVED_APPROVAL_SHOCK: 15
};

export const EVENT_CONSTANTS = {
  TIER_1_FREQUENCY: 0.05,  // 5% chance (was 10%)
  TIER_2_FREQUENCY: 0.10,  // 10% chance (was 20%)
  TIER_3_FREQUENCY: 0.15   // 15% chance (was 30%)
};

export const REALTIME_CONSTANTS = {
  BASE_TICK_INTERVAL: 2000, // milliseconds per turn at normal speed
  MIN_SPEED: 0.5, // slowest speed multiplier
  MAX_SPEED: 3, // fastest speed multiplier
  SPEED_STEP: 0.5, // speed adjustment increment
  MIN_TICK_INTERVAL: 100, // minimum interval to prevent performance issues
  MAX_TICK_INTERVAL: 10000 // maximum interval cap
};

export const PRODUCTION_EFFICIENCY_CONSTANTS = {
  BASE_EFFICIENCY: 0.01,              // 1% base efficiency (99% nerf) - effectively divides production by 100
  MIN_EFFICIENCY: 0.001,              // Minimum efficiency floor (0.1%)
  MAX_EFFICIENCY: 1.0                 // Maximum efficiency cap (100%)
};

export const RATIONING_CONSTANTS = {
  BASE_RATIONING: 0.01,               // 1% base rationing (99% nerf) - effectively divides consumption by 100
  MIN_RATIONING: 0.001,               // Minimum rationing floor (0.1%)
  MAX_RATIONING: 1.0                  // Maximum rationing cap (100%)
};

export const GAME_INIT_CONSTANTS = {
  // Coalition economy starting values
  INITIAL_REQUISITION: 500,
  INITIAL_TREASURY_CREDITS: 10000,
  INITIAL_ALLOWANCE_CREDITS: 1000,
  
  // Player starting values
  INITIAL_PLAYER_INFLUENCE: 100,
  
  // Voting system defaults
  DEFAULT_BASE_VOTES_PER_EMPIRE: 1,
  DEFAULT_QUORUM_THRESHOLD: 0.5,
  DEFAULT_PASS_THRESHOLD: 0.5,
  
  // RNG seed offsets for deterministic subsystems
  RNG_OFFSET_IMPROVEMENTS: 1000
};

export const VALUE_AXES = {
  AUTHORITARIAN_LIBERAL: 'authoritarian_liberal',
  SPIRITUAL_MATERIALISTIC: 'spiritual_materialistic',
  NATURAL_MECHANICAL: 'natural_mechanical',
  PACIFIST_MILITARISTIC: 'pacifist_militaristic',
  STOICIST_HEDONISTIC: 'stoicist_hedonistic',
  ESSENTIALIST_CONSTRUCTIVIST: 'essentialist_constructivist'
};

export const AXES_CONFIG = {
  authoritarian_liberal: { min: -1, max: 1 },
  spiritual_materialistic: { min: -1, max: 1 },
  natural_mechanical: { min: -1, max: 1 },
  pacifist_militaristic: { min: -1, max: 1 },
  stoicist_hedonistic: { min: -1, max: 1 },
  essentialist_constructivist: { min: -1, max: 1 }
};

export const REACTION_CONSTANTS = {
  THRESHOLDS: {
    LAUD: 0.60,
    APPROVE: 0.20,
    NEUTRAL_BAND: 0.20, // Width of neutral band: reactions in [-0.20..+0.20] are neutral
    DISAPPROVE: -0.20,
    DENOUNCE: -0.60
  },
  POWER_SCALING: {
    POP_EXPONENT: 0.5,
    PRESSURE_LOG_DIVISOR: 5 // Normalizes log10(pressure) to ~0.2-1.5 range for scaling
  }
};

export const TECH_CONSTANTS = {
  BASE_POINTS_PER_TICK: 100,         // Base tech points gained per tick
  INITIAL_THRESHOLD: 25000,          // First tech unlocks at ~500 ticks (50000 / 100)
  THRESHOLD_EXPONENT: 1.10,          // Polynomial exponent: threshold = initial * (n+1)^exp
  BASE_RESEARCH_SPEED: 1.0,          // Default research_speed modifier
  TECH_CHOICES_COUNT: 3              // Number of tech choices offered per event
};

export const IMPROVEMENTS_CONSTANTS = {
  INITIAL_MAX_TOTAL_CAPACITY: 6,     // Starting maximum total improvement capacity
  COALITION_CONSTRUCTION: 4          // Build progress added to ALL building improvements per tick
};

export const SCOURGE_PREDICTION_CONSTANTS = {
  BASE_CONFIDENCE_MODIFIER: 1.0,      // Default certainty level
  CONFIDENCE_PER_LEVEL: 0.3,           // Modifier increase per confidence tier improvement
  STABLE_BONUS: 0.1,                   // Bonus modifier when coalition is Stable
  STRAINED_PENALTY: -0.05,             // Penalty when Strained
  DESPERATE_PENALTY: -0.15,            // Penalty when Desperate
  MIN_CONFIDENCE_MODIFIER: 0.1,        // Minimum (very uncertain)
  MAX_CONFIDENCE_MODIFIER: 2.0,        // Maximum (very certain)
  CONFIDENCE_DRIFT_TURNS: 30,          // Turns to drift toward baseline (1.0)
  
  // Uncertainty ranges based on confidence
  UNCERTAINTY_RANGE_LOW: { min: 5, max: 20 },      // Wide range when confidence is low
  UNCERTAINTY_RANGE_MEDIUM: { min: 2, max: 8 },    // Moderate range
  UNCERTAINTY_RANGE_HIGH: { min: 1, max: 3 }       // Narrow range
};

export const CONSUMPTION_REQUISITION_CONSTANTS = {
  CREDITS_PER_REQUISITION: 1000,                    // Conversion rate: 1000 credits = 1 requisition
  COALITION_CONSUMPTION_SHARE_BASE: 0.10,           // 10% - Base coalition share of consumption value
  CONVERSION_REQUISITION_MULTIPLIER: 10,            // 10x - Multiplier for requisition from consumption
  ALLOWANCE_PER_TICK: 1000,                         // Credits granted per tick
  ALLOWANCE_CAP_TICKS: 4                            // Maximum allowance (in ticks worth)
};

export const SCOURGE_MODIFIER_CONSTANTS = {
  MIN_SEVERITY: 1,                    // Minimum severity for modifiers (also starting value)
  // Note: No max severity - modifiers scale infinitely
  
  // Effect scaling per severity level (tuned for infinite scaling)
  ATTACK_POWER_PER_SEVERITY: 0.04,    // +4% Scourge attack power per severity 8%->4%
  RECOVERY_RATE_PER_SEVERITY: 0.05,   // +5% Scourge recovery rate per severity 10%->5%
  LAW_SPEED_PER_SEVERITY: -0.03       // -3% coalition law enact speed per severity
};

// Mission slider allowed values - centralized for server validation, mission logic, and UI
export const MISSION_SLIDER_VALUES = [-1, 0, 1, 2, 5];

export const SCOURGE_MISSION_CONSTANTS = {
  THREAT_THRESHOLD_1: 35,
  THREAT_THRESHOLD_2: 60,
  THREAT_THRESHOLD_3: 80,
  GLORY_BASE_PER_SCOURGE_WIN: 100,
  EP_COST_MEDIUM: 120,
  EP_COST_MEDIUM_HIGH: 180,
  EP_COST_HIGH: 240,
  EP_BASE_DURATION: 400,
  EP_MAX_ACTIVE: 1,
  MISSION_METER_PER_REQUISITION: 0.05,
  MISSION_NEGATIVE_THREAT_INCREASE: 2,
  MISSION_NEGATIVE_GLORY_TAX_DURATION: 600,
  MISSION_NEGATIVE_GLORY_GAIN_MUL: 0.85,
  DEEP_STRIKE_MP_PCT: 0.5,
  DEEP_SABOTAGE_SEVERITY: 1,
  DEEP_GLORY_SMALL: 40,
  DEEP_GLORY_MEDIUM: 80,
  DEEP_HARVEST_THREAT_SMALL_POSITIVE: 2,
  DEEP_REQUISITION_SMALL: 60,
  DEEP_INTEL_SMALL: 1,
  THREAT_CLIMATE_STRENGTHS: [0.08, 0.15, 0.25]
};

