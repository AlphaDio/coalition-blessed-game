/**
 * Law Event Templates - Sample events for law enactment phases
 */

/**
 * Create a law event template
 * @param {string} id - Event identifier
 * @param {string} name - Event name
 * @param {Object} options - Event configuration options
 * @returns {Object} Law event
 */
export function createLawEvent(id, name, options = {}) {
  const {
    scope = 'LAW',
    phase_tags = [],
    nature = 'NEUTRAL',
    tier = 'MAJOR',
    triggers = [],
    base_weight = 1.0,
    effects = null,
    weight_modifiers = [],
    description = '',
    choices = null
  } = options;
  
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
    weight_modifiers,
    description,
    choices // If null, event auto-fires; if array, requires player choice
  };
}

/**
 * Sample DEBATE phase events
 */
export const DEBATE_EVENTS = [
  createLawEvent(
    'debate_passionate_speech',
    'Passionate Speech in Council',
    {
      scope: 'LAW',
      phase_tags: ['DEBATE'],
      nature: 'APPROVE',
      tier: 'MAJOR',
      triggers: [],
      base_weight: 1.0,
      effects: {
        progress: 0.3,
        meters: {
          momentum: 0.1,
          polarization: 0.05
        }
      },
      weight_modifiers: [
        { type: 'momentum_boost', multiplier: 0.5 }
      ]
    }
  ),
  
  createLawEvent(
    'debate_technical_objection',
    'Technical Objection Raised',
    {
      scope: 'LAW',
      phase_tags: ['DEBATE'],
      nature: 'REJECT',
      tier: 'MAJOR',
      triggers: [],
      base_weight: 1.0,
      effects: {
        progress: -0.1,
        meters: {
          reject_pressure: 0.15,
          momentum: -0.1
        }
      },
      weight_modifiers: [
        { type: 'reject_pressure_boost', multiplier: 0.8 }
      ]
    }
  ),
  
  createLawEvent(
    'debate_amendment_proposed',
    'Amendment Proposed',
    {
      scope: 'LAW',
      phase_tags: ['DEBATE'],
      nature: 'ADVANCE',
      tier: 'MAJOR',
      triggers: [
        { type: 'meter_above', meter: 'momentum', threshold: 0.4 }
      ],
      base_weight: 0.8,
      effects: {
        progress: 0.25,
        meters: {
          momentum: 0.05,
          legitimacy: 0.1
        }
      }
    }
  ),
  
  createLawEvent(
    'debate_empire_endorsement',
    'Empire Public Endorsement',
    {
      scope: 'LAW',
      phase_tags: ['DEBATE'],
      nature: 'APPROVE',
      tier: 'MINOR',
      triggers: [],
      base_weight: 0.6,
      effects: {
        meters: {
          momentum: 0.05,
          legitimacy: 0.05
        }
      }
    }
  ),
  
  createLawEvent(
    'debate_heated_exchange',
    'Heated Exchange',
    {
      scope: 'LAW',
      phase_tags: ['DEBATE'],
      nature: 'NEUTRAL',
      tier: 'MINOR',
      triggers: [],
      base_weight: 0.5,
      effects: {
        meters: {
          polarization: 0.1,
          unrest: 0.05
        }
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
 * Law events with player choices - DEBATE phase
 */
export const DEBATE_CHOICE_EVENTS = [
  createLawEvent(
    'debate_choice_lobby_pressure',
    'Lobbyist Pressure',
    'LAW',
    ['DEBATE'],
    'NEUTRAL',
    'MAJOR',
    [],
    1.0,
    null, // No default effects, determined by choice
    [],
    'Powerful lobbyists from various factions are pressuring the council. How should you respond?',
    [
      {
        text: 'Accept their support (gain momentum, lose legitimacy)',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.15,
            legitimacy: -0.1,
            reject_pressure: -0.05
          }
        }
      },
      {
        text: 'Reject their influence (lose momentum, gain legitimacy)',
        effects: {
          progress: 0.1,
          meters: {
            momentum: -0.1,
            legitimacy: 0.15,
            polarization: 0.05
          }
        }
      },
      {
        text: 'Negotiate a middle ground (moderate effects)',
        effects: {
          progress: 0.15,
          meters: {
            momentum: 0.05,
            legitimacy: 0.05,
            polarization: -0.05
          }
        }
      }
    ]
  ),
  
  createLawEvent(
    'debate_choice_public_forum',
    'Public Forum Requested',
    'LAW',
    ['DEBATE'],
    'NEUTRAL',
    'MAJOR',
    [],
    0.9,
    null,
    [],
    'Citizens are demanding a public forum to discuss the law. How do you proceed?',
    [
      {
        text: 'Hold an open forum (slow progress, gain legitimacy)',
        effects: {
          progress: 0.05,
          meters: {
            momentum: -0.05,
            legitimacy: 0.2,
            unrest: -0.1,
            polarization: -0.05
          }
        }
      },
      {
        text: 'Decline and expedite voting (fast progress, lose legitimacy)',
        effects: {
          progress: 0.35,
          meters: {
            momentum: 0.15,
            legitimacy: -0.15,
            unrest: 0.15,
            reject_pressure: 0.1
          }
        }
      }
    ]
  ),
  
  createLawEvent(
    'debate_choice_expert_panel',
    'Expert Panel Consultation',
    'LAW',
    ['DEBATE'],
    'ADVANCE',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'legitimacy', threshold: 0.5 }
    ],
    0.8,
    null,
    [],
    'A panel of experts offers to analyze the law. Should you incorporate their recommendations?',
    [
      {
        text: 'Accept all recommendations (high legitimacy, slow progress)',
        effects: {
          progress: 0.1,
          meters: {
            legitimacy: 0.2,
            momentum: 0.05,
            polarization: -0.1
          }
        }
      },
      {
        text: 'Cherry-pick favorable points (balanced approach)',
        effects: {
          progress: 0.2,
          meters: {
            legitimacy: 0.1,
            momentum: 0.1,
            reject_pressure: 0.05
          }
        }
      },
      {
        text: 'Dismiss the panel (maintain momentum, risk legitimacy)',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.15,
            legitimacy: -0.1,
            polarization: 0.1
          }
        }
      }
    ]
  )
];

