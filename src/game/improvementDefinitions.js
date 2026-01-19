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

import { createImprovementRequest } from './improvements.js';

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
      sustainmentCost: { biomass: 3, ice: 2 },
      productionOutputs: { super_alloys: 8 },
      modifiers: { industrial_output: 0.02 },
      tags: ['industrial', 'production', 'orbital']
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
      sustainmentCost: { ice: 2 },
      productionOutputs: { rare_gases: 5, ice: 3 },
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
      sustainmentCost: { biomass: 5, ice: 3 },
      productionOutputs: { super_alloys: 15 },
      modifiers: { industrial_output: 0.05 },
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
      suppliesCost: 220,
      build: 440,
      capacity: 3,
      sustainmentCost: { super_alloys: 3, rare_gases: 2 },
      productionOutputs: { quantum_circuits: 4 },
      modifiers: { tech_level: 1 },
      tags: ['mega_structure', 'industrial', 'quantum']
    }
  ),
  
  // T3: Stellar-scale industry
  createTieredImprovementRequest(
    'dyson_harvester',
    'Dyson Harvester Swarm',
    'Self-replicating stellar collectors that harness the raw output of stars themselves',
    3,
    'industrial',
    {
      suppliesCost: 400,
      build: 700,
      capacity: 5,
      sustainmentCost: { quantum_circuits: 2, super_alloys: 5 },
      productionOutputs: { super_alloys: 30, rare_gases: 15 },
      modifiers: { industrial_output: 0.15, energy_production: 0.20 },
      tags: ['mega_structure', 'stellar', 'transcendent']
    }
  )
];

/**
 * RESEARCH BRANCH
 * Focus: Science, technology, knowledge advancement
 */
const RESEARCH_BRANCH = [
  // T1: Basic research
  createTieredImprovementRequest(
    'research_station',
    'Deep Space Research Station',
    'Scientific outpost dedicated to studying anomalous phenomena',
    1,
    'research',
    {
      suppliesCost: 90,
      build: 220,
      capacity: 2,
      sustainmentCost: { biomass: 2, rare_gases: 1 },
      productionOutputs: { rare_gases: 3 },
      modifiers: { research_speed: 0.03 },
      tags: ['research', 'science', 'exploration']
    }
  ),
  
  createTieredImprovementRequest(
    'data_archive',
    'Universal Data Archive',
    'Vast repository of knowledge collected from across known space',
    1,
    'research',
    {
      suppliesCost: 70,
      build: 160,
      capacity: 1,
      sustainmentCost: { ice: 2 },
      productionOutputs: {},
      modifiers: { research_speed: 0.02, tech_level: 0.5 },
      tags: ['research', 'knowledge', 'archive']
    }
  ),
  
  // T2: Advanced research
  createTieredImprovementRequest(
    'ascension_spire',
    'Ascension Spire',
    'Colossal monument to knowledge where the greatest minds pursue transcendent breakthroughs',
    2,
    'research',
    {
      suppliesCost: 300,
      build: 500,
      capacity: 4,
      sustainmentCost: { super_alloys: 3, rare_gases: 2 },
      productionOutputs: { rare_gases: 8, quantum_circuits: 2 },
      modifiers: { research_speed: 0.10, tech_level: 1 },
      tags: ['mega_structure', 'science', 'transcendence']
    }
  ),
  
  createTieredImprovementRequest(
    'xenobiology_lab',
    'Xenobiology Research Complex',
    'Facility dedicated to understanding and harnessing alien biological systems',
    2,
    'research',
    {
      suppliesCost: 180,
      build: 360,
      capacity: 3,
      sustainmentCost: { biomass: 4, genomes: 2 },
      productionOutputs: { genomes: 5 },
      modifiers: { research_speed: 0.05, population_growth: 0.01 },
      tags: ['research', 'biologic', 'xenobiology']
    }
  ),
  
  // T3: Reality research
  createTieredImprovementRequest(
    'reality_engine',
    'Reality Engineering Institute',
    'Facility probing the fundamental nature of existence itself, enabling manipulation of spacetime',
    3,
    'research',
    {
      suppliesCost: 450,
      build: 800,
      capacity: 6,
      sustainmentCost: { quantum_circuits: 4, rare_gases: 5, psycho_implants: 2 },
      productionOutputs: { quantum_circuits: 6 },
      modifiers: { research_speed: 0.20, tech_level: 3 },
      tags: ['mega_structure', 'transcendent', 'reality']
    }
  )
];

