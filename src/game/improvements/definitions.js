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
// Define-level sustainment is expressed in tame units (e.g. 1-5 for T1, decimals allowed).
// Runtime scales these values with population and a sustainment scale constant.

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
      'Foundry Ring',
      'A continent-scale orbital ring of furnaces and docks turning raw matter into strategic hull metal.',
      1,
      'industrial',
      {
        suppliesCost: 160,
        build: 180,
        capacity: 2,
        sustainmentCost: { biomass: 3.5, plasma_fuel: 2.5 },
        productionOutputs: { super_alloys: 0.034 },
        modifiers: { industrial_output: 0.03 },
        tags: ['mega_structure', 'industrial', 'production', 'orbital', 'ring'],
        requisitionUpkeep: 2
      }
    ),

    createTieredImprovementRequest(
     'asteroid_mining',
     'Asteroid Strip Array',
     'A chained lattice of mining anchors shaving entire asteroid belts into strategic feedstock.',
     1,
     'industrial',
      {
       suppliesCost: 220,
       build: 240,
       capacity: 2,
        sustainmentCost: { plasma_fuel: 2.5 },
        productionOutputs: { rare_gases: 0.04, plasma_fuel: 0.023 },
        modifiers: {},
       tags: ['mega_structure', 'industrial', 'mining', 'automated', 'array'],
       requisitionUpkeep: 2
     }
    ),

    createTieredImprovementRequest(
      'requisition_processing_center',
      'Coalition Requisition Forge',
      'A vast conversion forge that melts captured commodities into fuel cells, supply crates, and direct requisition throughput.',
      1,
      'industrial',
      {
        suppliesCost: 170,
        build: 210,
        capacity: 2,
        sustainmentCost: { biomass: 3 },
        productionOutputs: { plasma_fuel: 0.115, requisition: 9 },
        modifiers: { industrial_output: 0.02 },
        tags: ['mega_structure', 'industrial', 'requisition', 'conversion', 'forge'],
        requisitionUpkeep: 2
      }
    ),

    createTieredImprovementRequest(
      'nano_lattice_plant',
      'Nano-Lattice Crucible',
      'A sealed industrial crucible weaving nanoscopic machine swarms for fleet maintenance and battlefield repair.',
      1,
      'industrial',
      {
        suppliesCost: 180,
        build: 200,
        capacity: 2,
        sustainmentCost: { super_alloys: 3.5, plasma_fuel: 2.5 },
        productionOutputs: { nano_machines: 0.032 },
        modifiers: { supply_efficiency: 0.03 },
        tags: ['mega_structure', 'industrial', 'production', 'nano', 'precision'],
        requisitionUpkeep: 2
      }
    ),

    // T2: Advanced manufacturing

    createTieredImprovementRequest(
      'quantum_fabricator',
      'Quantum Fabrication Lattice',
      'A kilometer-spanning fabrication lattice assembling high-order components from atomically controlled matter streams.',
      2,
      'industrial',
      {
        suppliesCost: 460,
        build: 460,
        capacity: 2,
        sustainmentCost: { super_alloys: 6, rare_gases: 5 },
        productionOutputs: { quantum_circuits: 0.064 },
        modifiers: { industrial_output: 0.05 },
        tags: ['mega_structure', 'industrial', 'fabrication', 'quantum'],
        requisitionUpkeep: 7
      }
    ),

    // T3: Transcendent industry
    createTieredImprovementRequest(
      'dyson_harvester',
      'Dyson Mantle',
      'A proto-Dyson mantle drawing star-fire through planetary-scale collectors and feeding entire industrial sectors.',
      3,
      'industrial',
      {
        suppliesCost: 1350,
        build: 1000,
        capacity: 6,
        sustainmentCost: { quantum_circuits: 10, super_alloys: 12 },
        productionOutputs: { dark_matter: 0.007, quantum_circuits: 0.092 },
        modifiers: { industrial_output: 0.16, coalition_construction_mult: 0.3 },
        tags: ['mega_structure', 'industrial', 'energy', 'transcendent'],
        requisitionUpkeep: 10
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
     'Stellar Research Arcology',
     'A densely layered arcology of observatories, vaults, and experimental bays driving frontier science.',
     1,
     'research',
      {
       suppliesCost: 240,
       build: 260,
       capacity: 2,
       sustainmentCost: { rare_gases: 2.5, plasma_fuel: 1.5 },
       productionOutputs: {},
       modifiers: { research_speed: 0.2 },
       tags: ['mega_structure', 'research', 'facility', 'arcology'],
       requisitionUpkeep: 2
     }
   ),

   createTieredImprovementRequest(
     'circuit_synthesis_lab',
     'Circuit Synthesis Vault',
     'A secure vault-complex lithographing exotic circuit substrates for high-end science and command systems.',
     1,
     'research',
     {
       suppliesCost: 210,
       build: 230,
       capacity: 2,
       sustainmentCost: { super_alloys: 2.5, rare_gases: 2.5 },
       productionOutputs: { quantum_circuits: 0.026 },
       modifiers: { research_speed: 0.08 },
       tags: ['mega_structure', 'research', 'quantum', 'circuits', 'synthesis'],
       requisitionUpkeep: 2
     }
   ),

   // T2: Advanced research
   createTieredImprovementRequest(
     'neural_network',
     'Neural Constellation Grid',
     'An interlinked constellation of cognition nodes that shortens years of research into a single legislative cycle.',
     2,
     'research',
      {
       suppliesCost: 440,
       build: 420,
       capacity: 4,
       sustainmentCost: { rare_gases: 5, quantum_circuits: 4 },
       productionOutputs: {},
       modifiers: { research_speed: 0.4 },
       tags: ['mega_structure', 'research', 'computing', 'neural'],
       requisitionUpkeep: 7
     }
   ),

   // T3: Transcendent research
   createTieredImprovementRequest(
     'ascension_spire',
     'Ascension Spire Array',
     'A world-piercing spire array dedicated to dangerous, civilization-defining leaps in knowledge.',
     3,
     'research',
     {
       suppliesCost: 900,
       build: 900,
       capacity: 6,
        sustainmentCost: { rare_gases: 6, quantum_circuits: 5, genomes: 5 },
        productionOutputs: { rare_gases: 0.058 },
       modifiers: { research_speed: 0.7 },
        tags: ['mega_structure', 'research', 'knowledge', 'transcendent'],
        requisitionUpkeep: 10
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
    'Strategic War Citadel',
    'A fortified command-citadel drilling officers, doctrine cadres, and assault reserves under one banner.',
    1,
    'military',
    {
      suppliesCost: 160,
      build: 160,
      capacity: 2,
      sustainmentCost: { biomass: 5, plasma_fuel: 1.5 },
      productionOutputs: {},
      modifiers: { army_organization: 0.8, army_fervor: 0.8, army_damage_mult: 0.04, army_replenishment_mult: 0.06 },
      tags: ['mega_structure', 'military', 'training', 'organization', 'fervor'],
      requisitionUpkeep: 2
    }
  ),

  createTieredImprovementRequest(
    'mobilization_docks',
    'Mobilization Drydock Ring',
    'A reserve-fleet drydock ring built to cycle crews, hulls, and replacement cadres into active deployment at wartime tempo.',
    1,
    'military',
    {
      suppliesCost: 190,
      build: 180,
      capacity: 2,
      sustainmentCost: { biomass: 4, plasma_fuel: 2 },
      productionOutputs: { plasma_fuel: 0.035 },
      modifiers: { army_replenishment_mult: 0.12, army_consumption_mp_gain_mult: 0.15 },
      tags: ['mega_structure', 'military', 'mobilization', 'reserve', 'drydock'],
      requisitionUpkeep: 3
    }
  ),

  // T2: Advanced military
  createTieredImprovementRequest(
    'grand_symposium',
    'Grand War Conclave',
    'A strategic conclave coordinating distant fronts, reserve fleets, and theater logistics through hardened war rooms.',
    2,
    'military',
    {
      suppliesCost: 460,
      build: 420,
      capacity: 2,
      sustainmentCost: { super_alloys: 6, biomass: 3 },
      productionOutputs: {},
      modifiers: {
        army_organization: 1.4,
        supply_efficiency: 0.08,
        army_damage_mult: 0.06,
        army_replenishment_mult: 0.12,
        army_consumption_mp_gain_mult: 0.15
      },
      tags: ['mega_structure', 'military', 'coordination'],
      requisitionUpkeep: 7
    }
  ),

  createTieredImprovementRequest(
    'combat_cloning_vault',
    'Combat Cloning Vault',
    'A sealed reserve-vault of accelerated gestation chambers, indoctrination lattices, and rearmament gantries for rapid force replacement.',
    2,
    'military',
    {
      suppliesCost: 520,
      build: 360,
      capacity: 3,
      sustainmentCost: { genomes: 4, psycho_implants: 3, biomass: 2 },
      productionOutputs: {},
      modifiers: { army_replenishment_mult: 0.18, army_consumption_mp_gain_mult: 0.22, army_fervor: 1.0 },
      manpowerGrant: 1200,
      tags: ['mega_structure', 'military', 'cloning', 'reserve'],
      requisitionUpkeep: 6
    }
  ),

  // T3: Transcendent military
  createTieredImprovementRequest(
    'imperial_fortress',
    'Imperial Bastion World',
    'A fortress-world command bastion anchoring strategic reserves, hardened arsenals, and war-state communications.',
    3,
    'military',
    {
      suppliesCost: 1200,
      build: 900,
      capacity: 6,
      sustainmentCost: { super_alloys: 10, quantum_circuits: 6 },
      productionOutputs: {},
      modifiers: {
        army_organization: 2.4,
        army_fervor: 1.4,
        supply_efficiency: 0.12,
        army_damage_add: 0.16,
        army_damage_mult: 0.09,
        army_replenishment_mult: 0.18,
        army_consumption_mp_gain_mult: 0.22
      },
      tags: ['mega_structure', 'military', 'fortress', 'transcendent'],
      requisitionUpkeep: 10
    }
  ),

  createTieredImprovementRequest(
    'cataphract_forge',
    'Cataphract Forge Halo',
    'A halo of siege foundries and armored-muster vaults that refits whole theaters of war around a standing shock reserve.',
    3,
    'military',
    {
      suppliesCost: 1280,
      build: 980,
      capacity: 6,
      sustainmentCost: { super_alloys: 8, plasma_fuel: 5, quantum_circuits: 4 },
      productionOutputs: {},
      modifiers: {
        army_organization: 2.5,
        army_damage_add: 0.22,
        army_damage_mult: 0.10,
        army_replenishment_mult: 0.24,
        army_consumption_mp_gain_mult: 0.30
      },
      manpowerGrant: 2500,
      tags: ['mega_structure', 'military', 'siege', 'armor', 'muster'],
      requisitionUpkeep: 11
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
      'Biosphere Arcology',
      'A sealed biosphere-arcology combining food webs, housing terraces, and cultural plazas for mass civilian growth.',
      1,
      'cultural',
      {
        suppliesCost: 140,
        build: 180,
        capacity: 2,
        sustainmentCost: { plasma_fuel: 2.5, biomass: 4 },
        productionOutputs: { biomass: 0.046 },
        modifiers: { population_growth: 0.06, empire_approval: 4, hero_siphon_efficiency_add: 0.01 },
        tags: ['mega_structure', 'cultural', 'agriculture', 'social', 'food', 'arcology'],
        requisitionUpkeep: 2
      }
    ),

   // T2: Advanced culture
   createTieredImprovementRequest(
     'festival_grounds',
     'Festival Ring of Worlds',
     'A ceremonial ring-habitat hosting system-wide rites, games, and feasts that bind subject populations together.',
     2,
     'cultural',
     {
       suppliesCost: 620,
       build: 300,
       capacity: 4,
        sustainmentCost: { genomes: 4, psycho_implants: 4, biomass: 3 },
        productionOutputs: { genomes: 0.023 },
       modifiers: { population_growth: 0.12, empire_approval: 7 },
       tags: ['mega_structure', 'cultural', 'celebration', 'biologic'],
       requisitionUpkeep: 7
     }
   ),

   // T3: Transcendent culture
   createTieredImprovementRequest(
     'harmony_nexus',
     'Harmony Halo',
     'A transcendent halo of civic, agricultural, and ritual infrastructure engineered to stabilize entire populations.',
     3,
     'cultural',
     {
       suppliesCost: 1050,
       build: 720,
       capacity: 6,
        sustainmentCost: { genomes: 6, psycho_implants: 5, ancient_relics: 3 },
        productionOutputs: { genomes: 0.046, psycho_implants: 0.092 },
       modifiers: { population_growth: 0.22, empire_approval: 12, hero_siphon_efficiency_add: 0.02 },
       tags: ['mega_structure', 'cultural', 'unity', 'transcendent', 'biologic'],
       requisitionUpkeep: 10
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
      'Trade Relay Nexus',
      'A fortified exchange nexus routing caravans, convoy manifests, and customs traffic across multiple sectors.',
      1,
      'economic',
     {
       suppliesCost: 220,
       build: 240,
       capacity: 2,
       sustainmentCost: { plasma_fuel: 2.5, super_alloys: 1.5 },
       productionOutputs: {},
       modifiers: { trade_income: 35 },
      tags: ['mega_structure', 'economic', 'trade', 'relay'],
      requisitionUpkeep: 2
    }
  ),

  // T2: Advanced economy
    createTieredImprovementRequest(
      'convergence_nexus',
      'Convergence Exchange Ring',
      'A ring-market of bonded vaults and exchange docks where entire planetary economies clear in a single cycle.',
      2,
      'economic',
    {
      suppliesCost: 520,
      build: 480,
      capacity: 2,
      sustainmentCost: { plasma_fuel: 5, rare_gases: 3 },
      productionOutputs: {},
      modifiers: { trade_income: 180, market_efficiency: 0.08 },
      tags: ['mega_structure', 'economic', 'trade', 'marketplace'],
      requisitionUpkeep: 7
    }
  ),

  // T3: Transcendent economy
    createTieredImprovementRequest(
      'wealth_singularity',
      'Treasury Singularity',
      'A high-order treasury engine arbitraging quantum markets, debt webs, and strategic scarcity at imperial scale.',
      3,
      'economic',
    {
      suppliesCost: 1300,
      build: 980,
      capacity: 6,
      sustainmentCost: { quantum_circuits: 6, psycho_implants: 7, sentient_cores: 8 },
      productionOutputs: {},
       modifiers: { trade_income: 450, market_efficiency: 0.12, industrial_output: 0.05 },
       tags: ['mega_structure', 'economic', 'wealth', 'transcendent'],
       requisitionUpkeep: 10
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
     'Relic Cathedral',
     'A monumental reliquary cathedral channeling relic-lore into discipline, devotion, and martial fervor.',
     1,
     'spiritual',
     {
       suppliesCost: 140,
       build: 160,
       capacity: 2,
       sustainmentCost: { biomass: 2.5, plasma_fuel: 1.5 },
       productionOutputs: { ancient_relics: 0.046 },
       modifiers: { army_fervor: 4 },
       tags: ['mega_structure', 'spiritual', 'morale', 'relics'],
       requisitionUpkeep: 2
     }
   ),

   // T2: Advanced spiritual
   createTieredImprovementRequest(
     'monument_of_ages',
     'Monument of Endless Ages',
     'A towering memorial axis broadcasting the mythic memory of fallen civilizations into every active warfront.',
     2,
     'spiritual',
     {
       suppliesCost: 520,
       build: 460,
       capacity: 4,
        sustainmentCost: { ancient_relics: 4, psycho_implants: 4 },
        productionOutputs: { ancient_relics: 0.075 },
       modifiers: { army_fervor: 8, cohesionModifier: 1.03 },
       tags: ['mega_structure', 'spiritual', 'heritage', 'relics'],
       requisitionUpkeep: 7
     }
   ),

   // T3: Transcendent spiritual
   createTieredImprovementRequest(
     'sanctum_of_eternity',
     'Eternity Reliquary',
     'A transcendent reliquary-temple where relic harmonics forge long-war resolve across the entire coalition front.',
     3,
     'spiritual',
     {
       suppliesCost: 1050,
       build: 850,
       capacity: 6,
        sustainmentCost: { ancient_relics: 6, psycho_implants: 5, sentient_cores: 4 },
        productionOutputs: { ancient_relics: 0.115 },
       modifiers: { army_fervor: 15, cohesionModifier: 1.06, empire_approval: 3 },
       tags: ['mega_structure', 'spiritual', 'transcendent', 'relics'],
       requisitionUpkeep: 10
     }
   )
 ];

/**
 * GOVERNANCE BRANCH
 * Focus: Law progress, political efficiency, coalition management
 * Thematic Resource: Sentient Cores -> Intel and forecast confidence
 */
const GOVERNANCE_BRANCH = [
   // T1: Basic governance
   createTieredImprovementRequest(
     'administrative_hub',
     'Civic Command Arcology',
     'A hardened civic arcology coordinating logistics bureaus, planning ministries, and construction authorities.',
     1,
     'governance',
     {
       suppliesCost: 130,
       build: 150,
       capacity: 2,
       sustainmentCost: { super_alloys: 2.5, plasma_fuel: 1.5 },
       productionOutputs: {},
       modifiers: { law_progress_speed: 0.14, improvement_queue_capacity: 3 },
       tags: ['mega_structure', 'governance', 'administration', 'arcology'],
       requisitionUpkeep: 4
     }
   ),

   // T2: Advanced governance
   createTieredImprovementRequest(
     'council_spire',
     'Council Constellarium',
     'A star-lit deliberation tower where synthetic delegates model legislation and strategic response in parallel.',
     2,
     'governance',
    {
      suppliesCost: 520,
       build: 520,
       capacity: 4,
       sustainmentCost: { sentient_cores: 4, quantum_circuits: 3, rare_gases: 3 },
       productionOutputs: {},
       modifiers: { law_progress_speed: 0.24, tick_delay_multiplier: 0.60, improvement_queue_capacity: 2 },
       tags: ['mega_structure', 'governance', 'council', 'sentient'],
       requisitionUpkeep: 7
     }
   ),

   createTieredImprovementRequest(
     'cognition_foundry',
     'Cognition Vault',
     'A strategic vault of cognition vats and policy engines growing sentient cores for command forecasting.',
     2,
     'governance',
     {
       suppliesCost: 460,
       build: 420,
       capacity: 4,
       sustainmentCost: { quantum_circuits: 3, rare_gases: 3 },
       productionOutputs: { sentient_cores: 0.058 },
       modifiers: { law_progress_speed: 0.18, market_efficiency: 0.06, research_speed: 0.08 },
       tags: ['mega_structure', 'governance', 'sentient', 'intel'],
       requisitionUpkeep: 6
     }
   ),

   // T3: Transcendent governance
   createTieredImprovementRequest(
     'omniscient_senate',
     'Omniscient Synod',
     'A transcendent synod of linked intellects adjudicating policy, crisis response, and interstellar construction priorities.',
     3,
     'governance',
     {
       suppliesCost: 1200,
       build: 960,
       capacity: 6,
        sustainmentCost: { sentient_cores: 8, quantum_circuits: 5, psycho_implants: 5 },
        productionOutputs: { sentient_cores: 0.045 },
       modifiers: { law_progress_speed: 0.38, tick_delay_multiplier: 0.70, cohesionModifier: 1.05, improvement_queue_capacity: 4 },
       tags: ['mega_structure', 'governance', 'transcendent', 'sentient'],
       requisitionUpkeep: 10
     }
   )
 ];

/**
  * RESOURCE BRANCH
  * Focus: Resource extraction and generation (sustain + outputs)
  * Role: Passive income of basic resources; T1 requires sustainment like other branches
  * T1: Basic extractors and fabricators (can produce T1-T3 commodities)
  * T2: Advanced facilities (higher output, tier-appropriate commodities)
  */
const RESOURCE_BRANCH = [
    // T1: Basic extractors - lower output than T2, but available immediately
   createTieredImprovementRequest(
     'fuel_extractor',
     'Fuel Mantle Extractor',
     'A deep-bore extraction mantle drawing volatile fuel streams from asteroid cores and cometary seams.',
     1,
     'resource',
     {
       suppliesCost: 110,
       build: 120,
       capacity: 1,
       sustainmentCost: { biomass: 1.5 },
       productionOutputs: { plasma_fuel: 0.185 },
       modifiers: {},
       tags: ['mega_structure', 'resource', 'passive', 'extraction'],
       requisitionUpkeep: 2
     }
   ),

   createTieredImprovementRequest(
     'alloy_foundry',
     'Alloy Spine Foundry',
     'A spinal foundry line forging bulk structural alloys for fleets, colonies, and orbital works.',
     1,
     'resource',
     {
       suppliesCost: 180,
       build: 150,
       capacity: 2,
        sustainmentCost: { plasma_fuel: 1.5 },
        productionOutputs: { super_alloys: 0.064 },
       modifiers: {},
       tags: ['mega_structure', 'resource', 'passive', 'production'],
       requisitionUpkeep: 2
     }
   ),

   createTieredImprovementRequest(
     'genomic_lab',
     'Genome Crucible',
     'A bioindustrial crucible growing curated genome lines for laboratories, hatcheries, and strategic adaptation programs.',
     1,
     'resource',
     {
       suppliesCost: 150,
       build: 150,
       capacity: 2,
       sustainmentCost: { biomass: 2 },
       productionOutputs: { genomes: 0.021 },
       modifiers: { research_speed: 0.18 }, // 18% research speed bonus
       tags: ['mega_structure', 'resource', 'passive', 'research'],
       requisitionUpkeep: 2
     }
   ),

   createTieredImprovementRequest(
     'mycellium_grove',
     'Mycelial Biosphere',
     'A continent-scale fungal biosphere converting waste heat and nutrients into biomass and adaptive tissues.',
     1,
     'resource',
     {
       suppliesCost: 130,
       build: 130,
       capacity: 1,
       sustainmentCost: { plasma_fuel: 1.5, rare_gases: 1 },
       productionOutputs: { biomass: 0.08, genomes: 0.023 },
       modifiers: {},
       tags: ['mega_structure', 'resource', 'passive', 'biologic', 'organic'],
       requisitionUpkeep: 2
     }
   ),

   createTieredImprovementRequest(
     'nebulae_mining_initiatives',
     'Nebula Harvest Lattice',
     'A cloud-harvest lattice condensing rare gases and volatile fuel from diffuse nebular fronts.',
     1,
     'resource',
     {
       suppliesCost: 130,
       build: 130,
       capacity: 1,
       sustainmentCost: { plasma_fuel: 2, super_alloys: 1 },
       productionOutputs: { rare_gases: 0.185, plasma_fuel: 0.035 },
       modifiers: {},
       tags: ['mega_structure', 'resource', 'passive', 'mining'],
       requisitionUpkeep: 2
     }
   ),

   // T2: Advanced resource facilities - higher output

   // T2: Exotic matter facility - produces all three ultra-advanced commodities needed for Dark Matter Power Surge
   createTieredImprovementRequest(
     'exotic_matter_fabricator',
     'Exotic Matter Lattice',
     'A high-risk lattice for exotic fabrication, yielding the rare strategic materials needed for singular projects.',
     2,
     'resource',
     {
       suppliesCost: 520,
       build: 520,
       capacity: 2,
       sustainmentCost: { quantum_circuits: 4, genomes: 4, plasma_fuel: 5 },
       productionOutputs: {
         wormhole_reactors: 0.115,
         dark_matter: 0.007,
         nano_machines: 0.07
       },
       modifiers: { industrial_output: 0.05 },
       tags: ['mega_structure', 'resource', 'passive', 'exotic', 'advanced_commodity'],
       requisitionUpkeep: 7
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
