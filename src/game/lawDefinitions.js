import { createModuleRegistry, getModulesByType } from '../modules/loader.js';

/**
 * Tier unlock requirements (global history-based unlocks)
 */
export const TIER_REQUIREMENTS = {
  2: 1, // Need at least 1 T1 law enacted (ever)
  3: 1  // Need at least 1 T2 law enacted (ever)
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

export function getSampleLawDefinitions() {
  return TIERED_LAW_DEFINITIONS;
}

export function countEnactedByTier(state) {
  const enactedHistory = state.enactedLawsHistory || [];
  const counts = { 1: 0, 2: 0, 3: 0 };
  enactedHistory.forEach(lawId => {
    const law = TIERED_LAW_DEFINITIONS.find(l => l.id === lawId);
    if (law) {
      counts[law.tier]++;
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
  return [
    { tier: 1, unlocked: true, enacted: counts[1], required: 0, description: 'Foundational laws' },
    {
      tier: 2,
      unlocked: isTierUnlocked(2, state),
      enacted: counts[2],
      required: TIER_REQUIREMENTS[2],
      previousEnacted: counts[1],
      description: 'Advanced laws'
    },
    {
      tier: 3,
      unlocked: isTierUnlocked(3, state),
      enacted: counts[3],
      required: TIER_REQUIREMENTS[3],
      previousEnacted: counts[2],
      description: 'Transformative laws'
    }
  ];
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
