// Game constants - tunable numbers

/**
 * Coalition cohesion tier definitions.
 * Cohesion represents the unity/stability of the coalition.
 * Different tiers affect gameplay mechanics like event frequency and prediction accuracy.
 * @property {Object} TIER_1 - Stable state (67-100), coalition functions well
 * @property {Object} TIER_2 - Strained state (34-66), coalition under pressure
 * @property {Object} TIER_3 - Desperate state (1-33), coalition near collapse
 */
export const COHESION_TIERS = {
  TIER_1: { min: 67, max: 100, name: 'Stable' },
  TIER_2: { min: 34, max: 66, name: 'Strained' },
  TIER_3: { min: 1, max: 33, name: 'Desperate' }
};

/**
 * Cohesion pacing across the whole game.
 * Used to keep aggregate cohesion gains/losses balanced for long runs.
 * With a 2000-tick target, each individual cohesion delta is scaled down versus
 * the previous 1000-tick baseline.
 */
export const COHESION_PACING = {
  BASELINE_TICKS: 1000,
  TARGET_TICKS: 2000,
  MIN_DELTA_ABS: 0.05
};

/**
 * Initial game state values when starting a new game.
 * @property {number} coalitionCohesion - Starting cohesion for the player coalition (0-100)
 * @property {number} scourgeCohesion - Starting cohesion for the enemy Scourge faction
 * @property {number} scourgeFervor - Starting fervor (aggression/morale) of the Scourge
 * @property {Object} stockpiles - Initial resource stockpiles (empty at start)
 * @property {number} turn - Starting turn number
 */
export const INITIAL_STATE = {
  coalitionCohesion: 75,
  scourgeCohesion: 80,
  scourgeFervor: 10,
  stockpiles: {
  },
  turn: 1
};

/**
 * Coalition-wide economy settings.
 * @property {number} INITIAL_BUDGET - Starting coalition credits
 * @property {number} BUDGET_PER_TICK - Credits passively gained each game tick
 */
export const COALITION_ECONOMY = {
  INITIAL_BUDGET: 5000,           // Starting coalition credits
  BUDGET_PER_TICK: 100            // Credits gained per tick
};

/**
 * Market trading mechanics and price modifiers.
 * Controls how empires and armies buy/sell resources on the market.
 * @property {number} SELL_PRICE_DISCOUNT - Empires sell at 95% of market price (5% loss)
 * @property {number} BUY_NEEDS_PREMIUM - Empires pay 10% above market for essential needs
 * @property {number} BUY_WANTS_PREMIUM - Empires pay 5% above market for non-essential wants
 * @property {number} ARMY_NEEDS_PREMIUM - Armies pay 20% above market for essential supplies
 * @property {number} ARMY_WANTS_PREMIUM - Armies pay 15% above market for non-essential items
 * @property {number} SURPLUS_RATIO_THRESHOLD - Sell surplus when stockpile exceeds 35% of capacity
 * @property {number} SURPLUS_TARGET_RATIO - Target 70% stockpile ratio after selling
 * @property {number} SURPLUS_KEEP_RATIO - Always keep at least 50% when selling surplus
 * @property {number} POPULATION_GROWTH_BANK_THRESHOLD - Population grows by 1 when banked growth reaches 10
 */
export const MARKET_CONSTANTS = {
  SELL_PRICE_DISCOUNT: 0.95,      // Empires sell at 95% of market price
  BUY_NEEDS_PREMIUM: 1.1,         // Willing to pay 10% above market for needs
  BUY_WANTS_PREMIUM: 1.05,        // Willing to pay 5% above market for wants
  ARMY_NEEDS_PREMIUM: 1.2,        // Armies pay 20% above market for needs
  ARMY_WANTS_PREMIUM: 1.15,       // Armies pay 15% above market for wants
  RELATION_PRICE_SWING_CAP: 0.3,  // Diplomacy can swing bilateral trade prices by up to +/-30%
  SURPLUS_RATIO_THRESHOLD: 0.35,  // When stockpiles exceed this ratio, sell surplus
  SURPLUS_TARGET_RATIO: 0.7,      // Target stockpile ratio after selling
  SURPLUS_KEEP_RATIO: 0.5,        // Keep at least this much when selling
  POPULATION_GROWTH_BANK_THRESHOLD: 10, // Population growth accumulates to this threshold before applying
  BULK_QTY_THRESHOLD: 20,         // Orders above this qty qualify for bulk/gross pricing
  BULK_DISCOUNT_MAX: 0.15         // Maximum gross discount (15%) for large bulk orders
};

/**
 * Population system balance targets.
 * Population is treated as a capped strategic scale value. Positive growth tapers
 * as an empire approaches the ceiling so stacked growth sources remain useful
 * without running away indefinitely.
 */
export const POPULATION_CONSTANTS = {
  MIN_POPULATION: 1,
  MAX_POPULATION: 1_000_000,
  BASE_GROWTH_RATE: 0.001
};

/**
 * Raw trade_income modifiers are scaled down before being paid out as credits.
 * The divisor is intentionally low enough that trade statutes and dedicated
 * economic improvements create a meaningful budget faucet per empire.
 */
export const TRADE_INCOME_EFFECT_DIVISOR = 20;

/**
 * Front battle damage calculation modifiers.
 * Fervor and organization affect damage output in battles.
 * @property {number} FERVOR_MIN - Base damage multiplier at 0 fervor (0.85x)
 * @property {number} FERVOR_RANGE - Additional multiplier at 100 fervor (0.85 + 1.25 = 2.1x max)
 * @property {number} ORG_MIN - Base damage multiplier at 0 organization (0.9x)
 * @property {number} ORG_RANGE - Additional multiplier at 100 organization (0.9 + 0.2 = 1.1x max)
 * @property {number} MP_DAMAGE_MULT - Applied to MP damage only to control battle duration
 */
export const FRONT_BATTLE_MODIFIERS = {
  FERVOR_MIN: 0.85,               // 0 fervor = 0.85x damage
  FERVOR_RANGE: 1.25,             // 100 fervor = 0.85 + 1.25 = 2.1x damage
  ORG_MIN: 0.9,                   // 0 organization = 0.9x damage
  ORG_RANGE: 0.2,                 // 100 organization = 0.9 + 0.2 = 1.1x damage
  MP_DAMAGE_MULT: 0.5             // Halve MP attrition so battles run longer and morale matters more
};

