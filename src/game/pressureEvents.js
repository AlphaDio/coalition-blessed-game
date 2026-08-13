import { loadResources } from './economyTick/resources.js';
import { getPressureConfig } from './economyTick/backlog.js';
import { resolveEventVariables, interpolateText } from './selectors.js';

export const PRESSURE_EVENT_IDS = Object.freeze([
  'pressure_rationing',
  'pressure_emergency_procurement',
  'pressure_public_discontent',
  'pressure_institutional_breakdown',
  'pressure_desperate_measures'
]);

// These are cumulative pressure thresholds. Pressure is intentionally retained
// after an event is created, so a crisis can continue escalating while the
// player resolves the event.
export const DEFAULT_PRESSURE_EVENT_THRESHOLDS = Object.freeze([25, 100, 250, 500, 1000]);

function positiveNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
}

function normalizeThresholds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_PRESSURE_EVENT_THRESHOLDS];
  const thresholds = value
    .map(Number)
    .filter(threshold => Number.isFinite(threshold) && threshold > 0)
    .sort((a, b) => a - b);
  return thresholds.length > 0 ? thresholds : [...DEFAULT_PRESSURE_EVENT_THRESHOLDS];
}

function getThresholds(state, pressureType) {
  const configured = state.pressureEventConfig?.thresholdsByPressureType?.[pressureType] ||
    state.economyPressure?.thresholds_by_type?.[pressureType] ||
    state.pressureEventConfig?.thresholds;
  return normalizeThresholds(configured);
}

function thresholdForTier(tier, thresholds) {
  if (tier < thresholds.length) return thresholds[tier];
  const last = thresholds[thresholds.length - 1];
  return last * Math.pow(2, tier - thresholds.length + 1);
}

function ensurePressureEventState(state) {
  if (!state.economyPressure || typeof state.economyPressure !== 'object') {
    state.economyPressure = {};
  }
  if (!state.economyPressure.by_type || typeof state.economyPressure.by_type !== 'object') {
    state.economyPressure.by_type = {};
  }
  if (!Array.isArray(state.economyPressure.last_expired)) state.economyPressure.last_expired = [];
  if (!Array.isArray(state.economyPressure.history)) state.economyPressure.history = [];
  if (!state.economyPressure.escalation_by_type || typeof state.economyPressure.escalation_by_type !== 'object') {
    state.economyPressure.escalation_by_type = {};
  }
  state.pressure = state.economyPressure;
  return state.economyPressure;
}

export function ensureGameplayEventQueue(state) {
  if (Array.isArray(state.gameplayEventQueue)) {
    state.eventQueue = state.gameplayEventQueue;
    return state.gameplayEventQueue;
  }
  if (Array.isArray(state.eventQueue)) {
    state.gameplayEventQueue = state.eventQueue;
    return state.gameplayEventQueue;
  }
  state.gameplayEventQueue = [];
  state.eventQueue = state.gameplayEventQueue;
  return state.gameplayEventQueue;
}

export function enqueueGameplayEvent(state, event) {
  if (!event || !event.id) return false;
  ensureGameplayEventQueue(state).push(event);
  return true;
}

export function popNextGameplayEvent(state) {
  if (state.activeEvent) return null;
  return ensureGameplayEventQueue(state).shift() || null;
}

function getResourceDefinition(resource) {
  return (loadResources().commodities || []).find(candidate => candidate.key === resource) || null;
}

function sourceDetails(source) {
  if (source && typeof source === 'object') {
    return {
      id: source.id || null,
      type: source.type || null,
      label: source.name || source.label || source.id || source.type || 'unknown demand'
    };
  }
  return {
    id: null,
    type: null,
    label: source || 'unknown demand'
  };
}

function matchesEligibility(rule, value) {
  if (rule === undefined || rule === null || rule === 'all') return true;
  if (Array.isArray(rule)) return rule.includes(value);
  return rule === value;
}

function isEligible(event, context) {
  const eligibility = event.pressure_eligibility || event.pressureEligibility || {};
  return matchesEligibility(eligibility.pool, 'shared') &&
    matchesEligibility(eligibility.tiers || eligibility.pressure_tiers, context.tier) &&
    matchesEligibility(
      eligibility.persistence_policies || eligibility.persistencePolicies,
      context.persistence_policy
    ) &&
    matchesEligibility(eligibility.pressure_types || eligibility.pressureTypes, context.pressure_type) &&
    matchesEligibility(eligibility.resource_types || eligibility.resourceTypes, context.resource_type) &&
    matchesEligibility(eligibility.resources, context.resource);
}

function pressureEventDefinitions(state) {
  return (state.events || []).filter(event =>
    event && (event.scope === 'PRESSURE' || event.pressure_event === true || event.pressureEvent === true)
  );
}

function selectPressureEvent(state, context, escalation, globallyLastEventId = null) {
  const candidates = pressureEventDefinitions(state).filter(event => isEligible(event, context));
  if (candidates.length === 0) return null;

  const recent = Array.isArray(escalation.recent_event_ids) ? escalation.recent_event_ids : [];
  const nonRecent = candidates.filter(event =>
    !recent.includes(event.id) && event.id !== globallyLastEventId
  );
  const withoutGlobalRepeat = candidates.filter(event => event.id !== globallyLastEventId);
  const pool = nonRecent.length > 0
    ? nonRecent
    : (withoutGlobalRepeat.length > 0 ? withoutGlobalRepeat : candidates);
  const cursor = Number.isFinite(Number(escalation.selection_cursor))
    ? Math.max(0, Math.floor(Number(escalation.selection_cursor)))
    : 0;
  const event = pool[cursor % pool.length];
  escalation.selection_cursor = cursor + 1;
  return event;
}

