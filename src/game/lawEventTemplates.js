/**
 * Law Event Templates - Events for law enactment phases
 * 
 * METER PRIMARY EFFECTS (decoupled):
 * - Momentum: boosts APPROVE/ADVANCE event chance/size
 * - Reject_Pressure: boosts REJECT/STALL event chance, hard rejects
 * - Legitimacy: reduces unrest consequences, improves vote threshold
 * - Unrest: produces externalities (cohesion/approval loss), boosts EXTERNALITY events
 * 
 * Events should primarily modify ONE meter. Progress is separate.
 */

const EFFECT_RANGE_MULTIPLIER = 2;

function scaleEffects(effects) {
  if (!effects) {
    return effects;
  }

  const scaled = { ...effects };

  Object.entries(scaled).forEach(([key, value]) => {
    if (key === 'meters' && value && typeof value === 'object') {
      const meters = { ...value };
      Object.keys(meters).forEach((meterKey) => {
        if (typeof meters[meterKey] === 'number') {
          meters[meterKey] *= EFFECT_RANGE_MULTIPLIER;
        }
      });
      scaled.meters = meters;
      return;
    }

    if (typeof value === 'number') {
      scaled[key] = value * EFFECT_RANGE_MULTIPLIER;
    }
  });

  return scaled;
}

function scaleChoices(choices) {
  if (!choices) {
    return choices;
  }

  return choices.map((choice) => {
    if (!choice || !choice.effects) {
      return choice;
    }

    return {
      ...choice,
      effects: scaleEffects(choice.effects)
    };
  });
}

/**
 * Create a law event template
 * @param {string} id - Event identifier
 * @param {string} name - Event name
 * @param {Object|string} optionsOrScope - Options object or scope string
 * @returns {Object} Law event
 */
export function createLawEvent(
  id,
  name,
  optionsOrScope = {},
  phase_tags = [],
  nature = 'NEUTRAL',
  tier = 'MAJOR',
  triggers = [],
  base_weight = 1.0,
  effects = null,
  weight_modifiers = [],
  description = '',
  choices = null
) {
  const options = (optionsOrScope && typeof optionsOrScope === 'object' && !Array.isArray(optionsOrScope))
    ? optionsOrScope
    : {
      scope: optionsOrScope,
      phase_tags,
      nature,
      tier,
      triggers,
      base_weight,
      effects,
      weight_modifiers,
      description,
      choices
    };

  const {
    scope = 'LAW',
    phase_tags: phaseTags = [],
    nature: eventNature = 'NEUTRAL',
    tier: eventTier = 'MAJOR',
    triggers: eventTriggers = [],
    base_weight: baseWeight = 1.0,
    effects: eventEffects = null,
    weight_modifiers: weightModifiers = [],
    description: eventDescription = '',
    choices: eventChoices = null
  } = options;

  return {
    id,
    name,
    scope,
    phase_tags: phaseTags,
    nature: eventNature,
    tier: eventTier,
    triggers: eventTriggers,
    base_weight: baseWeight,
    effects: scaleEffects(eventEffects),
    weight_modifiers: weightModifiers,
    description: eventDescription,
    choices: scaleChoices(eventChoices)
  };
}

/**
 * DEBATE phase events
 */
export const DEBATE_EVENTS = [
  // APPROVE events - boosted by Momentum
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
      meters: { momentum: 0.1 }
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
      meters: { momentum: 0.08 }
    }
  ),
  
  // ADVANCE events - boosted by Momentum
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
      meters: { legitimacy: 0.1 }  // Primary: legitimacy (amendment adds validity)
    }
  ),
  
  // REJECT events - boosted by Reject_Pressure (require high pressure)
  createLawEvent(
    'debate_technical_objection',
    'Technical Objection Raised',
    'LAW',
    ['DEBATE'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'reject_pressure', threshold: 0.5 }
    ],
    0.4,
    {
      progress: -0.1,
      meters: { reject_pressure: 0.1 }  // Primary: reject_pressure
    }
  ),
  
  // Additional APPROVE/ADVANCE events to balance
  createLawEvent(
    'debate_coalition_backing',
    'Coalition Leadership Backing',
    'LAW',
    ['DEBATE'],
    'APPROVE',
    'MAJOR',
    [],
    1.2,
    {
      progress: 0.25,
      meters: { momentum: 0.08, legitimacy: 0.05 }
    }
  ),
  
  createLawEvent(
    'debate_procedural_clarity',
    'Procedural Clarity Achieved',
    'LAW',
    ['DEBATE'],
    'ADVANCE',
    'MINOR',
    [],
    0.8,
    {
      progress: 0.15,
      meters: { momentum: 0.05 }
    }
  ),
  
  createLawEvent(
    'debate_broad_consensus',
    'Broad Consensus Emerging',
    'LAW',
    ['DEBATE'],
    'APPROVE',
    'MAJOR',
    [],
    1.0,
    {
      progress: 0.2,
      meters: { momentum: 0.1, reject_pressure: -0.05 }
    }
  ),
  
  createLawEvent(
    'debate_favorable_precedent',
    'Favorable Precedent Cited',
    'LAW',
    ['DEBATE'],
    'ADVANCE',
    'MINOR',
    [],
    0.7,
    {
      progress: 0.12,
      meters: { legitimacy: 0.08 }
    }
  ),
  
  // NEUTRAL events - general
  createLawEvent(
    'debate_heated_exchange',
    'Heated Exchange',
    'LAW',
    ['DEBATE'],
    'NEUTRAL',
    'MINOR',
    [],
    0.4,
    {
      meters: { unrest: 0.05 }
    }
  )
];

