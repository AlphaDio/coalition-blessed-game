import { ECONOMY_BALANCE_CONSTANTS } from './constants.js';
import { getProjectDemandMultiplier, getProjectOutputMultiplier } from './projects.js';

function normalizeMultiplier(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 1;
  }
  return value;
}

function getCommodityMultiplier(map, commodity) {
  return normalizeMultiplier(map?.[commodity]);
}

export function getDemandCommodityMultiplier(commodity) {
  return getCommodityMultiplier(ECONOMY_BALANCE_CONSTANTS.DEMAND_MULTIPLIERS_BY_COMMODITY, commodity);
}

export function getSupplyCommodityMultiplier(commodity) {
  return getCommodityMultiplier(ECONOMY_BALANCE_CONSTANTS.SUPPLY_MULTIPLIERS_BY_COMMODITY, commodity);
}

export function applyDemandCommodityMultiplier(commodity, qty, state) {
  return qty * getDemandCommodityMultiplier(commodity) * getProjectDemandMultiplier(state, commodity);
}

export function applySupplyCommodityMultiplier(commodity, qty, state) {
  return qty * getSupplyCommodityMultiplier(commodity) * getProjectOutputMultiplier(state, commodity);
}

export function capConsumptionIndustrialOutputBonus(value) {
  return Number.isFinite(value) ? Math.min(value, ECONOMY_BALANCE_CONSTANTS.MAX_CONSUMPTION_INDUSTRIAL_OUTPUT_BONUS) : 0;
}
