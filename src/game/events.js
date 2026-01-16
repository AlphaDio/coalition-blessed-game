import { EVENT_CONSTANTS } from './constants.js';
import { getCohesionTier } from './cohesion.js';
import { clampApproval, clampCohesion, clampStat } from './cohesion.js';

export function checkEvent(state, rng = Math.random) {
  if (state.activeEvent) {
    return null; // Event already active
  }
  
  const tier = getCohesionTier(state.coalitionCohesion);
  if (!tier) return null;
  
  let frequency = 0;
  if (tier.name === 'Stable') frequency = EVENT_CONSTANTS.TIER_1_FREQUENCY;
  else if (tier.name === 'Strained') frequency = EVENT_CONSTANTS.TIER_2_FREQUENCY;
  else if (tier.name === 'Desperate') frequency = EVENT_CONSTANTS.TIER_3_FREQUENCY;
  
  if (rng() < frequency && state.events.length > 0) {
    const event = state.events[Math.floor(rng() * state.events.length)];
    return event;
  }
  
  return null;
}

export function handleEventChoice(state, eventId, choiceIndex) {
  const event = state.events.find(e => e.id === eventId);
  if (!event || !event.choices[choiceIndex]) {
    return { error: 'Invalid choice' };
  }
  
  const choice = event.choices[choiceIndex];
  const log = [`Event: ${event.title} - ${choice.text}`];
  
  // Apply choice effects
  if (choice.effects) {
    // Handle coalitionCohesion (function or number)
    if (choice.effects.coalitionCohesion !== undefined) {
      const change = typeof choice.effects.coalitionCohesion === 'function' 
        ? choice.effects.coalitionCohesion() 
        : choice.effects.coalitionCohesion;
      state.coalitionCohesion = clampCohesion(state.coalitionCohesion + change);
      log.push(`Coalition Cohesion ${change >= 0 ? '+' : ''}${change}`);
    }
    
    // Handle scourgeCohesion (function or number)
    if (choice.effects.scourgeCohesion !== undefined) {
      const change = typeof choice.effects.scourgeCohesion === 'function' 
        ? choice.effects.scourgeCohesion() 
        : choice.effects.scourgeCohesion;
      state.scourgeCohesion = clampStat(state.scourgeCohesion + change, 0, 100);
      log.push(`Scourge Cohesion ${change >= 0 ? '+' : ''}${change}`);
    }
    
    if (choice.effects.empireApproval) {
      Object.entries(choice.effects.empireApproval).forEach(([empireId, change]) => {
        const empire = state.empires.find(e => e.id === empireId);
        if (empire) {
          empire.approval = clampApproval(empire.approval + change);
          log.push(`${empire.name} approval ${change >= 0 ? '+' : ''}${change}`);
        }
      });
    }
    
    if (choice.effects.armyFervor) {
      Object.entries(choice.effects.armyFervor).forEach(([armyId, change]) => {
        const army = state.armies.find(a => a.id === armyId);
        if (army) {
          army.fervor = clampStat(army.fervor + change);
          log.push(`${army.name} fervor ${change >= 0 ? '+' : ''}${change}`);
        }
      });
    }
    
    if (choice.effects.stockpiles) {
      Object.entries(choice.effects.stockpiles).forEach(([resource, change]) => {
        if (state.stockpiles[resource] !== undefined) {
          // Handle function-based effects (for random values)
          const actualChange = typeof change === 'function' ? change() : change;
          state.stockpiles[resource] = Math.max(0, state.stockpiles[resource] + actualChange);
          log.push(`${resource} ${actualChange >= 0 ? '+' : ''}${actualChange}`);
        }
      });
    }
  }
  
  state.activeEvent = null;
  
  return { success: true, log };
}
