// Technology definitions - pool of available technologies
import { createTechnology } from './types.js';

/**
 * Technology Pool
 * 
 * Categories:
 * - general: Available to all empires, no special requirements
 * - aligned: Requires specific value axis alignment
 * - unique: Requires specific empire tags
 */

// ============================================
// GENERAL TECHNOLOGIES (no requirements)
// ============================================

export const GENERAL_TECHS = [
  createTechnology(
    'power_armor',
    'Power Armor',
    'Enhanced armor technology boosts army effectiveness.',
    'general',
    {},
    { credits: 80 },
    { army_organization: 2.5, army_damage_add: 0.03, army_replenishment_mult: 0.05, supply_efficiency: 0.03 }
  ),

  createTechnology(
    'fusion_power',
    'Fusion Power',
    'Clean, abundant energy source increases industrial output.',
    'general',
    {},
    { stability: 2 },
    { industrial_output: 0.06, trade_income: 30 }
  ),

  createTechnology(
    'neural_links',
    'Neural Links',
    'Direct brain-computer interfaces accelerate research.',
    'general',
    {},
    { approval: 3 },
    { research_speed: 0.08, army_organization: 1.5 }
  ),

  createTechnology(
    'hyperdrive',
    'Hyperdrive Technology',
    'Faster-than-light travel improves logistics and trade.',
    'general',
    {},
    { cohesion: 2 },
    { supply_efficiency: 0.06, market_efficiency: 0.04 }
  ),

  createTechnology(
    'cloning',
    'Cloning Technology',
    'Population growth through artificial reproduction.',
    'general',
    {},
    { stability: 2 },
    { population_growth: 0.0004, empire_approval: 2 }
  ),

  createTechnology(
    'ai_assistants',
    'AI Assistants',
    'Intelligent systems boost research and administration.',
    'general',
    {},
    { approval: 2 },
    { research_speed: 0.06, law_progress_speed: 0.04 }
  )
];

// ============================================
// ALIGNED TECHNOLOGIES (require value axis alignment)
// ============================================