/**
 * Battle system configuration for combat between armies and the Scourge.
 * @property {number} ARMY_POWER_ORG_WEIGHT - Weight of organization in army power calculation (60%)
 * @property {number} ARMY_POWER_FERVOR_WEIGHT - Weight of fervor in army power calculation (40%)
 * @property {number} SCOURGE_BASE_POWER - Base combat power of Scourge forces
 * @property {number} SCOURGE_BASE_MP - Base manpower pool of the Scourge before turn scaling
 * @property {number} SCOURGE_FERVOR_MULTIPLIER - Multiplier for Scourge fervor contribution to power
 * @property {number} SCOURGE_RNG_RANGE - Random variance range (+/-) in Scourge power
 * @property {number} SCOURGE_TURN_POWER_GROWTH - Percentage power growth per turn (0.15%)
 * @property {number} SCOURGE_TURN_MP_GROWTH - Military power points gained by Scourge per turn
 * @property {number} SCOURGE_TURN_GROWTH_CURVE_EXPONENT - Curves turn scaling sublinearly (<1 slows late growth)
 * @property {number} SCOURGE_COHESION_MP_EXP_DIVISOR - Divisor for cohesion exponential MP scaling (higher = smoother)
 * @property {number} INSURRECTION_RNG_RANGE - Random variance range in insurrection battles
 * @property {number} SCOURGE_TARGET_ARMY_ORG_MIN - Minimum organization for target-empire armies to respond
 * @property {number} SCOURGE_ASSIST_MIN_RELATIONS - Minimum mutual relations required for allied support
 * @property {number} SCOURGE_ASSIST_MAX_RATIO - Maximum share of an allied army that can be committed as support
 * @property {number} WIN_ORG_LOSS - Organization lost by winner after battle
 * @property {number} WIN_FERVOR_GAIN - Fervor gained by winner after battle
 * @property {number} LOSS_ORG_LOSS - Organization lost by loser after battle
 * @property {number} LOSS_FERVOR_LOSS - Fervor lost by loser after battle
 * @property {number} SCOURGE_WIN_COHESION_LOSS - Coalition cohesion lost when Scourge wins
 * @property {number} SCOURGE_LOSS_COHESION_LOSS - Coalition cohesion lost even when Scourge loses
 * @property {number} SCOURGE_WIN_APPROVAL_LOSS - Empire approval lost when Scourge wins
 * @property {number} SCOURGE_DEFENSE_HERO_POPULARITY_GAIN - Popularity gained by the targeted empire's hero when Coalition defeats the Scourge
 * @property {number} INSURRECTION_WIN_COHESION_LOSS - Cohesion lost when putting down insurrection
 * @property {number} INSURRECTION_LOSS_COHESION_LOSS - Cohesion lost when insurrection succeeds
 */
export const BATTLE_CONSTANTS = {
  ARMY_POWER_ORG_WEIGHT: 0.6,
  ARMY_POWER_FERVOR_WEIGHT: 0.4,
  SCOURGE_BASE_POWER: 80, // Increased from 50 to make battles more challenging
  SCOURGE_BASE_MP: 7000,
  SCOURGE_FERVOR_MULTIPLIER: 2.0,
  SCOURGE_RNG_RANGE: 20,
  SCOURGE_TURN_POWER_GROWTH: 0.00135,
  SCOURGE_TURN_MP_GROWTH: 10,
  SCOURGE_TURN_GROWTH_CURVE_EXPONENT: 0.88,
  SCOURGE_COHESION_MP_EXP_DIVISOR: 30,
  SCOURGE_TARGET_ARMY_ORG_MIN: 30,
  SCOURGE_ASSIST_MIN_RELATIONS: 40,
  SCOURGE_ASSIST_MAX_RATIO: 0.5,
  INSURRECTION_RNG_RANGE: 15,
  WIN_ORG_LOSS: 5,
  WIN_FERVOR_GAIN: 3,
  LOSS_ORG_LOSS: 15,
  LOSS_FERVOR_LOSS: 5,
  SCOURGE_WIN_COHESION_LOSS: 4,
  SCOURGE_LOSS_COHESION_LOSS: 5,
  SCOURGE_WIN_APPROVAL_LOSS: 10,
  SCOURGE_DEFENSE_HERO_POPULARITY_GAIN: 6,
  INSURRECTION_WIN_COHESION_LOSS: 3,
  INSURRECTION_LOSS_COHESION_LOSS: 12
};

/**
 * Economy tick calculations affecting organization, aggravation, and supplies.
 * @property {number} ORG_PER_PERCENT_SHARE - Organization gained per 1% budget share
 * @property {number} AGGRAVATION_REDUCTION_PER_PERCENT - Aggravation reduced per 1% budget share
 * @property {number} UNDERFUNDED_ORG_DECAY - Organization decay when underfunded
 * @property {number} UNDERFUNDED_AGGRAVATION_INCREASE - Aggravation increase when underfunded
 * @property {number} SUPPLY_SHORTAGE_ORG_PENALTY - Organization penalty for supply shortages
 * @property {number} SUPPLY_SHORTAGE_AGGRAVATION_INCREASE - Aggravation increase from supply shortage
 * @property {number} SCOURGE_FERVOR_GROWTH - Percentage growth of Scourge fervor per tick (2%)
 * @property {number} NEGATIVE_REQUISITION_COHESION_DIVISOR - Negative requisition to cohesion loss ratio (2500:1)
 * @property {number} ARMY_NEEDS_DEFICIT_EPSILON - Threshold below which needs deficit is considered effectively met
 * @property {number} ARMY_NEEDS_DAMAGE_GATE_EPSILON - MP delta required before army needs demand activates
 * @property {number} ARMY_NEEDS_AGGRAVATION_BASE_PER_TICK - Base aggravation gain from unmet needs while damaged
 * @property {number} ARMY_WANTS_AGGRAVATION_BASE_PER_TICK - Base aggravation gain from unmet wants (much lower than needs)
 * @property {number} ARMY_WANTS_FERVOR_DECAY_BASE_PER_TICK - Base fervor decay from unmet wants
 * @property {number} ARMY_WANTS_ORG_DECAY_BASE_PER_TICK - Base organization decay from unmet wants (affects army performance)
 * @property {number} ARMY_AGGRAVATION_DECAY_PER_TICK - Natural aggravation decay per tick when needs are met
 * @property {number} ARMY_GROWTH_CONSUMPTION_THRESHOLD_BASE - Base consumption (of demanded resources) needed to trigger +1 MP capacity; scales so growth ~every dozens of turns
 * @property {number} ARMY_GROWTH_CONSUMPTION_THRESHOLD_PER_SQRT_MP - Extra threshold per sqrt(army MP) so larger armies need more stored consumption
 * @property {number} ARMY_GROWTH_MP_PER_TRIGGER - MP capacity added when consumption threshold is reached
 * @property {number} ARMY_CONSUMPTION_MP_BASELINE_MULTIPLIER - Flat pacing multiplier for army MP growth from consumption (80% of prior defensive-recon baseline)
 * @property {number} ARMY_CONSUMPTION_EFFECT_THRESHOLD_MULTIPLIER - Global multiplier applied to army consumption effect thresholds at content load
 * @property {number} EMPIRE_DEMAND_POPULATION_EXPONENT - Population exponent for empire needs/wants demand
 * @property {number} ARMY_POPULATION_DEMAND_BASE - Base multiplier for army demand pressure
 * @property {number} ARMY_POPULATION_DEMAND_LOG_SCALE - Extra multiplier from log10(population) for army demand pressure
 */
