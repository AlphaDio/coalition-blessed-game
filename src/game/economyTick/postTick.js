import { MARKET_CONSTANTS } from '../constants.js';
import { refillCoalitionAllowance } from '../consumptionToRequisition.js';
import { computeArmyFulfillment } from '../marketEconomy.js';

export function applyPostMarketUpdates(state, config) {
  // Refill coalition allowance each tick (from faucet)
  // This is the primary credit source for the coalition
  refillCoalitionAllowance(state.coalitionEconomy);

  // Compute army fulfillment and performance
  state.armies.forEach(army => {
    computeArmyFulfillment(army, config);
  });

  // Apply coalition modifiers from enacted laws
  if (state.coalitionModifiers && state.empires) {
    state.empires.forEach(empire => {
      // Trade income
      if (state.coalitionModifiers.trade_income) {
        empire.budget_credits = (empire.budget_credits || 0) + state.coalitionModifiers.trade_income;
      }

      // Empire approval
      if (state.coalitionModifiers.empire_approval) {
        empire.approval = Math.min(100, Math.max(0, empire.approval + state.coalitionModifiers.empire_approval));
      }

      // Population growth (from coalition modifiers - percentage based)
      if (state.coalitionModifiers.population_growth) {
        if (!empire.stats) empire.stats = {};
        const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : 0;
        if (currentPopulation <= 0) return;

        // Initialize growth bank if needed
        if (!empire.stats.population_growth_bank) {
          empire.stats.population_growth_bank = 0;
        }

        // Calculate growth for this tick
        const growthAmount = currentPopulation * state.coalitionModifiers.population_growth;
        empire.stats.population_growth_bank += growthAmount;

        // Apply growth only when bank reaches threshold
        if (empire.stats.population_growth_bank >= MARKET_CONSTANTS.POPULATION_GROWTH_BANK_THRESHOLD) {
          const bankedGrowth = Math.floor(empire.stats.population_growth_bank);
          // Ensure population never goes below 1 to prevent division by zero and game breaks
          empire.stats.population = Math.max(1, currentPopulation + bankedGrowth);
          empire.stats.population_growth_bank -= bankedGrowth;
        }
      }
    });

    // Industrial output is applied during production calculations (handled elsewhere)
  }

  // Apply army maintenance cost modifier (placeholder - deduct from empire budgets)
  // TODO: Implement proper army maintenance system
  if (state.coalitionModifiers.army_maintenance_cost_modifier && state.coalitionModifiers.army_maintenance_cost_modifier !== 1.0) {
    state.empires.forEach(empire => {
      const armies = state.armies.filter(a => a.empireId === empire.id);
      // Placeholder: reduce maintenance costs by modifier (assuming some base cost per army)
      // This is a stub until full army maintenance is implemented
      const baseMaintenancePerArmy = 10; // placeholder value
      const totalMaintenance = armies.length * baseMaintenancePerArmy * state.coalitionModifiers.army_maintenance_cost_modifier;
      if (totalMaintenance > 0) {
        empire.budget_credits = Math.max(0, (empire.budget_credits || 0) - totalMaintenance);
      }
    });
  }

  // Apply relations strength modifier (placeholder - boost relations between empires)
  // TODO: Implement proper diplomacy relations improvement system
  if (state.coalitionModifiers.relations_strength_modifier && state.coalitionModifiers.relations_strength_modifier !== 1.0) {
    if (state.diplomacy && state.diplomacy.relations) {
      Object.keys(state.diplomacy.relations).forEach(empireId => {
        if (state.diplomacy.relations[empireId]) {
          Object.keys(state.diplomacy.relations[empireId]).forEach(otherId => {
            if (empireId !== otherId) {
              // Placeholder: improve relations by modifier each tick
              const current = state.diplomacy.relations[empireId][otherId] || 0;
              const improvement = (state.coalitionModifiers.relations_strength_modifier - 1.0) * 0.1; // Small boost per tick
              state.diplomacy.relations[empireId][otherId] = Math.min(100, current + improvement);
            }
          });
        }
      });
    }
  }
}
