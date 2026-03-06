import { POPULATION_CONSTANTS, UNITY_CONSTANTS } from './constants.js';
import { clampApproval, clampStat } from './cohesion.js';
import { getLogger } from '../modules/logger.js';
import { getUnityEffectForEmpire } from './unityDefinitions.js';
import { HERO_STATUS } from './heroes/constants.js';
import { ensureHeroMeters, getPopularityCap } from './heroes/utils.js';

function sanitizeNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function readUnityGainAdd(modifiers = {}) {
  const candidates = [
    modifiers.unity_gain_add,
    modifiers.unity_add
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric !== 0) {
      return numeric;
    }
  }
  return 0;
}

function readUnityGainMult(modifiers = {}) {
  const candidates = [
    modifiers.unity_gain_mult,
    modifiers.unity_mult
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric !== 0) {
      return Math.max(0, 1 + numeric);
    }
  }
  return 1;
}

function getEmpirePopulationUnityBaseline(empire) {
  const population = Math.max(0, Number(empire?.stats?.population || 0));
  if (population <= 0) {
    return 0;
  }

  const populationCap = Math.max(1, Number(POPULATION_CONSTANTS.MAX_POPULATION || 1_000_000));
  const normalizedPopulation = Math.max(0, Math.min(1, population / populationCap));
  const curvedPopulation = Math.pow(normalizedPopulation, UNITY_CONSTANTS.POPULATION_BASE_CURVE_EXPONENT || 1);
  const minGain = Math.max(0, Number(UNITY_CONSTANTS.POPULATION_BASE_MIN || 0));
  const maxGain = Math.max(minGain, Number(UNITY_CONSTANTS.POPULATION_BASE_MAX || minGain));
  return minGain + ((maxGain - minGain) * curvedPopulation);
}

function getLawUnityModifiers(state) {
  if (!Array.isArray(state?.activeLaws) || state.activeLaws.length === 0) {
    return { add: 0, mult: 1 };
  }

  let add = 0;
  let mult = 1;

  state.activeLaws.forEach((law) => {
    const modifiers = law?.modifiers || {};
    add += readUnityGainAdd(modifiers);
    mult *= readUnityGainMult(modifiers);
  });

  return { add, mult };
}

function getImprovementUnityModifiers(state, empireId) {
  const modifiers = state?.improvements?.empireModifiers?.[empireId] || {};
  return {
    add: readUnityGainAdd(modifiers),
    mult: readUnityGainMult(modifiers)
  };
}

function getEmpireHeroPopularityUnityMultiplier(state, empireId) {
  if (!Array.isArray(state?.heroes) || state.heroes.length === 0) {
    return 1;
  }

  const heroes = state.heroes.filter((hero) =>
    hero &&
    hero.empireId === empireId &&
    hero.status !== HERO_STATUS.EXILED
  );

  if (heroes.length === 0) {
    return 1;
  }

  const normalizedPopularityValues = heroes.map((hero) => {
    ensureHeroMeters(hero);
    const cap = Math.max(1, Number(getPopularityCap(hero) || 100));
    const effectivePopularity = Math.max(0, Math.min(cap, Number(hero.meters?.popularity || 0)));
    return effectivePopularity / cap;
  });

  const averagePopularity = normalizedPopularityValues.reduce((sum, value) => sum + value, 0) / normalizedPopularityValues.length;
  const centered = (averagePopularity - 0.5) * 2; // -1..1
  const span = Math.max(0, Number(UNITY_CONSTANTS.HERO_POPULARITY_MULT_SPAN || 0));
  const rawMultiplier = 1 + (centered * span);
  const minMultiplier = Math.max(0, Number(UNITY_CONSTANTS.HERO_POPULARITY_MULT_MIN || 0));
  const maxMultiplier = Math.max(minMultiplier, Number(UNITY_CONSTANTS.HERO_POPULARITY_MULT_MAX || minMultiplier));
  return Math.max(minMultiplier, Math.min(maxMultiplier, rawMultiplier));
}

function getRegularEmpireArmies(state, empireId) {
  return (state.armies || []).filter(army =>
    army?.empireId === empireId &&
    !String(army.id || '').startsWith('_')
  );
}

export function calculateUnityThreshold(level = 0) {
  const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
  const threshold = UNITY_CONSTANTS.INITIAL_THRESHOLD
    * Math.pow(normalizedLevel + 1, UNITY_CONSTANTS.THRESHOLD_EXPONENT);
  return Math.max(1, Math.round(threshold));
}

