/**
 * Tiered Progressive Law Definitions
 * 
 * Laws are organized in tiers (T1, T2, T3) within branches:
 * - T1: Simple, foundational laws with minimal commitment (always available)
 * - T2: More complex laws requiring 2 enacted T1 laws
 * - T3: Major laws with significant effects requiring 2 enacted T2 laws
 * 
 * Enacted laws are removed from available options.
 * Higher tier laws unlock based on total enacted laws at the previous tier.
 */

import { createLawDefinition } from './types.js';

/**
 * Tier unlock requirements
 * T2 requires this many T1 laws enacted
 * T3 requires this many T2 laws enacted
 */
export const TIER_REQUIREMENTS = {
  2: 2, // Need 2 T1 laws to unlock T2
  3: 2  // Need 2 T2 laws to unlock T3
};

/**
 * Create a tiered law definition
 * @param {string} id - Law identifier
 * @param {string} name - Law name
 * @param {number} tier - Tier level (1, 2, or 3)
 * @param {string} branch - Branch identifier (e.g., 'military', 'economic', 'rights')
 * @param {Object} axis_vector - Position on ideological axes
 * @param {Array} law_tags - Tags like "biologic", "mechanical", "hive"
 * @param {Object} support_weights - Biases like population_incentive, security_incentive
 * @param {Object} phase_tags - Event tags eligible in each phase
 * @param {Object} modifiers - Law-specific modifiers
 * @returns {Object} Tiered law definition
 */
export function createTieredLawDefinition(id, name, tier, branch, axis_vector = {}, law_tags = [], support_weights = {}, phase_tags = {}, modifiers = {}) {
  const baseDef = createLawDefinition(id, name, axis_vector, law_tags, support_weights, phase_tags, modifiers);
  return {
    ...baseDef,
    tier,
    branch
  };
}

/**
 * MILITARY BRANCH
 * Focus: Defense, conscription, warfare capabilities
 */
const MILITARY_BRANCH = [
  // T1: Ideology - Pacifist
  createTieredLawDefinition(
    'law_peace_accord_initiative',
    'Peace Accord Initiative',
    1,
    'military',
    {
      pacifist_militaristic: 0.4
    },
    ['peace', 'diplomacy'],
    {
      population_incentive: 0.1,
      security_incentive: 0.2,
      economy_incentive: 0.1
    },
    {
      DEBATE: ['peace', 'diplomacy', 'cooperation'],
      FALLOUT: ['social', 'economic'],
      VOTING: ['diplomacy', 'compromise']
    },
    {
      army_maintenance_cost_modifier: 0.9, // 10% reduction
      relations_strength_modifier: 1.075 // 7.5% relations boost
    }
  ),
  
  // T2: Professional military expansion
  createTieredLawDefinition(
    'law_professional_army',
    'Scourge Defense Readiness Act',
    2,
    'military',
    {
      pacifist_militaristic: 0.5,
      authoritarian_liberal: -0.2,
      stoicist_hedonistic: -0.2
    },
    ['military', 'professional'],
    {
      population_incentive: -0.2,
      security_incentive: 0.6,
      economy_incentive: -0.2
    },
    {
      DEBATE: ['military', 'security', 'standards'],
      FALLOUT: ['social', 'economic', 'unrest'],
      VOTING: ['security', 'compromise']
    },
    {
      army_maintenance_cost_modifier: 0.95, // 5% reduction
      relations_strength_modifier: 1.0375 // 3.75% relations boost
    }
  ),
  
  // T3: Total mobilization
  createTieredLawDefinition(
    'law_total_war',
    'Total War Mobilization',
    3,
    'military',
    {
      pacifist_militaristic: 0.9,
      stoicist_hedonistic: -0.6,
      authoritarian_liberal: -0.5
    },
    ['military', 'conscription', 'total_war'],
    {
      population_incentive: -0.5,
      security_incentive: 0.9,
      economy_incentive: -0.3
    },
    {
      DEBATE: ['military', 'security', 'emergency'],
      FALLOUT: ['social', 'unrest', 'hardship'],
      VOTING: ['security', 'emergency']
    },
    {
      army_maintenance_cost_modifier: 0.8, // 20% army cost reduction
      army_organization: 10, // +10 organization to all armies
      empire_approval: -0.5 // Slight approval drain due to sacrifices
    }
  )
];

/**
 * RIGHTS BRANCH
 * Focus: Civil liberties, citizenship, personhood
 */