/**
 * FALLOUT phase events
 */
export const FALLOUT_EVENTS = [
  // REJECT events - boosted by Reject_Pressure
  createLawEvent(
    'fallout_public_protest',
    'Public Protests Erupt',
    'LAW',
    ['FALLOUT'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.55 }
    ],
    0.5,
    {
      progress: -0.15,
      meters: { reject_pressure: 0.15, unrest: -0.12 }  // Self-limiting: protests release tension
    }
  ),
  
  createLawEvent(
    'fallout_minor_riot',
    'Minor Unrest Incidents',
    'LAW',
    ['FALLOUT'],
    'REJECT',
    'MINOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.45 }
    ],
    0.4,
    {
      meters: { reject_pressure: 0.06, unrest: -0.05 }  // Self-limiting: minor release of tension
    }
  ),
  
  // APPROVE events - boosted by Momentum
  createLawEvent(
    'fallout_media_support',
    'Media Campaign in Support',
    'LAW',
    ['FALLOUT'],
    'APPROVE',
    'MAJOR',
    [],
    1.2,
    {
      progress: 0.2,
      meters: { momentum: 0.15, unrest: -0.04 }  // Media support calms public
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
    0.8,
    {
      meters: { legitimacy: 0.1 }  // Primary: legitimacy (expert validation)
    }
  ),
  
  createLawEvent(
    'fallout_public_support',
    'Public Support Rallies',
    'LAW',
    ['FALLOUT'],
    'APPROVE',
    'MAJOR',
    [],
    1.0,
    {
      progress: 0.2,
      meters: { momentum: 0.1, unrest: -0.08 }  // Rallies reduce unrest more
    }
  ),
  
  createLawEvent(
    'fallout_diplomatic_progress',
    'Diplomatic Progress Made',
    'LAW',
    ['FALLOUT'],
    'ADVANCE',
    'MINOR',
    [],
    0.9,
    {
      progress: 0.15,
      meters: { legitimacy: 0.08 }
    }
  ),
  
  // ADVANCE events - boosted by Momentum
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
      meters: { legitimacy: 0.08 }  // Primary: legitimacy (informed process)
    }
  )
];

/**
 * VOTING phase events
 */
export const VOTING_EVENTS = [
  // APPROVE events - boosted by Momentum
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
      meters: { momentum: 0.1 }  // Primary: momentum
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
      meters: { momentum: 0.08 }  // Primary: momentum
    }
  ),
  
  // REJECT events - boosted by Reject_Pressure
  createLawEvent(
    'voting_procedural_delay',
    'Procedural Delay Tactic',
    'LAW',
    ['VOTING'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'reject_pressure', threshold: 0.65 }
    ],
    0.4,
    {
      progress: -0.12,
      meters: { reject_pressure: -0.1 }  // Self-limiting: using the tactic exhausts it
    }
  ),
  
  createLawEvent(
    'voting_bribery_scandal',
    'Bribery Allegations Surface',
    'LAW',
    ['VOTING'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_below', meter: 'legitimacy', threshold: 0.4 }
    ],
    0.4,
    {
      progress: -0.25,
      meters: { legitimacy: -0.2 }  // Primary: legitimacy (scandal hurts validity)
    }
  ),
  
  // Additional APPROVE events
  createLawEvent(
    'voting_coalition_endorsement',
    'Coalition Formal Endorsement',
    'LAW',
    ['VOTING'],
    'APPROVE',
    'MAJOR',
    [],
    1.0,
    {
      progress: 0.25,
      meters: { momentum: 0.1, legitimacy: 0.05 }
    }
  ),
  
  createLawEvent(
    'voting_swing_vote',
    'Swing Voter Secured',
    'LAW',
    ['VOTING'],
    'ADVANCE',
    'MINOR',
    [],
    0.9,
    {
      progress: 0.2,
      meters: { momentum: 0.06 }
    }
  ),
  
  createLawEvent(
    'voting_abstention_threat',
    'Abstention Threats',
    'LAW',
    ['VOTING'],
    'STALL',
    'MINOR',
    [
      { type: 'meter_below', meter: 'legitimacy', threshold: 0.5 }  // Only when legitimacy is low
    ],
    0.3,  // Reduced weight
    {
      meters: { reject_pressure: 0.05 }  // Reduced impact
    }
  ),
  
  // ADVANCE events - boosted by Momentum
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
      meters: { legitimacy: 0.15 }  // Primary: legitimacy (compromise = broad support)
    }
  )
];

