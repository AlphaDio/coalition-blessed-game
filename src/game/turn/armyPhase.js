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

function getArmyGrowthThreshold(army) {
  const base = ECONOMY_CONSTANTS.ARMY_GROWTH_CONSUMPTION_THRESHOLD_BASE;
  const perSqrt = ECONOMY_CONSTANTS.ARMY_GROWTH_CONSUMPTION_THRESHOLD_PER_SQRT_MP;
  const mp = Math.max(1, army.mp?.max || army.manpower || 100);
  return Math.max(50, base + perSqrt * Math.sqrt(mp));
}

/**
 * Replenish manpower for armies not currently in active battles.
 * Army capacity growth happens ONLY when consumption of demanded resources (needs/wants)
 * reaches a threshold; growth is logged to the turn log.
 *
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 * @param {string[]} log - Turn log array to push growth messages
 */
export function replenishArmyManpower(state, activeBattles, log = []) {
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

    // Army growth ONLY when consumption of demanded resources (needs/wants) reaches threshold.
    const threshold = getArmyGrowthThreshold(army);
    let bank = Number(army.growthConsumptionBank) || 0;
    const mpPerTrigger = Math.max(1, ECONOMY_CONSTANTS.ARMY_GROWTH_MP_PER_TRIGGER || 1);
    while (bank >= threshold) {
      const prevMax = Math.floor(army.mp?.max || army.manpower || 0);
      army.mp = army.mp || { current: 0, max: 0 };
      army.mp.max = (army.mp.max || 0) + mpPerTrigger;
      army.manpower = Math.max(army.manpower || 0, army.mp.max);
      bank -= threshold;
      army.growthConsumptionBank = bank;
      const empireName = empire?.name || 'Unknown';
      const msg = `${army.name} (${empireName}): supply stockpile reached threshold → +${mpPerTrigger} MP capacity (${prevMax} → ${Math.floor(army.mp.max)})`;
      log.push(msg);
      logger.info(msg);
    }
    if (bank !== (Number(army.growthConsumptionBank) || 0)) army.growthConsumptionBank = bank;

    // Skip manpower refill if already at max (growth already applied above).
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