export const ECONOMY_CONSTANTS = {
  ORG_PER_PERCENT_SHARE: 0.3,
  AGGRAVATION_REDUCTION_PER_PERCENT: 0.2,
  UNDERFUNDED_ORG_DECAY: 2,
  UNDERFUNDED_AGGRAVATION_INCREASE: 3,
  SUPPLY_SHORTAGE_ORG_PENALTY: 2,
  SUPPLY_SHORTAGE_AGGRAVATION_INCREASE: 1,
  SCOURGE_FERVOR_GROWTH: 0.02,
  NEGATIVE_REQUISITION_COHESION_DIVISOR: 2500, // For every 2500 req, lose 1 cohesion
  ARMY_NEEDS_DEFICIT_EPSILON: 0.01,
  ARMY_NEEDS_DAMAGE_GATE_EPSILON: 1,
  ARMY_NEEDS_AGGRAVATION_BASE_PER_TICK: 0.6,
  ARMY_WANTS_AGGRAVATION_BASE_PER_TICK: 0.12,
  ARMY_WANTS_FERVOR_DECAY_BASE_PER_TICK: 0.15,
  ARMY_WANTS_ORG_DECAY_BASE_PER_TICK: 0.25,
  ARMY_AGGRAVATION_DECAY_PER_TICK: 0.4,
  ARMY_GROWTH_CONSUMPTION_THRESHOLD_BASE: 150,
  ARMY_GROWTH_CONSUMPTION_THRESHOLD_PER_SQRT_MP: 2.25,
  ARMY_GROWTH_MP_PER_TRIGGER: 5,
  ARMY_CONSUMPTION_MP_BASELINE_MULTIPLIER: 0.8,
  ARMY_CONSUMPTION_EFFECT_THRESHOLD_MULTIPLIER: 20,
  EMPIRE_DEMAND_POPULATION_EXPONENT: 1.0,
  ARMY_POPULATION_DEMAND_BASE: 1.0,
  ARMY_POPULATION_DEMAND_LOG_SCALE: 2.5
};

/**
 * Army battle experience and veteran surge tuning.
 * Armies gain XP after each battle based on outcome and intensity.
 * On level up they gain a one-round surge for their next battle tick.
 * @property {number} BASE_THRESHOLD - XP required for level 1
 * @property {number} THRESHOLD_GROWTH_MULTIPLIER - Multiplier applied per level
 * @property {number} WIN_XP - Base XP for winning a battle
 * @property {number} LOSS_XP - Base XP for losing a battle (higher than WIN_XP)
 * @property {number} DRAW_XP - Base XP for draw outcomes
 * @property {number} MIN_PARTICIPATION_FACTOR - Minimum XP factor from partial participation
 * @property {number} MAX_PARTICIPATION_FACTOR - Maximum XP factor from participation
 * @property {number} MIN_INTENSITY_FACTOR - Minimum XP factor from battle intensity
 * @property {number} MAX_INTENSITY_FACTOR - Maximum XP factor from battle intensity
 * @property {number} SURGE_TICKS - Number of battle rounds the surge lasts
 * @property {number} SURGE_DAMAGE_MULT_BASE - Base damage multiplier bonus on surge
 * @property {number} SURGE_DAMAGE_MULT_PER_LEVEL - Extra surge damage per level
 * @property {number} SURGE_DAMAGE_MULT_CAP - Max surge damage multiplier
 * @property {number} SURGE_KILL_RATE_BONUS_BASE - Base kill-rate bonus on surge
 * @property {number} SURGE_KILL_RATE_BONUS_PER_LEVEL - Extra kill-rate bonus per level
 * @property {number} SURGE_KILL_RATE_BONUS_CAP - Max kill-rate surge bonus
 * @property {number} SURGE_PROTECTION_BONUS_BASE - Base protection bonus on surge
 * @property {number} SURGE_PROTECTION_BONUS_PER_LEVEL - Extra protection bonus per level
 * @property {number} SURGE_PROTECTION_BONUS_CAP - Max protection surge bonus
 * @property {number} SURGE_RESOLVE_BONUS_BASE - Base resolve bonus on surge
 * @property {number} SURGE_RESOLVE_BONUS_PER_LEVEL - Extra resolve bonus per level
 * @property {number} SURGE_RESOLVE_BONUS_CAP - Max resolve surge bonus
 */
export const ARMY_EXPERIENCE_CONSTANTS = {
  BASE_THRESHOLD: 120,
  THRESHOLD_GROWTH_MULTIPLIER: 1.35,
  WIN_XP: 18,
  LOSS_XP: 30,
  DRAW_XP: 24,
  MIN_PARTICIPATION_FACTOR: 0.3,
  MAX_PARTICIPATION_FACTOR: 1.0,
  MIN_INTENSITY_FACTOR: 0.8,
  MAX_INTENSITY_FACTOR: 1.8,
  SURGE_TICKS: 1,
  SURGE_DAMAGE_MULT_BASE: 0.4,
  SURGE_DAMAGE_MULT_PER_LEVEL: 0.06,
  SURGE_DAMAGE_MULT_CAP: 0.95,
  SURGE_KILL_RATE_BONUS_BASE: 0.03,
  SURGE_KILL_RATE_BONUS_PER_LEVEL: 0.01,
  SURGE_KILL_RATE_BONUS_CAP: 0.22,
  SURGE_PROTECTION_BONUS_BASE: 0.04,
  SURGE_PROTECTION_BONUS_PER_LEVEL: 0.008,
  SURGE_PROTECTION_BONUS_CAP: 0.2,
  SURGE_RESOLVE_BONUS_BASE: 0.04,
  SURGE_RESOLVE_BONUS_PER_LEVEL: 0.008,
  SURGE_RESOLVE_BONUS_CAP: 0.2
};

