import { ECONOMY_BALANCE_CONSTANTS } from './constants.js';

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

export function applyDemandCommodityMultiplier(commodity, qty) {
  return qty * getDemandCommodityMultiplier(commodity);
}

export function applySupplyCommodityMultiplier(commodity, qty) {
  return qty * getSupplyCommodityMultiplier(commodity);
}