/**
 * MILITARY BRANCH
 * Focus: Defense, warfare, strategic assets
 */
const MILITARY_BRANCH = [
  // T1: Basic defense
  createTieredImprovementRequest(
    'defense_platform',
    'Orbital Defense Platform',
    'Automated weapons platform providing protection for key installations',
    1,
    'military',
    {
      suppliesCost: 100,
      build: 200,
      capacity: 2,
      sustainmentCost: { super_alloys: 2 },
      productionOutputs: {},
      modifiers: { army_organization: 2, supply_efficiency: 0.02 },
      tags: ['military', 'defense', 'orbital']
    }
  ),
  
  createTieredImprovementRequest(
    'training_academy',
    'Elite Training Academy',
    'Premier military institution producing highly skilled officers and soldiers',
    1,
    'military',
    {
      suppliesCost: 80,
      build: 180,
      capacity: 2,
      sustainmentCost: { biomass: 3 },
      productionOutputs: {},
      modifiers: { army_organization: 3 },
      tags: ['military', 'training', 'elite']
    }
  ),
  
  // T2: Strategic assets
  createTieredImprovementRequest(
    'war_symposium',
    'Grand War Symposium',
    'Galactic convocation of military leaders coordinating fleets across a thousand battlefronts',
    2,
    'military',
    {
      suppliesCost: 150,
      build: 360,
      capacity: 3,
      sustainmentCost: { super_alloys: 4, biomass: 6 },
      productionOutputs: {},
      modifiers: { army_organization: 5, supply_efficiency: 0.08 },
      tags: ['grand_event', 'military', 'coordination']
    }
  ),
  
  createTieredImprovementRequest(
    'fortress_world',
    'Fortress World Designation',
    'Transform an entire planet into an impregnable military stronghold',
    2,
    'military',
    {
      suppliesCost: 250,
      build: 480,
      capacity: 4,
      sustainmentCost: { super_alloys: 6, ice: 4 },
      productionOutputs: {},
      modifiers: { army_organization: 8, supply_efficiency: 0.10 },
      tags: ['mega_structure', 'military', 'fortress']
    }
  ),
  
  // T3: Ultimate weapon
  createTieredImprovementRequest(
    'stellar_dreadnought',
    'Stellar Dreadnought Yards',
    'Orbital shipyards capable of constructing moon-sized warships that reshape the balance of power',
    3,
    'military',
    {
      suppliesCost: 500,
      build: 900,
      capacity: 6,
      sustainmentCost: { super_alloys: 10, quantum_circuits: 3, rare_gases: 5 },
      productionOutputs: {},
      modifiers: { army_organization: 15, supply_efficiency: 0.15 },
      tags: ['mega_structure', 'military', 'transcendent']
    }
  )
];

/**
 * CULTURAL BRANCH
 * Focus: Unity, approval, diplomacy, cultural projects
 */
const CULTURAL_BRANCH = [
  // T1: Basic culture
  createTieredImprovementRequest(
    'cultural_center',
    'Interstellar Cultural Center',
    'Hub for artistic exchange and cultural preservation across species',
    1,
    'cultural',
    {
      suppliesCost: 70,
      build: 160,
      capacity: 1,
      sustainmentCost: { biomass: 2 },
      productionOutputs: {},
      modifiers: { empire_approval: 1, population_growth: 0.005 },
      tags: ['cultural', 'unity', 'diplomacy']
    }
  ),
  
  createTieredImprovementRequest(
    'diplomatic_enclave',
    'Diplomatic Enclave',
    'Neutral ground where representatives gather to resolve disputes and forge alliances',
    1,
    'cultural',
    {
      suppliesCost: 60,
      build: 140,
      capacity: 1,
      sustainmentCost: { biomass: 1, ice: 1 },
      productionOutputs: {},
      modifiers: { empire_approval: 1 },
      tags: ['diplomatic', 'negotiation', 'unity']
    }
  ),
  
  // T2: Major cultural projects
  createTieredImprovementRequest(
    'festival_of_worlds',
    'Festival of Worlds',
    'Massive celebration spanning entire star systems, uniting billions in shared culture and purpose',
    2,
    'cultural',
    {
      suppliesCost: 250,
      build: 440,
      capacity: 4,
      sustainmentCost: { biomass: 5, genomes: 3, psycho_implants: 1 },
      productionOutputs: { genomes: 4 },
      modifiers: { population_growth: 0.03, empire_approval: 2 },
      tags: ['grand_event', 'cultural', 'unity']
    }
  ),
  
  createTieredImprovementRequest(
    'unity_monument',
    'Coalition Unity Monument',
    'Awe-inspiring structure visible across light-years, a testament to shared purpose',
    2,
    'cultural',
    {
      suppliesCost: 200,
      build: 400,
      capacity: 3,
      sustainmentCost: { super_alloys: 3, rare_gases: 2 },
      productionOutputs: {},
      modifiers: { empire_approval: 3 },
      tags: ['mega_structure', 'unity', 'monument']
    }
  ),
  
  // T3: Transcendent unity
  createTieredImprovementRequest(
    'galactic_senate',
    'Galactic Senate Complex',
    'The supreme deliberative body where all species have a voice in shaping the future',
    3,
    'cultural',
    {
      suppliesCost: 400,
      build: 760,
      capacity: 5,
      sustainmentCost: { biomass: 8, genomes: 4, psycho_implants: 3 },
      productionOutputs: { genomes: 6 },
      modifiers: { empire_approval: 5, population_growth: 0.02 },
      tags: ['mega_structure', 'governance', 'transcendent']
    }
  )
];

