import { clamp } from '../cohesion.js';
import {
  HERO_PASSIVES,
  HERO_PASSIVE_MODULE_IDS,
  HERO_MODULE_INTERPRETER,
  HERO_MODULE_REGISTRY
} from '../heroDefinitions.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_STATUS } from './constants.js';
import { formatMessage } from './helpers.js';
import { ensureHeroMeters, getHeroEmpireId, getPopularityScalar } from './utils.js';

const LAW_PHASES = new Set(['DEBATE', 'FALLOUT', 'VOTING']);

/**
 * Generic passive dispatcher. New passive behavior should be wired through this function.
 * @param {Object} state - Game state
 * @param {string} triggerType - Passive trigger type
 * @param {Object} payload - Trigger payload
 * @param {Array} log - Output log array
 */
export function triggerHeroPassives(state, triggerType, payload = {}, log = []) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    ensureHeroMeters(hero);

    const passive = hero.passive || {};
    if (!passive.passive_id) return;

    const definition = HERO_PASSIVES[passive.passive_id];
    if (!definition) return;

    const trigger = resolvePassiveTrigger(passive, definition);
    if (!shouldTriggerPassive(trigger, triggerType, payload, getHeroEmpireId(hero))) return;

    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const popularityScalar = getPopularityScalar(hero);
    const lawProcess = payload.lawProcess || payload.law_process || null;
    const lawDef = payload.lawDef || payload.law || null;
    const battleContext = payload.battleContext || payload.battle || null;

    if (runHeroPassiveHook(
      definition,
      hero,
      empire,
      state,
      lawProcess,
      lawDef,
      battleContext,
      popularityScalar,
      triggerType,
      trigger,
      payload,
      log,
      logger
    )) {
      return;
    }

    const effects = definition.effects || [];
    effects.forEach(effect => {
      applyHeroPassiveEffect(effect, {
        hero,
        empire,
        state,
        lawProcess,
        lawDef,
        battleContext,
        popularityScalar,
        log,
        logger
      });
    });
  });
}

/**
 * Legacy wrapper retained for compatibility with existing callers.
 */
export function runHeroPassives(state, lawProcess, lawDef, cadence, log) {
  if (!lawProcess) return;
  if (cadence === 'OnStart') {
    triggerHeroPassives(state, 'LAW_PHASE_STARTED', {
      phase: lawProcess.phase,
      lawProcess,
      lawDef
    }, log);
    return;
  }
  if (cadence === 'OnTick') {
    triggerHeroPassives(state, 'LAW_TICK', {
      phase: lawProcess.phase,
      lawProcess,
      lawDef
    }, log);
  }
}

/**
 * Legacy wrapper retained for compatibility with existing callers.
 */
export function runHeroBattlePassives(state, battleContext, cadence, log) {
  if (cadence !== 'OnStart') return;
  triggerHeroPassives(state, 'BATTLE_STARTED', {
    ...battleContext,
    battleContext
  }, log);
}

function resolvePassiveTrigger(passive, definition) {
  const baseTrigger = (definition && typeof definition.trigger === 'object')
    ? { ...definition.trigger }
    : null;
  const overrideTrigger = (passive && typeof passive.trigger === 'object')
    ? { ...passive.trigger }
    : null;

  if (baseTrigger || overrideTrigger) {
    return {
      ...(baseTrigger || {}),
      ...(overrideTrigger || {})
    };
  }

  const phase = passive.phase || definition.phase;
  const cadence = passive.cadence || definition.cadence;

  if (phase === 'BATTLE' && cadence === 'OnStart') {
    return {
      type: 'BATTLE_STARTED',
      battle_type: 'SCOURGE'
    };
  }
  if (cadence === 'OnStart' && LAW_PHASES.has(phase)) {
    return {
      type: 'LAW_PHASE_STARTED',
      phase
    };
  }
  if (cadence === 'OnTick' && LAW_PHASES.has(phase)) {
    return {
      type: 'LAW_TICK',
      phase
    };
  }

  return { type: null };
}

