/**
 * Tiered Law Definitions (Categories)
 *
 * Categories:
 * - Economy
 * - Military
 * - Gouvernance
 *
 * Each category has 3 law types, each with T1/T2/T3 variants.
 * Tier unlocks are global (any enacted law of previous tier).
 * Only one law per category can be active at a time (replacement).
 */

import { createLawDefinition } from './types.js';

export const LAW_CATEGORIES = [
  { id: 'economy', name: 'Economy', description: 'Markets, industry, and fiscal policy.' },
  { id: 'military', name: 'Military', description: 'Readiness, logistics, and force posture.' },
  { id: 'governance', name: 'Gouvernance', description: 'Political structure and cohesion.' }
];

/**
 * Tier unlock requirements (global history-based unlocks)
 */
export const TIER_REQUIREMENTS = {
  2: 1, // Need at least 1 T1 law enacted (ever)
  3: 1  // Need at least 1 T2 law enacted (ever)
};

export function createTieredLawDefinition(
  id,
  name,
  tier,
  category,
  lawType,
  axis_vector = {},
  law_tags = [],
  support_weights = {},
  phase_tags = {},
  modifiers = {},
  immediate_effects = {}
) {
  const baseDef = createLawDefinition(id, name, axis_vector, law_tags, support_weights, phase_tags, modifiers);
  return {
    ...baseDef,
    tier,
    category,
    law_type: lawType,
    immediate_effects
  };
}

