/**
 * Tiered Improvement Definitions
 *
 * Improvements are organized in tiers (T1, T2, T3) within branches:
 * - T1: Basic infrastructure, available immediately
 * - T2: Advanced mega-structures requiring 2 completed T1 improvements (per empire)
 * - T3: Epic transcendent projects requiring 2 completed T2 improvements (per empire)
 *
 * Unlike laws (which use global tier tracking), improvements use PER-EMPIRE tracking:
 * Each empire must individually complete T1 improvements to unlock T2 for themselves.
 */

import { createImprovementRequest } from './engine.js';

/**
 * Tier unlock requirements (per empire)
 * T2 requires this many T1 improvements completed
 * T3 requires this many T2 improvements completed
 */
export const IMPROVEMENT_TIER_REQUIREMENTS = {
  2: 2, // Need 2 T1 improvements to unlock T2
  3: 2  // Need 2 T2 improvements to unlock T3
};

/**
 * Create a tiered improvement request
 */
export function createTieredImprovementRequest(id, name, description, tier, branch, options = {}) {
  const request = createImprovementRequest(id, name, description, options);
  return {
    ...request,
    tier,
    branch
  };
}

/**
 * INDUSTRIAL BRANCH
 * Focus: Production, manufacturing, resource extraction
 */
const INDUSTRIAL_BRANCH = [
   // T1: Basic industry
   createTieredImprovementRequest(
     'orbital_foundry',
     'Orbital Foundry Complex',
     'Network of orbital facilities refining raw materials into usable alloys',
     1,
     'industrial',
     {
       suppliesCost: 100,
       build: 240,
       capacity: 2,
       sustainmentCost: { biomass: 3, solid_ice: 2 },
       productionOutputs: { super_alloys: 8 },
       modifiers: { industrial_output: 0.02 },
       tags: ['industrial', 'production', 'orbital']
     }
   ),

   createTieredImprovementRequest(
     'supply_refinery',
     'Supply Refinery',
     'Automated facility converting raw commodities into Coalition supplies for military use',
     1,
     'industrial',
     {
       suppliesCost: 120,
       build: 200,
       capacity: 2,
       sustainmentCost: { biomass: 5, solid_ice: 2 },
       productionOutputs: { supplies: 10 },
       modifiers: {},
       tags: ['industrial', 'supplies', 'conversion']
     }
   ),

  createTieredImprovementRequest(
    'asteroid_mining',
    'Asteroid Mining Operation',
    'Automated extraction of precious minerals from asteroid belts',
    1,
    'industrial',
    {
      suppliesCost: 80,
      build: 200,
      capacity: 2,
      sustainmentCost: { solid_ice: 2 },
      productionOutputs: { rare_gases: 5, solid_ice: 3 },
      modifiers: {},
      tags: ['industrial', 'mining', 'automated']
    }
  ),

  // T2: Advanced manufacturing
  createTieredImprovementRequest(
    'titan_forge',
    'Titan Forge Network',
    'Galaxy-spanning industrial mega-structure harvesting stellar matter to forge alloys of unparalleled strength',
    2,
    'industrial',
    {
      suppliesCost: 200,
      build: 400,
      capacity: 3,
      sustainmentCost: { biomass: 5, solid_ice: 3 },
      productionOutputs: { super_alloys: 15 },
       modifiers: { industrial_output: 0.05, coalition_construction_add: 1 },
      tags: ['mega_structure', 'industrial', 'production']
    }
  ),

  createTieredImprovementRequest(
    'quantum_fabricator',
    'Quantum Fabrication Array',
    'Matter manipulation facilities capable of creating complex components at the atomic level',
    2,
    'industrial',
    {
      suppliesCost: 180,
      build: 360,
      capacity: 3,
      sustainmentCost: { super_alloys: 3, rare_gases: 2 },
      productionOutputs: { quantum_circuits: 4 },
      modifiers: {},
      tags: ['industrial', 'fabrication', 'quantum']
    }
  ),

  // T3: Transcendent industry
  createTieredImprovementRequest(
    'dyson_harvester',
    'Dyson Harvester',
    'Immense stellar energy collection and matter conversion network',
    3,
    'industrial',
    {
      suppliesCost: 500,
      build: 800,
      capacity: 5,
      sustainmentCost: { quantum_circuits: 2, super_alloys: 8 },
      productionOutputs: { super_alloys: 30, quantum_circuits: 5 },
       modifiers: { industrial_output: 0.1, coalition_construction_mult: 0.2 },
      tags: ['mega_structure', 'industrial', 'energy', 'transcendent']
    }
  )
];

/**
 * RESEARCH BRANCH
 * Focus: Technology advancement, knowledge discovery
 */
