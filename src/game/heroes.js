/**
 * Hero system v0.3 - meters, passives, abilities, and law integration.
 */

import { clamp } from './cohesion.js';
import {
  HERO_ABILITIES,
  HERO_PASSIVES,
  HERO_ABILITY_MODULE_IDS,
  HERO_PASSIVE_MODULE_IDS,
  HERO_MODULE_INTERPRETER,
  HERO_MODULE_REGISTRY
} from './heroDefinitions.js';
import { createHero } from './types.js';
import { getLogger } from '../modules/logger.js';

const HERO_STATUS = {
  ACTIVE: 'ACTIVE',
  SIDELINED: 'SIDELINED',
  DISGRACED: 'DISGRACED',
  EXILED: 'EXILED'
};

const HERO_CONSTANTS = {
  HEAT_BASE: 2.0,
  GRIEVANCE_BASE: 1.2,
  // Unrest now acts as a magnifier (0..1) rather than a threshold gate.
  HEAT_DECAY_GOOD: 0.6,
  HEAT_DECAY_BAD: 0.2,
  GRIEVANCE_DECAY: 0.08,
  GRIEVANCE_BAKE_THRESHOLD: 60,
  GRIEVANCE_BAKE_RATE: 0.015,
  GRIEVANCE_BAKE_RELEASE: 0.35,
  POPULARITY_RISE_GOOD: 0.5,
  POPULARITY_FALL_BAD: 0.6,
  POPULARITY_CAP_FACTOR: 0.5,
  CHARGE_PER_CREDIT: 0.2, // 0.02 -> 0.2
  ABILITY_MIN_CHARGE: 100,
  STATUS_CHARGE_MULTIPLIER: {
    ACTIVE: 1,
    SIDELINED: 0.6,
    DISGRACED: 0.3,
    EXILED: 0
  },
  AGGRAVATION_HEAT_DRIFT: 0.08,
  AGGRAVATION_GRIEVANCE_DRIFT: 0.12,
  LAW_HEAT_NEUTRAL: 20,
  LAW_GRIEVANCE_NEUTRAL: 15,
  LAW_UNREST_FROM_HEAT: 0.004,
  LAW_REJECT_FROM_GRIEVANCE: 0.003
};

export const HERO_RECRUIT_DELAY_RANGE = { min: 5, max: 25 };
export const HERO_RECRUIT_CHOICE_COUNT = 2;

function getLawValues(lawDef) {
  return lawDef.axis_vector || lawDef.values || {};
}

function getHeroEmpireId(hero) {
  return hero.empireId || null;
}

function ensureHeroMeters(hero) {
  if (!hero.meters) {
    hero.meters = { heat: 0, grievance: 0, popularity: 50 };
    return;
  }
  if (!Number.isFinite(hero.meters.heat)) hero.meters.heat = 0;
  if (!Number.isFinite(hero.meters.grievance)) hero.meters.grievance = 0;
  if (!Number.isFinite(hero.meters.popularity)) hero.meters.popularity = 50;
}

export function computeAlignmentScore(valuesA = {}, valuesB = {}) {
  const axes = new Set([...Object.keys(valuesA || {}), ...Object.keys(valuesB || {})]);
  if (axes.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  axes.forEach(axis => {
    const a = Number.isFinite(valuesA[axis]) ? valuesA[axis] : 0;
    const b = Number.isFinite(valuesB[axis]) ? valuesB[axis] : 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  });

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 0) return 0;

  // Clamp to [-1, 1] in case of floating point drift.
  return clamp(dot / denom, -1, 1);
}

export function getPopularityCap(hero) {
  ensureHeroMeters(hero);
  const cap = 100 - (hero.meters.grievance * HERO_CONSTANTS.POPULARITY_CAP_FACTOR);
  return clamp(cap, 10, 100);
}

export function getPopularityScalar(hero) {
  ensureHeroMeters(hero);
  const cap = getPopularityCap(hero);
  const effectivePopularity = Math.min(hero.meters.popularity, cap);
  return clamp(0.3 + (effectivePopularity / 100) * 0.7, 0.3, 1.0);
}