export function ensureEmpireUnityState(empire) {
  if (!empire || typeof empire !== 'object') return;

  if (!Number.isFinite(empire.unityPoints) || empire.unityPoints < 0) {
    empire.unityPoints = 0;
  }

  if (!Number.isFinite(empire.unityLevel) || empire.unityLevel < 0) {
    empire.unityLevel = 0;
  } else {
    empire.unityLevel = Math.floor(empire.unityLevel);
  }

  if (!Array.isArray(empire.unityEffects)) {
    empire.unityEffects = [];
  }

  if (!empire.unityModifiers || typeof empire.unityModifiers !== 'object') {
    empire.unityModifiers = {};
  }

  if (empire.unityLevel >= UNITY_CONSTANTS.MAX_TIERS) {
    empire.unityLevel = UNITY_CONSTANTS.MAX_TIERS;
    empire.unityThreshold = Number.MAX_SAFE_INTEGER;
    empire.unityPoints = 0;
    return;
  }

  const baselineThreshold = calculateUnityThreshold(empire.unityLevel);
  if (!Number.isFinite(empire.unityThreshold) || empire.unityThreshold <= 0) {
    empire.unityThreshold = baselineThreshold;
  } else {
    empire.unityThreshold = Math.max(1, Math.round(empire.unityThreshold));
  }
}

export function getEmpireUnityGainPerTurn(state, empireId) {
  const empire = (state.empires || []).find(candidate => candidate.id === empireId);
  if (!empire) return 0;

  const populationBaseline = getEmpirePopulationUnityBaseline(empire);

  let improvementUnityOutput = 0;
  const improvements = state?.improvements?.queue;
  if (Array.isArray(improvements)) {
    for (const improvement of improvements) {
      if (!improvement || improvement.state !== 'ACTIVE' || improvement.empireId !== empireId) continue;
      const output = Number(improvement.unityOutput);
      if (Number.isFinite(output) && output > 0) {
        improvementUnityOutput += output;
      }
    }
  }

  const lawUnityModifiers = getLawUnityModifiers(state);
  const improvementUnityModifiers = getImprovementUnityModifiers(state, empireId);
  const unityEffectModifiers = empire.unityModifiers || {};
  const unityEffectGainAdd = readUnityGainAdd(unityEffectModifiers);
  const unityEffectGainMult = readUnityGainMult(unityEffectModifiers);
  const heroPopularityMultiplier = getEmpireHeroPopularityUnityMultiplier(state, empireId);

  const additiveGain = Math.max(
    0,
    populationBaseline +
    improvementUnityOutput +
    lawUnityModifiers.add +
    improvementUnityModifiers.add +
    unityEffectGainAdd
  );
  const multiplicativeGain = Math.max(
    0,
    lawUnityModifiers.mult *
    improvementUnityModifiers.mult *
    unityEffectGainMult *
    heroPopularityMultiplier
  );

  return Math.max(0, additiveGain * multiplicativeGain);
}

function applyUnityImmediateEffects(state, empire, immediateEffects = {}) {
  if (!immediateEffects || typeof immediateEffects !== 'object') return;

  const approval = Number(immediateEffects.approval);
  if (Number.isFinite(approval) && approval !== 0) {
    empire.approval = clampApproval((empire.approval || 0) + approval);
  }

  const stability = Number(immediateEffects.stability);
  if (Number.isFinite(stability) && stability !== 0) {
    empire.stability = clampStat((empire.stability || 0) + stability, 0, 100);
  }

  const credits = Number(immediateEffects.credits);
  if (Number.isFinite(credits) && credits !== 0) {
    empire.budget_credits = (empire.budget_credits || 0) + credits;
  }

  const requisition = Number(immediateEffects.requisition);
  if (Number.isFinite(requisition) && requisition !== 0) {
    if (!state.coalitionEconomy) state.coalitionEconomy = { requisition: 0 };
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + requisition;
  }
}

function applyUnityModifiers(empire, modifiers = {}) {
  if (!modifiers || typeof modifiers !== 'object') return;
  if (!empire.unityModifiers || typeof empire.unityModifiers !== 'object') {
    empire.unityModifiers = {};
  }

  Object.entries(modifiers).forEach(([key, value]) => {
    if (!Number.isFinite(value) || value === 0) return;
    empire.unityModifiers[key] = (empire.unityModifiers[key] || 0) + value;
  });
}

