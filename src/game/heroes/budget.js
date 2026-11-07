import { clamp } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_CONSTANTS, HERO_STATUS } from './constants.js';
import { getHeroEmpireId, getFundingScalar } from './utils.js';

const nonnegative = value => Number.isFinite(value) ? Math.max(0, value) : 0;

function fundingPerCredit(state, empire) {
  const global = state.coalitionModifiers || {};
  const local = state.improvements?.empireModifiers?.[empire.id] || {};
  // Existing improvements and saves retain their siphon efficiency bonuses as
  // funding efficiency. The old +0.01 on a 0.2 yield was a 5% improvement.
  const multiplier = (global.hero_funding_efficiency_mult || 0) +
    (local.hero_funding_efficiency_mult || 0) +
    (global.hero_siphon_efficiency_mult || 0) + (local.hero_siphon_efficiency_mult || 0);
  const additive = (global.hero_funding_efficiency_add || 0) +
    (local.hero_funding_efficiency_add || 0) +
    ((global.hero_siphon_efficiency_add || 0) + (local.hero_siphon_efficiency_add || 0)) * 2.5;
  return nonnegative(HERO_CONSTANTS.FUNDING_PER_CREDIT * (1 + multiplier) + additive);
}

/** Pay incrementally from the treasury left after the empire's other expenses. */
export function applyHeroFunding(state, log = []) {
  const logger = getLogger();
  const snapshots = new Map();
  for (const hero of state.heroes || []) {
    snapshots.set(hero, {
      funding: clamp(nonnegative(hero.funding), 0, HERO_CONSTANTS.FUNDING_MAX),
      paid: nonnegative(hero.funding_last_paid)
    });
    hero.funding = Math.max(0, snapshots.get(hero).funding - HERO_CONSTANTS.FUNDING_DECAY);
    hero.funding_total = nonnegative(hero.funding_total);
    hero.funding_last_paid = 0;
    // A legacy bank is neither money owed nor financial support already paid.
    delete hero.siphon_bank;
  }

  for (const empire of state.empires || []) {
    const heroes = (state.heroes || []).filter(hero =>
      getHeroEmpireId(hero) === empire.id && hero.status !== HERO_STATUS.EXILED);
    const budget = nonnegative(empire.budget_credits);
    const rate = fundingPerCredit(state, empire);
    if (budget <= 0 || rate <= 0) continue;

    // Compute all requests against the same treasury, then share any cap
    // proportionally so array order never gives one Hero priority over another.
    const requests = heroes.map(hero => ({
      hero,
      credits: Math.min(
        budget * nonnegative(hero.budget_share),
        HERO_CONSTANTS.FUNDING_MAX_SPEND_PER_TICK,
        (HERO_CONSTANTS.FUNDING_MAX - hero.funding) / rate
      )
    }));
    const requested = requests.reduce((sum, request) => sum + request.credits, 0);
    const available = budget * HERO_CONSTANTS.FUNDING_MAX_BUDGET_SHARE;
    const fraction = requested > available ? available / requested : 1;
    let paid = 0;
    for (const request of requests) {
      const credits = request.credits * fraction;
      request.hero.funding_last_paid = credits;
      request.hero.funding_total += credits;
      request.hero.funding = clamp(request.hero.funding + credits * rate, 0, HERO_CONSTANTS.FUNDING_MAX);
      paid += credits;
    }
    empire.budget_credits = Math.max(0, budget - paid);
  }

  for (const hero of state.heroes || []) {
    const before = snapshots.get(hero);
    const paid = hero.funding_last_paid;
    // Log support starting/stopping and meaningful rating bands, avoiding a
    // per-turn funding line that hides battles and political developments.
    if ((before.paid > 0) !== (paid > 0) || Math.floor(before.funding / 20) !== Math.floor(hero.funding / 20)) {
      const message = `Hero funding: ${hero.name} received ${paid.toFixed(1)} credits (${hero.funding_total.toFixed(1)} accumulated); apparatus ${hero.funding.toFixed(1)}/${HERO_CONSTANTS.FUNDING_MAX} (x${getFundingScalar(hero).toFixed(2)} funding strength).`;
      log.push(message);
      logger.info(message);
    }
  }
}

// Retain the public name for older callers; its behavior now pays real funding.
export const applyHeroBudgetSiphon = applyHeroFunding;
