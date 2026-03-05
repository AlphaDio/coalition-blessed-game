import { ARMY_EXPERIENCE_CONSTANTS } from './constants.js';
import { clamp } from '../utils/math.js';

function sanitizeNonNegativeNumber(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback;
  }
  return normalized;
}

export function getExperienceThresholdForLevel(level = 0) {
  const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
  const threshold = ARMY_EXPERIENCE_CONSTANTS.BASE_THRESHOLD
    * Math.pow(ARMY_EXPERIENCE_CONSTANTS.THRESHOLD_GROWTH_MULTIPLIER, normalizedLevel);
  return Math.max(1, Math.round(threshold));
}

function buildSurgeForLevel(level = 0) {
  const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
  const damageMult = Math.min(
    ARMY_EXPERIENCE_CONSTANTS.SURGE_DAMAGE_MULT_CAP,
    ARMY_EXPERIENCE_CONSTANTS.SURGE_DAMAGE_MULT_BASE
      + (normalizedLevel * ARMY_EXPERIENCE_CONSTANTS.SURGE_DAMAGE_MULT_PER_LEVEL)
  );
  const killRateBonus = Math.min(
    ARMY_EXPERIENCE_CONSTANTS.SURGE_KILL_RATE_BONUS_CAP,
    ARMY_EXPERIENCE_CONSTANTS.SURGE_KILL_RATE_BONUS_BASE
      + (normalizedLevel * ARMY_EXPERIENCE_CONSTANTS.SURGE_KILL_RATE_BONUS_PER_LEVEL)
  );
  const protectionBonus = Math.min(
    ARMY_EXPERIENCE_CONSTANTS.SURGE_PROTECTION_BONUS_CAP,
    ARMY_EXPERIENCE_CONSTANTS.SURGE_PROTECTION_BONUS_BASE
      + (normalizedLevel * ARMY_EXPERIENCE_CONSTANTS.SURGE_PROTECTION_BONUS_PER_LEVEL)
  );
  const resolveBonus = Math.min(
    ARMY_EXPERIENCE_CONSTANTS.SURGE_RESOLVE_BONUS_CAP,
    ARMY_EXPERIENCE_CONSTANTS.SURGE_RESOLVE_BONUS_BASE
      + (normalizedLevel * ARMY_EXPERIENCE_CONSTANTS.SURGE_RESOLVE_BONUS_PER_LEVEL)
  );

  return {
    level: normalizedLevel,
    ticksRemaining: ARMY_EXPERIENCE_CONSTANTS.SURGE_TICKS,
    damageMult,
    killRateBonus,
    protectionBonus,
    resolveBonus
  };
}

export function ensureArmyExperience(army) {
  if (!army || typeof army !== 'object') {
    return null;
  }

  const level = Math.max(0, Math.floor(Number(army.experienceLevel) || 0));
  army.experienceLevel = level;
  army.experience = sanitizeNonNegativeNumber(army.experience, 0);

  const minimumThreshold = getExperienceThresholdForLevel(level);
  const threshold = sanitizeNonNegativeNumber(army.experienceThreshold, minimumThreshold);
  army.experienceThreshold = Math.max(minimumThreshold, Math.round(threshold));

  if (!army.experienceSurge || typeof army.experienceSurge !== 'object') {
    army.experienceSurge = null;
  } else {
    const ticksRemaining = Math.max(0, Math.floor(Number(army.experienceSurge.ticksRemaining) || 0));
    if (ticksRemaining <= 0) {
      army.experienceSurge = null;
    } else {
      army.experienceSurge = {
        level: Math.max(level, Math.floor(Number(army.experienceSurge.level) || level)),
        ticksRemaining,
        damageMult: Math.max(0, Number(army.experienceSurge.damageMult) || 0),
        killRateBonus: Math.max(0, Number(army.experienceSurge.killRateBonus) || 0),
        protectionBonus: Math.max(0, Number(army.experienceSurge.protectionBonus) || 0),
        resolveBonus: Math.max(0, Number(army.experienceSurge.resolveBonus) || 0)
      };
    }
  }

  return army;
}