const RIGHTS_BRANCH = [
  // T1: Ideology - Liberal
  createTieredLawDefinition(
    'law_liberty_framework',
    'Liberty Framework',
    1,
    'rights',
    {
      authoritarian_liberal: 0.4
    },
    ['rights', 'freedom'],
    {
      population_incentive: 0.3,
      security_incentive: -0.1,
      economy_incentive: 0.1
    },
    {
      DEBATE: ['rights', 'freedom', 'civil'],
      FALLOUT: ['social', 'cultural'],
      VOTING: ['civil', 'compromise']
    },
    {
      empire_approval: 1 // +1 approval per empire
    }
  ),
  
  // T2: AI and synthetic rights
  createTieredLawDefinition(
    'law_ai_citizenship',
    'Scourge-Era AI Citizenship Accord',
    2,
    'rights',
    {
      natural_mechanical: 0.9,
      essentialist_constructivist: 0.6,
      authoritarian_liberal: 0.3
    },
    ['mechanical', 'rights', 'ai'],
    {
      population_incentive: 0.3,
      security_incentive: -0.2,
      economy_incentive: 0.1
    },
    {
      DEBATE: ['rights', 'mechanical', 'philosophical'],
      FALLOUT: ['social', 'economic', 'unrest'],
      VOTING: ['procedural', 'compromise']
    },
    {
      empire_approval: 0.5 // +0.5 approval per empire
    }
  ),
  
  // T3: Universal personhood
  createTieredLawDefinition(
    'law_universal_personhood',
    'Universal Personhood Declaration',
    3,
    'rights',
    {
      natural_mechanical: 0.7,
      essentialist_constructivist: 0.8,
      authoritarian_liberal: 0.6
    },
    ['rights', 'universal', 'personhood'],
    {
      population_incentive: 0.5,
      security_incentive: -0.3,
      economy_incentive: 0.2
    },
    {
      DEBATE: ['rights', 'philosophical', 'transcendence'],
      FALLOUT: ['social', 'cultural', 'paradigm'],
      VOTING: ['consensus', 'historic']
    },
    {
      empire_approval: 2, // +2 approval per tick to all empires
      cohesionModifier: 1.1, // 10% cohesion recovery bonus
      relations_strength_modifier: 1.15 // 15% diplomacy bonus
    }
  )
];

/**
 * ECONOMIC BRANCH
 * Focus: Trade, markets, resource management
 */
const ECONOMIC_BRANCH = [
  // T1: Ideology - Materialistic
  createTieredLawDefinition(
    'law_prosperity_doctrine',
    'Prosperity Doctrine',
    1,
    'economic',
    {
      spiritual_materialistic: 0.4
    },
    ['economic', 'prosperity'],
    {
      population_incentive: 0.1,
      security_incentive: 0.0,
      economy_incentive: 0.4
    },
    {
      DEBATE: ['economic', 'prosperity', 'material'],
      FALLOUT: ['economic', 'social'],
      VOTING: ['economic', 'pragmatic']
    },
    {
      trade_income: 150 // +150 income per tick
    }
  ),
  
  // T2: Market integration
  createTieredLawDefinition(
    'law_market_integration',
    'Scourge Survival Trade Protocols',
    2,
    'economic',
    {
      spiritual_materialistic: 0.5,
      authoritarian_liberal: 0.2,
      stoicist_hedonistic: 0.3
    },
    ['economic', 'market', 'integration'],
    {
      population_incentive: 0.2,
      security_incentive: -0.1,
      economy_incentive: 0.6
    },
    {
      DEBATE: ['economic', 'market', 'standards'],
      FALLOUT: ['economic', 'technological'],
      VOTING: ['procedural', 'efficiency']
    },
    {
      trade_income: 75 // +75 income per tick
    }
  ),
  
  // T3: Full economic union
  createTieredLawDefinition(
    'law_economic_union',
    'Coalition Economic Union',
    3,
    'economic',
    {
      spiritual_materialistic: 0.7,
      authoritarian_liberal: 0.3,
      stoicist_hedonistic: 0.4
    },
    ['economic', 'union', 'prosperity'],
    {
      population_incentive: 0.4,
      security_incentive: 0.1,
      economy_incentive: 0.8
    },
    {
      DEBATE: ['economic', 'union', 'historic'],
      FALLOUT: ['economic', 'cultural', 'paradigm'],
      VOTING: ['consensus', 'efficiency']
    },
    {
      trade_income: 300, // +300 credits per tick
      industrial_output: 0.1, // 10% production bonus
      supply_efficiency: 0.15 // 15% supply efficiency
    }
  )
];

/**
 * GOVERNANCE BRANCH
 * Focus: Political structure, decision-making, authority
 */
