import { consumeRequisition } from '../economy.js';
import { processEconomyTick } from '../economyTick.js';
import { recordConsumption } from '../consumptionToRequisition.js';
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

/**
 * Processes stockpile consumption for empires, consuming commodities above thresholds
 * to apply effects like population growth, and tracks consumption for coalition requisition.
 * @param {Object} state - The game state
 * @param {Function} log - Logging function
 */
export function processEmpireStockpileConsumption(state, log) {
  const logger = getLogger();
  for (const empire of state.empires) {
    for (const rule of empire.consumptionRules) {
      const { commodity, threshold, effect } = rule;
      const available = empire.stockpiles[commodity] || 0;
      if (available >= threshold) {
        const consumed = available;
        empire.stockpiles[commodity] = 0;

        // Track consumption for coalition requisition generation (with empire ID for approval scaling)
        recordConsumption(commodity, consumed, empire.id);

        if (effect.type === 'population_percent') {
          const increments = Math.floor(consumed / 100000);
          const populationIncrease = Math.floor(empire.stats.population * (effect.amount / 100) * increments);
          empire.stats.population += populationIncrease;
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${populationIncrease} pop (${increments * effect.amount}%)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'army_fervor_bonus') {
          const armies = state.armies.filter(a => a.empireId === empire.id);
          armies.forEach(army => {
            army.fervorBonus = (army.fervorBonus || 0) + effect.amount;
          });
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} fervor bonus to ${armies.length} armies (until next scourge battle)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'army_protection_bonus') {
          const armies = state.armies.filter(a => a.empireId === empire.id);
          armies.forEach(army => {
            army.protectionBonus = (army.protectionBonus || 0) + effect.amount;
          });
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} protection bonus to ${armies.length} armies (until next scourge battle)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'army_resolve_bonus') {
          const armies = state.armies.filter(a => a.empireId === empire.id);
          armies.forEach(army => {
            army.resolveBonus = (army.resolveBonus || 0) + effect.amount;
          });
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} resolve bonus to ${armies.length} armies (until next scourge battle)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'law_progress_bonus') {
          state.coalitionModifiers.lawProgressBonus = (state.coalitionModifiers.lawProgressBonus || 0) + effect.amount;
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} law progress bonus (until law enacted)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'research_speed_bonus') {
          empire.stats.researchSpeedBonus = (empire.stats.researchSpeedBonus || 0) + effect.amount;
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} research speed bonus (permanent)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'industrial_output_bonus') {
          state.coalitionModifiers.industrialOutputBonus = (state.coalitionModifiers.industrialOutputBonus || 0) + effect.amount;
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} industrial output bonus (permanent)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'army_kill_rate_bonus') {
          const armies = state.armies.filter(a => a.empireId === empire.id);
          armies.forEach(army => {
            army.killRateBonus = (army.killRateBonus || 0) + effect.amount;
          });
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} kill rate bonus to ${armies.length} armies (until next scourge battle)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'empire_approval_bonus') {
          empire.stats.approvalBonus = (empire.stats.approvalBonus || 0) + effect.amount;
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${effect.amount} approval bonus (until next scourge battle)`;
            log.push(message);
            logger.info(message);
          }
        } else if (effect.type === 'coalition_construction_bonus') {
          const increments = Math.floor(consumed / threshold);
          const bonus = increments * effect.amount;
          state.coalitionConstruction = (state.coalitionConstruction || 0) + bonus;
          {
            const message = `${empire.name} ${commodity}: consumed ${consumed}, +${bonus} coalition construction (permanent)`;
            log.push(message);
            logger.info(message);
          }
        }
      }
    }
  }
}

