import { UNITY_CONSTANTS } from './constants.js';

function createUnityEffect(id, tier, name, description, modifiers = {}, immediateEffects = {}) {
  return {
    id,
    tier,
    name,
    description,
    modifiers,
    immediateEffects
  };
}

const DEFAULT_UNITY_POOL = [
  createUnityEffect(
    'unity_foundation',
    1,
    'Civic Foundation',
    'Shared institutions strengthen civil coordination and military logistics.',
    { army_organization: 1.5, supply_efficiency: 0.04 }
  ),
  createUnityEffect(
    'unity_mobilization',
    2,
    'Mobilization Doctrine',
    'A unified doctrine speeds reinforcement and frontline replacement.',
    { army_replenishment_mult: 0.18, army_consumption_mp_gain_mult: 0.08 }
  ),
  createUnityEffect(
    'unity_scholarship',
    3,
    'Scholarship Compact',
    'Cross-sector collaboration accelerates strategic research.',
    { research_speed: 0.06 }
  ),
  createUnityEffect(
    'unity_vanguard',
    4,
    'Vanguard Consensus',
    'Unified command channels doctrine into stronger battlefield execution.',
    { army_damage_add: 0.05, army_damage_mult: 0.04 }
  ),
  createUnityEffect(
    'unity_ascendance',
    5,
    'Ascendant Cohesion',
    'Near-total strategic alignment amplifies both growth and war readiness.',
    { army_replenishment_mult: 0.22, army_damage_mult: 0.07, population_growth: 0.00018 }
  )
];