function shouldTriggerPassive(trigger, triggerType, payload, heroEmpireId) {
  if (!trigger?.type || trigger.type !== triggerType) return false;

  switch (triggerType) {
    case 'LAW_PHASE_STARTED':
    case 'LAW_TICK':
      if (trigger.phase && payload.phase !== trigger.phase) return false;
      return true;
    case 'BATTLE_STARTED':
      if (trigger.battle_type && payload.type && trigger.battle_type !== payload.type) return false;
      if (Array.isArray(payload.participatingEmpireIds) && payload.participatingEmpireIds.length > 0) {
        return payload.participatingEmpireIds.includes(heroEmpireId);
      }
      return true;
    case 'TECH_UNLOCKED':
    case 'IMPROVEMENT_STARTED':
    case 'IMPROVEMENT_COMPLETED': {
      const requireEmpireMatch = trigger.require_empire_match !== false;
      if (!requireEmpireMatch) return true;
      return !payload.empireId || payload.empireId === heroEmpireId;
    }
    case 'LAW_PROCESS_STARTED':
    case 'LAW_ENACTED':
      return true;
    default:
      return true;
  }
}

function buildPassiveScope(
  hero,
  empire,
  state,
  lawProcess,
  lawDef,
  battleContext,
  popularityScalar,
  triggerType,
  trigger,
  payload
) {
  return {
    hero,
    empire,
    state,
    law_process: lawProcess,
    law: lawDef,
    battle: battleContext,
    trigger_type: triggerType,
    trigger_payload: payload,
    trigger,
    popularity_scalar: popularityScalar,
    phase: payload?.phase || trigger?.phase || lawProcess?.phase || null,
    hero_tags: hero?.tags || [],
    empire_tags: empire?.tags || [],
    law_tags: lawDef?.tags || lawDef?.law_tags || []
  };
}

function runHeroPassiveHook(
  definition,
  hero,
  empire,
  state,
  lawProcess,
  lawDef,
  battleContext,
  popularityScalar,
  triggerType,
  trigger,
  payload,
  log,
  logger
) {
  const moduleId = HERO_PASSIVE_MODULE_IDS[definition?.id];
  if (!moduleId) return false;

  const moduleDoc = HERO_MODULE_REGISTRY.modules?.[moduleId];
  if (!moduleDoc?.hooks?.on_trigger?.logic) return false;

  const scope = buildPassiveScope(
    hero,
    empire,
    state,
    lawProcess,
    lawDef,
    battleContext,
    popularityScalar,
    triggerType,
    trigger,
    payload
  );
  const context = { scope, vars: {} };

  const result = HERO_MODULE_INTERPRETER.executeHook(moduleId, 'on_trigger', context);
  if (!result?.actions || result.actions.length === 0) return true;

  result.actions.forEach(action => {
    applyHeroPassiveAction(action, {
      hero,
      empire,
      state,
      lawProcess,
      lawDef,
      battleContext,
      popularityScalar,
      log,
      logger
    });
  });

  return true;
}

