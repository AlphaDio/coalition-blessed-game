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

export function createImprovementRequestInstance(definition, empireId, turn, rng = Math.random) {
  const definitionId = definition.definitionId || definition.id;
  const instanceId = `req_${definitionId}_${empireId}_${turn}_${Math.floor(rng() * 1e6)}`;
  return {
    ...definition,
    id: instanceId,
    definitionId,
    empireId,
    requestedAt: turn
  };
}

/**
 * INDUSTRIAL BRANCH
 * Focus: Production, manufacturing, resource extraction
 * Thematic Resource: Super Alloys -> Construction speed and capacity
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
        build: 120,
        capacity: 2,
        sustainmentCost: { biomass: 0.3, plasma_fuel: 0.2 },
        productionOutputs: { super_alloys: 0.01 },
        modifiers: { industrial_output: 0.02 },
        tags: ['industrial', 'production', 'orbital'],
        requisitionUpkeep: 1
      }
    ),

    createTieredImprovementRequest(
     'asteroid_mining',
     'Asteroid Mining Operation',
     'Automated extraction of precious minerals from asteroid belts',
     1,
     'industrial',
      {
       suppliesCost: 160,
       build: 200,
       capacity: 2,
        sustainmentCost: { plasma_fuel: 0.1 },
        productionOutputs: { rare_gases: 0.05, plasma_fuel: 0.03 },
        modifiers: {},
       tags: ['industrial', 'mining', 'automated'],
       requisitionUpkeep: 1
     }
    ),

    createTieredImprovementRequest(
      'requisition_processing_center',
      'Requisition Processing Center',
      'Advanced facility extracting and refining commodities into Coalition requisition supplies and plasma fuel',
      1,
      'industrial',
      {
        suppliesCost: 110,
        build: 160,
        capacity: 2,
        sustainmentCost: { biomass: 0.25 }, // 0.35 -> 0.25
        productionOutputs: { plasma_fuel: 0.8, requisition: 1.2 },
        modifiers: { industrial_output: 0.01 },
        tags: ['industrial', 'requisition', 'conversion', 'processing'],
        requisitionUpkeep: 1
      }
    ),

    createTieredImprovementRequest(
      'nano_lattice_plant',
      'Nano-Lattice Plant',
      'Precision facility producing nano-machines for advanced systems',
      1,
      'industrial',
      {
        suppliesCost: 120,
        build: 140,
        capacity: 2,
        sustainmentCost: { super_alloys: 0.15, plasma_fuel: 0.1 },
        productionOutputs: { nano_machines: 0.03 },
        modifiers: { supply_efficiency: 0.02 },
        tags: ['industrial', 'production', 'nano', 'precision'],
        requisitionUpkeep: 1
      }
    ),

    // T2: Advanced manufacturing

    createTieredImprovementRequest(
      'quantum_fabricator',
      'Quantum Fabrication Array',
      'Matter manipulation facilities capable of creating complex components at the atomic level',
      2,
      'industrial',
      {
        suppliesCost: 360,
        build: 360,
        capacity: 2,
        sustainmentCost: { super_alloys: 0.3, rare_gases: 0.2 },
        productionOutputs: { quantum_circuits: 0.04 },
        modifiers: {},
        tags: ['industrial', 'fabrication', 'quantum'],
        requisitionUpkeep: 6
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
        suppliesCost: 1000,
        build: 800,
        capacity: 6,
        sustainmentCost: { quantum_circuits: 0.2, super_alloys: 0.8 },
        productionOutputs: { dark_matter: 0.001, quantum_circuits: 0.005 },
        modifiers: { industrial_output: 0.1, coalition_construction_mult: 0.2 },
        tags: ['mega_structure', 'industrial', 'energy', 'transcendent'],
        requisitionUpkeep: 8
      }
    )
];

/**
 * RESEARCH BRANCH
 * Focus: Technology advancement, knowledge discovery
 * Thematic Resource: Rare Gases -> Research Speed
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
       suppliesCost: 180,
       build: 220,
       capacity: 2,
       sustainmentCost: { rare_gases: 0.2 },
       productionOutputs: {},
       modifiers: { research_speed: 0.15 },
       tags: ['research', 'facility'],
       requisitionUpkeep: 1
     }
   ),

   createTieredImprovementRequest(
     'circuit_synthesis_lab',
     'Circuit Synthesis Lab',
     'Facility producing quantum circuits for advanced computing and research applications',
     1,
     'research',
     {
       suppliesCost: 150,
       build: 180,
       capacity: 2,
       sustainmentCost: { super_alloys: 0.2, rare_gases: 0.15 },
       productionOutputs: { quantum_circuits: 0.015 },
       modifiers: { research_speed: 0.05 },
       tags: ['research', 'quantum', 'circuits', 'synthesis'],
       requisitionUpkeep: 1
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
       suppliesCost: 320,
       build: 320,
       capacity: 4,
       sustainmentCost: { rare_gases: 0.4, quantum_circuits: 0.1 },
       productionOutputs: {},
       modifiers: { research_speed: 0.3 },
       tags: ['research', 'computing', 'neural'],
       requisitionUpkeep: 6
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
       suppliesCost: 600,
       build: 600,
       capacity: 6,
        sustainmentCost: { rare_gases: 0.6, quantum_circuits: 0.2, genomes: 0.2 },
        productionOutputs: { rare_gases: 0.03 },
       modifiers: { research_speed: 0.5 },
        tags: ['mega_structure', 'research', 'knowledge', 'transcendent'],
        requisitionUpkeep: 8
     }
   )
 ];

/**
 * MILITARY BRANCH
 * Focus: Combat effectiveness, army management
 * Thematic Resource: Plasma Fuel -> Supply Efficiency
 */
