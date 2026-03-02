import { clamp } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_CONSTANTS, HERO_STATUS } from './constants.js';
import { computeAlignmentScore, ensureHeroMeters, getHeroEmpireId, getLawValues, getPopularityScalar } from './utils.js';

export function applyHeroLawSponsorship(state, lawProcess, lawDef, sponsorHero, log) {
  if (!lawProcess?.meters || !sponsorHero || sponsorHero.status === HERO_STATUS.EXILED) return;

  ensureHeroMeters(sponsorHero);
  const logger = getLogger();
  const sponsorAlignment = Math.max(0, computeAlignmentScore(getLawValues(lawDef), sponsorHero.values || {}));
  const popularityScalar = getPopularityScalar(sponsorHero);
  const momentumDelta = 0.08 + (popularityScalar * 0.04);
  const legitimacyDelta = sponsorAlignment * 0.10;
  const grievancePressure = Math.max(sponsorHero.meters.heat || 0, sponsorHero.meters.grievance || 0);
  const unrestDelta = grievancePressure >= 70
    ? 0.08
    : grievancePressure >= 50
      ? 0.05
      : grievancePressure >= 35
        ? 0.03
        : 0;

  lawProcess.meters.momentum = clamp((lawProcess.meters.momentum || 0) + momentumDelta, 0, 1);
  lawProcess.meters.legitimacy = clamp((lawProcess.meters.legitimacy || 0) + legitimacyDelta, 0, 1);
  if (unrestDelta > 0) {
    lawProcess.meters.unrest = clamp((lawProcess.meters.unrest || 0) + unrestDelta, 0, 1);
  }

  const sponsorEmpire = state.empires?.find((empire) => empire.id === getHeroEmpireId(sponsorHero));
  const message =
    `Sponsor ${sponsorHero.name}${sponsorEmpire ? ` (${sponsorEmpire.name})` : ''}: ` +
    `momentum +${momentumDelta.toFixed(2)}, legitimacy +${legitimacyDelta.toFixed(2)}` +
    (unrestDelta > 0 ? `, unrest +${unrestDelta.toFixed(2)}` : '');
  log.push(message);
  logger.info(message);
}

export function applyHeroLawPressure(state, lawProcess, lawDef, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  const lawValues = getLawValues(lawDef);
  const unrest = clamp(lawProcess.meters?.unrest || 0, 0, 1);
  const legitimacy = lawProcess.meters?.legitimacy || 0;
  const unrestPressure = Math.max(0.2, unrest);
  const legitimacyDampener = 1 - (legitimacy * 0.55);

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
  const heatPressure = clamp(
    (avgHeat - HERO_CONSTANTS.LAW_HEAT_NEUTRAL) / HERO_CONSTANTS.LAW_HEAT_PRESSURE_SPAN,
    -1,
    1
  );
  const grievancePressure = clamp(
    (avgGrievance - HERO_CONSTANTS.LAW_GRIEVANCE_NEUTRAL) / HERO_CONSTANTS.LAW_GRIEVANCE_PRESSURE_SPAN,
    -1,
    1
  );

  const unrestDelta = heatPressure * HERO_CONSTANTS.LAW_UNREST_FROM_HEAT;
  const rejectDelta = grievancePressure * HERO_CONSTANTS.LAW_REJECT_FROM_GRIEVANCE;
  if (unrestDelta === 0 && rejectDelta === 0) return;

  const oldUnrest = lawProcess.meters.unrest || 0;
  const oldReject = lawProcess.meters.reject_pressure || 0;
  lawProcess.meters.unrest = clamp(oldUnrest + unrestDelta, 0, 1);
  lawProcess.meters.reject_pressure = clamp(oldReject + rejectDelta, 0, 1);

  if (Math.abs(unrestDelta) >= 0.001 || Math.abs(rejectDelta) >= 0.001) {
    const message = `Hero sentiment: law unrest ${oldUnrest.toFixed(3)} -> ${lawProcess.meters.unrest.toFixed(3)}, ` +
      `reject pressure ${oldReject.toFixed(3)} -> ${lawProcess.meters.reject_pressure.toFixed(3)}.`;
    log.push(message);
    logger.debug(message);
  }
}
