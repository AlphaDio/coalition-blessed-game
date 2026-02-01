import { clampApproval, clampStat } from './cohesion.js';
import { calculateLawReactions } from './reactions.js';

export function enactLaw(state, lawId) {
  const law = state.laws.find(l => l.id === lawId);
  if (!law) {
    return { error: 'Law not found' };
  }
  
  if (law.currentCooldown > 0) {
    return { error: 'Law on cooldown' };
  }
  
  // Apply law effects
  const log = [`Law enacted: ${law.name}`];
  
  // Calculate value-based reactions if law has vector data
  if (law.vector && Object.keys(law.vector).length > 0) {
    const reactions = calculateLawReactions(state.empires, law);
    
    Object.entries(reactions).forEach(([empireId, reactionData]) => {
      const empire = state.empires.find(e => e.id === empireId);
      if (empire) {
        empire.approval = clampApproval(empire.approval + reactionData.approvalChange);
        
        const reactionLabel = reactionData.reaction.charAt(0).toUpperCase() + reactionData.reaction.slice(1);
        const changeSign = reactionData.approvalChange >= 0 ? '+' : '';
        log.push(`${empire.name}: ${reactionLabel} (${changeSign}${reactionData.approvalChange})`);
      }
    });
  } else {
    // Fallback to legacy empireApproval effects if no vector
    if (law.effects.empireApproval) {
      Object.entries(law.effects.empireApproval).forEach(([empireId, change]) => {
        const empire = state.empires.find(e => e.id === empireId);
        if (empire) {
          empire.approval = clampApproval(empire.approval + change);
          log.push(`${empire.name} approval ${change >= 0 ? '+' : ''}${change}`);
        }
      });
    }
  }
  
  if (law.effects.armyOrgConversion) {
    state.armies.forEach(army => {
      if (law.effects.armyOrgConversion.empireIds?.includes(army.empireId) || !law.effects.armyOrgConversion.empireIds) {
        const multiplier = law.effects.armyOrgConversion.multiplier || 1.0;
        // Apply a direct org boost if specified
        if (law.effects.armyOrgConversion.directBoost) {
          army.organization = clampStat(army.organization + law.effects.armyOrgConversion.directBoost);
        }
      }
    });
  }
  
   if (law.effects.cohesionModifier) {
     // This is a modifier for future cohesion losses
     // Store it in active laws
     state.activeLaws.push({ lawId: law.id, effects: law.effects });
   }
   
   // Apply permanent coalition modifiers
   if (law.empire_approval) {
     state.coalitionModifiers.empire_approval += law.empire_approval;
     log.push(`Empire approval increased by +${law.empire_approval}`);
   }
   if (law.trade_income) {
     state.coalitionModifiers.trade_income += law.trade_income;
     log.push(`Trade income increased by +${law.trade_income} per tick`);
   }
   if (law.population_growth) {
     state.coalitionModifiers.population_growth += law.population_growth;
     log.push(`Population growth increased by +${law.population_growth} per tick`);
   }
   if (law.industrial_output) {
     state.coalitionModifiers.industrial_output += law.industrial_output;
     log.push(`Industrial output increased by ${(law.industrial_output * 100).toFixed(1)}%`);
   }
   
   const modifiers = law.modifiers || {};
   if (modifiers.army_maintenance_cost_modifier) {
     state.coalitionModifiers.army_maintenance_cost_modifier *= modifiers.army_maintenance_cost_modifier;
     log.push(`Army maintenance costs reduced by ${(1 - modifiers.army_maintenance_cost_modifier) * 100}%`);
   }
    if (modifiers.relations_strength_modifier) {
      state.coalitionModifiers.relations_strength_modifier *= modifiers.relations_strength_modifier;
      log.push(`Diplomatic relations strengthened by ${(modifiers.relations_strength_modifier - 1) * 100}%`);
    }
    if (modifiers.empire_production_multiplier) {
      state.coalitionModifiers.empire_production_multiplier += modifiers.empire_production_multiplier;
      log.push(`Empire production multiplier increased by +${(modifiers.empire_production_multiplier * 100).toFixed(0)}%`);
    }
    if (modifiers.consumptionShareMultiplier) {
      state.coalitionModifiers.consumptionShareMultiplier = (state.coalitionModifiers.consumptionShareMultiplier || 1.0) * modifiers.consumptionShareMultiplier;
      log.push(`Coalition consumption share multiplied by ${modifiers.consumptionShareMultiplier}x`);
    }
    if (modifiers.consumptionShareBonus) {
      state.coalitionModifiers.consumptionShareBonus = (state.coalitionModifiers.consumptionShareBonus || 0) + modifiers.consumptionShareBonus;
      log.push(`Coalition consumption share increased by +${(modifiers.consumptionShareBonus * 100).toFixed(0)}%`);
    }

   // Set cooldown
  law.currentCooldown = law.cooldown;
  
  return { success: true, log };
}

export function updateLawCooldowns(state) {
  state.laws.forEach(law => {
    if (law.currentCooldown > 0) {
      law.currentCooldown--;
    }
  });
}