export function awardArmyBattleExperience(
  army,
  {
    won = false,
    draw = false,
    participation = 1,
    intensity = 1
  } = {}
) {
  if (!army) {
    return {
      xpGain: 0,
      levelsGained: 0,
      level: 0,
      experience: 0,
      nextThreshold: getExperienceThresholdForLevel(0),
      surge: null
    };
  }

  ensureArmyExperience(army);

  const baseXP = draw
    ? ARMY_EXPERIENCE_CONSTANTS.DRAW_XP
    : (won ? ARMY_EXPERIENCE_CONSTANTS.WIN_XP : ARMY_EXPERIENCE_CONSTANTS.LOSS_XP);
  const participationFactor = clamp(
    Number.isFinite(Number(participation)) ? Number(participation) : 1,
    ARMY_EXPERIENCE_CONSTANTS.MIN_PARTICIPATION_FACTOR,
    ARMY_EXPERIENCE_CONSTANTS.MAX_PARTICIPATION_FACTOR
  );
  const intensityFactor = clamp(
    Number.isFinite(Number(intensity)) ? Number(intensity) : 1,
    ARMY_EXPERIENCE_CONSTANTS.MIN_INTENSITY_FACTOR,
    ARMY_EXPERIENCE_CONSTANTS.MAX_INTENSITY_FACTOR
  );
  const xpGain = Math.max(1, Math.round(baseXP * participationFactor * intensityFactor));
  army.experience += xpGain;

  let levelsGained = 0;
  let grantedSurge = null;
  while (army.experience >= army.experienceThreshold) {
    army.experience -= army.experienceThreshold;
    army.experienceLevel += 1;
    army.experienceThreshold = getExperienceThresholdForLevel(army.experienceLevel);
    levelsGained += 1;
    grantedSurge = buildSurgeForLevel(army.experienceLevel);
  }

  if (grantedSurge) {
    if (
      !army.experienceSurge
      || (Number(army.experienceSurge.damageMult) || 0) <= grantedSurge.damageMult
    ) {
      army.experienceSurge = grantedSurge;
    } else {
      army.experienceSurge.ticksRemaining = Math.max(
        Number(army.experienceSurge.ticksRemaining) || 0,
        ARMY_EXPERIENCE_CONSTANTS.SURGE_TICKS
      );
    }
  }

  return {
    xpGain,
    levelsGained,
    level: army.experienceLevel,
    experience: army.experience,
    nextThreshold: army.experienceThreshold,
    surge: grantedSurge
  };
}

function consumeSingleArmySurge(army) {
  if (!army) {
    return null;
  }

  ensureArmyExperience(army);
  const surge = army.experienceSurge;
  if (!surge || (surge.ticksRemaining || 0) <= 0) {
    return null;
  }

  const profile = {
    level: Math.max(0, Math.floor(Number(surge.level) || Number(army.experienceLevel) || 0)),
    damageMult: Math.max(0, Number(surge.damageMult) || 0),
    killRateBonus: Math.max(0, Number(surge.killRateBonus) || 0),
    protectionBonus: Math.max(0, Number(surge.protectionBonus) || 0),
    resolveBonus: Math.max(0, Number(surge.resolveBonus) || 0)
  };

  surge.ticksRemaining = Math.max(0, Math.floor(Number(surge.ticksRemaining) || 0) - 1);
  if (surge.ticksRemaining <= 0) {
    army.experienceSurge = null;
  }

  return profile;
}

function mergeWeightedSurges(weightedSurges) {
  if (!Array.isArray(weightedSurges) || weightedSurges.length === 0) {
    return null;
  }

  const totals = {
    weight: 0,
    level: 0,
    damageMult: 0,
    killRateBonus: 0,
    protectionBonus: 0,
    resolveBonus: 0
  };

  weightedSurges.forEach((entry) => {
    const surge = entry?.surge;
    const weight = Math.max(0, Number(entry?.weight) || 0);
    if (!surge || weight <= 0) {
      return;
    }

    totals.weight += weight;
    totals.level += (Number(surge.level) || 0) * weight;
    totals.damageMult += (Number(surge.damageMult) || 0) * weight;
    totals.killRateBonus += (Number(surge.killRateBonus) || 0) * weight;
    totals.protectionBonus += (Number(surge.protectionBonus) || 0) * weight;
    totals.resolveBonus += (Number(surge.resolveBonus) || 0) * weight;
  });

  if (totals.weight <= 0) {
    return null;
  }

  return {
    level: Math.round(totals.level / totals.weight),
    damageMult: totals.damageMult / totals.weight,
    killRateBonus: totals.killRateBonus / totals.weight,
    protectionBonus: totals.protectionBonus / totals.weight,
    resolveBonus: totals.resolveBonus / totals.weight
  };
}

export function consumeArmyExperienceSurgeForRound(army, worldState) {
  if (!army) {
    return null;
  }

  if (army.isComposite && Array.isArray(army._originalArmies) && Array.isArray(worldState?.armies)) {
    const weightedSurges = [];
    army._originalArmies.forEach((original) => {
      const sourceArmy = worldState.armies.find((candidate) => candidate.id === original?.id);
      if (!sourceArmy) {
        return;
      }

      const surge = consumeSingleArmySurge(sourceArmy);
      if (!surge) {
        return;
      }

      const weight = Math.max(
        1,
        Number.isFinite(Number(original?.originalMP))
          ? Number(original.originalMP)
          : 1
      );
      weightedSurges.push({ surge, weight });
    });

    return mergeWeightedSurges(weightedSurges);
  }

  return consumeSingleArmySurge(army);
}
