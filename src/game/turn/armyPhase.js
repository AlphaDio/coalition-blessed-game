import { ECONOMY_CONSTANTS, SCOURGE_PREDICTION_CONSTANTS } from '../constants.js';
import { clampStat } from '../cohesion.js';
import { getEmpireById, getEmpireMilitaryModifierSet } from '../empireModifiers.js';
import { clampPopulation } from '../populationUtils.js';
import { applyCoalitionIntel } from '../scourgePrediction.js';
import { getLogger } from '../../modules/logger.js';
import { MODIFIER_ARMY_ORG_SCALE } from '../improvements/types.js';
import { collectArmiesInBattle, isRegularArmy } from './armyUtils.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeConsumptionThreshold(rawThreshold) {
  const parsed = Number(rawThreshold);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
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

  const replenishmentMultiplier = clamp((0.15 + (needsFulfillment * 0.85)) + Math.max(0, wantsFulfillment - 0.7) * 0.4, 0.05, 1.35);
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

function getArmyConsumptionPopulationMultiplier(empire) {
  const population = clampPopulation(empire?.stats?.population || 1000, 1000);
  return population / 20;
}

function applyArmyConsumptionEffect(state, army, rule, consumed, hits, log, logger) {
  const { commodity, effect } = rule;
  if (!effect || hits <= 0) return;

  const amount = Number(effect.amount);
  if (!Number.isFinite(amount) || amount === 0) return;
  const scaledAmount = amount * hits;
  const empireMilitaryMods = getEmpireMilitaryModifierSet(state, army.empireId);

  if (effect.type === 'mp_bonus') {
    const growthMultiplier = Math.max(0, Number(army.consumptionMpGainMultiplier) || 1) * empireMilitaryMods.army_consumption_mp_gain_mult;
    const populationMultiplier = getArmyConsumptionPopulationMultiplier(getEmpireById(state, army.empireId));
    const mpGain = scaledAmount * growthMultiplier * populationMultiplier;
    const prevCurrent = Math.floor(army.mp?.current || 0);
    const prevMax = Math.floor(army.mp?.max || army.manpower || 0);
    army.mp = army.mp || { current: 0, max: 0 };
    army.mp.current = Math.max(0, (army.mp.current || 0) + mpGain);
    army.mp.max = (army.mp.max || 0) + mpGain;
    army.manpower = Math.max(army.manpower || 0, army.mp.max);
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${mpGain.toFixed(3)} MP (${prevCurrent}/${prevMax} -> ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)}, ${hits} hits, x${growthMultiplier.toFixed(2)} growth, x${populationMultiplier.toFixed(2)} pop)`;
    log.push(msg);
    logger.info(msg);
    return;
  }

  if (effect.type === 'mp_growth_multiplier_bonus') {
    army.consumptionMpGainMultiplier = Math.max(0, (Number(army.consumptionMpGainMultiplier) || 1) + scaledAmount);
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${(scaledAmount * 100).toFixed(1)}% MP growth from army consumption (${hits} hits)`;
    log.push(msg);
    logger.info(msg);
    return;
  }

  if (effect.type === 'army_damage_bonus') {
    army.consumptionDamageAdd = Math.max(0, (Number(army.consumptionDamageAdd) || 0) + scaledAmount);
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} persistent army damage (${hits} hits)`;
    log.push(msg);
    logger.info(msg);
    return;
  }

  if (effect.type === 'replenishment_bonus') {
    army.replenishmentBonus = (army.replenishmentBonus || 0) + scaledAmount;
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} replenishment bonus (${hits} hits)`;
    log.push(msg);
    logger.info(msg);
    return;
  }

  if (effect.type === 'replenishment_multiplier_bonus') {
    army.replenishmentMultiplier = Math.max(0, (army.replenishmentMultiplier || 1) + scaledAmount);
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${(scaledAmount * 100).toFixed(1)}% replenishment multiplier (${hits} hits)`;
    log.push(msg);
    logger.info(msg);
    return;
  }

  if (effect.type === 'fervor_bonus') {
    army.fervor = clampStat((army.fervor || 0) + scaledAmount, 0, 100);
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} fervor (${hits} hits)`;
    log.push(msg);
    logger.info(msg);
    return;
  }

  if (effect.type === 'coalition_intel_bonus') {
    const intelGained = applyCoalitionIntel(state, scaledAmount);
    const confidenceBonus = intelGained * SCOURGE_PREDICTION_CONSTANTS.INTEL_CONFIDENCE_PER_POINT;
    const msg = `${army.name} ${commodity}: pooled consumed ${consumed}, +${intelGained.toFixed(3)} coalition intel (+${confidenceBonus.toFixed(3)} confidence, ${hits} hits)`;
    log.push(msg);
    logger.info(msg);
  }
}

