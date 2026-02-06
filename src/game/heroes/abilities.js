import { clamp } from '../cohesion.js';
import {
  HERO_ABILITIES,
  HERO_ABILITY_MODULE_IDS,
  HERO_MODULE_INTERPRETER,
  HERO_MODULE_REGISTRY
} from '../heroDefinitions.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_CONSTANTS, HERO_STATUS } from './constants.js';
import { formatMessage } from './helpers.js';
import { ensureHeroMeters, getHeroEmpireId, getPopularityScalar } from './utils.js';

export function triggerHeroAbilities(state, lawProcess, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    ensureHeroMeters(hero);
    const abilityDef = HERO_ABILITIES[hero.ability_id];
    if (!abilityDef) return;
    if ((hero.cooldowns?.ability || 0) > 0) return;
    const chargeRequired = abilityDef.chargeRequired ?? HERO_CONSTANTS.ABILITY_DEFAULT_CHARGE;
    if ((hero.charge || 0) < chargeRequired) return;

    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const siphonBank = hero.siphon_bank || 0;
    if (siphonBank > 0 && (empire.budget_credits || 0) < siphonBank) {
      return;
    }

    const popularityScalar = getPopularityScalar(hero);
    if (runHeroAbilityHook(abilityDef, hero, empire, state, lawProcess, popularityScalar, log, logger)) {
      // handled by hook
    } else if (typeof abilityDef.trigger === 'function') {
      abilityDef.trigger({ hero, empire, state, lawProcess, popularityScalar, log });
    }
    hero.charge = 0;
    hero.cooldowns = hero.cooldowns || {};
    hero.cooldowns.ability = abilityDef.cooldown ?? 10;
    hero.last_trigger_turn = state.turn;
    if (siphonBank > 0) {
      empire.budget_credits = Math.max(0, (empire.budget_credits || 0) - siphonBank);
      hero.siphon_bank = 0;
      const message = `Hero Ability siphon: ${hero.name} spent ${Math.round(siphonBank)} credits from ${empire.name}.`;
      log.push(message);
      logger.info(message);
    }
  });
}

export function tickHeroCooldowns(state) {
  if (!state.heroes || state.heroes.length === 0) return;
  state.heroes.forEach(hero => {
    if (!hero.cooldowns) return;
    if (hero.cooldowns.ability > 0) {
      hero.cooldowns.ability -= 1;
    }
  });
}

function buildAbilityScope(hero, empire, state, lawProcess, popularityScalar) {
  return {
    hero,
    empire,
    state,
    law_process: lawProcess,
    popularity_scalar: popularityScalar,
    hero_tags: hero?.tags || [],
    empire_tags: empire?.tags || []
  };
}

function runHeroAbilityHook(abilityDef, hero, empire, state, lawProcess, popularityScalar, log, logger) {
  const moduleId = HERO_ABILITY_MODULE_IDS[abilityDef?.id];
  if (!moduleId) return false;

  const moduleDoc = HERO_MODULE_REGISTRY.modules?.[moduleId];
  if (!moduleDoc?.hooks?.on_trigger?.logic) return false;

  const scope = buildAbilityScope(hero, empire, state, lawProcess, popularityScalar);
  const context = { scope, vars: {} };

  const result = HERO_MODULE_INTERPRETER.executeHook(moduleId, 'on_trigger', context);
  if (!result?.actions || result.actions.length === 0) return true;

  result.actions.forEach(action => {
    applyHeroAbilityAction(action, {
      hero,
      empire,
      state,
      lawProcess,
      popularityScalar,
      log,
      logger
    });
  });

  return true;
}

function applyHeroAbilityAction(action, context) {
  if (!action || typeof action !== 'object') return;
  const { type, args = {} } = action;

  const {
    hero,
    empire,
    state,
    lawProcess,
    log,
    logger
  } = context;

  const amount = Number(args.amount ?? args.value ?? 0);
  const logValues = {
    hero: hero?.name,
    empire: empire?.name,
    value: Number.isFinite(amount) ? Math.round(amount) : 0,
    amount: Number.isFinite(amount) ? amount : 0
  };

  switch (type) {
    case 'adjust_hero_meter': {
      if (!hero?.meters) return;
      const meter = args.meter;
      if (!meter || !Number.isFinite(amount) || amount === 0) return;
      if (!['heat', 'grievance', 'popularity'].includes(meter)) return;
      const current = Number(hero.meters[meter] || 0);
      hero.meters[meter] = clamp(current + amount, 0, 100);
      const message = formatMessage(args.log_message, logValues);
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'add_law_meter': {
      if (!lawProcess?.meters) return;
      const meter = args.meter;
      if (!meter || !Number.isFinite(amount) || amount === 0) return;
      if (!['momentum', 'reject_pressure', 'unrest', 'polarization', 'legitimacy'].includes(meter)) return;
      const before = Number(lawProcess.meters[meter] || 0);
      lawProcess.meters[meter] = clamp(before + amount, 0, 1);
      const message = formatMessage(args.log_message, {
        ...logValues,
        meter,
        before: before.toFixed(3),
        after: Number(lawProcess.meters[meter]).toFixed(3)
      });
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'add_law_progress': {
      if (!lawProcess) return;
      if (!Number.isFinite(amount) || amount === 0) return;
      const before = lawProcess.phaseProgress || 0;
      lawProcess.phaseProgress = clamp(before + amount, 0, 2.0);
      const message = formatMessage(args.log_message, {
        ...logValues,
        before: Number.isFinite(before) ? before.toFixed(2) : '0.00',
        after: Number.isFinite(lawProcess.phaseProgress) ? lawProcess.phaseProgress.toFixed(2) : '0.00'
      });
      if (message) {
        log.push(message);
        logger.info(message);
      }
      return;
    }
    case 'grant_requisition': {
      if (!state) return;
      if (!Number.isFinite(amount) || amount === 0) return;
      state.coalitionEconomy = state.coalitionEconomy || {};
      state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + Math.round(amount);
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