/**
 * Insurrection pressure and trigger thresholds.
 * High aggravation now erodes the owning empire's approval first. Rebellion only
 * occurs once approval is low and an army still carries at least a modest amount of aggravation.
 * @property {number} THRESHOLD - Minimum aggravation required for a rebellion check
 * @property {number} APPROVAL_THRESHOLD - Maximum approval allowed for rebellion checks
 * @property {number} APPROVAL_PRESSURE_THRESHOLD - High aggravation threshold that converts into approval loss
 * @property {number} APPROVAL_PRESSURE_LOSS_PER_ARMY - Base approval lost per over-threshold army each turn
 * @property {number} APPROVAL_PRESSURE_EXCESS_DIVISOR - Additional approval loss per N aggravation over the pressure threshold
 * @property {number} POST_REBELLION_AGGRAVATION - Aggravation reset after armies rebel
 * @property {number} RESOLVED_FERVOR_DROP - Fervor reduction when insurrection is resolved
 * @property {number} RESOLVED_APPROVAL_SHOCK - Approval penalty when insurrection is resolved
 * @property {number} COOLDOWN_TICKS - Minimum ticks after an insurrection before another can trigger
 * @property {number} TRIGGER_CONFIRMATION_TICKS - Consecutive turns conditions must hold before spawning
 * @property {number} ARMY_COOLDOWN_TICKS - Per-army cooldown after rebelling
 * @property {number} EMPIRE_COOLDOWN_TICKS - Per-empire cooldown after any rebellion
 */
export const INSURRECTION_CONSTANTS = {
  THRESHOLD: 80,
  APPROVAL_THRESHOLD: 35,
  APPROVAL_PRESSURE_THRESHOLD: 80,
  APPROVAL_PRESSURE_LOSS_PER_ARMY: 1,
  APPROVAL_PRESSURE_EXCESS_DIVISOR: 10,
  POST_REBELLION_AGGRAVATION: 0,
  RESOLVED_FERVOR_DROP: 20,
  RESOLVED_APPROVAL_SHOCK: 15,
  COOLDOWN_TICKS: 80,
  TRIGGER_CONFIRMATION_TICKS: 3,
  ARMY_COOLDOWN_TICKS: 180,
  EMPIRE_COOLDOWN_TICKS: 120
};

/**
 * Random event occurrence frequencies by cohesion tier.
 * Lower cohesion = higher chance of random events occurring.
 * @property {number} TIER_1_FREQUENCY - Event chance when Stable (2.5%)
 * @property {number} TIER_2_FREQUENCY - Event chance when Strained (5%)
 * @property {number} TIER_3_FREQUENCY - Event chance when Desperate (7.5%)
 * @property {number} RELATION_EFFECT_SCALAR - Global scalar for event-driven relation deltas
 * @property {number} RELATION_EFFECT_ABS_CAP - Absolute max relation delta an event can apply per edge
 * @property {number} RELATION_DIMINISHING_FLOOR - Minimum remaining impact when near relation caps
 * @property {number} RELATION_RECOVERY_BIAS - Positive-delta multiplier when repairing negative relations
 * @property {number} RELATION_HOSTILITY_DAMPING - Negative-delta damping when relation is already hostile
 * @property {number} RELATION_MIN_STEP - Minimum absolute non-zero relation delta after scaling
 */
export const EVENT_CONSTANTS = {
  TIER_1_FREQUENCY: 0.025,  // 2.5% chance (was 5%)
  TIER_2_FREQUENCY: 0.05,   // 5% chance (was 10%)
  TIER_3_FREQUENCY: 0.075,  // 7.5% chance (was 15%)
  RELATION_EFFECT_SCALAR: 0.7,
  RELATION_EFFECT_ABS_CAP: 9,
  RELATION_DIMINISHING_FLOOR: 0.2,
  RELATION_RECOVERY_BIAS: 1.15,
  RELATION_HOSTILITY_DAMPING: 0.8,
  RELATION_MIN_STEP: 0.4
};

/**
 * Real-time game tick and speed configuration.
 * Controls the pacing of the game simulation.
 * @property {number} BASE_TICK_INTERVAL - Milliseconds per turn at 1x speed (2 seconds)
 * @property {number} MIN_SPEED - Slowest speed multiplier (0.5x = 4 second ticks)
 * @property {number} MAX_SPEED - Fastest speed multiplier (3x = ~667ms ticks)
 * @property {number} SPEED_STEP - Increment when adjusting speed
 * @property {number} MIN_TICK_INTERVAL - Fastest allowed tick in ms (performance floor)
 * @property {number} MAX_TICK_INTERVAL - Slowest allowed tick in ms
 */
export const REALTIME_CONSTANTS = {
  BASE_TICK_INTERVAL: 2000, // milliseconds per turn at normal speed
  MIN_SPEED: 0.5, // slowest speed multiplier
  MAX_SPEED: 3, // fastest speed multiplier
  SPEED_STEP: 0.5, // speed adjustment increment
  MIN_TICK_INTERVAL: 100, // minimum interval to prevent performance issues
  MAX_TICK_INTERVAL: 10000 // maximum interval cap
};

/**
 * Production efficiency modifiers for resource generation.
 * Applied as a multiplier to raw production values.
 * @property {number} BASE_EFFICIENCY - Default 10% efficiency (effectively divides production by 10)
 * @property {number} MIN_EFFICIENCY - Minimum efficiency floor (0.1%)
 * @property {number} MAX_EFFICIENCY - Maximum efficiency cap (100%)
 */
export const PRODUCTION_EFFICIENCY_CONSTANTS = {
  BASE_EFFICIENCY: 0.10,              // 10% base efficiency (90% nerf) - effectively divides production by 10
  MIN_EFFICIENCY: 0.001,              // Minimum efficiency floor (0.1%)
  MAX_EFFICIENCY: 1.0                 // Maximum efficiency cap (100%)
};

/**
 * Rationing modifiers for resource consumption.
 * Applied as a multiplier to raw consumption values.
 * @property {number} BASE_RATIONING - Default 10% rationing (effectively divides consumption by 10)
 * @property {number} MIN_RATIONING - Minimum rationing floor (0.1%)
 * @property {number} MAX_RATIONING - Maximum rationing cap (100%)
 */
export const RATIONING_CONSTANTS = {
  BASE_RATIONING: 0.10,               // 10% base rationing (90% nerf) - effectively divides consumption by 10
  MIN_RATIONING: 0.001,               // Minimum rationing floor (0.1%)
  MAX_RATIONING: 1.0                  // Maximum rationing cap (100%)
};

/**
 * Commodity-specific economy rebalance multipliers.
 * Used to keep per-turn supply and demand closer to market-clearing
 * while preserving persistent backlog behavior.
 */
export const ECONOMY_BALANCE_CONSTANTS = {
  DEMAND_MULTIPLIERS_BY_COMMODITY: {
    plasma_fuel: 1.00,
    biomass: 1.00
  },
  SUPPLY_MULTIPLIERS_BY_COMMODITY: {
    plasma_fuel: 1.10,
    biomass: 1.05
  },
  IMPROVEMENT_PRODUCTION_BANK_THRESHOLD_DEFAULT: 10
};