function materializePressureEvent(definition, context, state) {
  const selectorContext = definition.variables
    ? resolveEventVariables(definition.variables, state)
    : {};
  const resolvedContext = { ...selectorContext, ...context };
  const interpolate = value => typeof value === 'string'
    ? interpolateText(value, resolvedContext, state)
    : value;

  return {
    ...definition,
    title: interpolate(definition.title),
    text: interpolate(definition.text),
    description: interpolate(definition.description),
    ai_narration: interpolate(definition.ai_narration),
    pressure_context: context,
    event_context: context,
    _resolvedContext: resolvedContext,
    choices: (definition.choices || []).map(choice => ({
      ...choice,
      text: interpolate(choice.text),
      ...(choice.description ? { description: interpolate(choice.description) } : {}),
      ...(choice.effects_summary ? { effects_summary: interpolate(choice.effects_summary) } : {})
    }))
  };
}

function buildPressureContext(state, pressureType, tier, records, accumulatedPressure) {
  const resource = records[records.length - 1]?.resource || null;
  const resourceDefinition = getResourceDefinition(resource);
  const source = records[records.length - 1]?.source || null;
  const sourceInfo = sourceDetails(source);
  const expiredQuantity = records.reduce(
    (sum, record) => sum + positiveNumber(record.quantity),
    0
  );
  const persistencePolicy = records.find(record => record.persistence_policy)?.persistence_policy ||
    resourceDefinition?.persistence_policy || null;

  return {
    resource,
    resource_name: resourceDefinition?.name || resource,
    resource_type: resourceDefinition?.type || resourceDefinition?.tier || records[records.length - 1]?.resource_type || null,
    pressure_type: pressureType,
    pressure: pressureType,
    accumulated_pressure: accumulatedPressure,
    expired_quantity: expiredQuantity,
    source,
    source_id: sourceInfo.id,
    source_type: sourceInfo.type,
    source_label: sourceInfo.label,
    persistence_policy: persistencePolicy,
    tier
  };
}

/**
 * Convert newly accumulated pressure into queued, normal Gameplay Events.
 * This function has no gameplay effects: effects are applied only by
 * handleEventChoice after the queued event becomes active.
 */
export function triggerPressureGameplayEvents(state, expiredPressureEvents = null) {
  const pressure = ensurePressureEventState(state);
  const records = Array.isArray(expiredPressureEvents)
    ? expiredPressureEvents
    : pressure.last_expired;
  const createdEvents = [];
  const thresholdsCrossed = [];
  const allTypes = new Set([
    ...Object.keys(pressure.by_type || {}),
    ...records.map(record => record?.pressure).filter(Boolean)
  ]);

  for (const pressureType of allTypes) {
    const accumulatedPressure = positiveNumber(pressure.by_type[pressureType]);
    if (accumulatedPressure <= 0) continue;

    const thresholds = getThresholds(state, pressureType);
    const saved = pressure.escalation_by_type[pressureType] || {};
    const escalation = pressure.escalation_by_type[pressureType] = {
      tier: Math.max(0, Math.floor(positiveNumber(saved.tier))),
      next_threshold: positiveNumber(saved.next_threshold),
      thresholds,
      last_event_id: saved.last_event_id || null,
      recent_event_ids: Array.isArray(saved.recent_event_ids) ? [...saved.recent_event_ids] : [],
      selection_cursor: positiveNumber(saved.selection_cursor)
    };
    if (escalation.next_threshold <= 0) {
      escalation.next_threshold = thresholdForTier(escalation.tier, thresholds);
    }

    const currentRecords = records.filter(record => record?.pressure === pressureType);
    const contextRecords = currentRecords.length > 0
      ? currentRecords
      : pressure.history.filter(record => record?.pressure === pressureType).slice(-1);

    while (accumulatedPressure >= escalation.next_threshold) {
      const nextTier = escalation.tier + 1;
      const context = buildPressureContext(
        state,
        pressureType,
        nextTier,
        contextRecords,
        accumulatedPressure
      );
      const definition = selectPressureEvent(
        state,
        context,
        escalation,
        pressure.last_pressure_event_id
      );
      if (!definition) break;

      const event = materializePressureEvent(definition, context, state);
      enqueueGameplayEvent(state, event);
      createdEvents.push(event);
      thresholdsCrossed.push({ pressure_type: pressureType, tier: nextTier, threshold: escalation.next_threshold });

      escalation.tier = nextTier;
      escalation.next_threshold = thresholdForTier(nextTier, thresholds);
      escalation.last_event_id = event.id;
      escalation.recent_event_ids = [...escalation.recent_event_ids.filter(id => id !== event.id), event.id].slice(-3);
      pressure.last_pressure_event_id = event.id;
    }
  }

  return { createdEvents, thresholdsCrossed };
}
