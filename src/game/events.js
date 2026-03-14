import { EVENT_CONSTANTS, SCOURGE_PREDICTION_CONSTANTS } from './constants.js';
import { getCohesionTier } from './cohesion.js';
import {
  clampApproval,
  clampStat,
  applyScaledCoalitionCohesionDelta,
  applyScaledScourgeCohesionDelta
} from './cohesion.js';
import { getLogger } from '../modules/logger.js';
import { resolveEventVariables, expandEffectTargets, interpolateText } from './selectors.js';
import { getEventTitle, hasValidChoices } from '../utils/events.js';
import { handleTechEventChoice } from './technology.js';
import { boostScourgePredictionConfidence } from './scourgePrediction.js';
import { buildHeroRecruitmentEvent, handleHeroRecruitmentChoice } from './heroes.js';
import { handleMissionEventChoice } from './scourgeMissions.js';

export function checkEvent(state, rng = Math.random) {
  const logger = getLogger();
  if (state.activeEvent) {
    return null; // Event already active
  }

  const heroRecruitmentEvent = buildHeroRecruitmentEvent(state, rng);
  if (heroRecruitmentEvent) {
    logger.info(`Hero recruitment triggered for ${heroRecruitmentEvent.empireId}`);
    return heroRecruitmentEvent;
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
          text: interpolateText(choice.text, resolvedContext, state),
          ...(choice.effects_summary ? { effects_summary: interpolateText(choice.effects_summary, resolvedContext, state) } : {}),
          ...(choice.description ? { description: interpolateText(choice.description, resolvedContext, state) } : {})
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

function applyLinkedIntelAndPrediction(state, confidenceDelta = 0, intelDelta = 0, log = []) {
  const confidenceChange = Number(confidenceDelta) || 0;
  const intelChange = Number(intelDelta) || 0;
  const perPoint = SCOURGE_PREDICTION_CONSTANTS.INTEL_CONFIDENCE_PER_POINT;

  let totalIntelDelta = intelChange;
  let totalConfidenceDelta = confidenceChange;

  if (confidenceChange !== 0 && perPoint > 0) {
    totalIntelDelta += confidenceChange / perPoint;
  }
  if (intelChange !== 0 && perPoint > 0) {
    totalConfidenceDelta += intelChange * perPoint;
  }

  if (totalIntelDelta !== 0) {
    state.coalitionIntel = (state.coalitionIntel || 0) + totalIntelDelta;
    const direction = totalIntelDelta >= 0 ? '+' : '';
    log.push(`Coalition intel ${direction}${totalIntelDelta.toFixed(2)}`);
  }

  if (state.scourgePrediction && totalConfidenceDelta !== 0) {
    boostScourgePredictionConfidence(state, totalConfidenceDelta);
    const newLevel = state.scourgePrediction.confidenceLevel;
    const direction = totalConfidenceDelta >= 0 ? '+' : '';
    log.push(`Scourge prediction confidence ${direction}${totalConfidenceDelta.toFixed(2)} (now ${newLevel.toUpperCase()})`);
  }
}

function scaleEventRelationDelta(rawDelta, currentRelation) {
  const numericDelta = Number(rawDelta);
  if (!Number.isFinite(numericDelta) || numericDelta === 0) {
    return 0;
  }

  const scalar = Number(EVENT_CONSTANTS.RELATION_EFFECT_SCALAR || 1);
  const absCap = Math.max(0, Number(EVENT_CONSTANTS.RELATION_EFFECT_ABS_CAP || 0));
  const diminishingFloor = clampStat(Number(EVENT_CONSTANTS.RELATION_DIMINISHING_FLOOR || 0), 0, 1);
  const recoveryBias = Math.max(0, Number(EVENT_CONSTANTS.RELATION_RECOVERY_BIAS || 1));
  const hostilityDamping = clampStat(Number(EVENT_CONSTANTS.RELATION_HOSTILITY_DAMPING || 1), 0, 1);
  const minStep = Math.max(0, Number(EVENT_CONSTANTS.RELATION_MIN_STEP || 0));

  let scaled = numericDelta * scalar;
  if (absCap > 0) {
    scaled = clampStat(scaled, -absCap, absCap);
  }

  const relation = clampStat(Number(currentRelation) || 0, -100, 100);
  const positiveHeadroom = clampStat((100 - relation) / 100, 0, 1);
  const negativeHeadroom = clampStat((relation + 100) / 100, 0, 1);
  const diminishingFactor = scaled >= 0 ? positiveHeadroom : negativeHeadroom;
  scaled *= Math.max(diminishingFloor, diminishingFactor);

  // Let players recover broken ties a bit faster than they can deepen hostility.
  if (scaled > 0 && relation < 0) {
    scaled *= recoveryBias;
  }
  if (scaled < 0 && relation < 0) {
    scaled *= hostilityDamping;
  }

  if (Math.abs(scaled) < minStep) {
    scaled = Math.sign(scaled) * minStep;
  }

  return Number(scaled.toFixed(2));
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

  if (event.scope === 'HERO_RECRUIT') {
    return handleHeroRecruitmentChoice(state, event, choiceIndex);
  }

  if (event.scope === 'SCOURGE_MISSION') {
    const result = handleMissionEventChoice(state, event, choiceIndex);
    state.activeEvent = null;
    return result;
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
      const reducedChange = change * 0.5;  // Reduce cohesion changes by 50%
      const appliedChange = applyScaledCoalitionCohesionDelta(state, reducedChange);
      log.push(`Coalition Cohesion ${appliedChange >= 0 ? '+' : ''}${appliedChange.toFixed(2)}`);
    }
    
    // Handle scourgeCohesion (function or number)
    if (expandedEffects.scourgeCohesion !== undefined) {
      const change = typeof expandedEffects.scourgeCohesion === 'function' 
        ? expandedEffects.scourgeCohesion() 
        : expandedEffects.scourgeCohesion;
      const reducedChange = change * 0.5;  // Reduce cohesion changes by 50%
      const appliedChange = applyScaledScourgeCohesionDelta(state, reducedChange);
      log.push(`Scourge Cohesion ${appliedChange >= 0 ? '+' : ''}${appliedChange.toFixed(2)}`);
    }
    
    if (expandedEffects.empireApproval) {
      Object.entries(expandedEffects.empireApproval).forEach(([empireId, change]) => {
        const empire = state.empires.find(e => e.id === empireId);
        if (empire) {
          empire.approval = clampApproval(empire.approval + change);
          log.push(`${empire.name} approval ${change >= 0 ? '+' : ''}${(change).toFixed(2)}`);
        }
      });
    }

    if (expandedEffects.empireBudgetCredits) {
      Object.entries(expandedEffects.empireBudgetCredits).forEach(([empireId, change]) => {
        const empire = state.empires.find(e => e.id === empireId);
        const actualChange = typeof change === 'function' ? change() : change;
        if (empire && Number.isFinite(actualChange) && actualChange !== 0) {
          empire.budget_credits = (empire.budget_credits || 0) + actualChange;
          log.push(`${empire.name} credits ${actualChange >= 0 ? '+' : ''}${actualChange.toFixed(2)}`);
        }
      });
    }

    if (expandedEffects.empireStability) {
      Object.entries(expandedEffects.empireStability).forEach(([empireId, change]) => {
        const empire = state.empires.find(e => e.id === empireId);
        const actualChange = typeof change === 'function' ? change() : change;
        if (empire && Number.isFinite(actualChange) && actualChange !== 0) {
          empire.stability = clampStat((empire.stability || 0) + actualChange, 0, 100);
          log.push(`${empire.name} stability ${actualChange >= 0 ? '+' : ''}${actualChange.toFixed(2)}`);
        }
      });
    }
    
    if (expandedEffects.armyFervor) {
      Object.entries(expandedEffects.armyFervor).forEach(([armyId, change]) => {
        const army = state.armies.find(a => a.id === armyId);
        if (army) {
          army.fervor = clampStat((army.fervor || 0) + change, 0, 100);
          log.push(`${army.name} fervor ${change >= 0 ? '+' : ''}${(change).toFixed(2)}`);
        }
      });
    }
    
    if (expandedEffects.stockpiles) {
      Object.entries(expandedEffects.stockpiles).forEach(([resource, change]) => {
        if (state.stockpiles[resource] !== undefined) {
          // Handle function-based effects (for random values)
          const actualChange = typeof change === 'function' ? change() : change;
          state.stockpiles[resource] = Math.max(0, state.stockpiles[resource] + actualChange);
          log.push(`${resource} ${actualChange >= 0 ? '+' : ''}${(actualChange).toFixed(2)}`);
        }
      });
    }

    // Handle empire relations changes
    if (expandedEffects.empireRelations) {
      Object.entries(expandedEffects.empireRelations).forEach(([fromEmpireId, targets]) => {
        Object.entries(targets).forEach(([toEmpireId, change]) => {
          if (state.diplomacy?.relations?.[fromEmpireId]?.[toEmpireId] !== undefined) {
            const rawChange = typeof change === 'function' ? change() : change;
            const oldValue = state.diplomacy.relations[fromEmpireId][toEmpireId];
            const actualChange = scaleEventRelationDelta(rawChange, oldValue);
            if (!Number.isFinite(actualChange) || actualChange === 0) {
              return;
            }
            state.diplomacy.relations[fromEmpireId][toEmpireId] = clampStat(oldValue + actualChange, -100, 100);

            const fromEmpire = state.empires.find(e => e.id === fromEmpireId);
            const toEmpire = state.empires.find(e => e.id === toEmpireId);
            if (fromEmpire && toEmpire) {
              log.push(`${fromEmpire.name} relations with ${toEmpire.name}: ${actualChange >= 0 ? '+' : ''}${(actualChange).toFixed(2)}`);
            }
          }
        });
      });
    }

    // Handle coalition economy changes
    if (expandedEffects.coalitionEconomy) {
      Object.entries(expandedEffects.coalitionEconomy).forEach(([key, change]) => {
        if (state.coalitionEconomy && state.coalitionEconomy[key] !== undefined) {
          const actualChange = typeof change === 'function' ? change() : change;
          const reducedChange = actualChange * 0.5;  // Reduce all economy changes by 50%
          state.coalitionEconomy[key] = Math.max(0, state.coalitionEconomy[key] + reducedChange);
          log.push(`Coalition ${key}: ${reducedChange >= 0 ? '+' : ''}${reducedChange.toFixed(2)}`);
        }
      });
    }

    // Handle timed coalition modifiers
    if (expandedEffects.timedModifiers) {
      Object.entries(expandedEffects.timedModifiers).forEach(([modifierKey, config]) => {
        if (config.value !== undefined && config.duration !== undefined) {
          // Apply the modifier immediately
          if (state.coalitionModifiers[modifierKey] !== undefined) {
            const oldValue = state.coalitionModifiers[modifierKey];
            state.coalitionModifiers[modifierKey] += config.value;

            // Store the timed modifier for reversal
            if (!state.timedModifiers) state.timedModifiers = [];
            state.timedModifiers.push({
              key: modifierKey,
              value: config.value,
              expiresAt: state.turn + config.duration
            });

            log.push(`Coalition ${modifierKey}: ${config.value >= 0 ? '+' : ''}${(config.value).toFixed(2)} for ${config.duration} turns`);
          }
        }
      });
    }

    // Keep Intel and prediction confidence synchronized when either event effect is used.
    let confidenceBoost = 0;
    let intelBoost = 0;

    if (expandedEffects.scourgePredictionConfidence !== undefined) {
      confidenceBoost = typeof expandedEffects.scourgePredictionConfidence === 'function'
        ? expandedEffects.scourgePredictionConfidence()
        : expandedEffects.scourgePredictionConfidence;
    }

    if (expandedEffects.coalitionIntel !== undefined) {
      intelBoost = typeof expandedEffects.coalitionIntel === 'function'
        ? expandedEffects.coalitionIntel()
        : expandedEffects.coalitionIntel;
    }

    if (confidenceBoost !== 0 || intelBoost !== 0) {
      applyLinkedIntelAndPrediction(state, confidenceBoost, intelBoost, log);
    }
  }
  
  state.activeEvent = null;
  
  // Log event choice effects at info level
  log.forEach(entry => logger.info(entry));
  
  return { success: true, log };
}
