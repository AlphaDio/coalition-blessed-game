import { UNITY_CONSTANTS } from './constants.js';
import { clampApproval, clampStat } from './cohesion.js';
import { getLogger } from '../modules/logger.js';
import { getUnityEffectForEmpire } from './unityDefinitions.js';

function sanitizeNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
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
  if (!state?.improvements || !Array.isArray(state.improvements.queue)) {
    return 0;
  }

  let baseGain = 0;
  for (const improvement of state.improvements.queue) {
    if (!improvement || improvement.state !== 'ACTIVE' || improvement.empireId !== empireId) continue;
    const output = Number(improvement.unityOutput);
    if (Number.isFinite(output) && output > 0) {
      baseGain += output;
    }
  }

  const empire = (state.empires || []).find(candidate => candidate.id === empireId);
  if (!empire) return Math.max(0, baseGain);

  const unityMods = empire.unityModifiers || {};
  const gainAdd = Number(unityMods.unity_gain_add) || 0;
  const gainMult = Math.max(0, 1 + (Number(unityMods.unity_gain_mult) || 0));

  return Math.max(0, (baseGain * gainMult) + gainAdd);
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