export function applyHeroBudgetSiphon(state, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  state.empires.forEach(empire => {
    const heroes = state.heroes.filter(hero => getHeroEmpireId(hero) === empire.id && hero.status !== HERO_STATUS.EXILED);
    if (heroes.length === 0) return;

    const totalShare = heroes.reduce((sum, hero) => sum + (hero.budget_share || 0), 0);
    if (totalShare <= 0) return;

    const budget = Math.max(0, empire.budget_credits || 0);
    const virtualSiphon = budget * Math.min(totalShare, 0.3);
    if (virtualSiphon <= 0) return;

    const empireMods = state.improvements?.empireModifiers?.[empire.id] || {};
    const globalMult = state.coalitionModifiers?.hero_siphon_efficiency_mult || 0;
    const globalAdd = state.coalitionModifiers?.hero_siphon_efficiency_add || 0;
    const empireMult = empireMods.hero_siphon_efficiency_mult || 0;
    const empireAdd = empireMods.hero_siphon_efficiency_add || 0;
    const efficiencyMult = globalMult + empireMult;
    const efficiencyAdd = globalAdd + empireAdd;
    const chargePerCredit = Math.max(
      0,
      (HERO_CONSTANTS.CHARGE_PER_CREDIT * (1 + efficiencyMult)) + efficiencyAdd
    );

    heroes.forEach(hero => {
      const share = totalShare > 0 ? (hero.budget_share || 0) / totalShare : 0;
      const siphoned = virtualSiphon * share;
      const statusMultiplier = HERO_CONSTANTS.STATUS_CHARGE_MULTIPLIER[hero.status] ?? 1;
      const chargeGain = siphoned * chargePerCredit * statusMultiplier;
      const abilityDef = HERO_ABILITIES[hero.ability_id];
      const chargeMax = abilityDef?.chargeRequired ?? HERO_CONSTANTS.ABILITY_MIN_CHARGE;
      hero.charge = clamp((hero.charge || 0) + chargeGain, 0, chargeMax);
      hero.siphon_bank = (hero.siphon_bank || 0) + siphoned;
      const message = `Hero charge: ${hero.name} accumulates +${chargeGain.toFixed(1)} charge (virtual siphon ${Math.round(siphoned)} credits).`;
      log.push(message);
      logger.debug(message);
    });
  });
}

export function applyHeroLawPressure(state, lawProcess, lawDef, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  const lawValues = getLawValues(lawDef);
  const unrest = clamp(lawProcess.meters?.unrest || 0, 0, 1);
  const legitimacy = lawProcess.meters?.legitimacy || 0;
  const unrestPressure = Math.max(0.1, unrest);
  const legitimacyDampener = 1 - (legitimacy * 0.7);

  if (unrestPressure <= 0) return;

  let totalHeatDelta = 0;
  let totalGrievanceDelta = 0;

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    ensureHeroMeters(hero);
    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const heroScore = computeAlignmentScore(lawValues, hero.values);
    const empireScore = computeAlignmentScore(lawValues, empire.values || {});
    const heroOpp = clamp(-heroScore, 0, 1);
    const empireOpp = clamp(-empireScore, 0, 1);

    const heatDelta = HERO_CONSTANTS.HEAT_BASE * empireOpp * unrestPressure * legitimacyDampener;
    const grievanceDelta = HERO_CONSTANTS.GRIEVANCE_BASE * heroOpp * unrestPressure * legitimacyDampener;

    hero.meters.heat = clamp((hero.meters.heat || 0) + heatDelta, 0, 100);
    hero.meters.grievance = clamp((hero.meters.grievance || 0) + grievanceDelta, 0, 100);

    totalHeatDelta += heatDelta;
    totalGrievanceDelta += grievanceDelta;
  });

  if (totalHeatDelta > 0 || totalGrievanceDelta > 0) {
    const message = `Hero pressure: Heat +${totalHeatDelta.toFixed(2)} | Grievance +${totalGrievanceDelta.toFixed(2)}`;
    log.push(message);
    logger.debug(message);
  }
}

