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
    { credits: 100 },
    { army_organization: 4, supply_efficiency: 0.05 }
  ),

  createTechnology(
    'fusion_power',
    'Fusion Power',
    'Clean, abundant energy source increases industrial output.',
    'general',
    {},
    { stability: 3 },
    { industrial_output: 0.10, trade_income: 75 }
  ),

  createTechnology(
    'neural_links',
    'Neural Links',
    'Direct brain-computer interfaces accelerate research.',
    'general',
    {},
    { approval: 4 },
    { research_speed: 0.10, army_organization: 3 }
  ),

  createTechnology(
    'hyperdrive',
    'Hyperdrive Technology',
    'Faster-than-light travel improves logistics and trade.',
    'general',
    {},
    { cohesion: 3 },
    { supply_efficiency: 0.08, market_efficiency: 0.05 }
  ),

  createTechnology(
    'cloning',
    'Cloning Technology',
    'Population growth through artificial reproduction.',
    'general',
    {},
    { stability: 2 },
    { population_growth: 0.025, empire_approval: 3 }
  ),

  createTechnology(
    'ai_assistants',
    'AI Assistants',
    'Intelligent systems boost research and administration.',
    'general',
    {},
    { approval: 3 },
    { research_speed: 0.08, law_progress_speed: 0.05 }
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
    { approval: 5 },
    { army_organization: 8, research_speed: 0.12 }
  ),

  createTechnology(
    'automation',
    'Total Automation',
    'Machines handle all production, greatly increasing output.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { stability: 4 },
    { industrial_output: 0.15, population_growth: -0.010 }
  ),

  // Natural-aligned (natural_mechanical < -0.3)
  createTechnology(
    'eco_harmony',
    'Ecological Harmony',
    'Living in balance with nature accelerates population and resource growth.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { stability: 6 },
    { population_growth: 0.040, empire_approval: 5 }
  ),

  createTechnology(
    'bio_engineering',
    'Bio-Engineering',
    'Genetic modifications enhance population growth and happiness.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { approval: 8 },
    { population_growth: 0.030, supply_efficiency: 0.08 }
  ),

  // Militaristic-aligned (pacifist_militaristic > 0.3)
  createTechnology(
    'elite_training',
    'Elite Military Training',
    'Advanced tactics and training create superior fighting forces.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { approval: 4 },
    { army_organization: 10, supply_efficiency: 0.06 }
  ),

  createTechnology(
    'orbital_weapons',
    'Orbital Weapons Platform',
    'Space-based weaponry provides overwhelming military advantage.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { cohesion: -3 },
    { army_organization: 12 }
  ),

  // Pacifist-aligned (pacifist_militaristic < -0.3)
  createTechnology(
    'diplomatic_mastery',
    'Diplomatic Mastery',
    'Exceptional negotiation skills improve all international relations.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { cohesion: 6 },
    { empire_approval: 6, trade_income: 150 }
  ),

  createTechnology(
    'cultural_unity',
    'Cultural Unity',
    'Shared values and traditions unite the coalition in purpose.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { approval: 8, stability: 4 },
    { empire_approval: 4, population_growth: 0.020 }
  ),

  // Authoritarian-aligned (authoritarian_liberal > 0.3)
  createTechnology(
    'centralized_control',
    'Centralized Control',
    'Unified command structure maximizes efficiency across all domains.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: 1, threshold: 0.3 } },
    { stability: 6 },
    { army_organization: 6, industrial_output: 0.10 }
  ),

  // Liberal-aligned (authoritarian_liberal < -0.3)
  createTechnology(
    'collaborative_science',
    'Collaborative Science',
    'Open sharing of knowledge dramatically accelerates technological progress.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: -1, threshold: 0.3 } },
    { approval: 6 },
    { research_speed: 0.15, market_efficiency: 0.08 }
  ),

  // Spiritual-aligned (spiritual_materialistic > 0.3)
  createTechnology(
    'divine_inspiration',
    'Divine Inspiration',
    'Spiritual enlightenment enhances all aspects of society.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: 1, threshold: 0.3 } },
    { stability: 8 },
    { empire_approval: 6, population_growth: 0.015 }
  ),
  
  // Materialistic-aligned (spiritual_materialistic < -0.3)
  createTechnology(
    'resource_optimization',
    'Resource Optimization Algorithms',
    'Efficient allocation maximizes output from available materials.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: -1, threshold: 0.3 } },
    { credits: 250 },
    { industrial_output: 0.12, trade_income: 200, market_efficiency: 0.06 }
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
    { cohesion: 8 },
    { army_organization: 12, research_speed: 0.10 }
  ),

  // Mechanical-tagged empires
  createTechnology(
    'nanofabrication',
    'Nanofabrication',
    'Molecular assembly creates anything from raw materials.',
    'unique',
    { tags: ['mechanical'] },
    { credits: 250 },
    { industrial_output: 0.20, supply_efficiency: 0.10 }
  ),

  // Warped-tagged empires (touched by the Scourge)
  createTechnology(
    'scourge_synthesis',
    'Scourge Energy Synthesis',
    'Harness the Scourge\'s power for unlimited energy.',
    'unique',
    { tags: ['warped'] },
    { stability: -4, cohesion: -3 },
    { research_speed: 0.18, industrial_output: 0.12 }
  ),

  // Biologic-tagged empires
  createTechnology(
    'genetic_perfection',
    'Genetic Perfection',
    'Perfect genetic engineering creates ideal citizens.',
    'unique',
    { tags: ['biologic'] },
    { approval: 10 },
    { population_growth: 0.050, empire_approval: 8 }
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
