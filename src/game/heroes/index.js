export { HERO_RECRUIT_DELAY_RANGE, HERO_RECRUIT_CHOICE_COUNT, HERO_STATUS, HERO_CONSTANTS } from './constants.js';
export {
  computeAlignmentScore,
  getPopularityCap,
  getPopularityScalar
} from './utils.js';
export { applyHeroFunding, applyHeroBudgetSiphon } from './budget.js';
export { triggerHeroEvent, getActiveHeroLawProcess } from './charge.js';
export { getFundingScalar, getAbilityScalar } from './utils.js';
export { applyHeroLawPressure, applyHeroLawSponsorship, applyHeroLawTension } from './law.js';
export { triggerHeroPassives, runHeroPassives, runHeroBattlePassives } from './passives.js';
export { triggerHeroAbilities, tickHeroCooldowns } from './abilities.js';
export { tickHeroMeters, applyHeroSpillover } from './meters.js';
export {
  buildHeroCandidates,
  createHeroFromCandidate,
  buildHeroRecruitmentEvent,
  handleHeroRecruitmentChoice,
  assignInitialHeroes
} from './recruitment.js';
