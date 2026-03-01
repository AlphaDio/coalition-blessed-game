import { ECONOMY_CONSTANTS } from '../constants.js';
import { clampStat } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { collectArmiesInBattle, isRegularArmy } from './armyUtils.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function averageFulfillment(fulfillmentMap, fallback = 1) {
  const values = Object.values(fulfillmentMap || {}).filter(value => Number.isFinite(value));
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getArmySupplySignals(army) {
  const needsDemandCount = Object.values(army.supply_state?.needs_demand || {})
    .filter(value => Number.isFinite(value) && value > 0)
    .length;
  const wantsDemandCount = Object.values(army.supply_state?.wants_demand || {})
    .filter(value => Number.isFinite(value) && value > 0)
    .length;
  const needsFallback = needsDemandCount > 0 ? 0 : 1;
  const wantsFallback = wantsDemandCount > 0 ? 0 : 1;

  const needsFulfillment = averageFulfillment(army.supply_state?.needs_fulfillment, needsFallback);
  const wantsFulfillment = averageFulfillment(army.supply_state?.wants_fulfillment, wantsFallback);
  const needsDeficit = Math.max(0, 1 - needsFulfillment);
  const wantsDeficit = Math.max(0, 1 - wantsFulfillment);

  // Needs are mandatory for replacement throughput. Wants only provide upside.
  const replenishmentMultiplier = clamp((0.15 + (needsFulfillment * 0.85)) + Math.max(0, wantsFulfillment - 0.7) * 0.4, 0.05, 1.35);

  // Capacity growth starts when needs and wants are reasonably met (lower thresholds so growth is visible).
  const growthSignal = Math.max(0, needsFulfillment - 0.70) + (Math.max(0, wantsFulfillment - 0.60) * 0.5);

  return {
    needsFulfillment,
    wantsFulfillment,
    needsDeficit,
    wantsDeficit,
    needsActive: needsDemandCount > 0,
    wantsActive: wantsDemandCount > 0,
    replenishmentMultiplier,
    growthSignal
  };
}

/**
 * Recover organization for all armies
 * Recovery rate is based on:
 * - Army Command stat (0-100, determines base recovery speed)
 * - Reduced during active battles (50% of normal rate)
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 */
export function recoverArmyOrganization(state, activeBattles) {
  const logger = getLogger();

  const armiesInBattle = collectArmiesInBattle(activeBattles);

  const regularArmies = state.armies.filter(isRegularArmy);

  regularArmies.forEach(army => {
    // Skip if already at max organization
    if (army.organization >= 100) return;

    const inBattle = armiesInBattle.has(army.id);

    // Base recovery rate: Command stat (0-100) determines recovery per tick
    // Scale: 0 command = 0.1 per tick, 100 command = 1.0 per tick
    const baseRecoveryRate = 0.1 + ((army.command || 50) / 100) * 0.9;

    // During battles, recovery is slower (50% of normal rate)
    const effectiveRate = inBattle ? baseRecoveryRate * 0.5 : baseRecoveryRate;

    // Apply organization recovery
    const spaceAvailable = 100 - army.organization;
    const recovered = Math.min(effectiveRate, spaceAvailable);
    army.organization = clampStat(army.organization + recovered, 0, 100);

    // Debug logging for significant recovery
    if (recovered > 0.5) {
      logger.debug(`Organization recovery: ${army.name} +${recovered.toFixed(2)} org (command: ${(army.command || 50).toFixed(0)}, inBattle: ${inBattle}, new: ${army.organization.toFixed(1)})`);
    }
  });
}

