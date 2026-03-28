import { consumeRequisition } from '../economy.js';
import { processEconomyTick } from '../economyTick.js';
import { CONSUMPTION_SOURCES, getEmpireTurnConsumptionByCommodity } from '../consumptionToRequisition.js';
import { SCOURGE_PREDICTION_CONSTANTS } from '../constants.js';
import { clampApproval } from '../cohesion.js';
import { applyPopulationDelta } from '../populationUtils.js';
import { applyCoalitionIntel } from '../scourgePrediction.js';
import { scalePositiveApprovalGain } from '../approvalUtils.js';
import { getLogger } from '../../modules/logger.js';
import { addEmpireBattlePrep } from '../armyBattlePrep.js';

export function handleEconomyTick(state, log, logger) {
  try {
    const economyResult = processEconomyTick(state);
    if (economyResult.log && economyResult.log.length > 0) {
      log.push(...economyResult.log);
    }
    logger.debug(`Economy tick: ${economyResult.trades} trades executed`);
  } catch (error) {
    logger.error(`Economy tick failed: ${error.message}`, { error });
    const supplyLog = consumeRequisition(state);
    log.push(...supplyLog.log);
  }

  // Stability impact from negative budgets
  if (state.empires && state.empires.length > 0) {
    state.empires.forEach(empire => {
      const budget = empire.budget_credits ?? 0;
      if (budget < 0) {
        empire.stability = Math.max(-100, Math.min(100, (empire.stability ?? 60) - 1));
      }
    });
  }
}

function logConsumptionEffect(logger, log, message) {
  log.push(message);
  logger.info(message);
}

function normalizeConsumptionThreshold(rawThreshold) {
  const parsed = Number(rawThreshold);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function applyArmyBonus(state, empireId, bonusKey, amount) {
  return addEmpireBattlePrep(state, empireId, bonusKey, amount);
}

function applyConsumptionEffect(state, empire, rule, consumed, hits, log, logger) {
  const { commodity, effect } = rule;
  if (!effect || hits <= 0) return;

  const amount = effect.amount;
  const scaledAmount = amount * hits;

  if (effect.type === 'population_percent') {
    const rawPopulationIncrease = Math.floor(empire.stats.population * (amount / 100) * hits);
    const populationIncrease = applyPopulationDelta(empire, rawPopulationIncrease);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${populationIncrease} pop (${(hits * amount).toFixed(2)}%, ${hits} hits)`
    );
    return;
  }

  if (effect.type === 'army_fervor_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'fervor', scaledAmount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} next-battle fervor to ${armyCount} armies (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'army_protection_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'protection', scaledAmount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} next-battle protection to ${armyCount} armies (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'army_resolve_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'resolve', scaledAmount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} next-battle resolve to ${armyCount} armies (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'army_kill_rate_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'killRateBonus', scaledAmount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} kill rate bonus to ${armyCount} armies (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'law_progress_bonus') {
    state.coalitionModifiers.lawProgressBonus = (state.coalitionModifiers.lawProgressBonus || 0) + scaledAmount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} law progress bonus (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'research_speed_bonus') {
    empire.stats.researchSpeedBonus = (empire.stats.researchSpeedBonus || 0) + scaledAmount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} research speed bonus (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'industrial_output_bonus') {
    state.coalitionModifiers.industrialOutputBonus = (state.coalitionModifiers.industrialOutputBonus || 0) + scaledAmount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${scaledAmount.toFixed(3)} industrial output bonus (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'empire_approval_bonus') {
    const prevApproval = empire.approval || 0;
    const approvalDelta = scaledAmount > 0
      ? scalePositiveApprovalGain(empire.approval, scaledAmount)
      : scaledAmount;
    empire.approval = clampApproval((empire.approval || 0) + approvalDelta);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, approval ${prevApproval.toFixed(1)} -> ${empire.approval.toFixed(1)} (+${(empire.approval - prevApproval).toFixed(3)}, ${hits} hits)`
    );
    return;
  }

  if (effect.type === 'coalition_construction_bonus') {
    const bonus = scaledAmount;
    state.coalitionConstruction = (state.coalitionConstruction || 0) + bonus;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${bonus.toFixed(3)} coalition construction (${hits} hits)`
    );
    return;
  }

  if (effect.type === 'coalition_intel_bonus') {
    const intelGained = applyCoalitionIntel(state, scaledAmount);
    const confidenceBonus = intelGained * SCOURGE_PREDICTION_CONSTANTS.INTEL_CONFIDENCE_PER_POINT;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: pooled consumed ${consumed}, +${intelGained.toFixed(3)} coalition intel (+${confidenceBonus.toFixed(3)} confidence, ${hits} hits)`
    );
  }
}

/**
 * Processes empire consumption effects from pooled regular consumption.
 * Consumption is accumulated by empire+commodity across turns and triggers effect
 * increments when a rule's threshold is reached. Pool remainder is carried forward.
 * @param {Object} state - The game state
 * @param {Function} log - Logging function
 */
export function processEmpireStockpileConsumption(state, log) {
  const logger = getLogger();
  if (!state.consumptionEffectPools || typeof state.consumptionEffectPools !== 'object') {
    state.consumptionEffectPools = {};
  }

  for (const empire of state.empires) {
    if (!Array.isArray(empire.consumptionRules) || empire.consumptionRules.length === 0) {
      continue;
    }

    const empireId = String(empire.id);
    if (!state.consumptionEffectPools[empireId] || typeof state.consumptionEffectPools[empireId] !== 'object') {
      state.consumptionEffectPools[empireId] = {};
    }
    const empirePool = state.consumptionEffectPools[empireId];
    const consumedByCommodity = getEmpireTurnConsumptionByCommodity(empire.id, [
      CONSUMPTION_SOURCES.EMPIRE_NEEDS,
      CONSUMPTION_SOURCES.EMPIRE_WANTS,
      CONSUMPTION_SOURCES.IMPROVEMENT_SUSTAINMENT
    ]);

    for (const rule of empire.consumptionRules) {
      const { commodity, threshold } = rule;
      const normalizedThreshold = normalizeConsumptionThreshold(threshold);
      if (!normalizedThreshold) {
        logger.warn(`Skipping invalid consumption threshold for ${empire.name} ${commodity}: ${threshold}`);
        continue;
      }

      const consumedThisTurn = Math.max(0, Number(consumedByCommodity[commodity] || 0));
      const existingPool = Math.max(0, Number(empirePool[commodity] || 0));
      const updatedPool = existingPool + consumedThisTurn;
      const hits = Math.floor(updatedPool / normalizedThreshold);
      const spentFromPool = hits * normalizedThreshold;

      empirePool[commodity] = Math.max(0, updatedPool - spentFromPool);
      if (hits <= 0) continue;

      applyConsumptionEffect(state, empire, rule, spentFromPool, hits, log, logger);
    }
  }
}