/**
 * ECONOMIC BRANCH
 * Focus: Trade, markets, wealth generation
 */
const ECONOMIC_BRANCH = [
  // T1: Basic trade
  createTieredImprovementRequest(
    'trade_hub',
    'Interstellar Trade Hub',
    'Central marketplace connecting disparate economies across the void',
    1,
    'economic',
    {
      suppliesCost: 80,
      build: 180,
      capacity: 2,
      sustainmentCost: { ice: 2 },
      productionOutputs: {},
      modifiers: { trade_income: 200, market_efficiency: 0.02 },
      tags: ['economic', 'trade', 'commerce']
    }
  ),
  
  createTieredImprovementRequest(
    'supply_depot',
    'Strategic Supply Depot',
    'Vast warehouses ensuring steady flow of materials to where they are needed',
    1,
    'economic',
    {
      suppliesCost: 70,
      build: 160,
      capacity: 1,
      sustainmentCost: { ice: 1 },
      productionOutputs: { ice: 3 },
      modifiers: { supply_efficiency: 0.03 },
      tags: ['economic', 'logistics', 'supply']
    }
  ),
  
  // T2: Major economic projects
  createTieredImprovementRequest(
    'convergence_nexus',
    'Convergence Nexus',
    'Hyperspatial marketplace where civilizations across the void exchange wealth and wonders',
    2,
    'economic',
    {
      suppliesCost: 180,
      build: 400,
      capacity: 3,
      sustainmentCost: { ice: 4, rare_gases: 2 },
      productionOutputs: {},
      modifiers: { trade_income: 500, market_efficiency: 0.05 },
      tags: ['mega_structure', 'economic', 'trade']
    }
  ),
  
  createTieredImprovementRequest(
    'banking_consortium',
    'Galactic Banking Consortium',
    'Financial institution managing the flow of credits across all member empires',
    2,
    'economic',
    {
      suppliesCost: 160,
      build: 360,
      capacity: 3,
      sustainmentCost: { super_alloys: 2, ice: 3 },
      productionOutputs: {},
      modifiers: { trade_income: 400, market_efficiency: 0.04 },
      tags: ['economic', 'banking', 'finance']
    }
  ),
  
  // T3: Economic mastery
  createTieredImprovementRequest(
    'infinite_market',
    'The Infinite Market',
    'A dimension-spanning bazaar where anything can be bought or sold, transcending normal economic laws',
    3,
    'economic',
    {
      suppliesCost: 380,
      build: 700,
      capacity: 5,
      sustainmentCost: { quantum_circuits: 3, rare_gases: 4, psycho_implants: 2 },
      productionOutputs: { rare_gases: 10 },
      modifiers: { trade_income: 1000, market_efficiency: 0.15 },
      tags: ['mega_structure', 'economic', 'transcendent']
    }
  )
];

/**
 * All tiered improvement definitions
 */
export const TIERED_IMPROVEMENT_DEFINITIONS = [
  ...INDUSTRIAL_BRANCH,
  ...RESEARCH_BRANCH,
  ...MILITARY_BRANCH,
  ...CULTURAL_BRANCH,
  ...ECONOMIC_BRANCH
];

/**
 * Get sample improvement requests (for compatibility)
 */
export function getTieredImprovementRequests() {
  return TIERED_IMPROVEMENT_DEFINITIONS;
}