/**
 * Law events with player choices - FALLOUT phase
 */
export const FALLOUT_CHOICE_EVENTS = [
  createLawEvent(
    'fallout_choice_opposition_rally',
    'Opposition Rally',
    'LAW',
    ['FALLOUT'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.3 }
    ],
    1.0,
    null,
    [
      { type: 'polarization_boost', multiplier: 0.8 }
    ],
    'A large opposition rally is taking place. How should you respond?',
    [
      {
        text: 'Engage with protesters (reduce unrest, slow progress)',
        effects: {
          progress: -0.1,
          meters: {
            unrest: -0.15,
            legitimacy: 0.1,
            reject_pressure: 0.05,
            momentum: -0.1
          }
        }
      },
      {
        text: 'Suppress the rally (reduce momentum, increase unrest)',
        effects: {
          progress: -0.05,
          meters: {
            unrest: 0.2,
            momentum: -0.15,
            reject_pressure: 0.15,
            legitimacy: -0.15
          }
        }
      },
      {
        text: 'Ignore and continue (maintain course, moderate risk)',
        effects: {
          progress: 0.05,
          meters: {
            unrest: 0.05,
            polarization: 0.1,
            momentum: 0.05
          }
        }
      }
    ]
  ),
  
  createLawEvent(
    'fallout_choice_economic_concerns',
    'Economic Impact Report',
    'LAW',
    ['FALLOUT'],
    'NEUTRAL',
    'MAJOR',
    [],
    0.9,
    null,
    [],
    'An economic analysis reveals potential costs. How do you address these concerns?',
    [
      {
        text: 'Fund mitigation programs (slow progress, high legitimacy)',
        effects: {
          progress: 0.05,
          meters: {
            legitimacy: 0.15,
            economy_shock: -0.1,
            momentum: -0.05,
            unrest: -0.1
          }
        }
      },
      {
        text: 'Dismiss concerns as overblown (fast progress, risk backlash)',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.15,
            economy_shock: 0.15,
            reject_pressure: 0.15,
            legitimacy: -0.1
          }
        }
      }
    ]
  ),
  
  createLawEvent(
    'fallout_choice_empire_demands',
    'Empire Makes Demands',
    'LAW',
    ['FALLOUT'],
    'NEUTRAL',
    'MAJOR',
    [],
    0.85,
    null,
    [],
    'A major empire demands concessions before supporting the law. What is your response?',
    [
      {
        text: 'Grant concessions (gain support, lose some momentum)',
        effects: {
          progress: 0.15,
          meters: {
            momentum: 0.1,
            legitimacy: -0.05,
            reject_pressure: -0.15,
            polarization: -0.05
          }
        }
      },
      {
        text: 'Refuse and risk their opposition (maintain vision, risk rejection)',
        effects: {
          progress: 0.1,
          meters: {
            momentum: 0.05,
            legitimacy: 0.1,
            reject_pressure: 0.2,
            polarization: 0.15
          }
        }
      },
      {
        text: 'Seek compromise language (balanced approach)',
        effects: {
          progress: 0.2,
          meters: {
            momentum: 0.05,
            legitimacy: 0.05,
            reject_pressure: -0.05,
            polarization: 0.05
          }
        }
      }
    ]
  )
];

