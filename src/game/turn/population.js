import { POPULATION_CONSTANTS } from '../constants.js';
import { getEmpireImprovementModifier, getEmpireTechModifier } from '../empireModifiers.js';
import { applyPopulationGrowthRateToEmpire, ensurePopulationStats } from '../populationUtils.js';
import { getProjectBonus } from '../projects.js';

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getEmpirePopulationGrowthRate(state, empire) {
  return (
    POPULATION_CONSTANTS.BASE_GROWTH_RATE * (1 + getProjectBonus(state, 'population')) +
    toFiniteNumber(state?.coalitionModifiers?.population_growth, 0) +
    getEmpireTechModifier(empire, 'population_growth') +
    getEmpireImprovementModifier(state, empire.id, 'population_growth') +
    toFiniteNumber(empire.stats?.fulfillment_growth_modifier, 0)
  );
}

export function applyBasePopulationGrowth(state) {
  if (!Array.isArray(state?.empires)) return;

  state.empires.forEach((empire) => {
    ensurePopulationStats(empire);
    const growthRate = getEmpirePopulationGrowthRate(state, empire);
    applyPopulationGrowthRateToEmpire(empire, growthRate);
  });
}
