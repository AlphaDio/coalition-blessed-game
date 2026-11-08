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
import { ensureHeroMeters, getHeroEmpireId, getPopularityScalar, getFundingScalar } from './utils.js';
import { calculateArmyPower } from '../battles/power.js';
import { getEffectiveArmyFervor } from '../armyBattlePrep.js';

const LAW_METERS = new Set(['momentum', 'reject_pressure', 'unrest', 'polarization', 'legitimacy']);
const HERO_METERS = new Set(['heat', 'grievance', 'popularity']);
const isActiveLaw = law => law && !['ENACTED', 'BURIED', 'REJECTED', 'FAILED'].includes(law.phase);

export function triggerHeroAbilities(state, lawProcess = null, log = []) {
  if (!state.heroes?.length || !state.empires?.length) return;
  const logger = getLogger();
  const activeLaw = isActiveLaw(lawProcess) ? lawProcess : (state.lawProcesses || []).find(isActiveLaw) || null;

  state.heroes.forEach(hero => {
    if (hero.status === HERO_STATUS.EXILED) return;
    ensureHeroMeters(hero);
    const abilityDef = HERO_ABILITIES[hero.ability_id];
    if (!abilityDef || (hero.cooldowns?.ability || 0) > 0) return;
    const chargeRequired = abilityDef.chargeRequired ?? HERO_CONSTANTS.ABILITY_DEFAULT_CHARGE;
    if ((hero.charge || 0) < chargeRequired) return;
    const empire = state.empires.find(e => e.id === getHeroEmpireId(hero));
    if (!empire) return;

    const abilityScalar = getFundingScalar(hero);
    const resolved = runHeroAbilityHook(abilityDef, hero, empire, state, activeLaw, abilityScalar, log, logger);
    // Legacy JS callbacks must explicitly report a successful resolution.
    const fired = resolved === null && typeof abilityDef.trigger === 'function'
      ? abilityDef.trigger({ hero, empire, state, lawProcess: activeLaw, popularityScalar: abilityScalar, abilityScalar, log }) === true
      : resolved === true;
    if (!fired) return;

    hero.charge = 0;
    hero.cooldowns = hero.cooldowns || {};
    hero.cooldowns.ability = abilityDef.cooldown ?? 10;
    hero.last_trigger_turn = state.turn;
    const moduleId = HERO_ABILITY_MODULE_IDS[abilityDef.id];
    const name = HERO_MODULE_REGISTRY.modules?.[moduleId]?.module?.name || abilityDef.id;
    const message = `Hero Ability fired: ${hero.name} — ${name} (x${abilityScalar.toFixed(2)} strength; funding ${Number(hero.funding || 0).toFixed(1)}/${HERO_CONSTANTS.FUNDING_MAX}).`;
    log.push(message);
    logger.info(message);
  });
}

export function tickHeroCooldowns(state) {
  (state.heroes || []).forEach(hero => {
    hero.cooldowns = hero.cooldowns || {};
    if (hero.cooldowns.ability > 0) hero.cooldowns.ability -= 1;
    if (hero.cooldowns.law_proposal > 0) hero.cooldowns.law_proposal -= 1;
  });
}

