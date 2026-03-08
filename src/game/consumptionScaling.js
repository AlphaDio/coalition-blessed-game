import { ECONOMY_CONSTANTS } from './constants.js';
import { clampPopulation } from './populationUtils.js';

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function getEmpireEffectiveDemandPopulation(population) {
  const pop = Math.max(1, Number(population) || 1);
  const exponent = Math.min(
    1,
    Math.max(0.5, finiteOr(ECONOMY_CONSTANTS.EMPIRE_DEMAND_POPULATION_EXPONENT, 0.9))
  );
  return Math.pow(pop, exponent);
}

export function getArmyPopulationDemandMultiplier(population) {
  const pop = clampPopulation(population || 1000, 1);
  const base = Math.max(0, finiteOr(ECONOMY_CONSTANTS.ARMY_POPULATION_DEMAND_BASE, 1));
  const logScale = Math.max(0, finiteOr(ECONOMY_CONSTANTS.ARMY_POPULATION_DEMAND_LOG_SCALE, 2.5));
  const multiplier = base + (Math.log10(pop) * logScale);
  return Math.max(1, multiplier);
}
