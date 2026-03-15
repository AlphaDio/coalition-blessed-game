// Technology definitions - pool of available technologies
import { createTechnology } from './types.js';

function createTieredTechnology(
  tier,
  id,
  name,
  description,
  category = 'general',
  requirements = {},
  immediateEffects = {},
  modifiers = {}
) {
  return createTechnology(
    id,
    name,
    description,
    category,
    requirements,
    immediateEffects,
    modifiers,
    { tier }
  );
}

// ============================================
// GENERAL TECHNOLOGIES
// ============================================

export const GENERAL_TECHS = [
  createTieredTechnology(
    1,
    'power_armor',
    'Power Armor',
    'Enhanced armor technology boosts army protection and effectiveness.',
    'general',
    {},
    { credits: 80 },
    { army_organization: 2.2, army_protection: 0.03, army_damage_add: 0.025, army_replenishment_mult: 0.04, supply_efficiency: 0.02 }
  ),

  createTieredTechnology(
    1,
    'fusion_power',
    'Fusion Power',
    'Clean, abundant energy source increases industrial output.',
    'general',
    {},
    { stability: 2 },
    { industrial_output: 0.05, trade_income: 24 }
  ),

  createTieredTechnology(
    1,
    'neural_links',
    'Neural Links',
    'Direct brain-computer interfaces accelerate research.',
    'general',
    {},
    { approval: 2 },
    { research_speed: 0.07, law_progress_speed: 0.03 }
  ),

  createTieredTechnology(
    2,
    'hyperdrive',
    'Hyperdrive Technology',
    'Faster-than-light logistics stabilize coalition supply lines.',
    'general',
    {},
    { cohesion: 2 },
    { supply_efficiency: 0.08, market_efficiency: 0.06, trade_income: 30 }
  ),

  createTieredTechnology(
    2,
    'cloning',
    'Cloning Technology',
    'Population growth through artificial reproduction.',
    'general',
    {},
    { stability: 2 },
    { population_growth: 0.00045, empire_approval: 1.6 }
  ),

  createTieredTechnology(
    2,
    'ai_assistants',
    'AI Assistants',
    'Intelligent systems boost research and administration.',
    'general',
    {},
    { approval: 2 },
    { research_speed: 0.08, law_progress_speed: 0.06, market_efficiency: 0.03 }
  )
];

// ============================================
// ALIGNED TECHNOLOGIES
// ============================================

export const ALIGNED_TECHS = [
  // Mechanical-aligned (natural_mechanical > 0.3)
  createTieredTechnology(
    2,
    'cybernetics',
    'Cybernetics',
    'Machine enhancements boost army performance and research throughput.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { approval: 4 },
    { army_organization: 3.5, research_speed: 0.08, army_damage_add: 0.05, army_consumption_mp_gain_mult: 0.1 }
  ),

  createTieredTechnology(
    2,
    'automation',
    'Total Automation',
    'Machines handle production with ruthless efficiency.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { stability: 3 },
    { industrial_output: 0.12, supply_efficiency: 0.06, population_growth: -0.00025 }
  ),

  // Natural-aligned (natural_mechanical < -0.3)
  createTieredTechnology(
    2,
    'eco_harmony',
    'Ecological Harmony',
    'Living in balance with nature accelerates growth and social trust.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { stability: 5 },
    { population_growth: 0.00075, empire_approval: 3.5, supply_efficiency: 0.04 }
  ),

  createTieredTechnology(
    2,
    'bio_engineering',
    'Bio-Engineering',
    'Genetic optimization stabilizes growth and resilience.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { approval: 5 },
    { population_growth: 0.00065, supply_efficiency: 0.07, army_replenishment_mult: 0.05 }
  ),

  // Militaristic-aligned (pacifist_militaristic > 0.3)
  createTieredTechnology(
    2,
    'elite_training',
    'Elite Military Training',
    'Advanced doctrine creates superior expeditionary forces.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { approval: 3 },
    { army_organization: 5.5, army_protection: 0.02, supply_efficiency: 0.06, army_damage_mult: 0.08, army_replenishment_mult: 0.1 }
  ),

  createTieredTechnology(
    3,
    'orbital_weapons',
    'Orbital Weapons Platform',
    'Space-based weapon arrays deliver overwhelming firepower.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { cohesion: -3 },
    { army_organization: 6, army_damage_add: 0.16, army_damage_mult: 0.12 }
  ),

  // Pacifist-aligned (pacifist_militaristic < -0.3)
  createTieredTechnology(
    2,
    'diplomatic_mastery',
    'Diplomatic Mastery',
    'Negotiation discipline converts stability into economic lift.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { cohesion: 5 },
    { empire_approval: 4.5, trade_income: 70, market_efficiency: 0.04 }
  ),

  createTieredTechnology(
    2,
    'cultural_unity',
    'Cultural Unity',
    'Shared values harden coalition social cohesion.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { approval: 5, stability: 3 },
    { empire_approval: 3.2, population_growth: 0.00035, law_progress_speed: 0.04 }
  ),

  // Authoritarian-aligned (authoritarian_liberal > 0.3)
  createTieredTechnology(
    3,
    'centralized_control',
    'Centralized Control',
    'Unified command maximizes operational throughput.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: 1, threshold: 0.3 } },
    { stability: 5 },
    { army_organization: 4, industrial_output: 0.09, law_progress_speed: 0.08, army_replenishment_mult: 0.08 }
  ),

  // Liberal-aligned (authoritarian_liberal < -0.3)
  createTieredTechnology(
    3,
    'collaborative_science',
    'Collaborative Science',
    'Open coordination dramatically accelerates discovery.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: -1, threshold: 0.3 } },
    { approval: 5 },
    { research_speed: 0.14, market_efficiency: 0.08, law_progress_speed: 0.06 }
  ),

  // Spiritual-aligned (spiritual_materialistic > 0.3)
  createTieredTechnology(
    3,
    'divine_inspiration',
    'Divine Inspiration',
    'Spiritual cohesion raises legitimacy and recovery discipline.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: 1, threshold: 0.3 } },
    { stability: 6 },
    { empire_approval: 5.5, population_growth: 0.00045, army_replenishment_mult: 0.08 }
  ),

  // Materialistic-aligned (spiritual_materialistic < -0.3)
  createTieredTechnology(
    3,
    'resource_optimization',
    'Resource Optimization Algorithms',
    'Advanced optimization maximizes output from constrained resources.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: -1, threshold: 0.3 } },
    { credits: 180 },
    { industrial_output: 0.12, trade_income: 110, market_efficiency: 0.08, supply_efficiency: 0.05 }
  )
];

