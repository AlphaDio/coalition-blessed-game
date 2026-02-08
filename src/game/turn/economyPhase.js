import { consumeRequisition } from '../economy.js';
import { processEconomyTick } from '../economyTick.js';
import { recordConsumption } from '../consumptionToRequisition.js';
import {
  consumeFromSellOrders,
  getEmpireCommoditySellOrders,
  getOrderAvailable
} from '../marketOrderReserves.js';
import { getLogger } from '../../modules/logger.js';

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

function applyArmyBonus(state, empireId, bonusKey, amount) {
  const armies = state.armies.filter(a => a.empireId === empireId);
  armies.forEach(army => {
    army[bonusKey] = (army[bonusKey] || 0) + amount;
  });
  return armies.length;
}

function applyConsumptionEffect(state, empire, rule, consumed, log, logger) {
  const { commodity, threshold, effect } = rule;
  const amount = effect.amount;

  if (effect.type === 'population_percent') {
    const increments = Math.floor(consumed / 100000);
    const populationIncrease = Math.floor(empire.stats.population * (amount / 100) * increments);
    empire.stats.population += populationIncrease;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${populationIncrease} pop (${increments * amount}%)`
    );
    return;
  }

  if (effect.type === 'army_fervor_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'fervorBonus', amount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} fervor bonus to ${armyCount} armies (until next scourge battle)`
    );
    return;
  }

  if (effect.type === 'army_protection_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'protectionBonus', amount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} protection bonus to ${armyCount} armies (until next scourge battle)`
    );
    return;
  }

  if (effect.type === 'army_resolve_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'resolveBonus', amount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} resolve bonus to ${armyCount} armies (until next scourge battle)`
    );
    return;
  }

  if (effect.type === 'army_kill_rate_bonus') {
    const armyCount = applyArmyBonus(state, empire.id, 'killRateBonus', amount);
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} kill rate bonus to ${armyCount} armies (until next scourge battle)`
    );
    return;
  }

  if (effect.type === 'law_progress_bonus') {
    state.coalitionModifiers.lawProgressBonus = (state.coalitionModifiers.lawProgressBonus || 0) + amount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} law progress bonus (until law enacted)`
    );
    return;
  }

  if (effect.type === 'research_speed_bonus') {
    empire.stats.researchSpeedBonus = (empire.stats.researchSpeedBonus || 0) + amount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} research speed bonus (permanent)`
    );
    return;
  }

  if (effect.type === 'industrial_output_bonus') {
    state.coalitionModifiers.industrialOutputBonus = (state.coalitionModifiers.industrialOutputBonus || 0) + amount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} industrial output bonus (permanent)`
    );
    return;
  }

  if (effect.type === 'empire_approval_bonus') {
    empire.stats.approvalBonus = (empire.stats.approvalBonus || 0) + amount;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${amount} approval bonus (until next scourge battle)`
    );
    return;
  }

  if (effect.type === 'coalition_construction_bonus') {
    const increments = Math.floor(consumed / threshold);
    const bonus = increments * amount;
    state.coalitionConstruction = (state.coalitionConstruction || 0) + bonus;
    logConsumptionEffect(
      logger,
      log,
      `${empire.name} ${commodity}: consumed ${consumed}, +${bonus} coalition construction (permanent)`
    );
  }
}

/**
 * Processes empire consumption upgrades from accumulated market sell orders.
 * When a commodity's outstanding sell quantity reaches a threshold, the empire
 * retires that accumulation and applies the configured bonus.
 * to apply effects like population growth, and tracks consumption for coalition requisition.
 * @param {Object} state - The game state
 * @param {Function} log - Logging function
 */
export function processEmpireStockpileConsumption(state, log) {
  const logger = getLogger();
  for (const empire of state.empires) {
    for (const rule of empire.consumptionRules) {
      const { commodity, threshold } = rule;
      const sellOrders = getEmpireCommoditySellOrders(state, empire.id, commodity);
      const available = sellOrders.reduce((sum, order) => sum + getOrderAvailable(order), 0);
      if (available >= threshold) {
        const consumed = consumeFromSellOrders(sellOrders, available);

        // Track consumption for coalition requisition generation (with empire ID for approval scaling)
        recordConsumption(commodity, consumed, empire.id);
        applyConsumptionEffect(state, empire, rule, consumed, log, logger);
      }
    }
  }
}

