/**
 * Law Event Templates - Sample events for law enactment phases
 */

/**
 * Create a law event template
 */
export function createLawEvent(id, name, scope, phase_tags, nature, tier, triggers, base_weight, effects, weight_modifiers = []) {
  return {
    id,
    name,
    scope,
    phase_tags,
    nature,
    tier,
    triggers,
    base_weight,
    effects,
    weight_modifiers
  };
}

/**
 * Sample DEBATE phase events
 */
export const DEBATE_EVENTS = [
  createLawEvent(
    'debate_passionate_speech',
    'Passionate Speech in Council',
    'LAW',
    ['DEBATE'],
    'APPROVE',
    'MAJOR',
    [],
    1.0,
    {
      progress: 0.3,
      meters: {
        momentum: 0.1,
        polarization: 0.05
      }
    },
    [
      { type: 'momentum_boost', multiplier: 0.5 }
    ]
  ),
  
  createLawEvent(
    'debate_technical_objection',
    'Technical Objection Raised',
    'LAW',
    ['DEBATE'],
    'REJECT',
    'MAJOR',
    [],
    1.0,
    {
      progress: -0.1,
      meters: {
        reject_pressure: 0.15,
        momentum: -0.1
      }
    },
    [
      { type: 'reject_pressure_boost', multiplier: 0.8 }
    ]
  ),
  
  createLawEvent(
    'debate_amendment_proposed',
    'Amendment Proposed',
    'LAW',
    ['DEBATE'],
    'ADVANCE',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'momentum', threshold: 0.4 }
    ],
    0.8,
    {
      progress: 0.25,
      meters: {
        momentum: 0.05,
        legitimacy: 0.1
      }
    }
  ),
  
  createLawEvent(
    'debate_empire_endorsement',
    'Empire Public Endorsement',
    'LAW',
    ['DEBATE'],
    'APPROVE',
    'MINOR',
    [],
    0.6,
    {
      meters: {
        momentum: 0.05,
        legitimacy: 0.05
      }
    }
  ),
  
  createLawEvent(
    'debate_heated_exchange',
    'Heated Exchange',
    'LAW',
    ['DEBATE'],
    'NEUTRAL',
    'MINOR',
    [],
    0.5,
    {
      meters: {
        polarization: 0.1,
        unrest: 0.05
      }
    }
  )
];

/**
 * Sample FALLOUT phase events
 */
export const FALLOUT_EVENTS = [
  createLawEvent(
    'fallout_public_protest',
    'Public Protests Erupt',
    'LAW',
    ['FALLOUT'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'polarization', threshold: 0.5 }
    ],
    1.0,
    {
      progress: -0.2,
      meters: {
        unrest: 0.2,
        reject_pressure: 0.15,
        momentum: -0.15
      }
    },
    [
      { type: 'polarization_boost', multiplier: 1.0 }
    ]
  ),
  
  createLawEvent(
    'fallout_media_support',
    'Media Campaign in Support',
    'LAW',
    ['FALLOUT'],
    'APPROVE',
    'MAJOR',
    [],
    0.9,
    {
      progress: 0.2,
      meters: {
        momentum: 0.15,
        legitimacy: 0.1,
        unrest: -0.05
      }
    }
  ),
  
  createLawEvent(
    'fallout_economic_impact',
    'Economic Impact Analysis Released',
    'LAW',
    ['FALLOUT'],
    'ADVANCE',
    'MAJOR',
    [],
    0.8,
    {
      progress: 0.15,
      meters: {
        economy_shock: 0.1,
        legitimacy: 0.05
      }
    }
  ),
  
  createLawEvent(
    'fallout_minor_riot',
    'Minor Unrest Incidents',
    'LAW',
    ['FALLOUT'],
    'NEUTRAL',
    'MINOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.4 }
    ],
    0.6,
    {
      meters: {
        unrest: 0.1,
        reject_pressure: 0.05
      }
    }
  ),
  
  createLawEvent(
    'fallout_expert_testimony',
    'Expert Testimony',
    'LAW',
    ['FALLOUT'],
    'APPROVE',
    'MINOR',
    [],
    0.5,
    {
      meters: {
        legitimacy: 0.08,
        momentum: 0.03
      }
    }
  )
];

/**
 * Sample VOTING phase events
 */
export const VOTING_EVENTS = [
  createLawEvent(
    'voting_whip_success',
    'Vote Whipping Campaign',
    'LAW',
    ['VOTING'],
    'APPROVE',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'momentum', threshold: 0.5 }
    ],
    1.0,
    {
      progress: 0.3,
      meters: {
        momentum: 0.1,
        legitimacy: -0.05
      }
    }
  ),
  
  createLawEvent(
    'voting_procedural_delay',
    'Procedural Delay Tactic',
    'LAW',
    ['VOTING'],
    'REJECT',
    'MAJOR',
    [],
    0.9,
    {
      progress: -0.15,
      meters: {
        reject_pressure: 0.1,
        legitimacy: -0.05
      }
    }
  ),
  
  createLawEvent(
    'voting_compromise_reached',
    'Last-Minute Compromise',
    'LAW',
    ['VOTING'],
    'ADVANCE',
    'MAJOR',
    [
      { type: 'rejects_at_least', count: 2 }
    ],
    0.7,
    {
      progress: 0.4,
      meters: {
        momentum: 0.2,
        reject_pressure: -0.15,
        legitimacy: 0.1
      }
    }
  ),
  
  createLawEvent(
    'voting_bribery_scandal',
    'Bribery Allegations Surface',
    'LAW',
    ['VOTING'],
    'REJECT',
    'MAJOR',
    [],
    0.6,
    {
      progress: -0.25,
      meters: {
        reject_pressure: 0.2,
        legitimacy: -0.15,
        unrest: 0.1
      }
    }
  ),
  
  createLawEvent(
    'voting_empire_pledge',
    'Empire Pledges Support',
    'LAW',
    ['VOTING'],
    'APPROVE',
    'MINOR',
    [],
    0.7,
    {
      meters: {
        momentum: 0.05
      }
    }
  ),
  
  createLawEvent(
    'voting_abstention_threat',
    'Abstention Threats',
    'LAW',
    ['VOTING'],
    'NEUTRAL',
    'MINOR',
    [],
    0.5,
    {
      meters: {
        reject_pressure: 0.05,
        polarization: 0.05
      }
    }
  )
];

/**
 * Get all law events
 */
export function getAllLawEvents() {
  return [
    ...DEBATE_EVENTS,
    ...FALLOUT_EVENTS,
    ...VOTING_EVENTS
  ];
}