const GOVERNANCE_BRANCH = [
  // T1: Ideology - Stoicist
  createTieredLawDefinition(
    'law_discipline_directive',
    'Discipline Directive',
    1,
    'governance',
    {
      stoicist_hedonistic: -0.4
    },
    ['discipline', 'sacrifice'],
    {
      population_incentive: -0.1,
      security_incentive: 0.3,
      economy_incentive: 0.0
    },
    {
      DEBATE: ['discipline', 'sacrifice', 'unity'],
      FALLOUT: ['social', 'economic'],
      VOTING: ['unity', 'sacrifice']
    },
    {
      cohesionModifier: 1.05 // 5% faster cohesion recovery
    }
  ),
  
  // T2: Digital systems
  createTieredLawDefinition(
    'law_digital_governance',
    'Scourge Crisis Command Network',
    2,
    'governance',
    {
      natural_mechanical: 0.6,
      spiritual_materialistic: 0.5,
      authoritarian_liberal: 0.2
    },
    ['governance', 'digital', 'efficiency'],
    {
      population_incentive: 0.2,
      security_incentive: 0.1,
      economy_incentive: 0.4
    },
    {
      DEBATE: ['efficiency', 'mechanical', 'governance'],
      FALLOUT: ['technological', 'social'],
      VOTING: ['procedural', 'efficiency']
    },
    {
      tick_delay_multiplier: 0.7, // Faster resolution
      cohesionModifier: 1.025 // 2.5% faster cohesion recovery
    }
  ),
  
  // T3: Unified council
  createTieredLawDefinition(
    'law_unified_council',
    'Unified Coalition Council',
    3,
    'governance',
    {
      authoritarian_liberal: -0.2,
      essentialist_constructivist: 0.3,
      spiritual_materialistic: 0.4
    },
    ['governance', 'unified', 'authority'],
    {
      population_incentive: 0.3,
      security_incentive: 0.3,
      economy_incentive: 0.3
    },
    {
      DEBATE: ['governance', 'unity', 'historic'],
      FALLOUT: ['political', 'paradigm'],
      VOTING: ['consensus', 'historic']
    },
    {
      tick_delay_multiplier: 0.5, // 50% faster law resolution
      cohesionModifier: 1.15, // 15% cohesion recovery
      relations_strength_modifier: 1.2, // 20% diplomacy bonus
      empire_approval: 1 // +1 approval per tick
    }
  )
];

/**
 * BIOLOGIC BRANCH
 * Focus: Genetic enhancement, hive integration, organic systems
 */
const BIOLOGIC_BRANCH = [
  // T1: Ideology - Constructivist
  createTieredLawDefinition(
    'law_identity_evolution_charter',
    'Identity Evolution Charter',
    1,
    'biologic',
    {
      essentialist_constructivist: 0.4
    },
    ['evolution', 'adaptation'],
    {
      population_incentive: 0.2,
      security_incentive: 0.1,
      economy_incentive: 0.1
    },
    {
      DEBATE: ['evolution', 'adaptation', 'identity'],
      FALLOUT: ['social', 'cultural'],
      VOTING: ['progressive', 'adaptive']
    },
    {
      population_growth: 2.5 // +2.5 population growth per tick
    }
  ),
  
  // T2: Enhancement programs
  createTieredLawDefinition(
    'law_genetic_enhancement',
    'Scourge Adaptation Genetic Initiative',
    2,
    'biologic',
    {
      natural_mechanical: -0.3,
      essentialist_constructivist: 0.7,
      spiritual_materialistic: 0.4
    },
    ['biologic', 'enhancement', 'scientific'],
    {
      population_incentive: 0.4,
      security_incentive: 0.3,
      economy_incentive: -0.2
    },
    {
      DEBATE: ['scientific', 'biologic', 'philosophical'],
      FALLOUT: ['social', 'ethical', 'cultural'],
      VOTING: ['procedural', 'compromise']
    },
    {
      population_growth: 1.25 // +1.25 population growth per tick
    }
  ),
  
  // T2: Biomass cultivation mandate
  createTieredLawDefinition(
    'law_biomass_cultivation',
    'Galactic Biomass Cultivation Mandate',
    2,
    'biologic',
    {
      natural_mechanical: -0.8, // Strongly favored by biologicals, disfavored by synthetics
      essentialist_constructivist: 0.4,
      spiritual_materialistic: -0.3 // Slightly spiritual/organic focus
    },
    ['biologic', 'production', 'hive', 'organic'],
    {
      population_incentive: 0.5, // Benefits large organic populations
      security_incentive: 0.2,
      economy_incentive: 0.6 // Strong economic benefit
    },
    {
      DEBATE: ['economic', 'biologic', 'production'],
      FALLOUT: ['economic', 'environmental', 'cultural'],
      VOTING: ['economic', 'compromise']
    },
    {
      population_growth: 5, // +5 population growth per tick
      industrial_output: 0.05 // 5% production bonus for organic goods
    }
  ),
  
  // T3: Hive integration
  createTieredLawDefinition(
    'law_hive_integration',
    'Hive-Mind Integration Protocol',
    3,
    'biologic',
    {
      essentialist_constructivist: -0.7,
      authoritarian_liberal: -0.6,
      natural_mechanical: -0.3
    },
    ['hive', 'biologic', 'collective'],
    {
      population_incentive: 0.2,
      security_incentive: 0.4,
      economy_incentive: 0.3
    },
    {
      DEBATE: ['hive', 'collective', 'philosophical'],
      FALLOUT: ['social', 'unrest', 'cultural'],
      VOTING: ['procedural', 'security']
    },
    {
      cohesionModifier: 1.2, // 20% cohesion recovery (hive unity)
      army_organization: 15, // +15 army organization (collective coordination)
      population_growth: 10, // +10 population growth (hive reproduction)
      empire_approval: -1 // -1 approval (loss of individuality concerns)
    }
  )
];