function processArmyPassiveGrowth(state, army, totalConsumed, inBattle, log, logger) {
  army.growthConsumptionPool = Math.max(0, Number(army.growthConsumptionPool) || 0) + totalConsumed;

  if (inBattle) return;

  const currentMax = army.mp?.max || army.manpower || 0;
  const threshold = ECONOMY_CONSTANTS.ARMY_GROWTH_CONSUMPTION_THRESHOLD_BASE +
    ECONOMY_CONSTANTS.ARMY_GROWTH_CONSUMPTION_THRESHOLD_PER_SQRT_MP * Math.sqrt(currentMax);

  if (threshold <= 0) return;

  const hits = Math.floor(army.growthConsumptionPool / threshold);
  if (hits <= 0) return;

  army.growthConsumptionPool -= hits * threshold;
  const populationMultiplier = getArmyConsumptionPopulationMultiplier(getEmpireById(state, army.empireId));
  const mpGain = hits * ECONOMY_CONSTANTS.ARMY_GROWTH_MP_PER_TRIGGER * populationMultiplier;

  army.mp = army.mp || { current: 0, max: 0 };
  army.mp.current = Math.max(0, (army.mp.current || 0) + mpGain);
  army.mp.max = (army.mp.max || 0) + mpGain;
  army.manpower = Math.max(army.manpower || 0, army.mp.max);

  const msg = `${army.name}: passive growth +${mpGain.toFixed(1)} MP (${hits} hits, threshold ${threshold.toFixed(1)}, pool ${army.growthConsumptionPool.toFixed(1)}, x${populationMultiplier.toFixed(2)} pop)`;
  log.push(msg);
  logger.info(msg);
}

function processArmyConsumptionEffects(state, regularArmies, armiesInBattle, log) {
  const logger = getLogger();

  regularArmies.forEach(army => {
    if (!Array.isArray(army.consumptionRules) || army.consumptionRules.length === 0) {
      return;
    }

    if (!army.consumptionEffectPools || typeof army.consumptionEffectPools !== 'object') {
      army.consumptionEffectPools = {};
    }

    const receivedByCommodity = army.supply_state?.received || {};
    let totalConsumedThisTurn = 0;

    for (const rule of army.consumptionRules) {
      const { commodity, threshold } = rule;
      const normalizedThreshold = normalizeConsumptionThreshold(threshold);
      if (!normalizedThreshold) {
        logger.warn(`Skipping invalid army consumption threshold for ${army.name} ${commodity}: ${threshold}`);
        continue;
      }

      const consumedThisTurn = Math.max(0, Number(receivedByCommodity[commodity] || 0));
      totalConsumedThisTurn += consumedThisTurn;
      const existingPool = Math.max(0, Number(army.consumptionEffectPools[commodity] || 0));
      const updatedPool = existingPool + consumedThisTurn;

      if (armiesInBattle.has(army.id)) {
        army.consumptionEffectPools[commodity] = updatedPool;
        continue;
      }

      const hits = Math.floor(updatedPool / normalizedThreshold);
      const spentFromPool = hits * normalizedThreshold;
      army.consumptionEffectPools[commodity] = Math.max(0, updatedPool - spentFromPool);

      if (hits <= 0) continue;
      applyArmyConsumptionEffect(state, army, rule, spentFromPool, hits, log, logger);
    }

    processArmyPassiveGrowth(state, army, totalConsumedThisTurn, armiesInBattle.has(army.id), log, logger);
  });
}

export function applyArmyPassiveStatModifiers(state) {
  if (!Array.isArray(state?.armies)) {
    return;
  }

  const regularArmies = state.armies.filter(isRegularArmy);
  regularArmies.forEach(army => {
    const empireMilitaryMods = getEmpireMilitaryModifierSet(state, army.empireId);
    const passiveOrganizationGain = Math.max(0, empireMilitaryMods.army_organization) / MODIFIER_ARMY_ORG_SCALE;
    const passiveFervorGain = Math.max(0, empireMilitaryMods.army_fervor) / MODIFIER_ARMY_ORG_SCALE;

    if (passiveOrganizationGain > 0) {
      army.organization = clampStat((army.organization || 0) + passiveOrganizationGain, 0, 100);
    }
    if (passiveFervorGain > 0) {
      army.fervor = clampStat((army.fervor || 0) + passiveFervorGain, 0, 100);
    }
  });
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
    if (army.organization >= 100) return;

    const inBattle = armiesInBattle.has(army.id);
    const baseRecoveryRate = 0.1 + ((army.command || 50) / 100) * 0.9;
    const effectiveRate = inBattle ? baseRecoveryRate * 0.5 : baseRecoveryRate;
    const spaceAvailable = 100 - army.organization;
    const recovered = Math.min(effectiveRate, spaceAvailable);
    army.organization = clampStat(army.organization + recovered, 0, 100);

    if (recovered > 0.5) {
      logger.debug(`Organization recovery: ${army.name} +${recovered.toFixed(2)} org (command: ${(army.command || 50).toFixed(0)}, inBattle: ${inBattle}, new: ${army.organization.toFixed(1)})`);
    }
  });
}

/**
 * Replenish manpower for armies not currently in active battles.
 * Threshold-based army consumption effects are processed from filled needs/wants orders.
 * Direct MP refill still happens separately for armies not currently in active battles.
 *
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 * @param {string[]} log - Turn log array to push growth messages
 */