export function applyHeroLawTension(state, lawProcess, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!lawProcess || !lawProcess.meters) return;

  const logger = getLogger();
  const activeHeroes = state.heroes.filter(hero => hero.status !== HERO_STATUS.EXILED);
  if (activeHeroes.length === 0) return;

  let totalHeat = 0;
  let totalGrievance = 0;
  activeHeroes.forEach(hero => {
    ensureHeroMeters(hero);
    totalHeat += hero.meters.heat || 0;
    totalGrievance += hero.meters.grievance || 0;
  });

  const avgHeat = totalHeat / activeHeroes.length;
  const avgGrievance = totalGrievance / activeHeroes.length;
  const heatPressure = clamp((avgHeat - HERO_CONSTANTS.LAW_HEAT_NEUTRAL) / 100, -1, 1);
  const grievancePressure = clamp((avgGrievance - HERO_CONSTANTS.LAW_GRIEVANCE_NEUTRAL) / 100, -1, 1);

  const unrestDelta = heatPressure * HERO_CONSTANTS.LAW_UNREST_FROM_HEAT;
  const rejectDelta = grievancePressure * HERO_CONSTANTS.LAW_REJECT_FROM_GRIEVANCE;
  if (unrestDelta === 0 && rejectDelta === 0) return;

  const oldUnrest = lawProcess.meters.unrest || 0;
  const oldReject = lawProcess.meters.reject_pressure || 0;
  lawProcess.meters.unrest = clamp(oldUnrest + unrestDelta, 0, 1);
  lawProcess.meters.reject_pressure = clamp(oldReject + rejectDelta, 0, 1);

  if (Math.abs(unrestDelta) >= 0.001 || Math.abs(rejectDelta) >= 0.001) {
    const message = `Hero sentiment: law unrest ${oldUnrest.toFixed(3)} → ${lawProcess.meters.unrest.toFixed(3)}, ` +
      `reject pressure ${oldReject.toFixed(3)} → ${lawProcess.meters.reject_pressure.toFixed(3)}.`;
    log.push(message);
    logger.debug(message);
  }
}

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

function formatMessage(template, values) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] ?? match;
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
    const chargeRequired = abilityDef.chargeRequired ?? HERO_CONSTANTS.ABILITY_MIN_CHARGE;
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

export function tickHeroMeters(state, log) {
  if (!state.heroes || state.heroes.length === 0) return;

  const goodContext = (state.coalitionCohesion || 0) > 66 && (state.coalitionEconomy?.requisition || 0) > 0;

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    ensureHeroMeters(hero);

    // Heat decay
    const heatDecay = goodContext ? HERO_CONSTANTS.HEAT_DECAY_GOOD : HERO_CONSTANTS.HEAT_DECAY_BAD;
    hero.meters.heat = Math.max(0, hero.meters.heat - heatDecay);

    // Grievance decay (slow)
    hero.meters.grievance = Math.max(0, hero.meters.grievance - HERO_CONSTANTS.GRIEVANCE_DECAY);

    // Grievance bake
    if (hero.meters.heat > HERO_CONSTANTS.GRIEVANCE_BAKE_THRESHOLD) {
      const baked = hero.meters.heat * HERO_CONSTANTS.GRIEVANCE_BAKE_RATE;
      hero.meters.grievance = clamp(hero.meters.grievance + baked, 0, 100);
      hero.meters.heat = clamp(hero.meters.heat - (baked * HERO_CONSTANTS.GRIEVANCE_BAKE_RELEASE), 0, 100);
    }

    // Popularity drift
    const popularityDelta = goodContext ? HERO_CONSTANTS.POPULARITY_RISE_GOOD : -HERO_CONSTANTS.POPULARITY_FALL_BAD;
    hero.meters.popularity = clamp(hero.meters.popularity + popularityDelta, 0, 100);

    // Enforce popularity cap based on grievance
    hero.meters.popularity = Math.min(hero.meters.popularity, getPopularityCap(hero));
  });
}

