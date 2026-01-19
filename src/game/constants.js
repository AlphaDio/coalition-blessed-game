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
    supplies: 1000
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
  SURPLUS_KEEP_RATIO: 0.5         // Keep at least this much when selling
};

export const FRONT_BATTLE_MODIFIERS = {
  FERVOR_MIN: 0.8,                // 0 fervor = 0.8x damage
  FERVOR_RANGE: 0.4,              // 100 fervor = 0.8 + 0.4 = 1.2x damage
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
  SCOURGE_WIN_COHESION_LOSS: 8,
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
  SCOURGE_FERVOR_GROWTH: 0.005

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
  BASE_TICK_INTERVAL: 2500, // milliseconds per turn at normal speed (5 seconds)
  MIN_SPEED: 0.5, // slowest speed multiplier
  MAX_SPEED: 3, // fastest speed multiplier
  SPEED_STEP: 0.5, // speed adjustment increment
  MIN_TICK_INTERVAL: 500 // minimum interval to prevent performance issues
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
  BASE_POINTS_PER_TICK: 10000,         // Base tech points gained per tick
  INITIAL_THRESHOLD: 50000,          // First tech unlocks at ~500 ticks (50000 / 100)
  THRESHOLD_EXPONENT: 1.10,          // Polynomial exponent: threshold = initial * (n+1)^exp
  BASE_RESEARCH_SPEED: 1.0,          // Default research_speed modifier
  TECH_CHOICES_COUNT: 3              // Number of tech choices offered per event
};