const RESEARCH_BRANCH = [
  // T1: Basic research
  createTieredImprovementRequest(
    'research_lab',
    'Research Lab',
    'Dedicated research facility for scientific advancement',
    1,
    'research',
    {
      suppliesCost: 90,
      build: 220,
      capacity: 2,
      sustainmentCost: { biomass: 2, solid_ice: 1 },
      productionOutputs: {},
      modifiers: { research_speed: 0.05 },
      tags: ['research', 'facility']
    }
  ),

  // T2: Advanced research
  createTieredImprovementRequest(
    'neural_network',
    'Neural Research Network',
    'Distributed computing network accelerating technological breakthroughs',
    2,
    'research',
    {
      suppliesCost: 160,
      build: 320,
      capacity: 3,
      sustainmentCost: { rare_gases: 2, super_alloys: 2 },
      productionOutputs: {},
      modifiers: { research_speed: 0.08 },
      tags: ['research', 'computing', 'neural']
    }
  ),

  // T3: Transcendent research
  createTieredImprovementRequest(
    'ascension_spire',
    'Ascension Spire',
    'Colossal monument to knowledge pursuing transcendent breakthroughs',
    3,
    'research',
    {
      suppliesCost: 300,
      build: 600,
      capacity: 4,
      sustainmentCost: { super_alloys: 4, rare_gases: 3, quantum_circuits: 1 },
      productionOutputs: { rare_gases: 3 },
      modifiers: { research_speed: 0.15 },
      tags: ['mega_structure', 'research', 'knowledge', 'transcendent']
    }
  )
];

/**
 * MILITARY BRANCH
 * Focus: Combat effectiveness, army management
 */
const MILITARY_BRANCH = [
  // T1: Basic military
  createTieredImprovementRequest(
    'military_depot',
    'Military Depot',
    'Logistics hub improving army supply lines',
    1,
    'military',
    {
      suppliesCost: 70,
      build: 180,
      capacity: 2,
      sustainmentCost: { biomass: 3 },
      productionOutputs: {},
      modifiers: { supply_efficiency: 0.05 },
      tags: ['military', 'logistics']
    }
  ),

  // T2: Advanced military
  createTieredImprovementRequest(
    'grand_symposium',
    'Grand War Symposium',
    'Galactic convocation coordinating fleets across a thousand battlefronts',
    2,
    'military',
    {
      suppliesCost: 150,
      build: 300,
      capacity: 2,
      sustainmentCost: { super_alloys: 4, biomass: 6 },
      productionOutputs: {},
      modifiers: { army_organization: 5, supply_efficiency: 0.08 },
      tags: ['mega_structure', 'military', 'coordination']
    }
  ),

  // T3: Transcendent military
  createTieredImprovementRequest(
    'imperial_fortress',
    'Imperial Fortress',
    'Impenetrable citadel commanding the strategic heart of the galaxy',
    3,
    'military',
    {
      suppliesCost: 400,
      build: 700,
      capacity: 4,
      sustainmentCost: { super_alloys: 6, rare_gases: 4, quantum_circuits: 2 },
      productionOutputs: {},
      modifiers: { army_organization: 8, supply_efficiency: 0.12 },
      tags: ['mega_structure', 'military', 'fortress', 'transcendent']
    }
  )
];

/**
 * CULTURAL BRANCH
 * Focus: Population growth, approval, social cohesion
 */
const CULTURAL_BRANCH = [
  // T1: Basic culture
  createTieredImprovementRequest(
    'cultural_center',
    'Cultural Center',
    'Community hub fostering social bonds and cultural expression',
    1,
    'cultural',
    {
      suppliesCost: 60,
      build: 160,
      capacity: 2,
      sustainmentCost: { biomass: 2 },
      productionOutputs: {},
      modifiers: { empire_approval: 2 },
      tags: ['cultural', 'social']
    }
  ),

  // T2: Advanced culture
  createTieredImprovementRequest(
    'festival_grounds',
    'Festival of Worlds',
    'Massive celebration spanning star systems, uniting billions',
    2,
    'cultural',
    {
      suppliesCost: 250,
      build: 480,
      capacity: 3,
      sustainmentCost: { biomass: 5, genomes: 3, psycho_implants: 1 },
      productionOutputs: { genomes: 4 },
      modifiers: { population_growth: 3, empire_approval: 2 },
      tags: ['mega_structure', 'cultural', 'celebration', 'biologic']
    }
  ),

  // T3: Transcendent culture
  createTieredImprovementRequest(
    'harmony_nexus',
    'Harmony Nexus',
    'Transcendent unity network connecting all sentient minds across the cosmos',
    3,
    'cultural',
    {
      suppliesCost: 350,
      build: 650,
      capacity: 4,
      sustainmentCost: { genomes: 5, psycho_implants: 3, quantum_circuits: 2 },
      productionOutputs: { psycho_implants: 3 },
      modifiers: { population_growth: 5, empire_approval: 4 },
      tags: ['mega_structure', 'cultural', 'unity', 'transcendent', 'biologic']
    }
  )
];

/**
 * ECONOMIC BRANCH
 * Focus: Trade, credits, market efficiency
 */
