import { clamp } from '../cohesion.js';
import { createHero } from '../types.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_RECRUIT_CHOICE_COUNT, HERO_RECRUIT_DELAY_RANGE, HERO_STATUS } from './constants.js';
import { getHeroEmpireId } from './utils.js';

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