const MILITARY_BRANCH = [
    // T1: Basic military
    createTieredImprovementRequest(
      'war_academy',
      'War Academy Complex',
      'Military institution training soldiers in both tactical discipline and combat fervor for unified martial excellence',
      1,
      'military',
      {
        suppliesCost: 90,
        build: 80,
        capacity: 2,
        sustainmentCost: { biomass: 0.5 },
        productionOutputs: {},
        modifiers: { army_organization: 1, army_fervor: 1, army_damage_mult: 0.05 },
        tags: ['military', 'training', 'organization', 'fervor'],
        requisitionUpkeep: 1
      }
    ),

   // T2: Advanced military
   createTieredImprovementRequest(
     'grand_symposium',
     'Grand War Symposium',
     'Galactic convocation coordinating fleets across a thousand battlefronts with cryo-preserved logistics',
     2,
     'military',
      {
       suppliesCost: 300,
       build: 300,
       capacity: 2,
       sustainmentCost: { super_alloys: 0.3 },
       productionOutputs: {},
       modifiers: { army_organization: 3, supply_efficiency: 0.08 },
       tags: ['mega_structure', 'military', 'coordination'],
       requisitionUpkeep: 6
     }
   ),

   // T3: Transcendent military
   createTieredImprovementRequest(
     'imperial_fortress',
     'Imperial Fortress',
     'Impenetrable citadel commanding the strategic heart of the galaxy with ice-core storage vaults',
     3,
     'military',
     {
       suppliesCost: 800,
       build: 700,
       capacity: 6,
       sustainmentCost: { super_alloys: 0.4, quantum_circuits: 0.2 },
       productionOutputs: {},
       modifiers: { army_organization: 5, supply_efficiency: 0.12 },
       tags: ['mega_structure', 'military', 'fortress', 'transcendent'],
       requisitionUpkeep: 8
     }
   )
 ];

/**
 * CULTURAL BRANCH
 * Focus: Population growth, approval, social cohesion
 * Thematic Resource: Biomass -> Population growth
 */