// ============================================
// UNIQUE TECHNOLOGIES
// ============================================

export const UNIQUE_TECHS = [
  createTieredTechnology(
    3,
    'hive_mind',
    'Hive Mind Enhancement',
    'Collective cognition creates near-perfect command coherence.',
    'unique',
    { tags: ['hive'] },
    { cohesion: 6 },
    { army_organization: 7, research_speed: 0.1, army_replenishment_mult: 0.14, army_damage_mult: 0.08, law_progress_speed: 0.06 }
  ),

  createTieredTechnology(
    3,
    'nanofabrication',
    'Nanofabrication',
    'Molecular-scale fabrication lifts both logistics and military scaling.',
    'unique',
    { tags: ['mechanical'] },
    { credits: 200 },
    { industrial_output: 0.18, supply_efficiency: 0.1, army_replenishment_mult: 0.1, army_consumption_mp_gain_mult: 0.16 }
  ),

  createTieredTechnology(
    3,
    'scourge_synthesis',
    'Scourge Energy Synthesis',
    'Harnessing warped energy grants power at severe political risk.',
    'unique',
    { tags: ['warped'] },
    { stability: -4, cohesion: -3 },
    { research_speed: 0.16, industrial_output: 0.11, army_damage_add: 0.06, army_damage_mult: 0.06 }
  ),

  createTieredTechnology(
    3,
    'genetic_perfection',
    'Genetic Perfection',
    'Advanced genomic tuning produces resilient, loyal populations.',
    'unique',
    { tags: ['biologic'] },
    { approval: 8 },
    { population_growth: 0.001, empire_approval: 7, supply_efficiency: 0.07, army_replenishment_mult: 0.12 }
  )
];

// ============================================
// APEX TECHNOLOGIES (Tier 4)
// ============================================

export const APEX_TECHS = [
  createTieredTechnology(
    4,
    'quantum_command_matrix',
    'Quantum Command Matrix',
    'Entangled command relays accelerate policy, research, and military response.',
    'general',
    { techs: ['neural_links', 'ai_assistants'] },
    { cohesion: 4 },
    { research_speed: 0.16, law_progress_speed: 0.15, army_organization: 4.5 }
  ),

  createTieredTechnology(
    4,
    'planetary_forge_mesh',
    'Planetary Forge Mesh',
    'Integrated forge infrastructure pushes coalition industry into overdrive.',
    'aligned',
    {
      axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.55 },
      techs: ['automation', 'resource_optimization']
    },
    { credits: 350 },
    { industrial_output: 0.22, supply_efficiency: 0.14, trade_income: 160, army_consumption_mp_gain_mult: 0.18 }
  ),

  createTieredTechnology(
    4,
    'total_war_synthesis',
    'Total War Synthesis',
    'Unified kinetic doctrine converts logistics into overwhelming battlefield pressure.',
    'aligned',
    {
      axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.55 },
      techs: ['elite_training', 'orbital_weapons']
    },
    { approval: -4, cohesion: -2 },
    { army_organization: 8, army_protection: 0.04, army_damage_add: 0.2, army_damage_mult: 0.2, army_replenishment_mult: 0.25 }
  ),

  createTieredTechnology(
    4,
    'biospheric_transcendence',
    'Biospheric Transcendence',
    'Civilizational bio-integration unlocks late-game demographic acceleration.',
    'unique',
    { tags: ['biologic'], techs: ['genetic_perfection'] },
    { approval: 10, stability: 6 },
    { population_growth: 0.0015, empire_approval: 10, supply_efficiency: 0.12, army_replenishment_mult: 0.16 }
  ),

  createTieredTechnology(
    4,
    'cryptic_signal_overmind',
    'Cryptic Signal Overmind',
    'Warp-signaling intelligence grants devastating output at social cost.',
    'unique',
    { tags: ['warped'], techs: ['scourge_synthesis'] },
    { stability: -6, cohesion: -4 },
    { research_speed: 0.2, industrial_output: 0.14, army_damage_add: 0.12, army_damage_mult: 0.12 }
  )
];

// Combined tech pool for convenience
export const ALL_TECHNOLOGIES = [
  ...GENERAL_TECHS,
  ...ALIGNED_TECHS,
  ...UNIQUE_TECHS,
  ...APEX_TECHS
];

// Lookup map by ID
export const TECH_BY_ID = Object.fromEntries(
  ALL_TECHNOLOGIES.map(tech => [tech.id, tech])
);