export const ALIGNED_TECHS = [
  // Mechanical-aligned (natural_mechanical > 0.3)
  createTechnology(
    'cybernetics',
    'Cybernetics',
    'Machine enhancements dramatically boost army and research capabilities.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { approval: 4 },
    { army_organization: 4, research_speed: 0.09, army_damage_add: 0.06, army_consumption_mp_gain_mult: 0.08 }
  ),

  createTechnology(
    'automation',
    'Total Automation',
    'Machines handle all production, greatly increasing output.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { stability: 3 },
    { industrial_output: 0.10, population_growth: -0.0003 }
  ),

  // Natural-aligned (natural_mechanical < -0.3)
  createTechnology(
    'eco_harmony',
    'Ecological Harmony',
    'Living in balance with nature accelerates population and resource growth.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { stability: 5 },
    { population_growth: 0.0007, empire_approval: 4 }
  ),

  createTechnology(
    'bio_engineering',
    'Bio-Engineering',
    'Genetic modifications enhance population growth and happiness.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { approval: 6 },
    { population_growth: 0.0006, supply_efficiency: 0.06 }
  ),

  // Militaristic-aligned (pacifist_militaristic > 0.3)
  createTechnology(
    'elite_training',
    'Elite Military Training',
    'Advanced tactics and training create superior fighting forces.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { approval: 3 },
    { army_organization: 5, supply_efficiency: 0.05, army_damage_mult: 0.06, army_replenishment_mult: 0.08 }
  ),

  createTechnology(
    'orbital_weapons',
    'Orbital Weapons Platform',
    'Space-based weaponry provides overwhelming military advantage.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { cohesion: -3 },
    { army_organization: 4, army_damage_add: 0.14, army_damage_mult: 0.08 }
  ),

  // Pacifist-aligned (pacifist_militaristic < -0.3)
  createTechnology(
    'diplomatic_mastery',
    'Diplomatic Mastery',
    'Exceptional negotiation skills improve all international relations.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { cohesion: 5 },
    { empire_approval: 5, trade_income: 60 }
  ),

  createTechnology(
    'cultural_unity',
    'Cultural Unity',
    'Shared values and traditions unite the coalition in purpose.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { approval: 6, stability: 3 },
    { empire_approval: 3, population_growth: 0.0003 }
  ),

  // Authoritarian-aligned (authoritarian_liberal > 0.3)
  createTechnology(
    'centralized_control',
    'Centralized Control',
    'Unified command structure maximizes efficiency across all domains.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: 1, threshold: 0.3 } },
    { stability: 5 },
    { army_organization: 3, industrial_output: 0.07, army_replenishment_mult: 0.06 }
  ),

  // Liberal-aligned (authoritarian_liberal < -0.3)
  createTechnology(
    'collaborative_science',
    'Collaborative Science',
    'Open sharing of knowledge dramatically accelerates technological progress.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: -1, threshold: 0.3 } },
    { approval: 5 },
    { research_speed: 0.10, market_efficiency: 0.05 }
  ),

  // Spiritual-aligned (spiritual_materialistic > 0.3)
  createTechnology(
    'divine_inspiration',
    'Divine Inspiration',
    'Spiritual enlightenment enhances all aspects of society.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: 1, threshold: 0.3 } },
    { stability: 6 },
    { empire_approval: 5, population_growth: 0.0003 }
  ),
  
  // Materialistic-aligned (spiritual_materialistic < -0.3)
  createTechnology(
    'resource_optimization',
    'Resource Optimization Algorithms',
    'Efficient allocation maximizes output from available materials.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: -1, threshold: 0.3 } },
    { credits: 180 },
    { industrial_output: 0.08, trade_income: 80, market_efficiency: 0.05 }
  )
];

// ============================================
// UNIQUE TECHNOLOGIES (require specific empire tags)
// ============================================

export const UNIQUE_TECHS = [
  // Hive-tagged empires
  createTechnology(
    'hive_mind',
    'Hive Mind Enhancement',
    'Perfect coordination through collective consciousness.',
    'unique',
    { tags: ['hive'] },
    { cohesion: 6 },
    { army_organization: 5, research_speed: 0.08, army_replenishment_mult: 0.10, army_damage_mult: 0.05 }
  ),

  // Mechanical-tagged empires
  createTechnology(
    'nanofabrication',
    'Nanofabrication',
    'Molecular assembly creates anything from raw materials.',
    'unique',
    { tags: ['mechanical'] },
    { credits: 200 },
    { industrial_output: 0.14, supply_efficiency: 0.08, army_replenishment_mult: 0.08, army_consumption_mp_gain_mult: 0.10 }
  ),

  // Warped-tagged empires (touched by the Scourge)
  createTechnology(
    'scourge_synthesis',
    'Scourge Energy Synthesis',
    'Harness the Scourge\'s power for unlimited energy.',
    'unique',
    { tags: ['warped'] },
    { stability: -4, cohesion: -3 },
    { research_speed: 0.14, industrial_output: 0.08 }
  ),

  // Biologic-tagged empires
  createTechnology(
    'genetic_perfection',
    'Genetic Perfection',
    'Perfect genetic engineering creates ideal citizens.',
    'unique',
    { tags: ['biologic'] },
    { approval: 8 },
    { population_growth: 0.0008, empire_approval: 6 }
  )
];

// Combined tech pool for convenience
export const ALL_TECHNOLOGIES = [
  ...GENERAL_TECHS,
  ...ALIGNED_TECHS,
  ...UNIQUE_TECHS
];

// Lookup map by ID
export const TECH_BY_ID = Object.fromEntries(
  ALL_TECHNOLOGIES.map(tech => [tech.id, tech])
);
