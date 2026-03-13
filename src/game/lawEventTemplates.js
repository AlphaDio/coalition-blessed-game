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
 * Hero-focused law choice events
 * These events create decisions that interact directly with the hero system,
 * forcing players to weigh political capital against law progress.
 */
export const HERO_CHOICE_EVENTS = [
  // DEBATE: Sponsor's Gambit - the sponsoring hero makes a bold public declaration
  createLawEvent(
    'debate_choice_sponsors_gambit',
    'Sponsor\'s Bold Declaration',
    'LAW',
    ['DEBATE'],
    'NEUTRAL',
    'MAJOR',
    [],
    0.85,
    null,
    [],
    'The law\'s sponsor has made a fiery public declaration, rallying passionate supporters but also inflaming opposition. Do you back their aggressive stance?',
    [
      {
        text: 'Back the sponsor\'s gambit (fast progress, but stoke unrest)',
        effects_summary: 'Major progress boost | Momentum boost | Unrest increase | Polarization increase',
        effects: {
          progress: 0.3,
          meters: {
            momentum: 0.2,
            unrest: 0.12,
            polarization: 0.1
          }
        }
      },
      {
        text: 'Temper their message (slower but steadier)',
        effects_summary: 'Slight progress boost | Legitimacy boost | Polarization drop',
        effects: {
          progress: 0.08,
          meters: {
            legitimacy: 0.15,
            momentum: 0.05,
            polarization: -0.05
          }
        }
      }
    ]
  ),

  // DEBATE: Ideological Flashpoint - the law hits a deep ideological nerve
  createLawEvent(
    'debate_choice_ideological_flashpoint',
    'Ideological Flashpoint',
    'LAW',
    ['DEBATE'],
    'NEUTRAL',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'polarization', threshold: 0.25 }
    ],
    0.8,
    null,
    [],
    'The law has exposed a deep ideological divide between coalition heroes. One faction demands the law go further; another insists it is already too radical. How do you navigate this?',
    [
      {
        text: 'Lean into the controversy (energize supporters, alienate moderates)',
        effects_summary: 'Progress boost | Momentum boost | Polarization increase | Unrest increase',
        effects: {
          progress: 0.2,
          meters: {
            momentum: 0.15,
            polarization: 0.15,
            unrest: 0.1
          }
        }
      },
      {
        text: 'Seek middle ground (calm tensions, but lose momentum)',
        effects_summary: 'Legitimacy boost | Polarization drop | Unrest drop | Momentum drop',
        effects: {
          progress: 0.05,
          meters: {
            legitimacy: 0.12,
            polarization: -0.1,
            unrest: -0.08,
            momentum: -0.05
          }
        }
      }
    ]
  ),

  // FALLOUT: Coalition Fracture Warning
  createLawEvent(
    'fallout_choice_coalition_fracture',
    'Coalition Fracture Warning',
    'LAW',
    ['FALLOUT'],
    'NEUTRAL',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.35 }
    ],
    0.9,
    null,
    [],
    'Intelligence reports that the law\'s consequences are straining coalition bonds. Several heroes have privately expressed alarm. Do you press forward or amend the law to address their concerns?',
    [
      {
        text: 'Press forward regardless (maintain vision at risk of fracture)',
        effects_summary: 'Progress boost | Momentum boost | Polarization increase | Unrest increase',
        effects: {
          progress: 0.18,
          meters: {
            momentum: 0.15,
            polarization: 0.2,
            unrest: 0.15
          }
        }
      },
      {
        text: 'Amend to address concerns (sacrifice progress for stability)',
        effects_summary: 'Legitimacy boost | Unrest drop | Polarization drop | Progress drop | Momentum drop',
        effects: {
          progress: -0.08,
          meters: {
            legitimacy: 0.2,
            unrest: -0.15,
            polarization: -0.12,
            momentum: -0.1
          }
        }
      }
    ]
  ),

  // VOTING: Military-Economic Standoff
  createLawEvent(
    'voting_choice_faction_standoff',
    'Military-Economic Standoff',
    'LAW',
    ['VOTING'],
    'NEUTRAL',
    'MAJOR',
    [],
    0.75,
    null,
    [],
    'Military and economic factions within the coalition have reached an impasse over the law\'s impact. Each side has hero champions threatening to derail the vote unless their concerns are prioritized.',
    [
      {
        text: 'Side with the military faction (security allies rally, economic allies waver)',
        effects_summary: 'Progress boost | Momentum boost | Reject pressure increase | Polarization increase',
        effects: {
          progress: 0.2,
          meters: {
            momentum: 0.15,
            reject_pressure: 0.1,
            polarization: 0.12
          }
        }
      },
      {
        text: 'Side with the economic faction (broad legitimacy, but military faction withdraws support)',
        effects_summary: 'Legitimacy boost | Reject pressure drop | Momentum drop | Unrest slight increase',
        effects: {
          progress: 0.1,
          meters: {
            legitimacy: 0.15,
            reject_pressure: -0.1,
            momentum: -0.1,
            unrest: 0.05
          }
        }
      }
    ]
  )
];

