import { TRADE_INCOME_EFFECT_DIVISOR } from '../constants.js';
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
    const tradeIncomeRate = Number.isFinite(state.coalitionModifiers.trade_income)
      ? state.coalitionModifiers.trade_income / TRADE_INCOME_EFFECT_DIVISOR
      : 0;

    state.empires.forEach(empire => {
      // Trade income
      if (tradeIncomeRate) {
        empire.budget_credits = (empire.budget_credits || 0) + tradeIncomeRate;
      }

      // Empire approval
      if (state.coalitionModifiers.empire_approval) {
        empire.approval = Math.min(100, Math.max(0, empire.approval + state.coalitionModifiers.empire_approval));
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
