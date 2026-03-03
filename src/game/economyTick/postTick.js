import { TRADE_INCOME_EFFECT_DIVISOR, FULFILLMENT_CONSTANTS } from '../constants.js';
import { refillCoalitionAllowance } from '../consumptionToRequisition.js';
import { computeArmyFulfillment, computeEmpireFulfillment } from '../marketEconomy.js';

/**
 * Compute the average fulfillment across all commodities in a fulfillment map.
 * Returns 1.0 (fully fulfilled) when no commodities are demanded.
 */
function averageFulfillment(fulfillmentMap) {
  const values = Object.values(fulfillmentMap || {}).filter(v => Number.isFinite(v));
  if (values.length === 0) return 1.0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Apply gradual approval and population-growth effects based on empire needs/wants fulfillment.
 * - Needs:  steep penalty curve below NEEDS_NEUTRAL_THRESHOLD, small bonus above it.
 * - Wants:  gentle linear curve centred on WANTS_NEUTRAL (penalty below, bonus above).
 *
 * Effects are stored on empire.fulfillment_effects for diagnostics and applied directly
 * to empire.approval and empire.stats.fulfillment_growth_modifier (read by population.js).
 *
 * @param {Object} empire - The empire whose fulfillment effects should be applied
 */
export function applyEmpireFulfillmentEffects(empire) {
  const {
    NEEDS_NEUTRAL_THRESHOLD,
    NEEDS_CURVE_POWER,
    NEEDS_MAX_APPROVAL_PENALTY,
    NEEDS_MAX_GROWTH_PENALTY,
    NEEDS_MAX_APPROVAL_BONUS,
    NEEDS_MAX_GROWTH_BONUS,
    WANTS_NEUTRAL,
    WANTS_MAX_APPROVAL_BONUS,
    WANTS_MAX_GROWTH_BONUS,
    WANTS_MAX_APPROVAL_PENALTY,
    WANTS_MAX_GROWTH_PENALTY
  } = FULFILLMENT_CONSTANTS;

  const needsFulfillment = averageFulfillment(empire.supply_state?.needs_fulfillment);
  const wantsFulfillment = averageFulfillment(empire.supply_state?.wants_fulfillment);

  // --- Needs ---
  let needsApprovalEffect = 0;
  let needsGrowthEffect = 0;
  const needsDemandCount = Object.keys(empire.supply_state?.needs_demand || {}).length;

  if (needsDemandCount > 0) {
    if (needsFulfillment < NEEDS_NEUTRAL_THRESHOLD) {
      const penaltyRatio = (NEEDS_NEUTRAL_THRESHOLD - needsFulfillment) / NEEDS_NEUTRAL_THRESHOLD;
      const severity = Math.pow(penaltyRatio, NEEDS_CURVE_POWER);
      needsApprovalEffect = -NEEDS_MAX_APPROVAL_PENALTY * severity;
      needsGrowthEffect = -NEEDS_MAX_GROWTH_PENALTY * severity;
    } else {
      const bonusRatio = (needsFulfillment - NEEDS_NEUTRAL_THRESHOLD) / (1 - NEEDS_NEUTRAL_THRESHOLD);
      needsApprovalEffect = NEEDS_MAX_APPROVAL_BONUS * bonusRatio;
      needsGrowthEffect = NEEDS_MAX_GROWTH_BONUS * bonusRatio;
    }
  }

  // --- Wants ---
  let wantsApprovalEffect = 0;
  let wantsGrowthEffect = 0;
  const wantsDemandCount = Object.keys(empire.supply_state?.wants_demand || {}).length;

  if (wantsDemandCount > 0) {
    const wantsDelta = wantsFulfillment - WANTS_NEUTRAL;
    if (wantsDelta >= 0) {
      const bonusRatio = wantsDelta / (1 - WANTS_NEUTRAL);
      wantsApprovalEffect = WANTS_MAX_APPROVAL_BONUS * bonusRatio;
      wantsGrowthEffect = WANTS_MAX_GROWTH_BONUS * bonusRatio;
    } else {
      const penaltyRatio = Math.abs(wantsDelta) / WANTS_NEUTRAL;
      wantsApprovalEffect = -WANTS_MAX_APPROVAL_PENALTY * penaltyRatio;
      wantsGrowthEffect = -WANTS_MAX_GROWTH_PENALTY * penaltyRatio;
    }
  }

  // Apply approval effect (clamped to [0, 100])
  const totalApprovalEffect = needsApprovalEffect + wantsApprovalEffect;
  if (totalApprovalEffect !== 0) {
    empire.approval = Math.max(0, Math.min(100, (empire.approval ?? 50) + totalApprovalEffect));
  }

  // Store growth modifier so population.js can pick it up
  empire.stats = empire.stats || {};
  empire.stats.fulfillment_growth_modifier = needsGrowthEffect + wantsGrowthEffect;

  // Diagnostics snapshot for UI / debugging
  empire.fulfillment_effects = {
    needs_fulfillment: needsFulfillment,
    wants_fulfillment: wantsFulfillment,
    needs_approval_effect: needsApprovalEffect,
    wants_approval_effect: wantsApprovalEffect,
    needs_growth_effect: needsGrowthEffect,
    wants_growth_effect: wantsGrowthEffect
  };
}

export function applyPostMarketUpdates(state, config) {
  // Refill coalition allowance each tick (from faucet)
  // This is the primary credit source for the coalition
  refillCoalitionAllowance(state.coalitionEconomy);

  // Compute army fulfillment and performance
  state.armies.forEach(army => {
    computeArmyFulfillment(army, config);
  });

  // Compute empire needs/wants fulfillment and apply gradual effects
  state.empires.forEach(empire => {
    computeEmpireFulfillment(empire);
    applyEmpireFulfillmentEffects(empire);
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