function applyHeroPassiveAction(action, context) {
  if (!action || typeof action !== 'object') return;
  const { type, args = {} } = action;

  const {
    hero,
    empire,
    state,
    lawProcess,
    battleContext,
    log,
    logger
  } = context;

  const amount = Number(args.amount ?? args.value ?? 0);
  const percentValue = Number.isFinite(args.percent)
    ? Number(args.percent)
    : (Number.isFinite(amount) ? amount * 100 : 0);
  const logValues = {
    hero: hero?.name,
    empire: empire?.name,
    value: Number.isFinite(amount) ? Math.round(amount) : 0,
    amount: Number.isFinite(amount) ? amount : 0,
    percent: Number.isFinite(percentValue) ? percentValue.toFixed(1) : '0.0'
  };

  switch (type) {
    case 'grant_credits': {
      if (!empire || !Number.isFinite(amount) || amount === 0) return;
      const grant = Math.round(amount);
      if (grant === 0) return;
      empire.budget_credits = (empire.budget_credits || 0) + grant;
      const message = formatMessage(args.log_message, logValues);
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'add_law_momentum': {
      if (!lawProcess?.meters || !Number.isFinite(amount) || amount === 0) return;
      lawProcess.meters.momentum = clamp((lawProcess.meters.momentum || 0) + amount, 0, 1);
      const message = formatMessage(args.log_message, logValues);
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'add_law_legitimacy': {
      if (!lawProcess?.meters || !Number.isFinite(amount) || amount === 0) return;
      lawProcess.meters.legitimacy = clamp((lawProcess.meters.legitimacy || 0) + amount, 0, 1);
      const message = formatMessage(args.log_message, logValues);
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'add_scourge_manpower_damage_pct': {
      if (!state || !Number.isFinite(amount) || amount === 0) return;
      if (battleContext?.type !== 'SCOURGE') return;
      const previous = state.scourgeNextAttackManpowerDamagePct || 0;
      state.scourgeNextAttackManpowerDamagePct = clamp(previous + amount, 0, 1);
      const message = formatMessage(args.log_message, logValues);
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    default:
      return;
  }
}

function applyHeroPassiveEffect(effect, context) {
  if (!effect || typeof effect !== 'object') return;

  const {
    hero,
    empire,
    state,
    lawProcess,
    lawDef,
    battleContext,
    popularityScalar,
    log,
    logger
  } = context;
  const scaleByPopularity = effect.scale_by_popularity ? popularityScalar : 1;

  switch (effect.type) {
    case 'grant_credits': {
      const baseGrant = Number(effect.amount || 0);
      if (!Number.isFinite(baseGrant) || baseGrant === 0) return;
      const grant = Math.round(baseGrant * scaleByPopularity);
      if (!Number.isFinite(grant) || grant === 0) return;
      empire.budget_credits = (empire.budget_credits || 0) + grant;
      const message = formatMessage(effect.log_message, {
        hero: hero.name,
        empire: empire.name,
        value: grant
      });
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'momentum_bonus_if_tag_match': {
      const lawTags = lawDef?.tags || lawDef?.law_tags || [];
      const heroTags = hero.tags || [];
      if (effect.requires_tag_match && !lawTags.some(tag => heroTags.includes(tag))) return;
      const baseBonus = Number(effect.base_bonus || 0);
      if (!Number.isFinite(baseBonus) || baseBonus === 0) return;
      const bonus = baseBonus * scaleByPopularity;
      if (!lawProcess?.meters || !Number.isFinite(bonus) || bonus === 0) return;
      lawProcess.meters.momentum = Math.min(1, lawProcess.meters.momentum + bonus);
      const message = formatMessage(effect.log_message, {
        hero: hero.name,
        percent: (bonus * 100).toFixed(1)
      });
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'legitimacy_bonus': {
      const baseBonus = Number(effect.base_bonus || 0);
      if (!Number.isFinite(baseBonus) || baseBonus === 0) return;
      const bonus = baseBonus * scaleByPopularity;
      if (!lawProcess?.meters || !Number.isFinite(bonus) || bonus === 0) return;
      lawProcess.meters.legitimacy = Math.min(1, lawProcess.meters.legitimacy + bonus);
      const message = formatMessage(effect.log_message, {
        hero: hero.name,
        percent: (bonus * 100).toFixed(1)
      });
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'scourge_manpower_damage_pct': {
      if (!state) return;
      if (battleContext?.type !== 'SCOURGE') return;
      const basePct = Number(effect.base_pct || 0);
      if (!Number.isFinite(basePct) || basePct === 0) return;
      const pct = Math.max(0, basePct * scaleByPopularity);
      if (!Number.isFinite(pct) || pct === 0) return;
      const previous = state.scourgeNextAttackManpowerDamagePct || 0;
      state.scourgeNextAttackManpowerDamagePct = Math.min(1, previous + pct);
      const message = formatMessage(effect.log_message, {
        hero: hero.name,
        percent: (pct * 100).toFixed(1)
      });
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    default:
      return;
  }
}