/**
 * EMERGENCY BRANCH
 * Focus: Crisis response, rationing, emergency powers
 */
const EMERGENCY_BRANCH = [
  // T1: Ideology - Mechanical
  createTieredLawDefinition(
    'law_synthetic_integration_act',
    'Synthetic Integration Act',
    1,
    'emergency',
    {
      natural_mechanical: 0.4
    },
    ['synthetic', 'technology'],
    {
      population_incentive: 0.1,
      security_incentive: 0.2,
      economy_incentive: 0.2
    },
    {
      DEBATE: ['technology', 'synthetic', 'progress'],
      FALLOUT: ['social', 'technological'],
      VOTING: ['progressive', 'efficiency']
    },
    {
      industrial_output: 0.075 // 7.5% production efficiency
    }
  ),
  
  // T2: Rationing
  createTieredLawDefinition(
    'law_resource_rationing',
    'Emergency Resource Rationing',
    2,
    'emergency',
    {
      stoicist_hedonistic: -0.6,
      authoritarian_liberal: -0.4
    },
    ['economic', 'emergency', 'rationing'],
    {
      population_incentive: -0.3,
      security_incentive: 0.5,
      economy_incentive: 0.7
    },
    {
      DEBATE: ['economic', 'emergency', 'security'],
      FALLOUT: ['economic', 'unrest', 'hardship'],
      VOTING: ['emergency', 'compromise']
    },
    {
      supply_efficiency: 0.2, // 20% supply efficiency
      trade_income: -50, // -50 credits per tick (rationing costs)
      empire_approval: -0.25 // Slight approval drain
    }
  ),
  
  // T3: Emergency powers
  createTieredLawDefinition(
    'law_emergency_powers',
    'Coalition Emergency Powers',
    3,
    'emergency',
    {
      stoicist_hedonistic: -0.7,
      authoritarian_liberal: -0.8
    },
    ['emergency', 'authority', 'crisis'],
    {
      population_incentive: -0.4,
      security_incentive: 0.8,
      economy_incentive: 0.5
    },
    {
      DEBATE: ['emergency', 'authority', 'security'],
      FALLOUT: ['political', 'unrest', 'hardship'],
      VOTING: ['emergency', 'security']
    },
    {
      tick_delay_multiplier: 0.4, // 60% faster law resolution
      army_maintenance_cost_modifier: 0.7, // 30% army cost reduction
      industrial_output: 0.15, // 15% production bonus
      supply_efficiency: 0.25, // 25% supply efficiency
      empire_approval: -1, // -1 approval per tick (authoritarian measures)
      cohesionModifier: 0.95 // 5% cohesion penalty (internal tensions)
    }
  )
];

/**
 * All tiered law definitions
 */
export const TIERED_LAW_DEFINITIONS = [
  ...MILITARY_BRANCH,
  ...RIGHTS_BRANCH,
  ...ECONOMIC_BRANCH,
  ...GOVERNANCE_BRANCH,
  ...BIOLOGIC_BRANCH,
  ...EMERGENCY_BRANCH
];

/**
 * Get all law definitions (for compatibility)
 */