/**
 * ENACTMENT EVENTS - Fire after a law is enacted based on final meter values.
 * These events make the meters at enactment matter by producing game-state
 * consequences (coalition cohesion, empire approval) weighted by
 * reject_pressure, legitimacy, polarization, and unrest.
 *
 * Natures map to meter drivers during ENACTED phase:
 *   APPROVE  → boosted by high legitimacy
 *   REJECT   → boosted by high reject_pressure
 *   NEUTRAL  → boosted by high polarization
 *   EXTERNALITY → boosted by high unrest
 */
const ENACTMENT_EVENTS = [
  // High legitimacy: the law passed with broad validation
  createLawEvent(
    'enactment_popular_mandate',
    'Popular Mandate',
    'LAW',
    ['ENACTED'],
    'APPROVE',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'legitimacy', threshold: 0.5 }
    ],
    1.0,
    null,
    [],
    'The law passed with strong perceived legitimacy. The coalition\'s citizens feel their voices were heard, and public confidence surges. How do you capitalize on this goodwill?',
    [
      {
        text: 'Celebrate publicly (boost approval across empires)',
        effects_summary: 'Approval boost to all empires',
        effects: {
          approval: 3
        }
      },
      {
        text: 'Reinforce institutions (strengthen coalition cohesion)',
        effects_summary: 'Coalition cohesion boost',
        effects: {
          coalitionCohesion: 3
        }
      }
    ]
  ),

  // Very high legitimacy: a resounding mandate
  createLawEvent(
    'enactment_resounding_mandate',
    'Resounding Mandate',
    'LAW',
    ['ENACTED'],
    'APPROVE',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'legitimacy', threshold: 0.8 }
    ],
    0.8,
    null,
    [],
    'The law was enacted through an exemplary process that even skeptics respect. The coalition radiates confidence. How do you channel this energy?',
    [
      {
        text: 'Rally the people (major approval surge)',
        effects_summary: 'Major approval boost to all empires',
        effects: {
          approval: 5
        }
      },
      {
        text: 'Shore up the coalition (major cohesion boost)',
        effects_summary: 'Major coalition cohesion boost',
        effects: {
          coalitionCohesion: 5
        }
      }
    ]
  ),

  // High reject pressure: the opposition is vocal but the law won
  createLawEvent(
    'enactment_bitter_passage',
    'Bitter Passage',
    'LAW',
    ['ENACTED'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'reject_pressure', threshold: 0.35 }
    ],
    1.0,
    null,
    [],
    'The law scraped through despite fierce opposition, but the victory itself has energised your base. The opposition is vocal — do you co-opt their energy or ride the momentum?',
    [
      {
        text: 'Invite critics into the implementation process (build unity)',
        effects_summary: 'Cohesion boost | Slight approval cost',
        effects: {
          coalitionCohesion: 2,
          approval: -1
        }
      },
      {
        text: 'Rally your supporters around the victory (energise the base)',
        effects_summary: 'Approval boost | Slight cohesion cost',
        effects: {
          approval: 2,
          coalitionCohesion: -1
        }
      }
    ]
  ),

  // Very high reject pressure: deep opposition but the law is now reality
  createLawEvent(
    'enactment_opposition_backlash',
    'Opposition Backlash',
    'LAW',
    ['ENACTED'],
    'REJECT',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'reject_pressure', threshold: 0.6 }
    ],
    0.8,
    null,
    [],
    'The law was forced through over massive resistance, but the coalition proved it can act decisively. Opposition factions demand a seat at the table. How do you capitalise on this moment?',
    [
      {
        text: 'Offer the opposition a role in implementation (forge broader unity)',
        effects_summary: 'Major cohesion boost | Approval cost',
        effects: {
          coalitionCohesion: 3,
          approval: -2
        }
      },
      {
        text: 'Double down on the law\'s benefits in public messaging (rally citizens)',
        effects_summary: 'Major approval boost | Cohesion cost',
        effects: {
          approval: 3,
          coalitionCohesion: -2
        }
      }
    ]
  ),

  // High polarization: the coalition is divided but engaged
  createLawEvent(
    'enactment_ideological_fault_lines',
    'Ideological Fault Lines',
    'LAW',
    ['ENACTED'],
    'NEUTRAL',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'polarization', threshold: 0.35 }
    ],
    1.0,
    null,
    [],
    'The law exposed deep ideological rifts, but the passionate debate has also engaged citizens like never before. Both sides claim the law as proof their vision works. How do you steer the narrative?',
    [
      {
        text: 'Host public forums to air differences openly (citizens love the transparency)',
        effects_summary: 'Approval boost | Slight cohesion cost',
        effects: {
          approval: 2,
          coalitionCohesion: -1
        }
      },
      {
        text: 'Forge a compromise narrative both sides can claim (unite the factions)',
        effects_summary: 'Cohesion boost | Slight approval cost',
        effects: {
          coalitionCohesion: 2,
          approval: -1
        }
      }
    ]
  ),

  // Very high polarization: coalition under tension but resilient
  createLawEvent(
    'enactment_coalition_schism',
    'Coalition Schism',
    'LAW',
    ['ENACTED'],
    'NEUTRAL',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'polarization', threshold: 0.6 }
    ],
    0.8,
    null,
    [],
    'The law\'s passage has hardened factional lines, but it has also demonstrated that the coalition can weather serious disagreement and still govern. Key figures on both sides are looking for a path forward.',
    [
      {
        text: 'Turn the debate into a showcase of democratic strength (engage citizens)',
        effects_summary: 'Major approval boost | Cohesion cost',
        effects: {
          approval: 3,
          coalitionCohesion: -2
        }
      },
      {
        text: 'Broker a power-sharing agreement between the camps (unite the coalition)',
        effects_summary: 'Major cohesion boost | Approval cost',
        effects: {
          coalitionCohesion: 3,
          approval: -2
        }
      }
    ]
  ),

  // High unrest: turbulent but transformative implementation
  createLawEvent(
    'enactment_turbulent_implementation',
    'Turbulent Implementation',
    'LAW',
    ['ENACTED'],
    'EXTERNALITY',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.35 }
    ],
    1.0,
    null,
    [],
    'Civil unrest complicates the law\'s rollout, but the energy in the streets also shows citizens care deeply about governance. Organisers on both sides are looking for direction.',
    [
      {
        text: 'Channel protests into structured feedback programs (harness civic energy)',
        effects_summary: 'Approval boost | Slight cohesion cost',
        effects: {
          approval: 2,
          coalitionCohesion: -1
        }
      },
      {
        text: 'Redirect resources to smooth implementation in key systems (stabilise)',
        effects_summary: 'Cohesion boost | Slight approval cost',
        effects: {
          coalitionCohesion: 2,
          approval: -1
        }
      }
    ]
  ),

  // Very high unrest: public disorder but opportunity for renewal
  createLawEvent(
    'enactment_public_disorder',
    'Public Disorder',
    'LAW',
    ['ENACTED'],
    'EXTERNALITY',
    'MAJOR',
    [
      { type: 'meter_above', meter: 'unrest', threshold: 0.6 }
    ],
    0.8,
    null,
    [],
    'Widespread unrest erupts as the new law takes effect, but amid the chaos, grassroots movements are forming to shape the law\'s implementation. The coalition can either embrace or direct this energy.',
    [
      {
        text: 'Transform protest movements into civic councils (empower the people)',
        effects_summary: 'Major approval boost | Cohesion cost',
        effects: {
          approval: 3,
          coalitionCohesion: -2
        }
      },
      {
        text: 'Deploy peacekeepers with community outreach programs (restore order)',
        effects_summary: 'Major cohesion boost | Approval cost',
        effects: {
          coalitionCohesion: 3,
          approval: -2
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
    ...VOTING_CHOICE_EVENTS,
    ...HERO_CHOICE_EVENTS,
    ...ENACTMENT_EVENTS
  ];
}