/**
 * Replenish manpower for armies not currently in active battles
 * Replenishment rate is based on:
 * - Army fervor (higher fervor = faster replenishment)
 * - Empire size (population - larger empires can replenish faster)
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 */
export function replenishArmyManpower(state, activeBattles) {
  const logger = getLogger();

  const armiesInBattle = collectArmiesInBattle(activeBattles);

  const regularArmies = state.armies.filter(isRegularArmy);
  const replenishingArmies = regularArmies.filter(army => !armiesInBattle.has(army.id));

  // Build empire lookup map
  const empireMap = new Map(state.empires.map(empire => [empire.id, empire]));

  replenishingArmies.forEach(army => {
    const empire = empireMap.get(army.empireId);
    if (!empire) {
      logger.debug(`Army ${army.name} has no empire, skipping replenishment`);
      return;
    }

    const maxMP = Math.max(1, army.mp?.max || army.manpower || 0);
    const currentMP = Math.max(0, army.mp?.current || 0);
    const damageRatio = clamp((maxMP - currentMP) / maxMP, 0, 1);
    const supplySignals = getArmySupplySignals(army);

    // Damage-gated unmet needs drive rebellion pressure.
    const needsAggravationGain = (damageRatio > 0 && supplySignals.needsActive)
      ? ECONOMY_CONSTANTS.ARMY_NEEDS_AGGRAVATION_BASE_PER_TICK * supplySignals.needsDeficit * damageRatio
      : 0;
    if (needsAggravationGain > 0) {
      army.aggravation = clampStat((army.aggravation || 0) + needsAggravationGain, 0, 100);
    }

    // Wants are persistent: unmet wants reduce morale/enthusiasm over time.
    const wantsFervorLoss = supplySignals.wantsActive
      ? ECONOMY_CONSTANTS.ARMY_WANTS_FERVOR_DECAY_BASE_PER_TICK * supplySignals.wantsDeficit
      : 0;
    if (wantsFervorLoss > 0) {
      army.fervor = clampStat((army.fervor || 0) - wantsFervorLoss, 0, 100);
    }

    // Base replenishment rate (per tick) - used for both replenishment and capacity growth
    const baseRate = army.reinforcementRate || 100;

    // Fervor modifier: 0.5x at 0 fervor, 1.5x at 100 fervor
    let totalFervorBonus = (army.fervorBonus || 0);
    if (army.timedFervorBonuses && Array.isArray(army.timedFervorBonuses)) {
      totalFervorBonus += army.timedFervorBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
    }
    const effectiveFervor = Math.min(100, (army.fervor || 0) + totalFervorBonus);
    const fervorModifier = 0.5 + (effectiveFervor / 100) * 1.0;

    // Empire size modifier based on population
    const population = empire.stats?.population || 1000;
    const logPopulation = Math.log10(Math.max(1, population));
    let populationModifier;
    if (logPopulation <= 3.0) populationModifier = 0.5;
    else if (logPopulation <= 4.0) populationModifier = 0.5 + (logPopulation - 3.0) * 0.5;
    else if (logPopulation <= 5.0) populationModifier = 1.0 + (logPopulation - 4.0) * 0.5;
    else if (logPopulation <= 6.0) populationModifier = 1.5 + (logPopulation - 5.0) * 0.5;
    else populationModifier = 2.0;

    const replenishmentMultiplier = army.replenishmentMultiplier || 1.0;

    // Capacity growth is handled only by processArmyResourceGrowth (stockpile threshold + cooldown).

    // Skip manpower refill if already at max.
    if (army.mp.current >= army.mp.max) return;

    // Calculate effective replenishment rate
    let effectiveRate =
      baseRate *
      fervorModifier *
      populationModifier *
      replenishmentMultiplier *
      supplySignals.replenishmentMultiplier;
    const replenishmentBonus = army.replenishmentBonus || 0;
    effectiveRate = Math.max(0, effectiveRate + replenishmentBonus);

    // Apply replenishment
    const spaceAvailable = army.mp.max - army.mp.current;
    const replenished = Math.min(effectiveRate, spaceAvailable);
    army.mp.current += replenished;

    // Debug logging for significant replenishment
    if (replenished > 50 || needsAggravationGain > 0.2 || wantsFervorLoss > 0.2) {
      logger.debug(
        `Manpower replenishment: ${army.name} +${replenished.toFixed(0)} MP` +
        ` (needs ${(supplySignals.needsFulfillment * 100).toFixed(0)}%, wants ${(supplySignals.wantsFulfillment * 100).toFixed(0)}%,` +
        ` rate ${effectiveRate.toFixed(0)}, cap ${Math.floor(army.mp.max)},` +
        ` aggravation +${needsAggravationGain.toFixed(2)}, fervor -${wantsFervorLoss.toFixed(2)})`
      );
    }
  });

}

