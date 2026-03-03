import { POPULATION_CONSTANTS } from '../constants.js';
import { getEmpireImprovementModifier, getEmpireTechModifier } from '../empireModifiers.js';
import { getActiveEmergencyModifiers } from '../emergencyLaws.js';
import { applyPopulationGrowthRateToEmpire, ensurePopulationStats } from '../populationUtils.js';

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getEmpirePopulationGrowthRate(state, empire, emergencyPopulationGrowth) {
  return (
    POPULATION_CONSTANTS.BASE_GROWTH_RATE +
    toFiniteNumber(state?.coalitionModifiers?.population_growth, 0) +
    toFiniteNumber(emergencyPopulationGrowth, 0) +
    getEmpireTechModifier(empire, 'population_growth') +
    getEmpireImprovementModifier(state, empire.id, 'population_growth') +
    toFiniteNumber(empire.stats?.fulfillment_growth_modifier, 0)
  );
}

export function applyBasePopulationGrowth(state) {
  if (!Array.isArray(state?.empires)) return;

  const emergencyPopulationGrowth = getActiveEmergencyModifiers(state)?.population_growth || 0;

  state.empires.forEach((empire) => {
    ensurePopulationStats(empire);
    const growthRate = getEmpirePopulationGrowthRate(state, empire, emergencyPopulationGrowth);
    applyPopulationGrowthRateToEmpire(empire, growthRate);
  });
}
