import { ECONOMY_CONSTANTS } from './constants.js';
import { clampStat } from './cohesion.js';

export function applyWarFundAllocation(state, allocations) {
  // allocations: { armyId: percentage }
  const total = Object.values(allocations).reduce((sum, p) => sum + p, 0);
  if (Math.abs(total - 100) > 0.1) {
    return { error: 'Allocations must sum to 100%' };
  }
  
  // Update army shares
  state.armies.forEach(army => {
    const share = allocations[army.id] || 0;
    army.warFundShare = share;
    
    // Apply share effects
    if (share > 0) {
      const orgGain = share * ECONOMY_CONSTANTS.ORG_PER_PERCENT_SHARE;
      army.organization = clampStat(army.organization + orgGain);
      
      const aggravationReduction = share * ECONOMY_CONSTANTS.AGGRAVATION_REDUCTION_PERCENT;
      army.aggravation = clampStat(army.aggravation - aggravationReduction);
    } else {
      // Underfunded
      army.organization = clampStat(army.organization - ECONOMY_CONSTANTS.UNDERFUNDED_ORG_DECAY);
      army.aggravation = clampStat(army.aggravation + ECONOMY_CONSTANTS.UNDERFUNDED_AGGRAVATION_INCREASE);
    }
  });
  
  return { success: true };
}

export function consumeSupplies(state) {
  const log = [];
  let totalNeeded = 0;
  
  state.armies.forEach(army => {
    const needed = army.supplyNeed * (army.warFundShare / 100);
    totalNeeded += needed;
  });
  
  if (state.stockpiles.supplies >= totalNeeded) {
    state.stockpiles.supplies -= totalNeeded;
  } else {
    // Shortage
    const shortage = totalNeeded - state.stockpiles.supplies;
    state.stockpiles.supplies = 0;
    
    state.armies.forEach(army => {
      const needed = army.supplyNeed * (army.warFundShare / 100);
      if (needed > 0) {
        const shortageRatio = shortage / totalNeeded;
        army.organization = clampStat(army.organization - ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_ORG_PENALTY * shortageRatio);
        army.aggravation = clampStat(army.aggravation + ECONOMY_CONSTANTS.SUPPLY_SHORTAGE_AGGRAVATION_INCREASE * shortageRatio);
      }
    });
    
    log.push(`Supply shortage! Organizations and Aggravation affected.`);
  }
  
  return { log };
}