/**
 * EXTERNALITY events - triggered by high unrest, apply negative consequences
 * These happen alongside normal events when unrest is very high.
 */
export const EXTERNALITY_EVENTS = [
  createLawEvent(
    'externality_cohesion_strain',
    'Coalition Unity Strained',
    'LAW',
    ['DEBATE', 'FALLOUT', 'VOTING'],
    'EXTERNALITY',
    'MINOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.5 }
    ],
    0.8,
    {
      // Externality effects are applied via applyUnrestExternalities()
      // This event just signals the consequence
      meters: { unrest: -0.05 }  // Slight pressure release
    }
  ),
  
  createLawEvent(
    'externality_approval_crisis',
    'Public Opinion Plummets',
    'LAW',
    ['DEBATE', 'FALLOUT', 'VOTING'],
    'EXTERNALITY',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.7 }
    ],
    0.6,
    {
      meters: { legitimacy: -0.1 }  // High unrest damages legitimacy
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
        effects_summary: 'Progress boost | Momentum boost | Legitimacy drop | Reject pressure drop',
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
        effects_summary: 'Slight progress boost | Momentum drop | Legitimacy boost | Slight polarization increase',
        effects: {
          progress: 0.1,
          meters: {
            momentum: -0.1,
            legitimacy: 0.15,
            polarization: 0.05
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
        effects_summary: 'Slight progress boost | Momentum drop | Major legitimacy boost | Unrest drop | Polarization drop',
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
        effects_summary: 'Major progress boost | Momentum boost | Legitimacy drop | Unrest increase | Reject pressure increase',
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
        effects_summary: 'Slight progress boost | Major legitimacy boost | Momentum boost | Polarization drop',
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
        text: 'Dismiss the panel (maintain momentum, risk legitimacy)',
        effects_summary: 'Progress boost | Momentum boost | Legitimacy drop | Polarization increase',
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
        effects_summary: 'Progress drop | Unrest drop | Legitimacy boost | Reject pressure increase | Momentum drop',
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
        effects_summary: 'Slight progress drop | Major unrest increase | Momentum drop | Reject pressure increase | Legitimacy drop',
        effects: {
          progress: -0.05,
          meters: {
            unrest: 0.2,
            momentum: -0.15,
            reject_pressure: 0.15,
            legitimacy: -0.15
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
        effects_summary: 'Slight progress boost | Legitimacy boost | Momentum drop | Unrest drop',
        effects: {
          progress: 0.05,
          meters: {
            legitimacy: 0.15,
            momentum: -0.05,
            unrest: -0.1
          }
        }
      },
      {
        text: 'Dismiss concerns as overblown (fast progress, risk backlash)',
        effects_summary: 'Progress boost | Momentum boost | Reject pressure increase | Legitimacy drop',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.15,
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
        effects_summary: 'Progress boost | Momentum boost | Slight legitimacy drop | Reject pressure drop | Polarization drop',
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
        effects_summary: 'Slight progress boost | Slight momentum boost | Legitimacy boost | Major reject pressure increase | Polarization increase',
        effects: {
          progress: 0.1,
          meters: {
            momentum: 0.05,
            legitimacy: 0.1,
            reject_pressure: 0.2,
            polarization: 0.15
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
        effects_summary: 'Major progress boost | Momentum boost | Slight legitimacy boost | Reject pressure drop | Polarization drop',
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
        effects_summary: 'Slight progress boost | Momentum drop | Legitimacy boost | Reject pressure increase | Polarization increase',
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
        effects_summary: 'Progress boost | Momentum boost | Legitimacy drop | Reject pressure drop | Slight polarization drop',
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
        text: 'Delay vote to build consensus (slow but safer)',
        effects_summary: 'Progress drop | Momentum drop | Slight legitimacy boost | Reject pressure drop | Polarization drop | Unrest drop',
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
        effects_summary: 'Progress drop | Legitimacy boost | Momentum drop | Reject pressure drop | Unrest drop',
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
        effects_summary: 'Progress boost | Momentum boost | Major legitimacy drop | Reject pressure increase | Unrest increase | Polarization increase',
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
    ...EXTERNALITY_EVENTS,
    ...DEBATE_CHOICE_EVENTS,
    ...FALLOUT_CHOICE_EVENTS,
    ...VOTING_CHOICE_EVENTS
  ];
}
