import { EVENT_CONSTANTS } from './constants.js';
import { getCohesionTier } from './cohesion.js';
import { clampApproval, clampCohesion, clampStat } from './cohesion.js';
import { getLogger } from '../modules/logger.js';

export function checkEvent(state, rng = Math.random) {
  const logger = getLogger();
  if (state.activeEvent) {
    return null; // Event already active
  }
  
  const tier = getCohesionTier(state.coalitionCohesion);
  if (!tier) {
    logger.debug('No cohesion tier, skipping event check');
    return null;
  }
  
  let frequency = 0;
  if (tier.name === 'Stable') frequency = EVENT_CONSTANTS.TIER_1_FREQUENCY;
  else if (tier.name === 'Strained') frequency = EVENT_CONSTANTS.TIER_2_FREQUENCY;
  else if (tier.name === 'Desperate') frequency = EVENT_CONSTANTS.TIER_3_FREQUENCY;
  
  const roll = rng();
  logger.debug(`Event check: tier=${tier.name}, frequency=${frequency}, roll=${roll.toFixed(3)}`);
  
  if (roll < frequency && state.events.length > 0) {
    const event = state.events[Math.floor(rng() * state.events.length)];
    
    // Validate event has required properties
    if (!event) {
      logger.error('Selected event is null or undefined');
      return null;
    }
    
    if (!event.id) {
      logger.error('Selected event missing id property', { event });
      return null;
    }
    
    if (!event.title && !event.name) {
      logger.error(`Event ${event.id} missing title/name property`, { event });
      return null;
    }
    
    const eventTitle = event.title || event.name || event.id;
    logger.debug(`Event selected: ${eventTitle} (${event.id})`);
    return event;
  }
  
  return null;
}

export function handleEventChoice(state, eventId, choiceIndex) {
  const logger = getLogger();
  const event = state.events.find(e => e.id === eventId);
  if (!event) {
    logger.error(`Event not found: ${eventId}`);
    return { error: 'Event not found' };
  }
  
  if (!event.choices || !Array.isArray(event.choices)) {
    logger.error(`Event ${eventId} has no choices array`, { event });
    return { error: 'Event has no choices' };
  }
  
  if (choiceIndex < 0 || choiceIndex >= event.choices.length) {
    logger.error(`Invalid choice index: ${choiceIndex} (event has ${event.choices.length} choices)`, {
      eventId,
      choiceIndex,
      choicesCount: event.choices.length
    });
    return { error: 'Invalid choice index' };
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
