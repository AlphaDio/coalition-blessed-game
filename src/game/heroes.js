/**
 * Hero system v0.3 - meters, passives, abilities, and law integration.
 */

import { clamp } from './cohesion.js';
import { HERO_ABILITIES, HERO_PASSIVES } from './heroDefinitions.js';
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
  UNREST_THRESHOLD: 0.35,
  UNREST_SPAN: 0.65,
  HEAT_DECAY_GOOD: 0.6,
  HEAT_DECAY_BAD: 0.2,
  GRIEVANCE_DECAY: 0.08,
  GRIEVANCE_BAKE_THRESHOLD: 60,
  GRIEVANCE_BAKE_RATE: 0.015,
  GRIEVANCE_BAKE_RELEASE: 0.35,
  POPULARITY_RISE_GOOD: 0.5,
  POPULARITY_FALL_BAD: 0.6,
  POPULARITY_CAP_FACTOR: 0.5,
  CHARGE_PER_CREDIT: 0.02,
  ABILITY_CHARGE_MAX: 100,
  ABILITY_MIN_CHARGE: 100,
  STATUS_CHARGE_MULTIPLIER: {
    ACTIVE: 1,
    SIDELINED: 0.6,
    DISGRACED: 0.3,
    EXILED: 0
  },
  AGGRAVATION_HEAT_DRIFT: 0.08,
  AGGRAVATION_GRIEVANCE_DRIFT: 0.12
};

export const HERO_RECRUIT_DELAY_RANGE = { min: 5, max: 25 };
export const HERO_RECRUIT_CHOICE_COUNT = 2;

function getLawValues(lawDef) {
  return lawDef.axis_vector || lawDef.values || {};
}

function getHeroEmpireId(hero) {
  return hero.empire_id || hero.empireId || null;
}

export function computeAlignmentScore(valuesA = {}, valuesB = {}) {
  const axes = new Set([...Object.keys(valuesA || {}), ...Object.keys(valuesB || {})]);
  if (axes.size === 0) return 0;

  let totalScore = 0;
  axes.forEach(axis => {
    const a = Number.isFinite(valuesA[axis]) ? valuesA[axis] : 0;
    const b = Number.isFinite(valuesB[axis]) ? valuesB[axis] : 0;
    const diff = Math.abs(a - b); // 0..2
    const similarity = 1 - Math.min(1, diff / 2);
    const score = (similarity * 2) - 1; // -1..1
    totalScore += score;
  });

  return totalScore / axes.size;
}

export function getPopularityCap(hero) {
  const cap = 100 - (hero.meters.grievance * HERO_CONSTANTS.POPULARITY_CAP_FACTOR);
  return clamp(cap, 10, 100);
}

export function getPopularityScalar(hero) {
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

    heroes.forEach(hero => {
      const share = totalShare > 0 ? (hero.budget_share || 0) / totalShare : 0;
      const siphoned = virtualSiphon * share;
      const statusMultiplier = HERO_CONSTANTS.STATUS_CHARGE_MULTIPLIER[hero.status] ?? 1;
      const chargeGain = siphoned * HERO_CONSTANTS.CHARGE_PER_CREDIT * statusMultiplier;
      hero.charge = clamp((hero.charge || 0) + chargeGain, 0, HERO_CONSTANTS.ABILITY_CHARGE_MAX);
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
  const unrest = lawProcess.meters?.unrest || 0;
  const legitimacy = lawProcess.meters?.legitimacy || 0;
  const unrestPressure = clamp((unrest - HERO_CONSTANTS.UNREST_THRESHOLD) / HERO_CONSTANTS.UNREST_SPAN, 0, 1);
  const legitimacyDampener = 1 - (legitimacy * 0.7);

  if (unrestPressure <= 0) {
    return;
  }

  let totalHeatDelta = 0;
  let totalGrievanceDelta = 0;

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
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

export function runHeroPassives(state, lawProcess, lawDef, cadence, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    const passive = hero.passive || {};
    if (!passive.passive_id) return;
    if (passive.phase !== lawProcess.phase) return;
    if (passive.cadence !== cadence) return;

    const definition = HERO_PASSIVES[passive.passive_id];
    if (!definition) return;

    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const popularityScalar = getPopularityScalar(hero);
    definition.apply({ hero, empire, lawProcess, lawDef, popularityScalar, log });
  });
}

export function triggerHeroAbilities(state, lawProcess, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    const abilityDef = HERO_ABILITIES[hero.ability_id];
    if (!abilityDef) return;
    if ((hero.cooldowns?.ability || 0) > 0) return;
    if ((hero.charge || 0) < HERO_CONSTANTS.ABILITY_MIN_CHARGE) return;

    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const siphonBank = hero.siphon_bank || 0;
    if (siphonBank > 0 && (empire.budget_credits || 0) < siphonBank) {
      return;
    }

    const popularityScalar = getPopularityScalar(hero);
    abilityDef.trigger({ hero, empire, lawProcess, popularityScalar, log });
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

    const avgHeat = heroes.reduce((sum, hero) => sum + (hero.meters.heat || 0), 0) / heroes.length;
    const avgGrievance = heroes.reduce((sum, hero) => sum + (hero.meters.grievance || 0), 0) / heroes.length;

    const aggravationDelta = (avgHeat / 100) * HERO_CONSTANTS.AGGRAVATION_HEAT_DRIFT +
      (avgGrievance / 100) * HERO_CONSTANTS.AGGRAVATION_GRIEVANCE_DRIFT;

    if (aggravationDelta <= 0) return;

    const armies = (state.armies || []).filter(army => army.empireId === empire.id || army.owner_empire_id === empire.id);
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
    def.empire_id === empire.id &&
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
    empire_id: empire.id,
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
  const empireId = candidate.empire_id || event.empire_id || null;
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
