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
        // This affects how war funds convert to org (handled in economy)
        // For now, just apply a direct org boost if specified
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