export function getSampleLawDefinitions() {
  return TIERED_LAW_DEFINITIONS;
}

/**
 * Count enacted laws by tier
 * @param {Object} state - Game state with enactedLaws array
 * @returns {Object} { 1: count, 2: count, 3: count }
 */
export function countEnactedByTier(state) {
  const enactedLawIds = state.enactedLaws || [];
  const counts = { 1: 0, 2: 0, 3: 0 };
  
  enactedLawIds.forEach(lawId => {
    const law = TIERED_LAW_DEFINITIONS.find(l => l.id === lawId);
    if (law) {
      counts[law.tier]++;
    }
  });
  
  return counts;
}

/**
 * Check if a tier is unlocked based on enacted laws
 * @param {number} tier - Tier to check (2 or 3)
 * @param {Object} state - Game state
 * @returns {boolean} True if tier is unlocked
 */
export function isTierUnlocked(tier, state) {
  if (tier === 1) return true; // T1 always available
  
  const counts = countEnactedByTier(state);
  const requirement = TIER_REQUIREMENTS[tier] || 0;
  const previousTier = tier - 1;
  
  return counts[previousTier] >= requirement;
}

/**
 * Get available laws (unenacted laws with tier requirements met)
 * @param {Object} state - Game state with enactedLaws array
 * @returns {Array} Available law definitions
 */
export function getAvailableLaws(state) {
  const enactedLawIds = state.enactedLaws || [];
  
  return TIERED_LAW_DEFINITIONS.filter(law => {
    // Already enacted - not available
    if (enactedLawIds.includes(law.id)) {
      return false;
    }
    
    // Check tier is unlocked
    return isTierUnlocked(law.tier, state);
  });
}

/**
 * Get laws by branch
 * @param {string} branch - Branch identifier
 * @returns {Array} Laws in that branch
 */
export function getLawsByBranch(branch) {
  return TIERED_LAW_DEFINITIONS.filter(law => law.branch === branch);
}

/**
 * Get laws by tier
 * @param {number} tier - Tier level (1, 2, or 3)
 * @returns {Array} Laws at that tier
 */
export function getLawsByTier(tier) {
  return TIERED_LAW_DEFINITIONS.filter(law => law.tier === tier);
}

/**
 * Check if a law can be started (tier unlocked, not enacted)
 * @param {string} lawId - Law ID to check
 * @param {Object} state - Game state
 * @returns {Object} { canStart: boolean, reason: string }
 */
export function canStartLaw(lawId, state) {
  const law = TIERED_LAW_DEFINITIONS.find(l => l.id === lawId);
  
  if (!law) {
    return { canStart: false, reason: 'Law not found' };
  }
  
  const enactedLawIds = state.enactedLaws || [];
  
  // Already enacted
  if (enactedLawIds.includes(lawId)) {
    return { canStart: false, reason: 'Law already enacted' };
  }
  
  // Check tier is unlocked
  if (!isTierUnlocked(law.tier, state)) {
    const counts = countEnactedByTier(state);
    const previousTier = law.tier - 1;
    const requirement = TIER_REQUIREMENTS[law.tier];
    const current = counts[previousTier];
    
    return { 
      canStart: false, 
      reason: `Tier ${law.tier} locked (need ${requirement} T${previousTier} laws, have ${current})` 
    };
  }
  
  return { canStart: true, reason: '' };
}

/**
 * Get tier unlock status for display
 * @param {Object} state - Game state
 * @returns {Array} Tier status info
 */
export function getTierStatus(state) {
  const counts = countEnactedByTier(state);
  
  return [
    { 
      tier: 1, 
      unlocked: true, 
      enacted: counts[1],
      required: 0,
      description: 'Foundational laws'
    },
    { 
      tier: 2, 
      unlocked: isTierUnlocked(2, state), 
      enacted: counts[2],
      required: TIER_REQUIREMENTS[2],
      previousEnacted: counts[1],
      description: 'Advanced legislation'
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

/**
 * Get branch display info
 * @returns {Array} Branch metadata
 */
export function getBranchInfo() {
  return [
    { id: 'military', name: 'Military', description: 'Defense and warfare capabilities' },
    { id: 'rights', name: 'Rights', description: 'Civil liberties and personhood' },
    { id: 'economic', name: 'Economic', description: 'Trade and market systems' },
    { id: 'governance', name: 'Governance', description: 'Political structure and authority' },
    { id: 'biologic', name: 'Biologic', description: 'Genetic and organic enhancements' },
    { id: 'emergency', name: 'Emergency', description: 'Crisis response and powers' }
  ];
}