function runHeroAbilityHook(abilityDef, hero, empire, state, lawProcess, abilityScalar, log, logger) {
  const moduleId = HERO_ABILITY_MODULE_IDS[abilityDef?.id];
  const moduleDoc = HERO_MODULE_REGISTRY.modules?.[moduleId];
  if (!moduleDoc?.hooks?.on_trigger?.logic) return null;

  const requiredContext = abilityDef.requires_context ||
    (moduleDoc.metadata?.tags?.includes('law') ? 'law' : null);
  if (requiredContext === 'law' && !isActiveLaw(lawProcess)) return false;
  if (requiredContext === 'army' && !getEmpireAbilityArmies(state, empire.id).length) return false;

  const scope = {
    hero,
    empire,
    state,
    law_process: lawProcess,
    // Ability content still uses this legacy field for its strength multiplier.
    popularity_scalar: abilityScalar,
    ability_scalar: abilityScalar,
    popularity_only_scalar: getPopularityScalar(hero),
    funding_scalar: abilityScalar,
    hero_tags: hero.tags || [],
    empire_tags: empire.tags || []
  };
  const result = HERO_MODULE_INTERPRETER.executeHook(moduleId, 'on_trigger', { scope, vars: {} });
  const actions = result?.actions || [];
  const context = {
    hero, empire, state, lawProcess, log, logger,
    // Use the same pre-activation combat weights for all components of a rally.
    armyPowers: new Map(actions.some(action => ['adjust_army_fervor', 'adjust_army_organization'].includes(action.type))
      ? (state.armies || []).map(army => [army.id, calculateArmyPower(army)]) : [])
  };
  // Check primary benefits before applying any costs. Heat, grievance or
  // polarization alone must never spend Charge in an unusable context.
  const primaryActions = requiredContext === 'law'
    ? actions.filter(action => ['add_law_meter', 'add_law_progress'].includes(action.type))
    : requiredContext === 'army'
      ? actions.filter(action => ['adjust_army_fervor', 'adjust_army_organization'].includes(action.type))
      : actions;
  if (!primaryActions.some(action => canBenefit(action, context))) return false;
  let changed = false;
  for (const action of actions) changed = applyHeroAbilityAction(action, context) || changed;
  return changed;
}

function actionAmount(action) {
  return Number(action?.args?.amount ?? action?.args?.value ?? 0);
}

function changes(current, amount, max) {
  return clamp(Number(current || 0) + amount, 0, max) !== Number(current || 0);
}

function getEmpireAbilityArmies(state, empireId) {
  // Composite forces already represent the originals. Applying the full bonus
  // to a same-empire loyal composite as well would count those armies twice.
  return (state.armies || []).filter(army => army.empireId === empireId &&
    !army.isComposite && !Array.isArray(army._originalArmies));
}

function armyStat(army, stat) {
  return stat === 'fervor' ? getEffectiveArmyFervor(army) : Number(army[stat] || 0);
}

function syncCompositeArmyBoost(state, stat, deltas, armyPowers) {
  const byId = new Map((state.armies || []).map(army => [army.id, army]));
  const fightingIds = new Set((state.battleFronts || []).filter(front => front.state === 'ACTIVE')
    .flatMap(front => [front.leftArmyId, front.rightArmyId]));
  for (const id of fightingIds) {
    const composite = byId.get(id);
    if (!composite?._originalArmies?.length || composite.empireId === '_insurrection') continue;
    const participants = composite._originalArmies.filter(entry => byId.has(entry.id));
    const weights = participants.map(entry => {
      const commitRatio = Number.isFinite(Number(entry.commitRatio)) ? clamp(Number(entry.commitRatio), 0, 1) : 1;
      return Math.max(0, armyPowers.get(entry.id) || 0) * commitRatio;
    });
    const totalPower = weights.reduce((sum, weight) => sum + weight, 0);
    const divisor = totalPower > 0 ? totalPower : Math.max(1, participants.length);
    // Propagate only the effect's actual delta, preserving combat attrition and
    // the unaffected coalition partners' share of this combined force.
    const delta = participants.reduce((sum, entry, index) =>
      sum + (deltas.get(entry.id) || 0) * (totalPower > 0 ? weights[index] : 1) / divisor, 0);
    if (delta !== 0) composite[stat] = clamp(Number(composite[stat] || 0) + delta, 0, 100);
  }
}