export function applyHeroSpillover(state, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  state.empires.forEach(empire => {
    const heroes = state.heroes.filter(hero => getHeroEmpireId(hero) === empire.id && hero.status !== HERO_STATUS.EXILED);
    if (heroes.length === 0) return;

    const avgHeat = heroes.reduce((sum, hero) => {
      ensureHeroMeters(hero);
      return sum + (hero.meters.heat || 0);
    }, 0) / heroes.length;
    const avgGrievance = heroes.reduce((sum, hero) => {
      ensureHeroMeters(hero);
      return sum + (hero.meters.grievance || 0);
    }, 0) / heroes.length;

    const aggravationDelta = (avgHeat / 100) * HERO_CONSTANTS.AGGRAVATION_HEAT_DRIFT +
      (avgGrievance / 100) * HERO_CONSTANTS.AGGRAVATION_GRIEVANCE_DRIFT;

    if (aggravationDelta <= 0) return;

    const armies = (state.armies || []).filter(army => army.empireId === empire.id);
    armies.forEach(army => {
      army.aggravation = clamp((army.aggravation || 0) + aggravationDelta, 0, 100);
    });

    const message = `${empire.name} unrest spillover: +${aggravationDelta.toFixed(2)} aggravation to ${armies.length} armies.`;
    log.push(message);
    logger.debug(message);
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

function getNextHeroIndex(state, empireId) {
  const existing = (state.heroes || []).filter(hero => getHeroEmpireId(hero) === empireId);
  return existing.length;
}

function shuffle(array, rng = Math.random) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildHeroCandidates(state, empire, rng = Math.random, count = HERO_RECRUIT_CHOICE_COUNT) {
  const roster = Array.isArray(state.heroRoster) ? state.heroRoster : [];
  const available = roster.filter(def =>
    def.empireId === empire.id &&
    !(state.heroes || []).some(hero => hero.id === def.id)
  );

  const shuffled = shuffle(available, rng);
  return shuffled.slice(0, count).map(def => ({
    ...def
  }));
}

export function createHeroFromCandidate(state, empire, candidate, rng = Math.random) {
  const index = getNextHeroIndex(state, empire.id);
  const jitter = () => (rng() * 0.2) - 0.1;
  const values = {};
  if (candidate.values && Object.keys(candidate.values).length > 0) {
    Object.keys(candidate.values).forEach(axis => {
      values[axis] = clamp(candidate.values[axis], -1, 1);
    });
  } else {
    Object.keys(empire.values || {}).forEach(axis => {
      values[axis] = clamp((empire.values[axis] || 0) + jitter(), -1, 1);
    });
  }

  return createHero(
    candidate.id || `HERO_${empire.id}_${index + 1}`,
    empire.id,
    candidate.name || `${empire.name} Envoy ${index + 1}`,
    {
      tagline: candidate.tagline || '',
      tags: candidate.tags || ['political', 'hero'],
      values,
      status: HERO_STATUS.ACTIVE,
      budget_share: candidate.budget_share ?? 0.1,
      charge: 0,
      ability_id: candidate.ability_id || null,
      passive: {
        phase: candidate.passive?.phase || candidate.passive_phase || 'DEBATE',
        cadence: candidate.passive?.cadence || candidate.passive_cadence || 'OnStart',
        passive_id: candidate.passive?.passive_id || candidate.passive_id || null
      },
      meters: {
        heat: 0,
        grievance: 0,
        popularity: 50
      },
      siphon_bank: 0,
      last_trigger_turn: state.turn ?? -1,
      cooldowns: { ability: 0 },
      modifiers: {}
    }
  );
}

export function buildHeroRecruitmentEvent(state, rng = Math.random) {
  if (!state.empires || state.empires.length === 0) return null;
  if (state.activeEvent) return null;

  if (!state.heroRecruitmentState) {
    state.heroRecruitmentState = {};
  }

  const empiresWithoutHero = state.empires.filter(empire =>
    !(state.heroes || []).some(hero => getHeroEmpireId(hero) === empire.id)
  );
  const missingIds = new Set(empiresWithoutHero.map(empire => empire.id));

  // Update missing counters
  state.empires.forEach(empire => {
    const entry = state.heroRecruitmentState[empire.id];
    if (!missingIds.has(empire.id)) {
      if (entry) delete state.heroRecruitmentState[empire.id];
      return;
    }
    if (!entry) {
      const delayTicks = Math.floor(rng() * (HERO_RECRUIT_DELAY_RANGE.max - HERO_RECRUIT_DELAY_RANGE.min + 1)) +
        HERO_RECRUIT_DELAY_RANGE.min;
      state.heroRecruitmentState[empire.id] = {
        missingTicks: 1,
        delayTicks,
        lastSeenTurn: state.turn ?? 0
      };
    } else {
      entry.missingTicks += 1;
      entry.lastSeenTurn = state.turn ?? entry.lastSeenTurn;
    }
  });

  const eligibleEmpires = empiresWithoutHero.filter(empire => {
    const entry = state.heroRecruitmentState[empire.id];
    return entry && entry.missingTicks >= entry.delayTicks;
  });

  if (eligibleEmpires.length === 0) return null;

  const empire = eligibleEmpires[Math.floor(rng() * eligibleEmpires.length)];
  const candidates = buildHeroCandidates(state, empire, rng, HERO_RECRUIT_CHOICE_COUNT);
  if (candidates.length < HERO_RECRUIT_CHOICE_COUNT) return null;

  return {
    id: `HERO_RECRUIT_${empire.id}_${state.turn ?? 0}`,
    scope: 'HERO_RECRUIT',
    empireId: empire.id,
    title: `Hero Candidates for ${empire.name}`,
    text: `${empire.name} lacks a hero. Choose a candidate to represent their interests.`,
      choices: candidates.map(candidate => ({
        text: `${candidate.name} - ${candidate.tagline}`,
        hero_candidate: candidate
      }))
  };
}

export function handleHeroRecruitmentChoice(state, event, choiceIndex, rng = Math.random) {
  const logger = getLogger();
  const choice = event.choices?.[choiceIndex];
  if (!choice || !choice.hero_candidate) {
    return { error: 'Invalid hero candidate choice' };
  }

  const candidate = choice.hero_candidate;
  const empireId = candidate.empireId || event.empireId || null;
  const empire = state.empires?.find(e => e.id === empireId) || state.empires?.find(e => candidate.name?.startsWith(e.name));
  if (!empire) {
    return { error: 'Empire not found for hero recruitment' };
  }

  const hero = createHeroFromCandidate(state, empire, candidate, rng);
  state.heroes = state.heroes || [];
  state.heroes.push(hero);
  state.activeEvent = null;

  const log = [`Hero recruited: ${hero.name} for ${empire.name}.`];
  logger.info(log[0]);
  return { success: true, log };
}

/**
 * Assign initial heroes to each empire at game start.
 * Picks one random hero from the roster for each empire.
 * @param {Object} state - Game state with empires and heroRoster
 * @param {Function} rng - Random number generator
 * @returns {Array} Log of assigned heroes
 */
export function assignInitialHeroes(state, rng = Math.random) {
  const logger = getLogger();
  const log = [];

  if (!state.empires || state.empires.length === 0) {
    logger.warn('No empires found - skipping initial hero assignment');
    return log;
  }

  const roster = Array.isArray(state.heroRoster) ? state.heroRoster : [];
  if (roster.length === 0) {
    logger.warn('Hero roster is empty - skipping initial hero assignment');
    return log;
  }

  state.heroes = state.heroes || [];

  for (const empire of state.empires) {
    // Skip if empire already has a hero
    if (state.heroes.some(hero => getHeroEmpireId(hero) === empire.id)) {
      continue;
    }

    // Find available heroes for this empire
    const available = roster.filter(def =>
      def.empireId === empire.id &&
      !state.heroes.some(hero => hero.id === def.id)
    );

    if (available.length === 0) {
      logger.warn(`No available heroes for empire ${empire.id}`);
      continue;
    }

    // Pick a random hero from available candidates
    const candidate = available[Math.floor(rng() * available.length)];
    const hero = createHeroFromCandidate(state, empire, candidate, rng);
    state.heroes.push(hero);

    const msg = `Initial hero assigned: ${hero.name} for ${empire.name}`;
    log.push(msg);
    logger.info(msg);
  }

  return log;
}
