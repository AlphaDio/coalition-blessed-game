/**
 * Sample Law Definitions for Law Enactment System
 */

import { createLawDefinition } from './types.js';

/**
 * Sample law definitions
 */
export const SAMPLE_LAW_DEFINITIONS = [
  createLawDefinition(
    'law_ai_citizenship',
    'AI Citizenship Rights',
    {
      natural_mechanical: 0.9,
      essentialist_constructivist: 0.6,
      authoritarian_liberal: 0.3
    },
    ['mechanical', 'rights'],
    {
      population_incentive: 0.3,
      security_incentive: -0.2,
      economy_incentive: 0.1
    },
    {
      DEBATE: ['rights', 'mechanical', 'philosophical'],
      FALLOUT: ['social', 'economic', 'unrest'],
      VOTING: ['procedural', 'compromise']
    }
  ),
  
  createLawDefinition(
    'law_military_draft',
    'Universal Military Conscription',
    {
      pacifist_militaristic: 0.8,
      stoicist_hedonistic: -0.4,
      authoritarian_liberal: -0.5
    },
    ['military', 'conscription'],
    {
      population_incentive: -0.4,
      security_incentive: 0.8,
      economy_incentive: -0.2
    },
    {
      DEBATE: ['military', 'security', 'rights'],
      FALLOUT: ['social', 'unrest', 'economic'],
      VOTING: ['security', 'compromise']
    }
  ),
  
  createLawDefinition(
    'law_hive_integration',
    'Hive-Mind Integration Protocol',
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
    }
  ),
  
  createLawDefinition(
    'law_resource_rationing',
    'Emergency Resource Rationing',
    {
      stoicist_hedonistic: -0.6,
      authoritarian_liberal: -0.4
    },
    ['economic', 'emergency'],
    {
      population_incentive: -0.3,
      security_incentive: 0.5,
      economy_incentive: 0.7
    },
    {
      DEBATE: ['economic', 'emergency', 'security'],
      FALLOUT: ['economic', 'unrest', 'hardship'],
      VOTING: ['emergency', 'compromise']
    }
  ),
  
  createLawDefinition(
    'law_genetic_enhancement',
    'Genetic Enhancement Program',
    {
      natural_mechanical: 0.5,
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
    }
  )
];

/**
 * Get all law definitions
 */
export function getSampleLawDefinitions() {
  return SAMPLE_LAW_DEFINITIONS;
}