function canBenefit(action, { hero, empire, state, lawProcess }) {
  const amount = actionAmount(action);
  if (!Number.isFinite(amount) || amount === 0) return false;
  const meter = action.args?.meter;
  switch (action.type) {
    case 'adjust_hero_meter':
      return HERO_METERS.has(meter) &&
        (meter === 'popularity' ? amount > 0 : amount < 0) && changes(hero.meters[meter], amount, 100);
    case 'add_law_meter':
      return isActiveLaw(lawProcess) && lawProcess.meters && LAW_METERS.has(meter) &&
        (['momentum', 'legitimacy'].includes(meter) ? amount > 0 : amount < 0) &&
        changes(lawProcess.meters[meter], amount, 1);
    case 'add_law_progress':
      return isActiveLaw(lawProcess) && amount > 0 && changes(lawProcess.phaseProgress, amount, 2);
    case 'grant_requisition':
      return Math.round(amount) > 0;
    case 'grant_intel':
      return amount > 0;
    case 'adjust_coalition_cohesion':
      return amount > 0 && changes(state.coalitionCohesion, amount, 100);
    case 'adjust_scourge_cohesion':
      return amount < 0 && changes(state.scourgeCohesion, amount, 100);
    case 'adjust_army_fervor':
    case 'adjust_army_organization': {
      const stat = action.type === 'adjust_army_fervor' ? 'fervor' : 'organization';
      return amount > 0 && getEmpireAbilityArmies(state, empire.id).some(army =>
        changes(army[stat], amount, 100) && changes(armyStat(army, stat), amount, 100));
    }
    default:
      return false;
  }
}

function applyHeroAbilityAction(action, { hero, empire, state, lawProcess, log, logger, armyPowers }) {
  if (!action || typeof action !== 'object') return false;
  const { type, args = {} } = action;
  const amount = actionAmount(action);
  if (!Number.isFinite(amount) || amount === 0) return false;
  const meter = args.meter;
  let before;
  let after;
  let count;
  let effectiveAmount = amount;

  switch (type) {
    case 'adjust_hero_meter':
      if (!HERO_METERS.has(meter)) return false;
      before = Number(hero.meters[meter] || 0);
      after = hero.meters[meter] = clamp(before + amount, 0, 100);
      break;
    case 'add_law_meter':
      if (!isActiveLaw(lawProcess) || !lawProcess.meters || !LAW_METERS.has(meter)) return false;
      before = Number(lawProcess.meters[meter] || 0);
      after = lawProcess.meters[meter] = clamp(before + amount, 0, 1);
      break;
    case 'add_law_progress':
      if (!isActiveLaw(lawProcess)) return false;
      before = Number(lawProcess.phaseProgress || 0);
      after = lawProcess.phaseProgress = clamp(before + amount, 0, 2);
      break;
    case 'grant_requisition':
      state.coalitionEconomy = state.coalitionEconomy || {};
      effectiveAmount = Math.round(amount);
      before = Number(state.coalitionEconomy.requisition || 0);
      after = state.coalitionEconomy.requisition = before + effectiveAmount;
      break;
    case 'grant_intel':
      before = Number(state.coalitionIntel || 0);
      after = state.coalitionIntel = before + amount;
      break;
    case 'adjust_coalition_cohesion':
      before = Number(state.coalitionCohesion || 0);
      after = state.coalitionCohesion = clamp(before + amount, 0, 100);
      break;
    case 'adjust_scourge_cohesion':
      before = Number(state.scourgeCohesion || 0);
      after = state.scourgeCohesion = clamp(before + amount, 0, 100);
      break;
    case 'adjust_army_fervor':
    case 'adjust_army_organization': {
      const stat = type === 'adjust_army_fervor' ? 'fervor' : 'organization';
      const armies = getEmpireAbilityArmies(state, empire.id).filter(army => changes(army[stat], amount, 100));
      count = armies.length;
      if (count === 0) return false;
      const deltas = new Map();
      armies.forEach(army => {
        const previous = armyStat(army, stat);
        army[stat] = clamp(Number(army[stat] || 0) + amount, 0, 100);
        deltas.set(army.id, armyStat(army, stat) - previous);
      });
      syncCompositeArmyBoost(state, stat, deltas, armyPowers);
      before = 0;
      after = 1;
      break;
    }
    default:
      return false;
  }
  if (before === after) return false;
  if (count === undefined) effectiveAmount = after - before;
  const message = formatMessage(args.log_message, {
    hero: hero.name,
    empire: empire.name,
    value: Math.round(effectiveAmount),
    amount: effectiveAmount,
    meter,
    before: before.toFixed(type === 'add_law_meter' ? 3 : 2),
    after: after.toFixed(type === 'add_law_meter' ? 3 : 2),
    count
  });
  if (message) {
    log.push(message);
    logger.info(message);
  }
  return true;
}
