import { clamp } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_CONSTANTS, HERO_STATUS } from './constants.js';
import { ensureHeroMeters, getHeroEmpireId, getPopularityCap } from './utils.js';

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