export const UNITY_EFFECT_POOLS_BY_EMPIRE = {
  empire_1: [
    createUnityEffect(
      'fed_standing_cadres',
      1,
      'Standing Cadres',
      'The federation standardizes officer colleges and reserve doctrine across sectors.',
      { army_organization: 2.0, supply_efficiency: 0.05 }
    ),
    createUnityEffect(
      'fed_logistics_grid',
      2,
      'Logistics Grid',
      'Interstellar depots and convoy timetables sharply improve replenishment pace.',
      { army_replenishment_mult: 0.26, army_consumption_mp_gain_mult: 0.1 }
    ),
    createUnityEffect(
      'fed_strategic_forums',
      3,
      'Strategic Forums',
      'Policy and war-gaming forums produce faster, more reliable strategic insights.',
      { research_speed: 0.09 }
    ),
    createUnityEffect(
      'fed_shieldwall_protocols',
      4,
      'Shieldwall Protocols',
      'Fleet and army doctrine emphasize resilient line tactics and disciplined volleys.',
      { army_damage_add: 0.07, army_damage_mult: 0.05 }
    ),
    createUnityEffect(
      'fed_grand_reserve',
      5,
      'Grand Reserve',
      'A coalition-scale reserve command gives the federation sustained operational depth.',
      { army_replenishment_mult: 0.32, army_damage_mult: 0.08, army_organization: 2.0 }
    )
  ],
  empire_2: [
    createUnityEffect(
      'verdant_bloom_charter',
      1,
      'Bloom Charter',
      'Verdant colony networks synchronize food, habitat, and civic planning.',
      { population_growth: 0.00024, supply_efficiency: 0.05 }
    ),
    createUnityEffect(
      'verdant_gene_legions',
      2,
      'Gene Legions',
      'Biological reserve systems improve replacement rates for expeditionary armies.',
      { army_replenishment_mult: 0.3, army_consumption_mp_gain_mult: 0.12 }
    ),
    createUnityEffect(
      'verdant_harmonist_pact',
      3,
      'Harmonist Pact',
      'Civic science institutions channel social unity into strategic innovation.',
      { research_speed: 0.06, army_fervor: 2.0 }
    ),
    createUnityEffect(
      'verdant_rootward_fortitude',
      4,
      'Rootward Fortitude',
      'Territorial defense doctrine hardens command structures and frontline resilience.',
      { army_organization: 2.5, army_damage_add: 0.06 }
    ),
    createUnityEffect(
      'verdant_worldseed_union',
      5,
      'Worldseed Union',
      'A mature bio-civilizational compact sustains rapid growth under long-war pressure.',
      { population_growth: 0.00035, army_replenishment_mult: 0.24, research_speed: 0.05 }
    )
  ],
  empire_3: [
    createUnityEffect(
      'nexus_border_drills',
      1,
      'Border Drills',
      'Dominion frontier commands standardize rapid-response military drills.',
      { army_organization: 2.0, army_damage_mult: 0.05 }
    ),
    createUnityEffect(
      'nexus_corridor_logistics',
      2,
      'Corridor Logistics',
      'Hyperspace corridor control improves operational refill and strategic movement.',
      { army_replenishment_mult: 0.28, supply_efficiency: 0.06 }
    ),
    createUnityEffect(
      'nexus_signal_schools',
      3,
      'Signal Schools',
      'Advanced command schools merge scouting, targeting, and doctrine analysis.',
      { research_speed: 0.07, army_damage_add: 0.05 }
    ),
    createUnityEffect(
      'nexus_hyperlane_phalanx',
      4,
      'Hyperlane Phalanx',
      'Coordinated lane-control formations sharpen aggression and engagement quality.',
      { army_fervor: 3.0, army_damage_mult: 0.07 }
    ),
    createUnityEffect(
      'nexus_war_arbiter',
      5,
      'War Arbiter Network',
      'Centralized theater arbitration synchronizes doctrine, reinforcements, and strikes.',
      { army_organization: 3.0, army_damage_add: 0.1, army_replenishment_mult: 0.22 }
    )
  ],
  empire_hive: [
    createUnityEffect(
      'swarm_brood_reconstitution',
      1,
      'Brood Reconstitution',
      'Synaptic gestation swarms dramatically accelerate military recovery cycles.',
      { army_replenishment_mult: 0.55, army_consumption_mp_gain_mult: 0.2 }
    ),
    createUnityEffect(
      'swarm_synaptic_overdrive',
      2,
      'Synaptic Overdrive',
      'Distributed war-instinct routing boosts frontline aggression and reaction speed.',
      { army_damage_mult: 0.08, army_fervor: 2.0 }
    ),
    createUnityEffect(
      'swarm_metabolic_surplus',
      3,
      'Metabolic Surplus',
      'The hive redirects biomass ecosystems toward population and supply stability.',
      { population_growth: 0.00022, supply_efficiency: 0.05 }
    ),
    createUnityEffect(
      'swarm_adaptive_chitin',
      4,
      'Adaptive Chitin Doctrine',
      'Rapid adaptation loops harden combat organisms while increasing strike output.',
      { army_damage_add: 0.09, army_organization: 2.0 }
    ),
    createUnityEffect(
      'swarm_endless_warren',
      5,
      'Endless Warren',
      'Mature synaptic nesting enables relentless long-war regeneration and pressure.',
      { army_replenishment_mult: 0.4, army_damage_mult: 0.12, research_speed: 0.06 }
    )
  ],
  empire_clockwork: [
    createUnityEffect(
      'clockwork_quantum_cache',
      1,
      'Quantum Cache',
      'Shared synthetic memory banks accelerate optimization and strategic planning.',
      { research_speed: 0.12, supply_efficiency: 0.08 }
    ),
    createUnityEffect(
      'clockwork_targeting_mesh',
      2,
      'Targeting Mesh',
      'Collective combat prediction refines kill-box creation and strike precision.',
      { army_damage_add: 0.1, army_damage_mult: 0.05 }
    ),
    createUnityEffect(
      'clockwork_self_repair_fabric',
      3,
      'Self-Repair Fabric',
      'Nanotectonic maintenance grids keep synthetic battlegroups recovering under stress.',
      { army_replenishment_mult: 0.35, army_consumption_mp_gain_mult: 0.22 }
    ),
    createUnityEffect(
      'clockwork_command_matrices',
      4,
      'Command Matrices',
      'Linked command matrices synchronize strategic and tactical execution.',
      { army_organization: 2.5, research_speed: 0.08 }
    ),
    createUnityEffect(
      'clockwork_omniline',
      5,
      'Omniline Directive',
      'A full-spectrum synthetic command web amplifies every stage of war logistics.',
      { army_organization: 3.0, army_damage_mult: 0.1, supply_efficiency: 0.1 }
    )
  ]
};

export function getUnityEffectPool(empireId) {
  const pool = UNITY_EFFECT_POOLS_BY_EMPIRE[empireId];
  if (Array.isArray(pool) && pool.length > 0) {
    return pool;
  }
  return DEFAULT_UNITY_POOL;
}

export function getUnityEffectForEmpire(empireId, level = 0) {
  const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
  if (normalizedLevel >= UNITY_CONSTANTS.MAX_TIERS) {
    return null;
  }
  const pool = getUnityEffectPool(empireId);
  return pool[normalizedLevel] || null;
}
