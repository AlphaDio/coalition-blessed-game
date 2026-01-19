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
    'advanced_metallurgy',
    'Advanced Metallurgy',
    'New alloy compositions enable stronger, lighter construction materials.',
    'general',
    {},
    { credits: 100 },
    { industrial_output: 0.05, supply_efficiency: 0.02 }
  ),
  
  createTechnology(
    'unified_logistics',
    'Unified Logistics Network',
    'Standardized supply chains across coalition members reduce waste and delays.',
    'general',
    {},
    { stability: 3 },
    { supply_efficiency: 0.05, trade_income: 50 }
  ),
  
  createTechnology(
    'quantum_communications',
    'Quantum Communications',
    'Entangled particle networks enable instantaneous secure transmissions.',
    'general',
    {},
    { cohesion: 2 },
    { research_speed: 0.03, market_efficiency: 0.02 }
  ),
  
  createTechnology(
    'adaptive_shields',
    'Adaptive Shield Arrays',
    'Energy barriers that learn and adapt to incoming threats.',
    'general',
    {},
    { approval: 5 },
    { army_organization: 2, supply_efficiency: 0.02 }
  ),
  
  createTechnology(
    'stellar_cartography',
    'Stellar Cartography Initiative',
    'Comprehensive mapping of transit routes and resource deposits.',
    'general',
    {},
    { credits: 150 },
    { trade_income: 100, research_speed: 0.02 }
  ),
  
  createTechnology(
    'distributed_manufacturing',
    'Distributed Manufacturing',
    'Decentralized production networks increase resilience and throughput.',
    'general',
    {},
    { stability: 2 },
    { industrial_output: 0.04, market_efficiency: 0.03 }
  )
];

// ============================================
// ALIGNED TECHNOLOGIES (require value axis alignment)
// ============================================

export const ALIGNED_TECHS = [
  // Mechanical-aligned (natural_mechanical > 0.3)
  createTechnology(
    'synthetic_workforce',
    'Synthetic Workforce Integration',
    'Robotic labor supplements organic workers in hazardous conditions.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { credits: 200 },
    { industrial_output: 0.08, population_growth: -0.005 }
  ),
  
  createTechnology(
    'neural_interface_standard',
    'Neural Interface Standard',
    'Direct brain-machine connections streamline complex operations.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: 1, threshold: 0.3 } },
    { approval: 8 },
    { research_speed: 0.06, army_organization: 3 }
  ),
  
  // Natural-aligned (natural_mechanical < -0.3)
  createTechnology(
    'biosphere_harmony',
    'Biosphere Harmony Protocols',
    'Ecological integration enhances sustainable resource extraction.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { stability: 5 },
    { population_growth: 0.015, empire_approval: 2 }
  ),
  
  createTechnology(
    'organic_architecture',
    'Organic Architecture',
    'Living structures that grow, heal, and adapt to their inhabitants.',
    'aligned',
    { axis: { axis: 'natural_mechanical', direction: -1, threshold: 0.3 } },
    { approval: 5 },
    { empire_approval: 2, supply_efficiency: 0.04 }
  ),
  
  // Militaristic-aligned (pacifist_militaristic > 0.3)
  createTechnology(
    'combined_arms_doctrine',
    'Combined Arms Doctrine',
    'Integrated military tactics maximize force effectiveness.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { approval: 5 },
    { army_organization: 5, supply_efficiency: 0.03 }
  ),
  
  createTechnology(
    'orbital_bombardment_grid',
    'Orbital Bombardment Grid',
    'Coordinated satellite weapons provide devastating fire support.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: 1, threshold: 0.3 } },
    { cohesion: -3 },
    { army_organization: 8 }
  ),
  
  // Pacifist-aligned (pacifist_militaristic < -0.3)
  createTechnology(
    'diplomatic_corps_expansion',
    'Diplomatic Corps Expansion',
    'Trained negotiators resolve conflicts before they escalate.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { cohesion: 5 },
    { empire_approval: 3, trade_income: 100 }
  ),
  
  createTechnology(
    'cultural_exchange_initiative',
    'Cultural Exchange Initiative',
    'Shared art and traditions build lasting bonds between peoples.',
    'aligned',
    { axis: { axis: 'pacifist_militaristic', direction: -1, threshold: 0.3 } },
    { approval: 10, stability: 3 },
    { empire_approval: 2, population_growth: 0.01 }
  ),
  
  // Authoritarian-aligned (authoritarian_liberal > 0.3)
  createTechnology(
    'centralized_command',
    'Centralized Command Structure',
    'Unified hierarchy enables rapid response and coordination.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: 1, threshold: 0.3 } },
    { stability: 5 },
    { army_organization: 4, industrial_output: 0.04 }
  ),
  
  // Liberal-aligned (authoritarian_liberal < -0.3)
  createTechnology(
    'open_innovation_networks',
    'Open Innovation Networks',
    'Free exchange of ideas accelerates scientific progress.',
    'aligned',
    { axis: { axis: 'authoritarian_liberal', direction: -1, threshold: 0.3 } },
    { approval: 8 },
    { research_speed: 0.08, market_efficiency: 0.04 }
  ),
  
  // Spiritual-aligned (spiritual_materialistic > 0.3)
  createTechnology(
    'sacred_architecture',
    'Sacred Architecture Traditions',
    'Temples and monuments strengthen cultural identity.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: 1, threshold: 0.3 } },
    { stability: 8 },
    { empire_approval: 3, population_growth: 0.005 }
  ),
  
  // Materialistic-aligned (spiritual_materialistic < -0.3)
  createTechnology(
    'resource_optimization',
    'Resource Optimization Algorithms',
    'Efficient allocation maximizes output from available materials.',
    'aligned',
    { axis: { axis: 'spiritual_materialistic', direction: -1, threshold: 0.3 } },
    { credits: 250 },
    { industrial_output: 0.06, trade_income: 100, market_efficiency: 0.03 }
  )
];

// ============================================
// UNIQUE TECHNOLOGIES (require specific empire tags)
// ============================================

export const UNIQUE_TECHS = [
  // Hive-tagged empires
  createTechnology(
    'collective_consciousness_amplifier',
    'Collective Consciousness Amplifier',
    'Enhanced neural links strengthen the gestalt mind.',
    'unique',
    { tags: ['hive'] },
    { cohesion: 5 },
    { army_organization: 6, research_speed: 0.05 }
  ),
  
  // Mechanical-tagged empires
  createTechnology(
    'self_replicating_factories',
    'Self-Replicating Factories',
    'Autonomous manufacturing units that build copies of themselves.',
    'unique',
    { tags: ['mechanical'] },
    { credits: 300 },
    { industrial_output: 0.12, population_growth: 0.02 }
  ),
  
  // Warped-tagged empires (touched by the Scourge)
  createTechnology(
    'void_resonance_harnessing',
    'Void Resonance Harnessing',
    'Tapping into the energies that sustain the Scourge.',
    'unique',
    { tags: ['warped'] },
    { stability: -5, cohesion: -3 },
    { research_speed: 0.10, energy_production: 0.15 }
  ),
  
  // Biologic-tagged empires
  createTechnology(
    'accelerated_evolution',
    'Accelerated Evolution Program',
    'Guided genetic modification adapts populations rapidly.',
    'unique',
    { tags: ['biologic'] },
    { approval: 5 },
    { population_growth: 0.025, empire_approval: 2 }
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