/**
 * Law events with player choices - VOTING phase
 */
export const VOTING_CHOICE_EVENTS = [
  createLawEvent(
    'voting_choice_last_minute_amendment',
    'Last-Minute Amendment Proposed',
    'LAW',
    ['VOTING'],
    'NEUTRAL',
    'MAJOR',
    [],
    1.0,
    null,
    [],
    'A coalition proposes a last-minute amendment. Do you accept it?',
    [
      {
        text: 'Accept amendment (high chance of passing, changes law intent)',
        effects: {
          progress: 0.4,
          meters: {
            momentum: 0.2,
            legitimacy: 0.05,
            reject_pressure: -0.2,
            polarization: -0.1
          }
        }
      },
      {
        text: 'Reject amendment (maintain original vision, risk failure)',
        effects: {
          progress: 0.1,
          meters: {
            momentum: -0.1,
            legitimacy: 0.1,
            reject_pressure: 0.15,
            polarization: 0.15
          }
        }
      }
    ]
  ),
  
  createLawEvent(
    'voting_choice_abstention_bloc',
    'Abstention Bloc Forms',
    'LAW',
    ['VOTING'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'polarization', threshold: 0.4 }
    ],
    0.9,
    null,
    [],
    'Several empires threaten to abstain, risking quorum. How do you respond?',
    [
      {
        text: 'Offer incentives (gain votes, lose legitimacy)',
        effects: {
          progress: 0.3,
          meters: {
            momentum: 0.15,
            legitimacy: -0.15,
            reject_pressure: -0.15,
            polarization: -0.05
          }
        }
      },
      {
        text: 'Appeal to coalition values (maintain integrity, uncertain outcome)',
        effects: {
          progress: 0.15,
          meters: {
            momentum: 0.05,
            legitimacy: 0.1,
            reject_pressure: 0.05,
            polarization: 0.05
          }
        }
      },
      {
        text: 'Delay vote to build consensus (slow but safer)',
        effects: {
          progress: -0.1,
          meters: {
            momentum: -0.15,
            legitimacy: 0.05,
            reject_pressure: -0.1,
            polarization: -0.1,
            unrest: -0.05
          }
        }
      }
    ]
  ),
  
  createLawEvent(
    'voting_choice_scandal_emerges',
    'Scandal Threatens Vote',
    'LAW',
    ['VOTING'],
    'REJECT',
    'MAJOR',
    [],
    0.7,
    null,
    [],
    'A scandal related to the law surfaces just before the vote. How do you handle it?',
    [
      {
        text: 'Launch investigation (delay vote, preserve legitimacy)',
        effects: {
          progress: -0.15,
          meters: {
            legitimacy: 0.15,
            momentum: -0.2,
            reject_pressure: -0.1,
            unrest: -0.1
          }
        }
      },
      {
        text: 'Proceed with vote anyway (risk legitimacy for speed)',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.1,
            legitimacy: -0.2,
            reject_pressure: 0.2,
            unrest: 0.15,
            polarization: 0.15
          }
        }
      }
    ]
  )
];

/**
 * Get all law events
 */
export function getAllLawEvents() {
  return [
    ...DEBATE_EVENTS,
    ...FALLOUT_EVENTS,
    ...VOTING_EVENTS,
    ...DEBATE_CHOICE_EVENTS,
    ...FALLOUT_CHOICE_EVENTS,
    ...VOTING_CHOICE_EVENTS
  ];
}
