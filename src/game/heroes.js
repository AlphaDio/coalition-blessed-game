/**
 * Hero system v0.3 - meters, passives, abilities, and law integration.
 */

import { clamp } from './cohesion.js';
import { HERO_ABILITIES, HERO_PASSIVES, HERO_ARCHETYPES } from './heroDefinitions.js';
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
      const message = `Hero charge: ${hero.name} accumulates +${chargeGain.toFixed(1)} charge (budget share ${Math.round((hero.budget_share || 0) * 100)}%).`;
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

    const cost = abilityDef.cost_credits || 0;
    if (cost > 0 && (empire.budget_credits || 0) < cost) {
      return;
    }

    const popularityScalar = getPopularityScalar(hero);
    abilityDef.trigger({ hero, empire, lawProcess, popularityScalar, log });
    hero.charge = 0;
    hero.cooldowns = hero.cooldowns || {};
    hero.cooldowns.ability = abilityDef.cooldown ?? 10;
    hero.last_trigger_turn = state.turn;
    if (cost > 0) {
      empire.budget_credits = Math.max(0, (empire.budget_credits || 0) - cost);
      const message = `Hero Ability cost: ${hero.name} spent ${cost} credits from ${empire.name}.`;
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

export function createHeroFromEmpire(empire, index = 0, rng = Math.random) {
  const passiveList = Object.values(HERO_PASSIVES);
  const abilityList = Object.values(HERO_ABILITIES);
  const archetype = HERO_ARCHETYPES[index % HERO_ARCHETYPES.length] || null;
  const passive = archetype ? HERO_PASSIVES[archetype.passive_id] : passiveList[index % passiveList.length];
  const ability = archetype ? HERO_ABILITIES[archetype.ability_id] : abilityList[index % abilityList.length];
  const jitter = () => (rng() * 0.2) - 0.1;
  const values = {};
  Object.keys(empire.values || {}).forEach(axis => {
    values[axis] = clamp((empire.values[axis] || 0) + jitter(), -1, 1);
  });

  return createHero(
    `HERO_${empire.id}_${index + 1}`,
    empire.id,
    `${empire.name} ${archetype?.title || 'Envoy'} ${index + 1}`,
    {
      tagline: archetype?.tagline || '',
      tags: ['political', 'hero', ...(archetype?.tags || []), ...(empire.tags || [])],
      values,
      status: HERO_STATUS.ACTIVE,
      budget_share: 0.1,
      charge: 0,
      ability_id: ability?.id || null,
      passive: {
        phase: passive?.phase || 'DEBATE',
        cadence: passive?.cadence || 'OnStart',
        passive_id: passive?.id || null
      },
      meters: {
        heat: 0,
        grievance: 0,
        popularity: 50
      },
      last_trigger_turn: -1,
      cooldowns: { ability: 0 },
      modifiers: {}
    }
  );
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

export function buildHeroCandidates(state, empire, rng = Math.random, count = 3) {
  const archetypes = shuffle(HERO_ARCHETYPES, rng);
  const candidates = [];

  for (const archetype of archetypes) {
    if (candidates.length >= count) break;
    const passive = HERO_PASSIVES[archetype.passive_id];
    const ability = HERO_ABILITIES[archetype.ability_id];
    if (!passive || !ability) continue;

    candidates.push({
      empire_id: empire.id,
      archetype_id: archetype.id,
      name: `${empire.name} ${archetype.title}`,
      tagline: archetype.tagline,
      tags: ['political', 'hero', ...(archetype.tags || []), ...(empire.tags || [])],
      ability_id: ability.id,
      passive_id: passive.id,
      passive_phase: passive.phase,
      passive_cadence: passive.cadence
    });
  }

  return candidates;
}

export function createHeroFromCandidate(state, empire, candidate, rng = Math.random) {
  const index = getNextHeroIndex(state, empire.id);
  const jitter = () => (rng() * 0.2) - 0.1;
  const values = {};
  Object.keys(empire.values || {}).forEach(axis => {
    values[axis] = clamp((empire.values[axis] || 0) + jitter(), -1, 1);
  });

  return createHero(
    `HERO_${empire.id}_${index + 1}`,
    empire.id,
    candidate.name,
    {
      tagline: candidate.tagline || '',
      tags: candidate.tags || ['political', 'hero'],
      values,
      status: HERO_STATUS.ACTIVE,
      budget_share: 0.1,
      charge: 0,
      ability_id: candidate.ability_id || null,
      passive: {
        phase: candidate.passive_phase || 'DEBATE',
        cadence: candidate.passive_cadence || 'OnStart',
        passive_id: candidate.passive_id || null
      },
      meters: {
        heat: 0,
        grievance: 0,
        popularity: 50
      },
      last_trigger_turn: state.turn ?? -1,
      cooldowns: { ability: 0 },
      modifiers: {}
    }
  );
}

export function buildHeroRecruitmentEvent(state, rng = Math.random) {
  if (!state.empires || state.empires.length === 0) return null;
  if (state.activeEvent) return null;

  const empiresWithoutHero = state.empires.filter(empire =>
    !(state.heroes || []).some(hero => getHeroEmpireId(hero) === empire.id)
  );
  if (empiresWithoutHero.length === 0) return null;

  const empire = empiresWithoutHero[Math.floor(rng() * empiresWithoutHero.length)];
  const candidateCount = Math.min(3, Math.max(2, HERO_ARCHETYPES.length));
  const candidates = buildHeroCandidates(state, empire, rng, candidateCount);
  if (candidates.length === 0) return null;

  return {
    id: `HERO_RECRUIT_${empire.id}_${state.turn ?? 0}`,
    scope: 'HERO_RECRUIT',
    empire_id: empire.id,
    title: `Hero Candidates for ${empire.name}`,
    text: `${empire.name} lacks a hero. Choose a candidate to represent their interests.`,
    choices: candidates.map(candidate => ({
      text: `${candidate.name} — ${candidate.tagline}`,
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