const ECONOMIC_BRANCH = [
  // T1: Basic economy
  createTieredImprovementRequest(
    'trade_hub',
    'Trade Hub',
    'Commercial nexus facilitating interstellar commerce',
    1,
    'economic',
    {
      suppliesCost: 85,
      build: 210,
      capacity: 2,
      sustainmentCost: { solid_ice: 2 },
      productionOutputs: {},
      modifiers: { trade_income: 200 },
      tags: ['economic', 'trade']
    }
  ),

  // T2: Advanced economy
  createTieredImprovementRequest(
    'convergence_nexus',
    'Convergence Nexus',
    'Hyperspatial marketplace where civilizations exchange wealth and wonders',
    2,
    'economic',
    {
      suppliesCost: 180,
      build: 360,
      capacity: 2,
      sustainmentCost: { solid_ice: 4, rare_gases: 2 },
      productionOutputs: {},
      modifiers: { trade_income: 500, market_efficiency: 0.05 },
      tags: ['mega_structure', 'economic', 'trade', 'marketplace']
    }
  ),

  // T3: Transcendent economy
  createTieredImprovementRequest(
    'wealth_singularity',
    'Wealth Singularity',
    'Infinite value creation engine manipulating quantum economics',
    3,
    'economic',
    {
      suppliesCost: 450,
      build: 750,
      capacity: 5,
      sustainmentCost: { quantum_circuits: 3, rare_gases: 5, super_alloys: 4 },
      productionOutputs: {},
      modifiers: { trade_income: 1500, market_efficiency: 0.1 },
      tags: ['mega_structure', 'economic', 'wealth', 'transcendent']
    }
  )
];

/**
 * All improvement definitions organized by branch
 */
export const IMPROVEMENT_BRANCHES = {
  industrial: INDUSTRIAL_BRANCH,
  research: RESEARCH_BRANCH,
  military: MILITARY_BRANCH,
  cultural: CULTURAL_BRANCH,
  economic: ECONOMIC_BRANCH
};

/**
 * Get all improvement requests (flat list)
 */
export function getAllImprovementRequests() {
  return Object.values(IMPROVEMENT_BRANCHES).flat();
}

/**
 * Get tiered improvement requests (organized by tier)
 */
export function getTieredImprovementRequests() {
  const all = getAllImprovementRequests();
  const byTier = { 1: [], 2: [], 3: [] };

  all.forEach(req => {
    if (byTier[req.tier]) {
      byTier[req.tier].push(req);
    }
  });

  return byTier;
}

/**
 * Check if an empire can start a specific improvement
 */
export function canStartImprovement(improvementId, state, empireId) {
  const empire = state.empires.find(e => e.id === empireId);
  if (!empire) return { canStart: false, reason: 'Empire not found' };

  const improvement = getAllImprovementRequests().find(i => i.id === improvementId);
  if (!improvement) return { canStart: false, reason: 'Improvement not found' };

  if (improvement.tier === 1) {
    return { canStart: true };
  }

  // Check tier requirements
  const requiredTier = improvement.tier - 1;
  const requiredCount = IMPROVEMENT_TIER_REQUIREMENTS[improvement.tier];
  const completedInTier = state.improvements.queue
    .filter(i => i.empireId === empireId && i.state !== 'BUILDING' && i.tier === requiredTier)
    .length;

  if (completedInTier < requiredCount) {
    return {
      canStart: false,
      reason: `Requires ${requiredCount} completed T${requiredTier} improvements (has ${completedInTier})`
    };
  }

  return { canStart: true };
}

/**
 * Generate improvement suggestions for empires
 * Returns a list of available improvement requests based on empire tier access
 */
export function generateImprovementSuggestions(state, rng = Math.random) {
  const suggestions = [];

  // Get all empires
  state.empires.forEach(empire => {
    // Determine available tiers for this empire
    const availableTiers = [1]; // T1 always available

    // Check if T2 is unlocked
    const t1Completed = state.improvements.queue
      .filter(i => i.empireId === empire.id && i.state !== 'BUILDING' && i.tier === 1)
      .length;
    if (t1Completed >= IMPROVEMENT_TIER_REQUIREMENTS[2]) {
      availableTiers.push(2);
    }

    // Check if T3 is unlocked
    const t2Completed = state.improvements.queue
      .filter(i => i.empireId === empire.id && i.state !== 'BUILDING' && i.tier === 2)
      .length;
    if (t2Completed >= IMPROVEMENT_TIER_REQUIREMENTS[3]) {
      availableTiers.push(3);
    }

    // Get available requests for this empire's tiers
    const tieredRequests = getTieredImprovementRequests();
    availableTiers.forEach(tier => {
      const tierRequests = tieredRequests[tier] || [];
      suggestions.push(...tierRequests);
    });
  });

  // Remove duplicates and randomize order
  const uniqueSuggestions = [...new Set(suggestions.map(s => s.id))]
    .map(id => suggestions.find(s => s.id === id));

  // Shuffle the suggestions
  for (let i = uniqueSuggestions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [uniqueSuggestions[i], uniqueSuggestions[j]] = [uniqueSuggestions[j], uniqueSuggestions[i]];
  }

  return uniqueSuggestions;
}

/**
 * Refresh improvement suggestions in state
 */
export function refreshImprovementSuggestions(state, rng = Math.random) {
  state.improvements.requests = generateImprovementSuggestions(state, rng);
}