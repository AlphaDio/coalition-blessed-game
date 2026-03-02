import { MARKET_CONSTANTS, POPULATION_CONSTANTS } from './constants.js';

export function clampPopulation(value, fallback = POPULATION_CONSTANTS.MIN_POPULATION) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(
    POPULATION_CONSTANTS.MAX_POPULATION,
    Math.max(POPULATION_CONSTANTS.MIN_POPULATION, Math.floor(numeric))
  );
}

export function ensurePopulationStats(empire) {
  if (!empire.stats) {
    empire.stats = {};
  }
  empire.stats.population = clampPopulation(
    empire.stats.population,
    POPULATION_CONSTANTS.MIN_POPULATION
  );
  if (!Number.isFinite(empire.stats.population_growth_bank)) {
    empire.stats.population_growth_bank = 0;
  }
  if (empire.stats.population >= POPULATION_CONSTANTS.MAX_POPULATION && empire.stats.population_growth_bank > 0) {
    empire.stats.population_growth_bank = 0;
  }
  if (empire.stats.population <= POPULATION_CONSTANTS.MIN_POPULATION && empire.stats.population_growth_bank < 0) {
    empire.stats.population_growth_bank = 0;
  }
}

export function getPopulationHeadroomRatio(population) {
  const currentPopulation = clampPopulation(population, POPULATION_CONSTANTS.MIN_POPULATION);
  if (currentPopulation >= POPULATION_CONSTANTS.MAX_POPULATION) {
    return 0;
  }
  return (POPULATION_CONSTANTS.MAX_POPULATION - currentPopulation) / POPULATION_CONSTANTS.MAX_POPULATION;
}

export function applyPopulationDelta(empire, delta, options = {}) {
  ensurePopulationStats(empire);

  let adjustedDelta = Number(delta);
  if (!Number.isFinite(adjustedDelta) || adjustedDelta === 0) {
    return 0;
  }

  const currentPopulation = empire.stats.population;
  if (adjustedDelta > 0 && options.scalePositiveByHeadroom !== false) {
    adjustedDelta *= getPopulationHeadroomRatio(currentPopulation);
  }

  if (!Number.isFinite(adjustedDelta) || adjustedDelta === 0) {
    return 0;
  }

  const nextPopulation = clampPopulation(currentPopulation + adjustedDelta, currentPopulation);
  const appliedDelta = nextPopulation - currentPopulation;
  empire.stats.population = nextPopulation;

  if (nextPopulation >= POPULATION_CONSTANTS.MAX_POPULATION && empire.stats.population_growth_bank > 0) {
    empire.stats.population_growth_bank = 0;
  }

  return appliedDelta;
}

export function applyPopulationGrowthRateToEmpire(empire, growthRate) {
  ensurePopulationStats(empire);

  let rate = Number(growthRate);
  if (!Number.isFinite(rate) || rate === 0) {
    return 0;
  }

  const currentPopulation = empire.stats.population;
  if (rate > 0) {
    rate *= getPopulationHeadroomRatio(currentPopulation);
  }

  if (!Number.isFinite(rate) || rate === 0) {
    return 0;
  }

  empire.stats.population_growth_bank += currentPopulation * rate;

  const threshold = MARKET_CONSTANTS.POPULATION_GROWTH_BANK_THRESHOLD;
  if (empire.stats.population_growth_bank >= threshold) {
    const bankedGrowth = Math.floor(empire.stats.population_growth_bank);
    empire.stats.population_growth_bank -= bankedGrowth;
    const appliedGrowth = applyPopulationDelta(empire, bankedGrowth, { scalePositiveByHeadroom: false });
    return appliedGrowth;
  }

  if (empire.stats.population_growth_bank <= -threshold) {
    const bankedLoss = Math.ceil(empire.stats.population_growth_bank);
    empire.stats.population_growth_bank -= bankedLoss;
    const appliedLoss = applyPopulationDelta(empire, bankedLoss, { scalePositiveByHeadroom: false });
    return appliedLoss;
  }

  return 0;
}
