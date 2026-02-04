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

export function runHeroPassives(state, lawProcess, lawDef, cadence, log) {
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

    const { phase: passivePhase, cadence: passiveCadence } = getPassiveTrigger(passive, definition);
    if (passivePhase !== lawProcess.phase) return;
    if (passiveCadence !== cadence) return;

    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const popularityScalar = getPopularityScalar(hero);
    if (runHeroPassiveHook(definition, hero, empire, state, lawProcess, lawDef, null, popularityScalar, cadence, passivePhase, log, logger)) {
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
        popularityScalar,
        log,
        logger
      });
    });
  });
}

export function runHeroBattlePassives(state, battleContext, cadence, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();
  const activeEmpireIds = battleContext?.participatingEmpireIds || [];

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    if (activeEmpireIds.length > 0 && !activeEmpireIds.includes(getHeroEmpireId(hero))) return;
    ensureHeroMeters(hero);
    const passive = hero.passive || {};
    if (!passive.passive_id) return;

    const definition = HERO_PASSIVES[passive.passive_id];
    if (!definition) return;

    const { phase: passivePhase, cadence: passiveCadence } = getPassiveTrigger(passive, definition);
    if (passivePhase !== battleContext?.phase) return;
    if (passiveCadence !== cadence) return;

    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const popularityScalar = getPopularityScalar(hero);
    if (runHeroPassiveHook(definition, hero, empire, state, null, null, battleContext, popularityScalar, cadence, passivePhase, log, logger)) {
      return;
    }

    const effects = definition.effects || [];
    effects.forEach(effect => {
      applyHeroPassiveEffect(effect, {
        hero,
        empire,
        state,
        battleContext,
        popularityScalar,
        log,
        logger
      });
    });
  });
}

function getPassiveTrigger(passive, definition) {
  return {
    phase: passive.phase || definition.phase,
    cadence: passive.cadence || definition.cadence
  };
}

function buildPassiveScope(hero, empire, state, lawProcess, lawDef, battleContext, popularityScalar, cadence, phase) {
  return {
    hero,
    empire,
    state,
    law_process: lawProcess,
    law: lawDef,
    battle: battleContext,
    popularity_scalar: popularityScalar,
    cadence,
    phase,
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
  cadence,
  phase,
  log,
  logger
) {
  const moduleId = HERO_PASSIVE_MODULE_IDS[definition?.id];
  if (!moduleId) return false;

  const moduleDoc = HERO_MODULE_REGISTRY.modules?.[moduleId];
  if (!moduleDoc?.hooks?.on_trigger?.logic) return false;

  const scope = buildPassiveScope(hero, empire, state, lawProcess, lawDef, battleContext, popularityScalar, cadence, phase);
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