const CULTURAL_BRANCH = [
   // T1: Basic culture
    createTieredImprovementRequest(
      'civilization_hub',
      'Civilization Hub',
      'Integrated complex combining agricultural production with cultural services, fostering population growth and social harmony',
      1,
      'cultural',
      {
        suppliesCost: 50,
        build: 100,
        capacity: 2,
        sustainmentCost: { plasma_fuel: 0.01, biomass: 0.15 },
        productionOutputs: { biomass: 0.05 },
        modifiers: { population_growth: 1.5, empire_approval: 3, hero_siphon_efficiency_add: 0.005 },
        tags: ['cultural', 'agriculture', 'social', 'food'],
        requisitionUpkeep: 1
      }
    ),

   // T2: Advanced culture
   createTieredImprovementRequest(
     'festival_grounds',
     'Festival of Worlds',
     'Massive celebration spanning star systems, uniting billions with abundant feasts',
     2,
     'cultural',
     {
       suppliesCost: 500,
       build: 160,
       capacity: 4,
        sustainmentCost: { genomes: 0.2, psycho_implants: 0.1 },
        productionOutputs: { genomes: 0.004 },
       modifiers: { population_growth: 4, empire_approval: 5 },
       tags: ['mega_structure', 'cultural', 'celebration', 'biologic'],
       requisitionUpkeep: 6
     }
   ),

   // T3: Transcendent culture
   createTieredImprovementRequest(
     'harmony_nexus',
     'Harmony Nexus',
     'Transcendent unity network sustaining endless biomass flows to nurture galactic populations',
     3,
     'cultural',
     {
       suppliesCost: 700,
       build: 480,
       capacity: 6,
        sustainmentCost: { genomes: 0.3, psycho_implants: 0.2 },
        productionOutputs: { genomes: 0.005, psycho_implants: 0.2 },
       modifiers: { population_growth: 8, empire_approval: 10 },
       tags: ['mega_structure', 'cultural', 'unity', 'transcendent', 'biologic'],
       requisitionUpkeep: 8
     }
   )
 ];

/**
 * ECONOMIC BRANCH
 * Focus: Trade, credits, market efficiency
 */
const ECONOMIC_BRANCH = [
    createTieredImprovementRequest(
      'trade_hub',
      'Trade Hub',
      'Commercial nexus facilitating interstellar commerce',
      1,
      'economic',
     {
       suppliesCost: 170,
       build: 210,
       capacity: 2,
       sustainmentCost: { plasma_fuel: 0.2 },
       productionOutputs: {},
       modifiers: { trade_income: 20 },
      tags: ['economic', 'trade'],
      requisitionUpkeep: 1
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
      suppliesCost: 360,
      build: 360,
      capacity: 2,
      sustainmentCost: { plasma_fuel: 0.4 },
      productionOutputs: {},
      modifiers: { trade_income: 100, market_efficiency: 0.05 },
      tags: ['mega_structure', 'economic', 'trade', 'marketplace'],
      requisitionUpkeep: 6
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
      suppliesCost: 900,
      build: 750,
      capacity: 6,
      sustainmentCost: { quantum_circuits: 0.3, psycho_implants: 0.5, sentient_cores: 0.4 },
      productionOutputs: {},
       modifiers: { market_efficiency: 0.3 },
       tags: ['mega_structure', 'economic', 'wealth', 'transcendent'],
       requisitionUpkeep: 8
     }
   )
 ];

/**
 * SPIRITUAL BRANCH
 * Focus: Fervor, morale, ideological strength
 * Thematic Resource: Ancient Relics -> Fervor Contribution to Army Power
 */
const SPIRITUAL_BRANCH = [
   // T1: Basic spiritual
   createTieredImprovementRequest(
     'relic_shrine',
     'Relic Shrine',
     'Sacred site housing ancient artifacts that inspire warriors with righteous fervor',
     1,
     'spiritual',
     {
       suppliesCost: 80,
       build: 100,
       capacity: 2,
       sustainmentCost: { ancient_relics: 0.1, biomass: 0.2 },
       productionOutputs: { ancient_relics: 1 },
       modifiers: { army_fervor: 3 },
       tags: ['spiritual', 'morale', 'relics'],
       requisitionUpkeep: 1
     }
   ),

   // T2: Advanced spiritual
   createTieredImprovementRequest(
     'monument_of_ages',
     'Monument of Ages',
     'Towering edifice displaying relics from countless civilizations, channeling their ancient power into battle fervor',
     2,
     'spiritual',
     {
       suppliesCost: 360,
       build: 350,
       capacity: 4,
        sustainmentCost: { ancient_relics: 0.3, psycho_implants: 0.2 },
        productionOutputs: { ancient_relics: 1 },
       modifiers: { army_fervor: 6, cohesionModifier: 1.02 },
       tags: ['mega_structure', 'spiritual', 'heritage', 'relics'],
       requisitionUpkeep: 6
     }
   ),

   // T3: Transcendent spiritual
   createTieredImprovementRequest(
     'sanctum_of_eternity',
     'Sanctum of Eternity',
     'Transcendent temple where ancient relics resonate with cosmic power, granting armies unshakeable conviction',
     3,
     'spiritual',
     {
       suppliesCost: 700,
       build: 650,
       capacity: 6,
        sustainmentCost: { ancient_relics: 0.5, psycho_implants: 0.3, sentient_cores: 0.1 },
        productionOutputs: { ancient_relics: 1 },
       modifiers: { army_fervor: 12, cohesionModifier: 1.05, empire_approval: 2 },
       tags: ['mega_structure', 'spiritual', 'transcendent', 'relics'],
       requisitionUpkeep: 8
     }
   )
 ];