function createUnityCelebrationChoices(state, empire) {
  const armyFervor = {};
  getRegularEmpireArmies(state, empire.id).forEach(army => {
    armyFervor[army.id] = 8;
  });

  const martialChoiceEffects = {
    empireApproval: { [empire.id]: 3 }
  };
  if (Object.keys(armyFervor).length > 0) {
    martialChoiceEffects.armyFervor = armyFervor;
  } else {
    martialChoiceEffects.empireBudgetCredits = { [empire.id]: 500 };
  }

  return [
    {
      text: 'Hold grand unity festivals (+approval, +stability)',
      effects: {
        empireApproval: { [empire.id]: 8 },
        empireStability: { [empire.id]: 4 }
      }
    },
    {
      text: 'Issue a unity treasury dividend (+credits)',
      effects: {
        empireBudgetCredits: { [empire.id]: 1200 },
        empireStability: { [empire.id]: 1 }
      }
    },
    {
      text: 'Consecrate military honors (+army fervor)',
      effects: martialChoiceEffects
    }
  ];
}

function buildUnityCelebrationEvent(state, empire, unlockedEffect) {
  return {
    id: `unity_celebration_${empire.id}_${state.turn}_${empire.unityLevel}`,
    scope: 'UNITY',
    empireId: empire.id,
    unityTier: unlockedEffect.tier,
    unityEffectId: unlockedEffect.id,
    unityEffectName: unlockedEffect.name,
    title: `Unity Awakening - ${empire.name}`,
    text: `${empire.name} unlocked Unity Tier ${unlockedEffect.tier}: ${unlockedEffect.name}. ${unlockedEffect.description} Choose a celebration reward.`,
    choices: createUnityCelebrationChoices(state, empire)
  };
}

function unlockNextUnityEffect(state, empire) {
  const levelBeforeUnlock = Math.max(0, Math.floor(Number(empire.unityLevel) || 0));
  const effect = getUnityEffectForEmpire(empire.id, levelBeforeUnlock);
  if (!effect) return null;

  applyUnityModifiers(empire, effect.modifiers);
  applyUnityImmediateEffects(state, empire, effect.immediateEffects);

  if (!Array.isArray(empire.unityEffects)) {
    empire.unityEffects = [];
  }
  empire.unityEffects.push(effect.id);

  const thresholdSpent = sanitizeNonNegativeNumber(empire.unityThreshold, calculateUnityThreshold(levelBeforeUnlock));
  empire.unityPoints = Math.max(0, sanitizeNonNegativeNumber(empire.unityPoints, 0) - thresholdSpent);
  empire.unityLevel = levelBeforeUnlock + 1;

  if (empire.unityLevel >= UNITY_CONSTANTS.MAX_TIERS) {
    empire.unityThreshold = Number.MAX_SAFE_INTEGER;
    empire.unityPoints = 0;
  } else {
    empire.unityThreshold = calculateUnityThreshold(empire.unityLevel);
  }

  return effect;
}

export function processUnityAccrual(state) {
  const logger = getLogger();
  const log = [];
  const unlocks = [];

  if (!state || !Array.isArray(state.empires) || state.empires.length === 0) {
    return { log, unlocks };
  }
  if (!Array.isArray(state.unityPendingCelebrations)) {
    state.unityPendingCelebrations = [];
  }

  for (const empire of state.empires) {
    ensureEmpireUnityState(empire);
    if (empire.unityLevel >= UNITY_CONSTANTS.MAX_TIERS) {
      continue;
    }

    const gain = getEmpireUnityGainPerTurn(state, empire.id);
    if (!(gain > 0)) continue;

    empire.unityPoints = sanitizeNonNegativeNumber(empire.unityPoints, 0) + gain;

    const threshold = sanitizeNonNegativeNumber(empire.unityThreshold, calculateUnityThreshold(empire.unityLevel));
    if (empire.unityPoints < threshold) {
      continue;
    }

    const unlockedEffect = unlockNextUnityEffect(state, empire);
    if (!unlockedEffect) continue;

    const celebrationEvent = buildUnityCelebrationEvent(state, empire, unlockedEffect);
    state.unityPendingCelebrations.push(celebrationEvent);

    const message = `${empire.name} unlocked Unity Tier ${unlockedEffect.tier}: ${unlockedEffect.name}`;
    log.push(message);
    logger.info(message);

    unlocks.push({
      empireId: empire.id,
      tier: unlockedEffect.tier,
      effectId: unlockedEffect.id,
      effectName: unlockedEffect.name
    });
  }

  return { log, unlocks };
}

export function popNextUnityCelebrationEvent(state) {
  if (!state || !Array.isArray(state.unityPendingCelebrations) || state.unityPendingCelebrations.length === 0) {
    return null;
  }
  return state.unityPendingCelebrations.shift() || null;
}
