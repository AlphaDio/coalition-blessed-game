import { createModuleRegistry, getModulesByType } from '../modules/loader.js';

/**
 * Tier unlock requirements (global history-based unlocks)
 */
export const TIER_REQUIREMENTS = {
  2: 3, // Need at least 3 T1 laws enacted (ever)
  3: 4, // Need at least 4 T2 laws enacted (ever)
  4: 3  // Need at least 3 T3 laws enacted (ever)
};

function normalizeLawDefinition(moduleDoc, data) {
  const lawTags = data.law_tags ?? data.tags ?? [];
  return {
    ...data,
    description: data.description ?? moduleDoc?.module?.description ?? '',
    tier: Number.isFinite(data.tier) ? data.tier : 1,
    category: data.category ?? data.branch ?? 'general',
    law_type: data.law_type ?? data.lawType ?? 'General',
    law_tags: lawTags,
    tags: lawTags.length > 0 ? lawTags : (moduleDoc?.metadata?.tags ?? []),
    axis_vector: data.axis_vector ?? {},
    support_weights: data.support_weights ?? {},
    phase_tags: data.phase_tags ?? {},
    modifiers: data.modifiers ?? {},
    immediate_effects: data.immediate_effects ?? {}
  };
}

function loadLawDefinitions() {
  const registry = createModuleRegistry();
  const lawModules = getModulesByType(registry, 'law_definition');
  return lawModules.reduce((acc, entry) => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc?.declares?.law_definition;
    if (!data?.id) return acc;
    acc.push(normalizeLawDefinition(moduleDoc, data));
    return acc;
  }, []);
}

export const TIERED_LAW_DEFINITIONS = loadLawDefinitions();
const LAW_TIERS = Array.from(
  new Set(TIERED_LAW_DEFINITIONS.map((law) => Number.isFinite(law.tier) ? law.tier : 1))
).sort((left, right) => left - right);

function createTierCountRecord() {
  const counts = {};
  LAW_TIERS.forEach((tier) => {
    counts[tier] = 0;
  });
  return counts;
}

export function getSampleLawDefinitions() {
  return TIERED_LAW_DEFINITIONS;
}

export function countEnactedByTier(state) {
  const enactedHistory = state.enactedLawsHistory || [];
  const counts = createTierCountRecord();
  enactedHistory.forEach(lawId => {
    const law = TIERED_LAW_DEFINITIONS.find(l => l.id === lawId);
    if (law) {
      const tier = Number.isFinite(law.tier) ? law.tier : 1;
      counts[tier] = (counts[tier] || 0) + 1;
    }
  });
  return counts;
}

export function isTierUnlocked(tier, state) {
  if (tier <= 1) return true;
  if (state.lawTierUnlocks && state.lawTierUnlocks[tier]) return true;
  const counts = countEnactedByTier(state);
  const requirement = TIER_REQUIREMENTS[tier] || 0;
  const previousTier = tier - 1;
  return counts[previousTier] >= requirement;
}

export function getAvailableLaws(state) {
  const activeLawIds = Array.isArray(state.enactedLaws)
    ? state.enactedLaws
    : Object.values(state.enactedLawsByCategory || {});

  return TIERED_LAW_DEFINITIONS.filter(law => {
    if (activeLawIds.includes(law.id)) return false;
    return isTierUnlocked(law.tier, state);
  });
}

export function getLawsByCategory(category) {
  return TIERED_LAW_DEFINITIONS.filter(law => law.category === category);
}

export function getLawsByTier(tier) {
  return TIERED_LAW_DEFINITIONS.filter(law => law.tier === tier);
}

export function canStartLaw(lawId, state) {
  const law = TIERED_LAW_DEFINITIONS.find(l => l.id === lawId);
  if (!law) {
    return { canStart: false, reason: 'Law not found' };
  }

  const activeLawIds = Array.isArray(state.enactedLaws)
    ? state.enactedLaws
    : Object.values(state.enactedLawsByCategory || {});

  if (activeLawIds.includes(lawId)) {
    return { canStart: false, reason: 'Law already enacted' };
  }

  if (!isTierUnlocked(law.tier, state)) {
    const counts = countEnactedByTier(state);
    const previousTier = law.tier - 1;
    const requirement = TIER_REQUIREMENTS[law.tier];
    const current = counts[previousTier];
    return {
      canStart: false,
      reason: `Tier ${law.tier} locked (need ${requirement} T${previousTier} law, have ${current})`
    };
  }

  return { canStart: true, reason: '' };
}

export function getTierStatus(state) {
  const counts = countEnactedByTier(state);
  const tierDescriptions = {
    1: 'Foundational laws',
    2: 'Advanced laws',
    3: 'Transformative laws',
    4: 'Doctrine-defining laws'
  };

  return LAW_TIERS.map((tier) => {
    if (tier <= 1) {
      return {
        tier,
        unlocked: true,
        enacted: counts[tier] || 0,
        required: 0,
        description: tierDescriptions[tier] || `Tier ${tier} laws`
      };
    }

    const previousTier = tier - 1;
    return {
      tier,
      unlocked: isTierUnlocked(tier, state),
      enacted: counts[tier] || 0,
      required: TIER_REQUIREMENTS[tier] || 0,
      previousEnacted: counts[previousTier] || 0,
      description: tierDescriptions[tier] || `Tier ${tier} laws`
    };
  });
}

export function getBranchInfo() {
  const categories = new Map();
  TIERED_LAW_DEFINITIONS.forEach(law => {
    const category = law.category ?? 'general';
    if (!categories.has(category)) {
      categories.set(category, {
        id: category,
        name: category,
        description: ''
      });
    }
  });
  return Array.from(categories.values());
}