/**
 * Count completed improvements by tier for a specific empire
 * @param {Object} state - Game state
 * @param {string} empireId - Empire to check
 * @returns {Object} { 1: count, 2: count, 3: count }
 */
export function countEmpireCompletedByTier(state, empireId) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  
  if (!state.improvements || !state.improvements.queue) {
    return counts;
  }
  
  // Count ACTIVE improvements owned by this empire
  state.improvements.queue
    .filter(i => i.empireId === empireId && (i.state === 'ACTIVE' || i.state === 'DEGRADED'))
    .forEach(improvement => {
      const tier = improvement.tier;
      if (tier >= 1 && tier <= 3) {
        counts[tier]++;
      }
    });
  
  return counts;
}

/**
 * Check if a tier is unlocked for a specific empire
 * @param {number} tier - Tier to check (2 or 3)
 * @param {Object} state - Game state
 * @param {string} empireId - Empire to check
 * @returns {boolean} True if tier is unlocked
 */
export function isImprovementTierUnlocked(tier, state, empireId) {
  if (tier === 1) return true; // T1 always available
  
  const counts = countEmpireCompletedByTier(state, empireId);
  const requirement = IMPROVEMENT_TIER_REQUIREMENTS[tier] || 0;
  const previousTier = tier - 1;
  
  return counts[previousTier] >= requirement;
}

/**
 * Get available improvements for a specific empire
 * @param {Object} state - Game state
 * @param {string} empireId - Empire to check
 * @returns {Array} Available improvement definitions
 */
export function getAvailableImprovements(state, empireId) {
  return TIERED_IMPROVEMENT_DEFINITIONS.filter(improvement => {
    // Check tier is unlocked for this empire
    return isImprovementTierUnlocked(improvement.tier, state, empireId);
  });
}

/**
 * Get improvements by branch
 * @param {string} branch - Branch identifier
 * @returns {Array} Improvements in that branch
 */
export function getImprovementsByBranch(branch) {
  return TIERED_IMPROVEMENT_DEFINITIONS.filter(i => i.branch === branch);
}

/**
 * Get improvements by tier
 * @param {number} tier - Tier level (1, 2, or 3)
 * @returns {Array} Improvements at that tier
 */
export function getImprovementsByTier(tier) {
  return TIERED_IMPROVEMENT_DEFINITIONS.filter(i => i.tier === tier);
}

/**
 * Check if an empire can start a specific improvement
 * @param {string} improvementId - Improvement ID to check
 * @param {Object} state - Game state
 * @param {string} empireId - Empire attempting to build
 * @returns {Object} { canStart: boolean, reason: string }
 */
export function canStartImprovement(improvementId, state, empireId) {
  const improvement = TIERED_IMPROVEMENT_DEFINITIONS.find(i => i.id === improvementId);
  
  if (!improvement) {
    return { canStart: false, reason: 'Improvement not found' };
  }
  
  // Check tier is unlocked for this empire
  if (!isImprovementTierUnlocked(improvement.tier, state, empireId)) {
    const counts = countEmpireCompletedByTier(state, empireId);
    const previousTier = improvement.tier - 1;
    const requirement = IMPROVEMENT_TIER_REQUIREMENTS[improvement.tier];
    const current = counts[previousTier];
    
    return { 
      canStart: false, 
      reason: `Tier ${improvement.tier} locked (need ${requirement} T${previousTier} improvements, have ${current})` 
    };
  }
  
  return { canStart: true, reason: '' };
}

/**
 * Get tier unlock status for a specific empire
 * @param {Object} state - Game state
 * @param {string} empireId - Empire to check
 * @returns {Array} Tier status info
 */
export function getImprovementTierStatus(state, empireId) {
  const counts = countEmpireCompletedByTier(state, empireId);
  
  return [
    { 
      tier: 1, 
      unlocked: true, 
      completed: counts[1],
      required: 0,
      description: 'Basic infrastructure'
    },
    { 
      tier: 2, 
      unlocked: isImprovementTierUnlocked(2, state, empireId), 
      completed: counts[2],
      required: IMPROVEMENT_TIER_REQUIREMENTS[2],
      previousCompleted: counts[1],
      description: 'Advanced mega-structures'
    },
    { 
      tier: 3, 
      unlocked: isImprovementTierUnlocked(3, state, empireId), 
      completed: counts[3],
      required: IMPROVEMENT_TIER_REQUIREMENTS[3],
      previousCompleted: counts[2],
      description: 'Transcendent projects'
    }
  ];
}

