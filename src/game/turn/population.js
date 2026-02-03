import { MARKET_CONSTANTS } from '../constants.js';

const BASE_POPULATION_GROWTH_RATE = 0.001;
const MIN_POPULATION = 1;

export function applyBasePopulationGrowth(state) {
  if (!state.empires) return;
  state.empires.forEach(empire => {
    if (!empire.stats) empire.stats = { population: MIN_POPULATION };
    const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : MIN_POPULATION;
    if (currentPopulation <= 0) {
      empire.stats.population = MIN_POPULATION;
      return;
    }

    // Initialize growth bank if needed
    if (!empire.stats.population_growth_bank) {
      empire.stats.population_growth_bank = 0;
    }

    // Calculate growth for this tick
    const growthAmount = currentPopulation * BASE_POPULATION_GROWTH_RATE;
    empire.stats.population_growth_bank += growthAmount;

    // Apply growth only when bank reaches threshold
    if (empire.stats.population_growth_bank >= MARKET_CONSTANTS.POPULATION_GROWTH_BANK_THRESHOLD) {
      const bankedGrowth = Math.floor(empire.stats.population_growth_bank);
      empire.stats.population = Math.max(
        MIN_POPULATION,
        currentPopulation + bankedGrowth
      );
      // Keep remainder in bank
      empire.stats.population_growth_bank -= bankedGrowth;
    }
  });
}