/**
 * Initial game setup values for new games.
 * @property {number} INITIAL_REQUISITION - Starting requisition points for coalition operations
 * @property {number} INITIAL_TREASURY_CREDITS - Starting credits in coalition treasury
 * @property {number} INITIAL_ALLOWANCE_CREDITS - Starting allowance credits for spending
 * @property {number} INITIAL_PLAYER_INFLUENCE - Starting influence points for player actions
 * @property {number} DEFAULT_BASE_VOTES_PER_EMPIRE - Base voting power per empire in law votes
 * @property {number} DEFAULT_QUORUM_THRESHOLD - Fraction of votes needed for quorum (50%)
 * @property {number} DEFAULT_PASS_THRESHOLD - Fraction of votes needed to pass law (50%)
 * @property {number} RNG_OFFSET_IMPROVEMENTS - Seed offset for deterministic improvement RNG
 */
export const GAME_INIT_CONSTANTS = {
  // Coalition economy starting values
  INITIAL_REQUISITION: 1000, // 500 -> 1000
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

/**
 * Political/philosophical value axes for empires.
 * Each axis represents a spectrum of beliefs that affect empire behavior and reactions.
 * Values range from -1 (first trait) to +1 (second trait).
 * @property {string} AUTHORITARIAN_LIBERAL - Control vs freedom preference
 * @property {string} SPIRITUAL_MATERIALISTIC - Faith vs pragmatism orientation
 * @property {string} NATURAL_MECHANICAL - Organic vs technological preference
 * @property {string} PACIFIST_MILITARISTIC - Peace vs war inclination
 * @property {string} STOICIST_HEDONISTIC - Austerity vs pleasure values
 * @property {string} ESSENTIALIST_CONSTRUCTIVIST - Fixed vs malleable identity beliefs
 */
export const VALUE_AXES = {
  AUTHORITARIAN_LIBERAL: 'authoritarian_liberal',
  SPIRITUAL_MATERIALISTIC: 'spiritual_materialistic',
  NATURAL_MECHANICAL: 'natural_mechanical',
  PACIFIST_MILITARISTIC: 'pacifist_militaristic',
  STOICIST_HEDONISTIC: 'stoicist_hedonistic',
  ESSENTIALIST_CONSTRUCTIVIST: 'essentialist_constructivist'
};

/**
 * Configuration for each value axis defining valid ranges.
 * All axes use -1 to +1 range where:
 *   -1 = strongly first trait (e.g., authoritarian)
 *   +1 = strongly second trait (e.g., liberal)
 *    0 = neutral/balanced
 */
export const AXES_CONFIG = {
  authoritarian_liberal: { min: -1, max: 1 },
  spiritual_materialistic: { min: -1, max: 1 },
  natural_mechanical: { min: -1, max: 1 },
  pacifist_militaristic: { min: -1, max: 1 },
  stoicist_hedonistic: { min: -1, max: 1 },
  essentialist_constructivist: { min: -1, max: 1 }
};

/**
 * Empire reaction thresholds and scaling factors.
 * Reactions determine how empires respond to laws and events based on value alignment.
 * @property {Object} THRESHOLDS - Score thresholds for reaction types
 * @property {number} THRESHOLDS.LAUD - Score >= 0.60 triggers enthusiastic support
 * @property {number} THRESHOLDS.APPROVE - Score >= 0.20 triggers approval
 * @property {number} THRESHOLDS.NEUTRAL_BAND - Scores in [-0.20, +0.20] are neutral
 * @property {number} THRESHOLDS.DISAPPROVE - Score <= -0.20 triggers disapproval
 * @property {number} THRESHOLDS.DENOUNCE - Score <= -0.60 triggers strong opposition
 * @property {Object} POWER_SCALING - Factors for calculating political pressure
 * @property {number} POWER_SCALING.POP_EXPONENT - Population exponent for influence (sqrt)
 * @property {number} POWER_SCALING.PRESSURE_LOG_DIVISOR - Normalizes pressure to ~0.2-1.5 range
 */
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

/**
 * Technology research system configuration.
 * @property {number} BASE_POINTS_PER_TICK - Base tech points gained each tick (200)
 * @property {number} INITIAL_THRESHOLD - Points needed for first tech unlock (70000)
 * @property {number} THRESHOLD_EXPONENT - Polynomial scaling for subsequent techs (1.20)
 *                                          threshold = INITIAL_THRESHOLD * (n+1)^THRESHOLD_EXPONENT
 * @property {number} BASE_RESEARCH_SPEED - Default research speed multiplier (1.0)
 * @property {number} TECH_CHOICES_COUNT - Number of tech options presented when unlocking (3)
 * @property {Object} TIER_REQUIREMENTS - Minimum unlocked tech counts required for each tier
 */
export const TECH_CONSTANTS = {
  BASE_POINTS_PER_TICK: 200,         // Base tech points gained per tick 100 -> 200
  INITIAL_THRESHOLD: 70000,          // First tech unlocks at ~350 turns before research bonuses
  THRESHOLD_EXPONENT: 1.20,          // Higher exponent stretches advanced tech into mid/late campaign
  BASE_RESEARCH_SPEED: 1.0,          // Default research_speed modifier
  TECH_CHOICES_COUNT: 3,             // Number of tech choices offered per event
  TIER_REQUIREMENTS: {
    1: 0,
    2: 2,
    3: 5,
    4: 8
  }
};

/**
 * Unity progression system configuration.
 * Unity generation pipeline:
 * 1) Population baseline
 * 2) Additive boosts (laws, improvements, unity effects)
 * 3) Multiplicative boosts (laws, improvements, unity effects)
 * 4) Hero popularity multiplier
 *
 * This keeps population as the default driver while allowing strategy layers
 * (laws, infrastructure, heroes) to accelerate progression.
 * @property {number} INITIAL_THRESHOLD - Unity needed for first unlock
 * @property {number} THRESHOLD_EXPONENT - Polynomial scaling for later unlocks
 * @property {number} MAX_TIERS - Maximum number of unity effects per empire
 * @property {number} POPULATION_BASE_MIN - Minimum unity per turn from population baseline
 * @property {number} POPULATION_BASE_MAX - Maximum unity per turn from population baseline at population cap
 * @property {number} POPULATION_BASE_CURVE_EXPONENT - Curve exponent for population baseline scaling
 * @property {number} HERO_POPULARITY_MULT_SPAN - Half-span applied around x1 from hero popularity (0.2 => x0.8..x1.2)
 * @property {number} HERO_POPULARITY_MULT_MIN - Minimum multiplier from hero popularity contribution
 * @property {number} HERO_POPULARITY_MULT_MAX - Maximum multiplier from hero popularity contribution
 */
export const UNITY_CONSTANTS = {
  INITIAL_THRESHOLD: 120,
  THRESHOLD_EXPONENT: 1.45,
  MAX_TIERS: 5,
  POPULATION_BASE_MIN: 0.35,
  POPULATION_BASE_MAX: 2.5,
  POPULATION_BASE_CURVE_EXPONENT: 0.55,
  HERO_POPULARITY_MULT_SPAN: 0.2,
  HERO_POPULARITY_MULT_MIN: 0.8,
  HERO_POPULARITY_MULT_MAX: 1.2
};

/**
 * Coalition improvement/building system configuration.
 * @property {number} INITIAL_MAX_TOTAL_CAPACITY - Starting max improvement slots (6)
 * @property {number} COALITION_CONSTRUCTION - Build progress added to all constructions per tick (4)
 */
export const IMPROVEMENTS_CONSTANTS = {
  INITIAL_MAX_TOTAL_CAPACITY: 4,     // Starting maximum total improvement capacity 6 -> 4
  COALITION_CONSTRUCTION: 4          // Build progress added to ALL building improvements per tick
};

/**
 * Scourge attack prediction system configuration.
 * Controls how accurately the coalition can predict Scourge movements.
 * @property {number} BASE_CONFIDENCE_MODIFIER - Default prediction certainty (1.0)
 * @property {number} CONFIDENCE_PER_LEVEL - Modifier increase per intelligence tier (0.3)
 * @property {number} STABLE_BONUS - Prediction bonus when coalition is Stable (+0.1)
 * @property {number} STRAINED_PENALTY - Prediction penalty when Strained (-0.05)
 * @property {number} DESPERATE_PENALTY - Prediction penalty when Desperate (-0.15)
 * @property {number} MIN_CONFIDENCE_MODIFIER - Minimum confidence floor (0.1)
 * @property {number} MAX_CONFIDENCE_MODIFIER - Maximum confidence cap (2.0)
 * @property {number} CONFIDENCE_DRIFT_TURNS - Turns to drift back toward baseline (30)
 * @property {number} INTEL_CONFIDENCE_PER_POINT - Confidence bonus per stored intel point
 * @property {number} MAX_INTEL_CONFIDENCE_BONUS - Maximum confidence bonus from stored intel
 * @property {number} DIRECT_TARGET_INTEL_COST - Intel cost to direct the next Scourge target
 * @property {Object} UNCERTAINTY_RANGE_LOW - Wide prediction range at low confidence (5-20 turns)
 * @property {Object} UNCERTAINTY_RANGE_MEDIUM - Moderate range at medium confidence (2-8 turns)
 * @property {Object} UNCERTAINTY_RANGE_HIGH - Narrow range at high confidence (1-3 turns)
 */
export const SCOURGE_PREDICTION_CONSTANTS = {
  BASE_CONFIDENCE_MODIFIER: 1.0,      // Default certainty level
  CONFIDENCE_PER_LEVEL: 0.3,           // Modifier increase per confidence tier improvement
  STABLE_BONUS: 0.1,                   // Bonus modifier when coalition is Stable
  STRAINED_PENALTY: -0.05,             // Penalty when Strained
  DESPERATE_PENALTY: -0.15,            // Penalty when Desperate
  MIN_CONFIDENCE_MODIFIER: 0.1,        // Minimum (very uncertain)
  MAX_CONFIDENCE_MODIFIER: 2.0,        // Maximum (very certain)
  CONFIDENCE_DRIFT_TURNS: 60,          // Turns to drift toward baseline (1.0) 30 -> 60
  INTEL_CONFIDENCE_PER_POINT: 0.05,    // Each stored intel point improves prediction confidence
  MAX_INTEL_CONFIDENCE_BONUS: 1.0,     // Cap the confidence gain from stockpiled intel
  DIRECT_TARGET_INTEL_COST: 6,         // Spend intel to force the next target empire

  // Uncertainty ranges based on confidence
  UNCERTAINTY_RANGE_LOW: { min: 5, max: 20 },      // Wide range when confidence is low
  UNCERTAINTY_RANGE_MEDIUM: { min: 2, max: 8 },    // Moderate range
  UNCERTAINTY_RANGE_HIGH: { min: 1, max: 3 }       // Narrow range
};

/**
 * Consumption-to-requisition conversion and allowance system.
 * Controls how empire consumption generates coalition requisition.
 * @property {number} CREDITS_PER_REQUISITION - Conversion rate (1000 credits = 1 requisition)
 * @property {number} COALITION_CONSUMPTION_SHARE_BASE - Coalition's share of consumption value (10%)
 * @property {number} CONVERSION_REQUISITION_MULTIPLIER - Multiplier for requisition from consumption (100x)
 * @property {number} ALLOWANCE_PER_TICK - Credits granted to coalition per tick (1000)
 * @property {number} ALLOWANCE_CAP_TICKS - Maximum stored allowance in ticks worth (4)
 * @property {number} APPROVAL_SCALE_MIN - Requisition multiplier at 0 approval (50%)
 * @property {number} APPROVAL_SCALE_MAX - Requisition multiplier at 100 approval (200%)
 * @property {number} REQUISITION_POOL_TURNS - Consumption requisition payout cadence in turns (15)
 */
export const CONSUMPTION_REQUISITION_CONSTANTS = {
  CREDITS_PER_REQUISITION: 1000,                    // Conversion rate: 1000 credits = 1 requisition
  COALITION_CONSUMPTION_SHARE_BASE: 0.10,           // 10% - Base coalition share of consumption value
  CONVERSION_REQUISITION_MULTIPLIER: 100,            // 100x - Multiplier for requisition from consumption
  ALLOWANCE_PER_TICK: 1000,                         // Credits granted per tick
  ALLOWANCE_CAP_TICKS: 4,                           // Maximum allowance (in ticks worth)
  APPROVAL_SCALE_MIN: 0.5,                          // At 0 approval, contribute 50% requisition
  APPROVAL_SCALE_MAX: 2.0,                          // At 100 approval, contribute 200% requisition
  REQUISITION_POOL_TURNS: 15,                       // Pool consumption requisition for 15 turns before payout
  SOURCE_MULTIPLIERS: {
    empire_needs: 1.0,
    empire_wants: 1.0,
    army_needs: 1.0,
    army_wants: 1.0,
    improvement_sustainment: 1.0,
    unknown: 1.0
  }
};

/**
 * Scourge difficulty modifier scaling.
 * Modifiers increase over time or through events, making the Scourge stronger.
 * @property {number} MIN_SEVERITY - Minimum/starting severity level (1)
 * @property {number} ATTACK_POWER_PER_SEVERITY - Scourge attack power bonus per severity (+4%)
 * @property {number} MO_DAMAGE_PER_SEVERITY - Scourge MO (morale) damage bonus per severity (+4%)
 * @property {number} RECOVERY_RATE_PER_SEVERITY - Scourge recovery (wounded return) bonus per severity (+5%)
 * @property {number} REINFORCEMENT_RATE_PER_SEVERITY - Scourge reinforcement (reserves during battle) bonus per severity (+5%)
 * @property {number} LAW_SPEED_PER_SEVERITY - Coalition law enactment penalty per severity (-3%)
 */
export const SCOURGE_MODIFIER_CONSTANTS = {
  MIN_SEVERITY: 1,                    // Minimum severity for modifiers (also starting value)
  // Note: No max severity - modifiers scale infinitely

  // Effect scaling per severity level (tuned for infinite scaling)
  ATTACK_POWER_PER_SEVERITY: 0.04,    // +4% Scourge attack power per severity
  MO_DAMAGE_PER_SEVERITY: 0.04,       // +4% Scourge MO (morale) damage per severity
  KILL_RATE_PER_SEVERITY: 0.03,       // +3% Scourge kill rate per severity
  RECOVERY_RATE_PER_SEVERITY: 0.05,   // +5% Scourge recovery rate (wounded return) per severity
  REINFORCEMENT_RATE_PER_SEVERITY: 0.05, // +5% Scourge reinforcement rate (reserves during battle) per severity
  LAW_SPEED_PER_SEVERITY: -0.03       // -3% coalition law enact speed per severity
};

/**
 * Empire needs/wants fulfillment effects on game state.
 *
 * Needs use a steep curve so that low fulfillment has drastic consequences; wants
 * use a gentler curve so that partial fulfillment is tolerable but rewarding to
 * improve.  Both are evaluated every turn and applied as additive modifiers to
 * empire approval and the empire's effective population growth rate.
 *
 * Values are calibrated for an 800-1000 tick game. Each effect is intentionally
 * small so that hitting extreme approval values (0 or 100) requires either:
 *   a) sustained, severe unfulfillment over hundreds of ticks, OR
 *   b) several negative effects (unfulfillment + bad laws + war penalties) stacking.
 *
 * For reference, enacted laws add roughly -2.0 to +3.0 approval/tick; these
 * fulfillment effects are in the same order of magnitude at worst, and one order
 * smaller at typical early-game fulfillment levels (30–50%).
 *
 * Needs curve (approval & pop-growth penalty below NEEDS_NEUTRAL_THRESHOLD):
 *   penalty = max_penalty × ((threshold - fulfillment) / threshold) ^ NEEDS_CURVE_POWER
 * Needs bonus above the threshold scales linearly up to NEEDS_MAX_BONUS.
 *
 * Wants curve (approval & pop-growth effect, centred at WANTS_NEUTRAL):
 *   At 100% wants: +WANTS_MAX_*_BONUS per tick
 *   At   0% wants: -WANTS_MAX_*_PENALTY per tick (intentionally smaller than the bonus)
 *
 * Improvement sustainment degradation threshold:
 *   An improvement only starts accumulating unsustained ticks when its
 *   sustainment fulfillment ratio falls below
 *   IMPROVEMENT_DEGRADATION_FULFILLMENT_THRESHOLD.
 */
export const FULFILLMENT_CONSTANTS = {
  // --- Needs ---
  // Fulfillment ratio below which penalties begin (70%)
  NEEDS_NEUTRAL_THRESHOLD: 0.70,
  // Power applied to the penalty ratio (steeper = harsher at very low values)
  NEEDS_CURVE_POWER: 1.8,
  // Maximum approval loss per tick at 0% needs fulfillment (~0.30/tick, from 50→0 in ~167 ticks).
  // At a typical early-game 30% fulfillment this is ~0.05/tick — comparable to a mild law effect.
  NEEDS_MAX_APPROVAL_PENALTY: 0.30,
  // Maximum population-growth-rate penalty per tick at 0% needs fulfillment
  // (can partially offset the 0.001 BASE_GROWTH_RATE at extreme, not cancel it)
  NEEDS_MAX_GROWTH_PENALTY: 0.0005,
  // Small approval bonus per tick when needs are fully met (above NEEDS_NEUTRAL_THRESHOLD)
  NEEDS_MAX_APPROVAL_BONUS: 0.06,
  // Small population-growth bonus per tick when needs are fully met
  NEEDS_MAX_GROWTH_BONUS: 0.00008,

  // --- Wants ---
  // Fulfillment ratio at which wants have no effect (50%)
  WANTS_NEUTRAL: 0.50,
  // Maximum approval bonus per tick at 100% wants fulfillment
  // (~0.15/tick — rewarding without overwhelming other modifiers)
  WANTS_MAX_APPROVAL_BONUS: 0.15,
  // Maximum population-growth bonus per tick at 100% wants fulfillment
  WANTS_MAX_GROWTH_BONUS: 0.0003,
  // Mild approval penalty at 0% wants fulfillment (intentionally lighter than the bonus)
  WANTS_MAX_APPROVAL_PENALTY: 0.08,
  // Mild population-growth penalty at 0% wants fulfillment
  WANTS_MAX_GROWTH_PENALTY: 0.00008,

  // --- Improvement sustainment ---
  // Fulfillment ratio below which an improvement starts accumulating degradation ticks
  IMPROVEMENT_DEGRADATION_FULFILLMENT_THRESHOLD: 0.20
};

/**
 * Approval gain pacing for recurring per-tick positive effects.
 *
 * Positive approval deltas are scaled by:
 *   scale = max(POSITIVE_GAIN_MIN_SCALE, POSITIVE_GAIN_BASE_SCALE * headroom^POSITIVE_GAIN_HEADROOM_EXPONENT)
 * where headroom = (100 - approval) / 100.
 *
 * This keeps recovery possible when approval is low while preventing runaway
 * stacking at high approval.
 */
export const APPROVAL_BALANCE_CONSTANTS = {
  POSITIVE_GAIN_BASE_SCALE: 0.40,
  POSITIVE_GAIN_MIN_SCALE: 0.05,
  POSITIVE_GAIN_HEADROOM_EXPONENT: 1.2
};

/**
 * Valid slider values for mission allocation.
 * Used by server validation, mission logic, and UI components.
 * -1 = withdraw/oppose, 0 = neutral, 1/2/5 = increasing commitment levels
 */
export const MISSION_SLIDER_VALUES = [-1, 0, 1, 2, 5];

/**
 * Scourge mission system configuration.
 * Controls deep strike missions, threat levels, and rewards.
 * @property {number} THREAT_THRESHOLD_1 - First threat tier boundary (35)
 * @property {number} THREAT_THRESHOLD_2 - Second threat tier boundary (60)
 * @property {number} THREAT_THRESHOLD_3 - Third/highest threat tier boundary (80)
 * @property {number} GLORY_BASE_PER_SCOURGE_WIN - Base glory earned for defeating Scourge (100)
 * @property {number} EP_COST_MEDIUM - Intel cost for medium emergency powers
 * @property {number} EP_COST_MEDIUM_HIGH - Intel cost for medium-high emergency powers
 * @property {number} EP_COST_HIGH - Intel cost for high-impact emergency powers
 * @property {number} EP_COST_EXTREME - Intel cost for apex emergency powers
 * @property {number} EP_BASE_DURATION - Base duration for emergency powers
 * @property {number} EP_MAX_ACTIVE - Maximum concurrent active emergency powers
 * @property {number} EP_REQUISITION_CACHE_AMOUNT - Base requisition granted by the instant requisition power
 * @property {number} EP_EMPIRE_CREDIT_GRANT - Base credits granted to each empire by the instant credit power
 * @property {number} MISSION_METER_PER_REQUISITION - Mission progress per requisition spent (0.10)
 * @property {number} MISSION_NEGATIVE_THREAT_INCREASE - Threat increase per tick while using emergency budget mode
 * @property {number} MISSION_NEGATIVE_GLORY_TAX_DURATION - Duration (ticks) of the emergency glory penalty after last use
 * @property {number} MISSION_NEGATIVE_GLORY_GAIN_MUL - Glory multiplier during emergency budget penalty window
 * @property {number} MISSION_NEGATIVE_REQUISITION_BASE_BONUS - Flat requisition bonus per tick in emergency budget mode
 * @property {number} MISSION_NEGATIVE_REQUISITION_RATE - Percent bonus from current positive requisition in emergency mode
 * @property {number} MISSION_NEGATIVE_REQUISITION_BONUS_CAP - Maximum requisition bonus per tick from emergency mode
 * @property {number} MISSION_INTEL_PER_REQUISITION - Intel gained per requisition diverted into mission budget
 * @property {number} PRE_ATTACK_DISRUPT_COST - Requisition cost for the defensive pre-strike option
 * @property {number} PRE_ATTACK_DISRUPT_THREAT_DELTA - Threat swing for the defensive pre-strike option
 * @property {number} PRE_ATTACK_SAFE_COST - Requisition cost for the recon pre-strike option
 * @property {number} PRE_ATTACK_SAFE_THREAT_DELTA - Threat swing for the recon pre-strike option
 * @property {number} PRE_ATTACK_SAFE_INTEL - Intel gained from the recon pre-strike option
 * @property {number} PRE_ATTACK_ESCALATE_THREAT_DELTA - Threat swing for the aggressive pre-strike option
 * @property {number} PRE_ATTACK_ESCALATE_REQUISITION - Requisition gained from the aggressive pre-strike option
 * @property {number} PRE_ATTACK_ESCALATE_GLORY - Glory gained from the aggressive pre-strike option
 * @property {number} DEEP_MISSION_THRESHOLD_BASE - Base mission meter required for the first Deep Mission (100)
 * @property {number} DEEP_MISSION_THRESHOLD_GROWTH_RATE - Permanent threshold growth after each Deep Mission (15%)
 * @property {number} DEEP_STRIKE_MP_PCT - Military power percentage for deep strikes (50%)
 * @property {number} DEEP_SABOTAGE_SEVERITY - Severity reduction from sabotage missions (1)
 * @property {number} DEEP_GLORY_SMALL - Small glory reward (40)
 * @property {number} DEEP_GLORY_MEDIUM - Medium glory reward (80)
 * @property {number} DEEP_HARVEST_THREAT_SMALL_POSITIVE - Small threat increase from harvesting (+2)
 * @property {number} DEEP_REQUISITION_SMALL - Small requisition reward (60)
 * @property {number[]} THREAT_CLIMATE_STRENGTHS - Threat modifier strengths by climate tier [0.08, 0.15, 0.25]
 */
export const SCOURGE_MISSION_CONSTANTS = {
  THREAT_THRESHOLD_1: 35,
  THREAT_THRESHOLD_2: 60,
  THREAT_THRESHOLD_3: 80,
  GLORY_BASE_PER_SCOURGE_WIN: 100,
  EP_COST_MEDIUM: 8,
  EP_COST_MEDIUM_HIGH: 12,
  EP_COST_HIGH: 16,
  EP_COST_EXTREME: 22,
  EP_BASE_DURATION: 140,
  EP_MAX_ACTIVE: 2,
  EP_REQUISITION_CACHE_AMOUNT: 120,
  EP_EMPIRE_CREDIT_GRANT: 900,
  MISSION_METER_PER_REQUISITION: 0.06,
  MISSION_NEGATIVE_THREAT_INCREASE: 0.45,
  MISSION_NEGATIVE_GLORY_TAX_DURATION: 90,
  MISSION_NEGATIVE_GLORY_GAIN_MUL: 0.92,
  MISSION_NEGATIVE_REQUISITION_BASE_BONUS: 2,
  MISSION_NEGATIVE_REQUISITION_RATE: 0.006,
  MISSION_NEGATIVE_REQUISITION_BONUS_CAP: 15,
  MISSION_INTEL_PER_REQUISITION: 0.025,
  PRE_ATTACK_DISRUPT_COST: 40,
  PRE_ATTACK_DISRUPT_THREAT_DELTA: -4,
  PRE_ATTACK_SAFE_COST: 25,
  PRE_ATTACK_SAFE_THREAT_DELTA: 1,
  PRE_ATTACK_SAFE_INTEL: 1.5,
  PRE_ATTACK_ESCALATE_THREAT_DELTA: 5,
  PRE_ATTACK_ESCALATE_REQUISITION: 35,
  PRE_ATTACK_ESCALATE_GLORY: 6,
  DEEP_MISSION_THRESHOLD_BASE: 140,
  DEEP_MISSION_THRESHOLD_GROWTH_RATE: 0.2,
  DEEP_STRIKE_MP_PCT: 0.5,
  DEEP_SABOTAGE_SEVERITY: 1,
  DEEP_GLORY_SMALL: 40,
  DEEP_GLORY_MEDIUM: 80,
  DEEP_HARVEST_THREAT_SMALL_POSITIVE: 2,
  DEEP_REQUISITION_SMALL: 60,
  THREAT_CLIMATE_STRENGTHS: [0.08, 0.15, 0.25]
};