/**
 * Get branch display info
 * @returns {Array} Branch metadata
 */
export function getImprovementBranchInfo() {
  return [
    { id: 'industrial', name: 'Industrial', description: 'Production and manufacturing' },
    { id: 'research', name: 'Research', description: 'Science and technology' },
    { id: 'military', name: 'Military', description: 'Defense and warfare' },
    { id: 'cultural', name: 'Cultural', description: 'Unity and diplomacy' },
    { id: 'economic', name: 'Economic', description: 'Trade and wealth' }
  ];
}

/**
 * Get empires that can suggest a specific improvement (have tier access)
 * @param {Object} state - Game state
 * @param {Object} improvement - Improvement definition
 * @returns {Array} Empire IDs that can suggest this improvement
 */
export function getEmpiresWithAccess(state, improvement) {
  if (!state.empires || state.empires.length === 0) {
    return [];
  }
  
  return state.empires
    .filter(empire => isImprovementTierUnlocked(improvement.tier, state, empire.id))
    .map(empire => empire.id);
}

/**
 * Check if the Coalition can suggest an improvement.
 * Coalition can only suggest improvements that at least one empire can build.
 * @param {Object} state - Game state
 * @param {Object} improvement - Improvement definition
 * @returns {boolean} True if coalition can suggest this
 */
export function canCoalitionSuggest(state, improvement) {
  // T1 is always available to coalition
  if (improvement.tier === 1) {
    return true;
  }
  
  // For T2/T3, coalition can only suggest if at least one empire has access
  const eligibleEmpires = getEmpiresWithAccess(state, improvement);
  return eligibleEmpires.length > 0;
}

/**
 * Generate improvement suggestions with proper suggestedBy assignment
 * Only includes improvements that at least one empire can access.
 * Coalition can only suggest what empires can build.
 * 
 * @param {Object} state - Game state with empires
 * @param {function} rng - Random number generator function (returns 0-1)
 * @returns {Array} Improvement requests with suggestedBy properly assigned
 */
export function generateImprovementSuggestions(state, rng = Math.random) {
  const suggestions = [];
  
  for (const improvement of TIERED_IMPROVEMENT_DEFINITIONS) {
    const eligibleEmpires = getEmpiresWithAccess(state, improvement);
    const coalitionCanSuggest = canCoalitionSuggest(state, improvement);
    
    // Skip improvements nobody can access (no empire has tier, and coalition can't suggest)
    if (eligibleEmpires.length === 0 && !coalitionCanSuggest) {
      continue;
    }
    
    // Assign suggestedBy
    let suggestedBy;
    if (improvement.tier === 1) {
      // T1 improvements: 50% chance coalition, 50% chance random empire
      if (rng() < 0.5 || eligibleEmpires.length === 0) {
        suggestedBy = 'coalition';
      } else {
        const idx = Math.floor(rng() * eligibleEmpires.length);
        suggestedBy = eligibleEmpires[idx];
      }
    } else {
      // T2/T3: Only empires with access can suggest (coalition cannot suggest T2/T3 directly)
      if (eligibleEmpires.length === 0) {
        // No empire has access - skip this improvement
        continue;
      }
      const idx = Math.floor(rng() * eligibleEmpires.length);
      suggestedBy = eligibleEmpires[idx];
    }
    
    suggestions.push({
      ...improvement,
      suggestedBy
    });
  }
  
  return suggestions;
}

/**
 * Refresh improvement suggestions based on current empire tier access
 * Call this when empire tier status changes (e.g., after completing improvements)
 * 
 * @param {Object} state - Game state
 * @param {function} rng - Random number generator
 */
export function refreshImprovementSuggestions(state, rng = Math.random) {
  if (!state.improvements) {
    return;
  }
  
  state.improvements.requests = generateImprovementSuggestions(state, rng);
}

/**
 * Get which empires can currently suggest improvements at each tier
 * @param {Object} state - Game state
 * @returns {Object} { 1: [empireIds], 2: [empireIds], 3: [empireIds] }
 */
export function getEmpireTierAccess(state) {
  const access = { 1: [], 2: [], 3: [] };
  
  if (!state.empires) {
    return access;
  }
  
  for (const empire of state.empires) {
    for (let tier = 1; tier <= 3; tier++) {
      if (isImprovementTierUnlocked(tier, state, empire.id)) {
        access[tier].push(empire.id);
      }
    }
  }
  
  return access;
}
