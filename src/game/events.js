import { EVENT_CONSTANTS } from './constants.js';
import { getCohesionTier } from './cohesion.js';
import { clampApproval, clampCohesion, clampStat } from './cohesion.js';
import { getLogger } from '../modules/logger.js';
import { resolveEventVariables, expandEffectTargets, interpolateText } from './selectors.js';
import { getEventTitle, hasValidChoices } from '../utils/events.js';
import { handleTechEventChoice } from './technology.js';


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
    // Filter out LAW scope events (they're handled by law system)
    const regularEvents = state.events.filter(e => e.scope !== 'LAW');
    if (regularEvents.length === 0) {
      logger.debug('No regular events available (only LAW scope events)');
      return null;
    }
    
    const event = regularEvents[Math.floor(rng() * regularEvents.length)];
    
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
    
    // Check if event has valid choices - if not, auto-resolve it
    if (!hasValidChoices(event)) {
      const eventTitle = getEventTitle(event);
      logger.warn(`Event "${eventTitle}" (${event.id}) has no choices array, auto-resolving`);
      // Auto-resolve by calling handleEventChoice with a default choice
      const autoResolveResult = autoResolveEvent(state, event);
      if (autoResolveResult.success) {
        logger.info(`Event "${eventTitle}" (${event.id}) auto-resolved (no choices)`);
        return null; // Don't set as activeEvent since it's already resolved
      } else {
        logger.error(`Failed to auto-resolve event "${eventTitle}" (${event.id}): ${autoResolveResult.error}`);
        return null; // Skip invalid events
      }
    }
    
    const eventTitle = getEventTitle(event);
    logger.debug(`Event selected: ${eventTitle} (${event.id})`);
    
    // Resolve dynamic variables if present
    if (event.variables) {
      const resolvedContext = resolveEventVariables(event.variables, state);
      // Return event with resolved context for use in handleEventChoice
      // Interpolate title, text, and choice text with resolved values
      return {
        ...event,
        _resolvedContext: resolvedContext,
        title: interpolateText(event.title, resolvedContext, state),
        text: interpolateText(event.text, resolvedContext, state),
        choices: event.choices.map(choice => ({
          ...choice,
          text: interpolateText(choice.text, resolvedContext, state)
        }))
      };
    }
    
    return event;
  }
  
  return null;
}

/**
 * Auto-resolve an event that has no choices
 */
function autoResolveEvent(state, event) {
  // For events without choices, just clear the active event
  // This allows the game to continue without player input
  state.activeEvent = null;
  return { success: true, log: [`Event ${getEventTitle(event)} occurred (no action required)`] };
}

export function handleEventChoice(state, eventId, choiceIndex) {
  const logger = getLogger();
  
  // Use activeEvent if available (has resolved context), otherwise find from events list
  // This is important for dynamic selectors - the activeEvent has _resolvedContext attached
  const activeEvent = state.activeEvent;
  const event = activeEvent && activeEvent.id === eventId 
    ? activeEvent 
    : state.events.find(e => e.id === eventId);
  
  if (!event) {
    logger.error(`Event not found: ${eventId}`);
    return { error: 'Event not found' };
  }
  
  // Route tech events to specialized handler
  if (event.scope === 'TECH') {
    return handleTechEventChoice(state, event, choiceIndex);
  }
  
  // Get resolved context for expanding effect targets
  const resolvedContext = event._resolvedContext || {};
  
  // If event has no choices, auto-resolve it
  if (!hasValidChoices(event)) {
    const eventTitle = getEventTitle(event);
    logger.warn(`Event "${eventTitle}" (${eventId}) has no choices array, auto-resolving`);
    const autoResolveResult = autoResolveEvent(state, event);
    if (autoResolveResult.success) {
      logger.info(`Event "${eventTitle}" (${eventId}) auto-resolved (no choices)`);
      return { success: true, log: autoResolveResult.log };
    } else {
      logger.error(`Failed to auto-resolve event "${eventTitle}" (${eventId}): ${autoResolveResult.error}`);
      return { error: 'Event has no choices and auto-resolution failed' };
    }
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
  
  // Interpolate choice text with resolved context
  const choiceText = interpolateText(choice.text, resolvedContext, state);
  const log = [`Event: ${event.title} - ${choiceText}`];
  
  // Apply choice effects
  if (choice.effects) {
    // Expand effect targets using resolved context (converts $var references to IDs)
    const expandedEffects = expandEffectTargets(choice.effects, resolvedContext, state);
    
    // Handle coalitionCohesion (function or number)
    if (expandedEffects.coalitionCohesion !== undefined) {
      const change = typeof expandedEffects.coalitionCohesion === 'function' 
        ? expandedEffects.coalitionCohesion() 
        : expandedEffects.coalitionCohesion;
      state.coalitionCohesion = clampCohesion(state.coalitionCohesion + change);
      log.push(`Coalition Cohesion ${change >= 0 ? '+' : ''}${change}`);
    }
    
    // Handle scourgeCohesion (function or number)
    if (expandedEffects.scourgeCohesion !== undefined) {
      const change = typeof expandedEffects.scourgeCohesion === 'function' 
        ? expandedEffects.scourgeCohesion() 
        : expandedEffects.scourgeCohesion;
      state.scourgeCohesion = clampStat(state.scourgeCohesion + change, 0, 100);
      log.push(`Scourge Cohesion ${change >= 0 ? '+' : ''}${change}`);
    }
    
    if (expandedEffects.empireApproval) {
      Object.entries(expandedEffects.empireApproval).forEach(([empireId, change]) => {
        const empire = state.empires.find(e => e.id === empireId);
        if (empire) {
          empire.approval = clampApproval(empire.approval + change);
          log.push(`${empire.name} approval ${change >= 0 ? '+' : ''}${change}`);
        }
      });
    }
    
    if (expandedEffects.armyFervor) {
      Object.entries(expandedEffects.armyFervor).forEach(([armyId, change]) => {
        const army = state.armies.find(a => a.id === armyId);
        if (army) {
          army.fervor = clampStat(army.fervor + change);
          log.push(`${army.name} fervor ${change >= 0 ? '+' : ''}${change}`);
        }
      });
    }
    
    if (expandedEffects.stockpiles) {
      Object.entries(expandedEffects.stockpiles).forEach(([resource, change]) => {
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