/**
 * GOVERNANCE BRANCH
 * Focus: Law progress, political efficiency, coalition management
 * Thematic Resource: Sentient Cores -> Law Progress
 */
const GOVERNANCE_BRANCH = [
   // T1: Basic governance
   createTieredImprovementRequest(
     'administrative_hub',
     'Administrative Hub',
     'Centralized bureaucratic center streamlining coalition law processing and expanding improvement queue capacity',
     1,
     'governance',
     {
       suppliesCost: 75,
       build: 95,
       capacity: 2,
       sustainmentCost: { sentient_cores: 0.1 },
       productionOutputs: {},
       modifiers: { law_progress_speed: 0.10, improvement_queue_capacity: 2 },
       tags: ['governance', 'administration'],
       requisitionUpkeep: 3
     }
   ),

   // T2: Advanced governance
   createTieredImprovementRequest(
     'council_spire',
     'Council Spire',
     'Magnificent assembly hall where sentient AI cores analyze and accelerate legislative proceedings',
     2,
     'governance',
    {
      suppliesCost: 400,
       build: 380,
       capacity: 4,
       sustainmentCost: { sentient_cores: 0.20, quantum_circuits: 0.10 },
       productionOutputs: {},
       modifiers: { law_progress_speed: 0.20, tick_delay_multiplier: 0.50 },
       tags: ['mega_structure', 'governance', 'council', 'sentient'],
       requisitionUpkeep: 5
     }
   ),

   // T3: Transcendent governance
   createTieredImprovementRequest(
     'omniscient_senate',
     'Omniscient Senate',
     'Transcendent governing body guided by networked sentient cores processing galactic-scale policy at lightspeed',
     3,
     'governance',
     {
       suppliesCost: 800,
       build: 700,
       capacity: 6,
        sustainmentCost: { sentient_cores: 0.40, quantum_circuits: 0.20, psycho_implants: 0.20 },
        productionOutputs: { sentient_cores: 0.001 },
       modifiers: { law_progress_speed: 0.30, tick_delay_multiplier: 0.75, cohesionModifier: 1.03 },
       tags: ['mega_structure', 'governance', 'transcendent', 'sentient'],
       requisitionUpkeep: 8
     }
   )
 ];

/**
  * RESOURCE BRANCH
  * Focus: Free resource generation without sustainment costs
  * Role: Passive income of basic resources to bootstrap economy
  * T1: Basic extractors and fabricators (can produce T1-T3 commodities)
  * T2: Advanced facilities (higher output, tier-appropriate commodities)
  */