/**
 * Get the primary resource this army "cares about" for growth (from demands: needs first, then wants).
 * @param {Object} army
 * @returns {string|null} Commodity key or null
 */
function getArmyGrowthCommodity(army) {
  const needs = army.demands?.needs && typeof army.demands.needs === 'object' ? Object.keys(army.demands.needs) : [];
  const wants = army.demands?.wants && typeof army.demands.wants === 'object' ? Object.keys(army.demands.wants) : [];
  if (needs.length > 0) return needs[0];
  if (wants.length > 0) return wants[0];
  return null;
}

/**
 * Army growth ONLY when empire stockpile of the army's cared-about resource reaches a threshold.
 * Triggers every ARMY_GROWTH_COOLDOWN_TURNS when threshold is met; consumes part of stockpile and adds MP.
 * Growth amount scales with army capacity. Logged to state.log.
 * @param {Object} state - Game state (mutated: armies, empires, log)
 * @param {Array} activeBattles - Array of active battle fronts (armies in battle skip growth)
 */
export function processArmyResourceGrowth(state, activeBattles) {
  const armiesInBattle = collectArmiesInBattle(activeBattles);
  const regularArmies = state.armies.filter(isRegularArmy);
  const empireMap = new Map((state.empires || []).map(e => [e.id, e]));
  const turn = state.turn || 1;
  const {
    ARMY_GROWTH_COOLDOWN_TURNS: cooldownTurns,
    ARMY_GROWTH_STOCKPILE_THRESHOLD_BASE: thresholdBase,
    ARMY_GROWTH_MP_BASE: mpBase,
    ARMY_GROWTH_MP_PER_1K_CAPACITY: mpPer1k,
    ARMY_GROWTH_CONSUME_PCT: consumePct
  } = ECONOMY_CONSTANTS;

  const log = state.log || [];

  regularArmies.forEach(army => {
    if (armiesInBattle.has(army.id)) return;

    const empire = empireMap.get(army.empireId);
    if (!empire || !empire.stockpiles) return;

    const commodity = getArmyGrowthCommodity(army);
    if (!commodity) return;

    const capacity = Math.max(1, army.mp?.max || army.manpower || 0);
    const threshold = Math.max(thresholdBase, Math.floor(thresholdBase * (1 + capacity / 10000)));
    const stock = Number(empire.stockpiles[commodity]) || 0;
    if (stock < threshold) return;

    const lastGrowth = army.lastResourceGrowthTurn ?? 0;
    if (turn - lastGrowth < cooldownTurns) return;

    const consumeAmount = Math.min(stock, Math.floor(threshold * consumePct));
    const mpGain = Math.max(1, Math.floor(mpBase + (capacity / 1000) * mpPer1k));

    empire.stockpiles[commodity] = Math.max(0, stock - consumeAmount);
    army.mp = army.mp || { current: 0, max: capacity };
    army.mp.max += mpGain;
    army.manpower = Math.max(army.manpower || 0, army.mp.max);
    army.lastResourceGrowthTurn = turn;

    const commodityLabel = commodity.replace(/_/g, ' ');
    const msg = `${empire.name}’s ${army.name}: stockpiled ${commodityLabel} reached ${threshold} (had ${Math.floor(stock)}). Consumed ${Math.floor(consumeAmount)}; army capacity +${mpGain} → ${Math.floor(army.mp.max)} MP.`;
    log.push(msg);
  });
}