const ECONOMY_LAWS = [
  // Market Track
  createTieredLawDefinition(
    'law_market_open_1',
    'Open Markets Act',
    1,
    'economy',
    'Market',
    { spiritual_materialistic: 0.4, authoritarian_liberal: 0.1 },
    ['market', 'trade'],
    { economy_incentive: 0.5 },
    { DEBATE: ['market', 'trade'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { trade_income: 150, supply_efficiency: 0.05 },
    { coalition_credits: 1500, requisition: 200, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_market_open_2',
    'Unified Exchange Protocol',
    2,
    'economy',
    'Market',
    { spiritual_materialistic: 0.6, authoritarian_liberal: 0.3 },
    ['market', 'trade'],
    { economy_incentive: 0.6 },
    { DEBATE: ['market', 'trade'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { trade_income: 300, supply_efficiency: 0.10 },
    { coalition_credits: 3000, requisition: 400, cohesion: 3 }
  ),
  createTieredLawDefinition(
    'law_market_open_3',
    'Galactic Market Mandate',
    3,
    'economy',
    'Market',
    { spiritual_materialistic: 0.8, authoritarian_liberal: 0.5 },
    ['market', 'trade'],
    { economy_incentive: 0.8 },
    { DEBATE: ['market', 'trade'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { trade_income: 600, supply_efficiency: 0.20 },
    { coalition_credits: 6000, requisition: 800, cohesion: 4 }
  ),

  // Industrial Track
  createTieredLawDefinition(
    'law_industry_drive_1',
    'Industrial Mobilization',
    1,
    'economy',
    'Industry',
    { natural_mechanical: 0.3, spiritual_materialistic: 0.5 },
    ['industry', 'production'],
    { economy_incentive: 0.6, security_incentive: 0.1 },
    { DEBATE: ['industry', 'production'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { industrial_output: 0.10, empire_production_multiplier: 0.05 },
    { coalition_credits: 1200, requisition: 250, cohesion: 1 }
  ),
  createTieredLawDefinition(
    'law_industry_drive_2',
    'Total Output Directive',
    2,
    'economy',
    'Industry',
    { natural_mechanical: 0.5, spiritual_materialistic: 0.6 },
    ['industry', 'production'],
    { economy_incentive: 0.7, security_incentive: 0.2 },
    { DEBATE: ['industry', 'production'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { industrial_output: 0.20, empire_production_multiplier: 0.10 },
    { coalition_credits: 2500, requisition: 500, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_industry_drive_3',
    'Forge-World Acceleration',
    3,
    'economy',
    'Industry',
    { natural_mechanical: 0.7, spiritual_materialistic: 0.7 },
    ['industry', 'production'],
    { economy_incentive: 0.9, security_incentive: 0.3 },
    { DEBATE: ['industry', 'production'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { industrial_output: 0.35, empire_production_multiplier: 0.15 },
    { coalition_credits: 5000, requisition: 900, cohesion: 3 }
  ),

  // Fiscal Track
  createTieredLawDefinition(
    'law_fiscal_stimulus_1',
    'Fiscal Stabilization Act',
    1,
    'economy',
    'Fiscal',
    { authoritarian_liberal: 0.2, stoicist_hedonistic: 0.2 },
    ['fiscal', 'stability'],
    { economy_incentive: 0.4 },
    { DEBATE: ['fiscal', 'stability'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { trade_income: 100, empire_approval: 0.5 },
    { coalition_credits: 1500, requisition: 150, cohesion: 2, empire_approval: 1 }
  ),
  createTieredLawDefinition(
    'law_fiscal_stimulus_2',
    'Coalition Credit Injection',
    2,
    'economy',
    'Fiscal',
    { authoritarian_liberal: 0.3, stoicist_hedonistic: 0.3 },
    ['fiscal', 'stability'],
    { economy_incentive: 0.6 },
    { DEBATE: ['fiscal', 'stability'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { trade_income: 200, empire_approval: 1 },
    { coalition_credits: 3000, requisition: 300, cohesion: 3, empire_approval: 2 }
  ),
  createTieredLawDefinition(
    'law_fiscal_stimulus_3',
    'Unified Treasury Mandate',
    3,
    'economy',
    'Fiscal',
    { authoritarian_liberal: 0.4, stoicist_hedonistic: 0.4 },
    ['fiscal', 'stability'],
    { economy_incentive: 0.8 },
    { DEBATE: ['fiscal', 'stability'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { trade_income: 350, empire_approval: 1.5 },
    { coalition_credits: 6000, requisition: 600, cohesion: 4, empire_approval: 3 }
  ),

  // Taxation Track - Increases coalition's share of empire consumption for requisition
  createTieredLawDefinition(
    'law_taxation_1',
    'War Contribution Levy',
    1,
    'economy',
    'Taxation',
    { authoritarian_liberal: -0.3, stoicist_hedonistic: -0.2, pacifist_militaristic: 0.3 },
    ['taxation', 'requisition', 'war'],
    { economy_incentive: 0.3, security_incentive: 0.4 },
    { DEBATE: ['taxation', 'war'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { consumptionShareMultiplier: 1.25, empire_approval: -0.3 },  // 10% -> 12.5% consumption share
    { requisition: 200, cohesion: 1 }
  ),
  createTieredLawDefinition(
    'law_taxation_2',
    'Coalition Revenue Act',
    2,
    'economy',
    'Taxation',
    { authoritarian_liberal: -0.5, stoicist_hedonistic: -0.3, pacifist_militaristic: 0.4 },
    ['taxation', 'requisition', 'war'],
    { economy_incentive: 0.4, security_incentive: 0.5 },
    { DEBATE: ['taxation', 'war'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { consumptionShareMultiplier: 1.5, empire_approval: -0.5 },   // 10% -> 15% consumption share
    { requisition: 400, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_taxation_3',
    'Total War Tithe',
    3,
    'economy',
    'Taxation',
    { authoritarian_liberal: -0.7, stoicist_hedonistic: -0.4, pacifist_militaristic: 0.6 },
    ['taxation', 'requisition', 'war'],
    { economy_incentive: 0.5, security_incentive: 0.7 },
    { DEBATE: ['taxation', 'war'], FALLOUT: ['economic'], VOTING: ['economic'] },
    { consumptionShareMultiplier: 2.0, empire_approval: -1.0 },   // 10% -> 20% consumption share (doubled)
    { requisition: 800, cohesion: 3 }
  )
];

const MILITARY_LAWS = [
  // Readiness Track
  createTieredLawDefinition(
    'law_readiness_1',
    'Rapid Response Charter',
    1,
    'military',
    'Readiness',
    { pacifist_militaristic: 0.5, stoicist_hedonistic: -0.2 },
    ['military', 'readiness'],
    { security_incentive: 0.6 },
    { DEBATE: ['security', 'military'], FALLOUT: ['security'], VOTING: ['security'] },
    { army_maintenance_cost_modifier: 0.9, cohesionModifier: 1.02 },
    { requisition: 300, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_readiness_2',
    'Fleet Readiness Mandate',
    2,
    'military',
    'Readiness',
    { pacifist_militaristic: 0.7, stoicist_hedonistic: -0.3 },
    ['military', 'readiness'],
    { security_incentive: 0.8 },
    { DEBATE: ['security', 'military'], FALLOUT: ['security'], VOTING: ['security'] },
    { army_maintenance_cost_modifier: 0.8, cohesionModifier: 1.05, supply_efficiency: 0.05 },
    { requisition: 600, cohesion: 3 }
  ),
  createTieredLawDefinition(
    'law_readiness_3',
    'Total Mobilization Protocol',
    3,
    'military',
    'Readiness',
    { pacifist_militaristic: 0.9, stoicist_hedonistic: -0.4 },
    ['military', 'readiness'],
    { security_incentive: 0.9 },
    { DEBATE: ['security', 'military'], FALLOUT: ['security'], VOTING: ['security'] },
    { army_maintenance_cost_modifier: 0.7, cohesionModifier: 1.08, supply_efficiency: 0.10 },
    { requisition: 1000, cohesion: 4 }
  ),

  // Conscription Track
  createTieredLawDefinition(
    'law_conscription_1',
    'Selective Service Act',
    1,
    'military',
    'Conscription',
    { pacifist_militaristic: 0.6, authoritarian_liberal: -0.2 },
    ['military', 'conscription'],
    { security_incentive: 0.7 },
    { DEBATE: ['security', 'military'], FALLOUT: ['social'], VOTING: ['security'] },
    { supply_efficiency: 0.05, empire_approval: -0.5 },
    { requisition: 400, cohesion: 1 }
  ),
  createTieredLawDefinition(
    'law_conscription_2',
    'Emergency Draft Order',
    2,
    'military',
    'Conscription',
    { pacifist_militaristic: 0.8, authoritarian_liberal: -0.4 },
    ['military', 'conscription'],
    { security_incentive: 0.8 },
    { DEBATE: ['security', 'military'], FALLOUT: ['social'], VOTING: ['security'] },
    { supply_efficiency: 0.10, empire_approval: -1 },
    { requisition: 800, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_conscription_3',
    'War Levy Mandate',
    3,
    'military',
    'Conscription',
    { pacifist_militaristic: 0.9, authoritarian_liberal: -0.6 },
    ['military', 'conscription'],
    { security_incentive: 0.9 },
    { DEBATE: ['security', 'military'], FALLOUT: ['social'], VOTING: ['security'] },
    { supply_efficiency: 0.15, empire_approval: -1.5 },
    { requisition: 1200, cohesion: 3 }
  ),

  // Intelligence Track
  createTieredLawDefinition(
    'law_intel_1',
    'Strategic Recon Bureau',
    1,
    'military',
    'Intelligence',
    { natural_mechanical: 0.3, essentialist_constructivist: 0.2 },
    ['military', 'intel'],
    { security_incentive: 0.5, economy_incentive: 0.2 },
    { DEBATE: ['security', 'intel'], FALLOUT: ['security'], VOTING: ['security'] },
    { relations_strength_modifier: 1.05, research_speed: 0.05 },
    { cohesion: 2, coalition_credits: 1000 }
  ),
  createTieredLawDefinition(
    'law_intel_2',
    'Coalition Intelligence Grid',
    2,
    'military',
    'Intelligence',
    { natural_mechanical: 0.5, essentialist_constructivist: 0.3 },
    ['military', 'intel'],
    { security_incentive: 0.7, economy_incentive: 0.2 },
    { DEBATE: ['security', 'intel'], FALLOUT: ['security'], VOTING: ['security'] },
    { relations_strength_modifier: 1.10, research_speed: 0.10 },
    { cohesion: 3, coalition_credits: 2000 }
  ),
  createTieredLawDefinition(
    'law_intel_3',
    'Total Surveillance Accord',
    3,
    'military',
    'Intelligence',
    { natural_mechanical: 0.7, essentialist_constructivist: 0.4 },
    ['military', 'intel'],
    { security_incentive: 0.9, economy_incentive: 0.2 },
    { DEBATE: ['security', 'intel'], FALLOUT: ['security'], VOTING: ['security'] },
    { relations_strength_modifier: 1.15, research_speed: 0.15 },
    { cohesion: 4, coalition_credits: 3500 }
  )
];

const GOVERNANCE_LAWS = [
  // Unity Track
  createTieredLawDefinition(
    'law_unity_1',
    'Unity Charter',
    1,
    'governance',
    'Unity',
    { stoicist_hedonistic: -0.3, authoritarian_liberal: -0.1 },
    ['governance', 'unity'],
    { population_incentive: 0.4 },
    { DEBATE: ['governance', 'unity'], FALLOUT: ['social'], VOTING: ['governance'] },
    { cohesionModifier: 1.08, empire_approval: 0.5 },
    { cohesion: 3, empire_approval: 1 }
  ),
  createTieredLawDefinition(
    'law_unity_2',
    'Coalition Solidarity Act',
    2,
    'governance',
    'Unity',
    { stoicist_hedonistic: -0.4, authoritarian_liberal: -0.2 },
    ['governance', 'unity'],
    { population_incentive: 0.5 },
    { DEBATE: ['governance', 'unity'], FALLOUT: ['social'], VOTING: ['governance'] },
    { cohesionModifier: 1.15, empire_approval: 1 },
    { cohesion: 4, empire_approval: 2 }
  ),
  createTieredLawDefinition(
    'law_unity_3',
    'Singular Council Doctrine',
    3,
    'governance',
    'Unity',
    { stoicist_hedonistic: -0.5, authoritarian_liberal: -0.3 },
    ['governance', 'unity'],
    { population_incentive: 0.6 },
    { DEBATE: ['governance', 'unity'], FALLOUT: ['social'], VOTING: ['governance'] },
    { cohesionModifier: 1.25, empire_approval: 2 },
    { cohesion: 6, empire_approval: 3 }
  ),

  // Delegation Track
  createTieredLawDefinition(
    'law_delegation_1',
    'Delegated Authority Pact',
    1,
    'governance',
    'Delegation',
    { authoritarian_liberal: 0.4 },
    ['governance', 'diplomacy'],
    { population_incentive: 0.2, economy_incentive: 0.2 },
    { DEBATE: ['governance', 'diplomacy'], FALLOUT: ['political'], VOTING: ['governance'] },
    { relations_strength_modifier: 1.05, trade_income: 50 },
    { coalition_credits: 1000, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_delegation_2',
    'Sector Delegation Accord',
    2,
    'governance',
    'Delegation',
    { authoritarian_liberal: 0.5 },
    ['governance', 'diplomacy'],
    { population_incentive: 0.3, economy_incentive: 0.3 },
    { DEBATE: ['governance', 'diplomacy'], FALLOUT: ['political'], VOTING: ['governance'] },
    { relations_strength_modifier: 1.10, trade_income: 100 },
    { coalition_credits: 2000, cohesion: 3 }
  ),
  createTieredLawDefinition(
    'law_delegation_3',
    'Federated Authority Treaty',
    3,
    'governance',
    'Delegation',
    { authoritarian_liberal: 0.6 },
    ['governance', 'diplomacy'],
    { population_incentive: 0.4, economy_incentive: 0.4 },
    { DEBATE: ['governance', 'diplomacy'], FALLOUT: ['political'], VOTING: ['governance'] },
    { relations_strength_modifier: 1.20, trade_income: 150 },
    { coalition_credits: 3500, cohesion: 4 }
  ),

  // Bureaucracy Track
  createTieredLawDefinition(
    'law_bureaucracy_1',
    'Administrative Standardization',
    1,
    'governance',
    'Bureaucracy',
    { natural_mechanical: 0.3, spiritual_materialistic: 0.2 },
    ['governance', 'efficiency'],
    { economy_incentive: 0.3 },
    { DEBATE: ['governance', 'efficiency'], FALLOUT: ['political'], VOTING: ['governance'] },
    { research_speed: 0.08, supply_efficiency: 0.05 },
    { influence: 20, cohesion: 2 }
  ),
  createTieredLawDefinition(
    'law_bureaucracy_2',
    'Central Coordination Office',
    2,
    'governance',
    'Bureaucracy',
    { natural_mechanical: 0.5, spiritual_materialistic: 0.3 },
    ['governance', 'efficiency'],
    { economy_incentive: 0.4 },
    { DEBATE: ['governance', 'efficiency'], FALLOUT: ['political'], VOTING: ['governance'] },
    { research_speed: 0.16, supply_efficiency: 0.10 },
    { influence: 40, cohesion: 3 }
  ),
  createTieredLawDefinition(
    'law_bureaucracy_3',
    'Unified Administrative Grid',
    3,
    'governance',
    'Bureaucracy',
    { natural_mechanical: 0.7, spiritual_materialistic: 0.4 },
    ['governance', 'efficiency'],
    { economy_incentive: 0.5 },
    { DEBATE: ['governance', 'efficiency'], FALLOUT: ['political'], VOTING: ['governance'] },
    { research_speed: 0.25, supply_efficiency: 0.15 },
    { influence: 60, cohesion: 4 }
  )
];

export const TIERED_LAW_DEFINITIONS = [
  ...ECONOMY_LAWS,
  ...MILITARY_LAWS,
  ...GOVERNANCE_LAWS
];

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
  if (tier === 1) return true;
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
  return LAW_CATEGORIES.map(category => ({
    id: category.id,
    name: category.name,
    description: category.description
  }));
}