const RESOURCE_BRANCH = [
    // T1: Basic extractors - lower output than T2, but available immediately
   createTieredImprovementRequest(
     'fuel_extractor',
     'Fuel Extractor',
     'Simple automated station extracting valuable fuels from asteroids',
     1,
     'resource',
     {
       suppliesCost: 50,
       build: 50,
       capacity: 1,
       sustainmentCost: { },
       productionOutputs: { plasma_fuel: 0.25 },
       modifiers: {},
       tags: ['resource', 'passive', 'extraction'],
       requisitionUpkeep: 1
     }
   ),

   createTieredImprovementRequest(
     'alloy_foundry',
     'Alloy Foundry',
     'Foundry producing advanced alloys from basic materials',
     1,
     'resource',
     {
       suppliesCost: 140,
       build: 85,
       capacity: 2,
        sustainmentCost: { plasma_fuel: 0.025 },
        productionOutputs: { super_alloys: 0.05 },
       modifiers: {},
       tags: ['resource', 'passive', 'production'],
       requisitionUpkeep: 1
     }
   ),

   createTieredImprovementRequest(
     'genomic_lab',
     'Genomic Lab',
     'Laboratory cultivating genetic samples for research and development',
     1,
     'resource',
     {
       suppliesCost: 90,
       build: 85,
       capacity: 2,
       sustainmentCost: { biomass: 0.01, genomes: 0.03 },
       productionOutputs: { genomes: 0.01 },
       modifiers: { research_speed: 0.15 }, // 15% research speed bonus
       tags: ['resource', 'passive', 'research'],
       requisitionUpkeep: 1
     }
   ),

   createTieredImprovementRequest(
     'mycellium_grove',
     'Mycellium Grove',
     'Self-sustaining fungal colony cultivating organic biomass and genetic material through symbiotic growth',
     1,
     'resource',
     {
       suppliesCost: 75,
       build: 70,
       capacity: 1,
       sustainmentCost: { },
       productionOutputs: { biomass: 0.1, genomes: 0.05 },
       modifiers: {},
       tags: ['resource', 'passive', 'biologic', 'organic'],
       requisitionUpkeep: 1
     }
   ),

   createTieredImprovementRequest(
     'nebulae_mining_initiatives',
     'Nebulae Mining Initiatives',
     'Automated mining initiatives extracting rare gases from nebulaes',
     1,
     'resource',
     {
       suppliesCost: 80,
       build: 70,
       capacity: 1,
       sustainmentCost: { },
       productionOutputs: { rare_gases: 0.3, plasma_fuel: 0.05 },
       modifiers: {},
       tags: ['resource', 'passive', 'mining'],
       requisitionUpkeep: 1
     }
   ),

   // T2: Advanced resource facilities - higher output

   // T2: Exotic matter facility - produces all three ultra-advanced commodities needed for Dark Matter Power Surge
   createTieredImprovementRequest(
     'exotic_matter_fabricator',
     'Exotic Matter Fabricator',
     'Fabricator producing exotic matter.',
     2,
     'resource',
     {
       suppliesCost: 200,
       build: 250,
       capacity: 2,
       sustainmentCost: { quantum_circuits: 0.05, genomes: 0.05, plasma_fuel: 0.15 },
       productionOutputs: { 
         wormhole_reactors: 0.4, 
         dark_matter: 0.0015, 
         nano_machines: 0.08 
       },
       modifiers: {},
       tags: ['resource', 'passive', 'exotic', 'advanced_commodity'],
       requisitionUpkeep: 6
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
  economic: ECONOMIC_BRANCH,
  spiritual: SPIRITUAL_BRANCH,
  governance: GOVERNANCE_BRANCH,
  resource: RESOURCE_BRANCH
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
 * Maximum suggestions each empire can have at once
 */
export const MAX_SUGGESTIONS_PER_EMPIRE = 3;

/**
 * Generate improvement suggestions for empires
 * Simple system: each empire gets up to MAX_SUGGESTIONS_PER_EMPIRE suggestions
 * When an improvement is built, the empire suggests a replacement
 */
export function generateImprovementSuggestions(state, rng = Math.random) {
  const suggestions = [];
  const turn = Number.isFinite(state.turn) ? state.turn : 0;

  // Count existing suggestions per empire
  const currentCounts = {};
  state.empires.forEach(e => currentCounts[e.id] = 0);
  state.improvements.requests.forEach(r => {
    if (r.empireId && currentCounts[r.empireId] !== undefined) {
      currentCounts[r.empireId]++;
    }
  });

  // Fill up suggestions for each empire
  state.empires.forEach(empire => {
    const currentCount = currentCounts[empire.id] || 0;
    const slotsNeeded = MAX_SUGGESTIONS_PER_EMPIRE - currentCount;
    
    if (slotsNeeded <= 0) return;

    // Get available improvements for this empire
    const available = getAvailableImprovementsForEmpire(state, empire.id, rng);
    
    // Take up to slotsNeeded suggestions
    const newSuggestions = available.slice(0, slotsNeeded);
    newSuggestions.forEach(def => {
      suggestions.push(createImprovementRequestInstance(def, empire.id, turn, rng));
    });
  });

  return suggestions;
}

/**
 * Generate a single replacement suggestion for an empire
 * Called when an improvement is accepted to replace the used request
 */
export function generateReplacementSuggestion(state, empireId, rng = Math.random) {
  // Count current suggestions for this empire
  const currentCount = state.improvements.requests.filter(r => r.empireId === empireId).length;
  
  if (currentCount >= MAX_SUGGESTIONS_PER_EMPIRE) {
    return null; // Already at max
  }

  // Get available improvements for this empire
  const available = getAvailableImprovementsForEmpire(state, empireId, rng);
  
  if (available.length === 0) {
    return null; // No improvements available
  }

  // Pick one and return it
  const turn = Number.isFinite(state.turn) ? state.turn : 0;
  const suggestion = createImprovementRequestInstance(available[0], empireId, turn, rng);

  return suggestion;
}

/**
 * Get available improvements for an empire (not already requested or building)
 * Returns shuffled list weighted by tier
 */
function getAvailableImprovementsForEmpire(state, empireId, rng = Math.random) {
  const SUGGESTION_WEIGHTS = {
    1: 10,  // T1: 10x weight (common)
    2: 3,   // T2: 3x weight (less common)
    3: 1    // T3: 1x weight (rare)
  };

  // Determine available tiers for this empire
  const availableTiers = [1]; // T1 always available

  // Check if T2 is unlocked
  const t1Completed = state.improvements.queue
    .filter(i => i.empireId === empireId && i.state !== 'BUILDING' && i.tier === 1)
    .length;
  if (t1Completed >= IMPROVEMENT_TIER_REQUIREMENTS[2]) {
    availableTiers.push(2);
  }

  // Check if T3 is unlocked
  const t2Completed = state.improvements.queue
    .filter(i => i.empireId === empireId && i.state !== 'BUILDING' && i.tier === 2)
    .length;
  if (t2Completed >= IMPROVEMENT_TIER_REQUIREMENTS[3]) {
    availableTiers.push(3);
  }

  // Collect available improvements with weights
  const tieredRequests = getTieredImprovementRequests();
  const weightedPool = [];

  availableTiers.forEach(tier => {
    const tierRequests = tieredRequests[tier] || [];
    const tierWeight = SUGGESTION_WEIGHTS[tier] || 1;

    tierRequests.forEach(req => {
      // Check requiresNoArmy condition
      if (req.requiresNoArmy) {
        const empireHasArmy = state.armies?.some(a => a.empireId === empireId);
        if (empireHasArmy) {
          return; // Skip - empire already has an army
        }
      }

      // Add with tier weight (allow duplicates - empires can request/build same improvement multiple times)
      for (let i = 0; i < tierWeight; i++) {
        weightedPool.push(req);
      }
    });
  });

  // Shuffle the weighted pool
  for (let i = weightedPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [weightedPool[i], weightedPool[j]] = [weightedPool[j], weightedPool[i]];
  }

  // Deduplicate while preserving weighted order
  const seen = new Set();
  const result = [];
  for (const req of weightedPool) {
    if (!seen.has(req.id)) {
      seen.add(req.id);
      result.push(req);
    }
  }

  return result;
}

/**
 * Check if a tier is unlocked for an empire
 * @param {number} tier - The tier to check
 * @param {Object} state - The game state
 * @param {string} empireId - The empire ID
 * @returns {boolean} Whether the tier is unlocked
 */
export function isImprovementTierUnlocked(tier, state, empireId) {
  if (tier === 1) {
    // T1 is always available
    return true;
  }

  // Check if empire exists
  const empire = state.empires?.find(e => e.id === empireId);
  if (!empire) {
    return false;
  }

  // Check tier requirements
  const requiredTier = tier - 1;
  const requiredCount = IMPROVEMENT_TIER_REQUIREMENTS[tier];
  const completedInTier = state.improvements?.queue
    .filter(i => i.empireId === empireId && i.state !== 'BUILDING' && i.tier === requiredTier)
    .length || 0;

  return completedInTier >= requiredCount;
}

/**
 * Refresh improvement suggestions in state
 */
export function refreshImprovementSuggestions(state, rng = Math.random) {
  if (!state.improvements) {
    return;
  }
  const existing = state.improvements.requests || [];
  const existingKeys = new Set(
    existing.map(request => `${request.empireId || 'none'}:${request.id}`)
  );
  const additions = generateImprovementSuggestions(state, rng).filter(request => {
    const key = `${request.empireId || 'none'}:${request.id}`;
    if (existingKeys.has(key)) {
      return false;
    }
    existingKeys.add(key);
    return true;
  });
  state.improvements.requests = [...existing, ...additions];
}

/**
 * Get improvements available to an empire (filtered by tier unlock status)
 * @param {Object} state - The game state
 * @param {string} empireId - The empire ID to check
 * @returns {Array} Array of improvement requests available to this empire
 */
export function getAvailableImprovements(state, empireId) {
  const allRequests = getAllImprovementRequests();

  return allRequests.filter(request => {
    return isImprovementTierUnlocked(request.tier, state, empireId);
  });
}