export function replenishArmyManpower(state, activeBattles, log = []) {
  const logger = getLogger();

  const armiesInBattle = collectArmiesInBattle(activeBattles);
  const regularArmies = state.armies.filter(isRegularArmy);
  processArmyConsumptionEffects(state, regularArmies, armiesInBattle, log);
  const replenishingArmies = regularArmies.filter(army => !armiesInBattle.has(army.id));

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
    const empireMilitaryMods = getEmpireMilitaryModifierSet(state, army.empireId);

    const needsAggravationGain = (damageRatio > 0 && supplySignals.needsActive)
      ? ECONOMY_CONSTANTS.ARMY_NEEDS_AGGRAVATION_BASE_PER_TICK * supplySignals.needsDeficit * damageRatio
      : 0;
    const wantsAggravationGain = supplySignals.wantsActive
      ? ECONOMY_CONSTANTS.ARMY_WANTS_AGGRAVATION_BASE_PER_TICK * supplySignals.wantsDeficit
      : 0;
    const totalAggravationGain = needsAggravationGain + wantsAggravationGain;

    const needsMet = !supplySignals.needsActive || supplySignals.needsDeficit < ECONOMY_CONSTANTS.ARMY_NEEDS_DEFICIT_EPSILON;
    const aggravationDecay = needsMet
      ? ECONOMY_CONSTANTS.ARMY_AGGRAVATION_DECAY_PER_TICK
      : 0;
    const netAggravation = totalAggravationGain - aggravationDecay;
    if (netAggravation !== 0) {
      army.aggravation = clampStat((army.aggravation || 0) + netAggravation, 0, 100);
    }

    const wantsFervorLoss = supplySignals.wantsActive
      ? ECONOMY_CONSTANTS.ARMY_WANTS_FERVOR_DECAY_BASE_PER_TICK * supplySignals.wantsDeficit
      : 0;
    if (wantsFervorLoss > 0) {
      army.fervor = clampStat((army.fervor || 0) - wantsFervorLoss, 0, 100);
    }

    const wantsOrgDecay = supplySignals.wantsActive
      ? ECONOMY_CONSTANTS.ARMY_WANTS_ORG_DECAY_BASE_PER_TICK * supplySignals.wantsDeficit
      : 0;
    if (wantsOrgDecay > 0) {
      army.organization = clampStat((army.organization || 0) - wantsOrgDecay, 0, 100);
    }
    const baseRate = army.reinforcementRate || 100;

    let totalFervorBonus = (army.fervorBonus || 0);
    if (army.timedFervorBonuses && Array.isArray(army.timedFervorBonuses)) {
      totalFervorBonus += army.timedFervorBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
    }
    const effectiveFervor = Math.min(100, (army.fervor || 0) + totalFervorBonus);
    const fervorModifier = 0.5 + (effectiveFervor / 100) * 1.0;

    const population = clampPopulation(empire.stats?.population || 1000, 1000);
    const logPopulation = Math.log10(population);
    let populationModifier;
    if (logPopulation <= 3.0) populationModifier = 0.5;
    else if (logPopulation <= 4.0) populationModifier = 0.5 + (logPopulation - 3.0) * 0.5;
    else if (logPopulation <= 5.0) populationModifier = 1.0 + (logPopulation - 4.0) * 0.5;
    else if (logPopulation <= 6.0) populationModifier = 1.5 + (logPopulation - 5.0) * 0.5;
    else populationModifier = 2.0;

    const replenishmentMultiplier = (army.replenishmentMultiplier || 1.0) * empireMilitaryMods.army_replenishment_mult;

    if (army.mp.current >= army.mp.max) return;

    let effectiveRate =
      baseRate *
      fervorModifier *
      populationModifier *
      replenishmentMultiplier *
      supplySignals.replenishmentMultiplier;
    const replenishmentBonus = army.replenishmentBonus || 0;
    effectiveRate = Math.max(0, effectiveRate + replenishmentBonus);

    const spaceAvailable = army.mp.max - army.mp.current;
    const replenished = Math.min(effectiveRate, spaceAvailable);
    army.mp.current += replenished;

    if (replenished > 50 || Math.abs(netAggravation) > 0.2 || wantsFervorLoss > 0.2 || wantsOrgDecay > 0.2) {
      logger.debug(
        `Manpower replenishment: ${army.name} +${replenished.toFixed(0)} MP` +
        ` (needs ${(supplySignals.needsFulfillment * 100).toFixed(0)}%, wants ${(supplySignals.wantsFulfillment * 100).toFixed(0)}%,` +
        ` rate ${effectiveRate.toFixed(0)}, cap ${Math.floor(army.mp.max)},` +
        ` aggravation ${netAggravation >= 0 ? '+' : ''}${netAggravation.toFixed(2)}, fervor -${wantsFervorLoss.toFixed(2)}, org -${wantsOrgDecay.toFixed(2)})`
      );
    }
  });
}
