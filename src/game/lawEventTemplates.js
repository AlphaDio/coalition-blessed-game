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
    null,
    [],
    'Rising unrest is straining coalition bonds. You can spend credits on public outreach to calm tensions, or quietly gather intelligence on the dissatisfied factions.',
    [
      {
        text: 'Fund public outreach (spend credits, reduce unrest, gain approval)',
        effects_summary: 'Unrest drop | Approval boost | Credits spent',
        effects: {
          meters: { unrest: -0.1 },
          approval: 1,
          credits: -300
        }
      },
      {
        text: 'Monitor the situation and gather intel (gain intel, slight unrest relief)',
        effects_summary: 'Slight unrest drop | Intel gained | Influence gained',
        effects: {
          meters: { unrest: -0.05 },
          coalitionIntel: 2,
          influence: 5
        }
      }
    ]
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
    null,
    [],
    'Public opinion is cratering as unrest spills over. An emergency PR campaign could stem the bleeding but costs credits; alternatively, diverting requisitions to visible infrastructure projects restores faith in governance.',
    [
      {
        text: 'Launch emergency PR campaign (spend credits, protect legitimacy)',
        effects_summary: 'Approval boost | Legitimacy preserved | Credits spent',
        effects: {
          meters: { legitimacy: -0.03 },
          approval: 2,
          credits: -500
        }
      },
      {
        text: 'Fast-track visible infrastructure projects (spend requisitions, gain cohesion)',
        effects_summary: 'Cohesion boost | Requisitions spent | Slight legitimacy cost',
        effects: {
          meters: { legitimacy: -0.06 },
          coalitionCohesion: 2,
          requisition: -35
        }
      }
    ]
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
    null,
    [],
    'Powerful lobbyists from various factions are pressuring the council. They bring generous funding and insider intelligence — but at a cost to your credibility.',
    [
      {
        text: 'Accept their support (gain credits and momentum, lose legitimacy)',
        effects_summary: 'Progress boost | Momentum boost | Credits gained | Legitimacy drop',
        effects: {
          progress: 0.2,
          meters: {
            momentum: 0.15,
            legitimacy: -0.1,
            reject_pressure: -0.05
          },
          credits: 500
        }
      },
      {
        text: 'Reject their influence and publicize it (gain legitimacy and intel)',
        effects_summary: 'Slight progress boost | Legitimacy boost | Intel gained | Momentum drop',
        effects: {
          progress: 0.1,
          meters: {
            momentum: -0.1,
            legitimacy: 0.15,
            polarization: 0.05
          },
          coalitionIntel: 2
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
    'Citizens are demanding a public forum to discuss the law. Engaging them builds trust and influence, but delays your timeline. Refusing saves resources but stirs resentment.',
    [
      {
        text: 'Hold an open forum (build legitimacy and influence, slow progress)',
        effects_summary: 'Slight progress boost | Major legitimacy boost | Influence gained | Unrest drop | Momentum drop',
        effects: {
          progress: 0.05,
          meters: {
            momentum: -0.05,
            legitimacy: 0.2,
            unrest: -0.1,
            polarization: -0.05
          },
          influence: 10
        }
      },
      {
        text: 'Decline and redirect resources (fast progress, gain requisitions)',
        effects_summary: 'Major progress boost | Momentum boost | Requisitions gained | Legitimacy drop | Unrest increase',
        effects: {
          progress: 0.3,
          meters: {
            momentum: 0.15,
            legitimacy: -0.15,
            unrest: 0.15,
            reject_pressure: 0.1
          },
          requisition: 50
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
    'A panel of experts offers to analyze the law. Their insights could yield valuable intelligence, but their fee is steep. Dismissing them saves credits but wastes an opportunity.',
    [
      {
        text: 'Commission the full analysis (gain legitimacy and intel, spend credits)',
        effects_summary: 'Slight progress boost | Major legitimacy boost | Intel gained | Credits spent | Polarization drop',
        effects: {
          progress: 0.1,
          meters: {
            legitimacy: 0.2,
            momentum: 0.05,
            polarization: -0.1
          },
          coalitionIntel: 3,
          credits: -300
        }
      },
      {
        text: 'Dismiss the panel and save the budget (fast progress, keep credits)',
        effects_summary: 'Progress boost | Momentum boost | Credits saved | Legitimacy drop',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.15,
            legitimacy: -0.1,
            polarization: 0.1
          },
          credits: 200
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
    'A large opposition rally is threatening to derail the law. You can engage the protesters diplomatically or deploy security — each costs different resources.',
    [
      {
        text: 'Engage with protesters (spend credits on outreach, gain legitimacy and approval)',
        effects_summary: 'Progress drop | Unrest drop | Legitimacy boost | Approval boost | Credits spent',
        effects: {
          progress: -0.1,
          meters: {
            unrest: -0.15,
            legitimacy: 0.1,
            reject_pressure: 0.05,
            momentum: -0.1
          },
          approval: 1,
          credits: -400
        }
      },
      {
        text: 'Deploy security forces (spend requisitions, gain intel from surveillance)',
        effects_summary: 'Slight progress drop | Unrest increase | Intel gained | Requisition spent | Legitimacy drop',
        effects: {
          progress: -0.05,
          meters: {
            unrest: 0.1,
            momentum: -0.08,
            reject_pressure: 0.1,
            legitimacy: -0.1
          },
          coalitionIntel: 3,
          requisition: -30
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
    'An economic analysis reveals the law will require significant investment. You can fund the transition now or gamble that the costs are overstated.',
    [
      {
        text: 'Fund mitigation programs (spend credits and requisitions, gain legitimacy)',
        effects_summary: 'Slight progress boost | Legitimacy boost | Approval boost | Credits and requisitions spent | Unrest drop',
        effects: {
          progress: 0.05,
          meters: {
            legitimacy: 0.15,
            momentum: -0.05,
            unrest: -0.1
          },
          credits: -600,
          requisition: -25,
          approval: 1
        }
      },
      {
        text: 'Dismiss concerns and pocket the savings (fast progress, gain credits)',
        effects_summary: 'Progress boost | Momentum boost | Credits gained | Reject pressure increase | Legitimacy drop',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.15,
            reject_pressure: 0.15,
            legitimacy: -0.1
          },
          credits: 400
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
    'A major empire demands concessions before supporting the law — specifically, coalition resources and trade privileges. Refusing preserves your vision but risks their active opposition.',
    [
      {
        text: 'Grant concessions (spend requisitions, gain approval and reduce opposition)',
        effects_summary: 'Progress boost | Requisitions spent | Approval boost | Reject pressure drop | Polarization drop',
        effects: {
          progress: 0.15,
          meters: {
            momentum: 0.1,
            legitimacy: -0.05,
            reject_pressure: -0.15,
            polarization: -0.05
          },
          requisition: -40,
          approval: 2
        }
      },
      {
        text: 'Refuse and rally your base (gain influence and legitimacy, risk rejection)',
        effects_summary: 'Slight progress boost | Legitimacy boost | Influence gained | Reject pressure increase | Polarization increase',
        effects: {
          progress: 0.1,
          meters: {
            momentum: 0.05,
            legitimacy: 0.1,
            reject_pressure: 0.2,
            polarization: 0.15
          },
          influence: 15
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
    'A coalition partner proposes a last-minute amendment that would streamline the law but require additional treasury allocation. Accepting buys broad support; rejecting preserves your budget and builds influence.',
    [
      {
        text: 'Accept amendment (spend credits, gain broad support and approval)',
        effects_summary: 'Major progress boost | Momentum boost | Approval boost | Credits spent | Reject pressure drop',
        effects: {
          progress: 0.35,
          meters: {
            momentum: 0.2,
            legitimacy: 0.05,
            reject_pressure: -0.2,
            polarization: -0.1
          },
          credits: -500,
          approval: 1
        }
      },
      {
        text: 'Reject amendment (save budget, gain legitimacy and influence)',
        effects_summary: 'Slight progress boost | Legitimacy boost | Influence gained | Momentum drop | Polarization increase',
        effects: {
          progress: 0.1,
          meters: {
            momentum: -0.1,
            legitimacy: 0.1,
            reject_pressure: 0.15,
            polarization: 0.15
          },
          influence: 12
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
    'Several empires threaten to abstain, risking quorum. You can buy their votes with coalition resources, or step back and use the delay to gather strategic intel.',
    [
      {
        text: 'Offer incentives (spend credits and requisitions, gain votes)',
        effects_summary: 'Progress boost | Momentum boost | Credits and requisitions spent | Legitimacy drop',
        effects: {
          progress: 0.3,
          meters: {
            momentum: 0.15,
            legitimacy: -0.15,
            reject_pressure: -0.15,
            polarization: -0.05
          },
          credits: -400,
          requisition: -30
        }
      },
      {
        text: 'Delay vote and gather intelligence (gain intel and influence, slow progress)',
        effects_summary: 'Progress drop | Intel gained | Influence gained | Momentum drop | Unrest drop',
        effects: {
          progress: -0.1,
          meters: {
            momentum: -0.15,
            legitimacy: 0.05,
            reject_pressure: -0.1,
            polarization: -0.1,
            unrest: -0.05
          },
          coalitionIntel: 4,
          influence: 8
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
    'A scandal related to the law surfaces just before the vote. You can launch a proper investigation — expensive but thorough — or rush the vote through before the story spreads.',
    [
      {
        text: 'Launch investigation (spend credits, gain legitimacy and intel)',
        effects_summary: 'Progress drop | Legitimacy boost | Intel gained | Credits spent | Unrest drop',
        effects: {
          progress: -0.15,
          meters: {
            legitimacy: 0.15,
            momentum: -0.2,
            reject_pressure: -0.1,
            unrest: -0.1
          },
          credits: -500,
          coalitionIntel: 3
        }
      },
      {
        text: 'Proceed with vote anyway (risk legitimacy for speed)',
        effects_summary: 'Progress boost | Momentum boost | Major legitimacy drop | Approval drop | Unrest increase',
        effects: {
          progress: 0.25,
          meters: {
            momentum: 0.1,
            legitimacy: -0.2,
            reject_pressure: 0.2,
            unrest: 0.15,
            polarization: 0.15
          },
          approval: -2
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
    'The law\'s sponsor has made a fiery public declaration, rallying passionate supporters but also inflaming opposition. Backing them brings glory and momentum; tempering the message builds quiet influence and legitimacy.',
    [
      {
        text: 'Back the sponsor\'s gambit (fast progress, gain cohesion, stoke unrest)',
        effects_summary: 'Major progress boost | Momentum boost | Cohesion boost | Unrest increase | Polarization increase',
        effects: {
          progress: 0.3,
          meters: {
            momentum: 0.2,
            unrest: 0.12,
            polarization: 0.1
          },
          coalitionCohesion: 2
        }
      },
      {
        text: 'Temper their message (build legitimacy and influence)',
        effects_summary: 'Slight progress boost | Legitimacy boost | Influence gained | Polarization drop',
        effects: {
          progress: 0.08,
          meters: {
            legitimacy: 0.15,
            momentum: 0.05,
            polarization: -0.05
          },
          influence: 10
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
    'The law has exposed a deep ideological divide between coalition factions. One side demands the law go further; the other insists it is already too radical. Leaning in gains credits from passionate donors; seeking middle ground yields valuable intelligence about factional dynamics.',
    [
      {
        text: 'Lean into the controversy (energize supporters, collect donations)',
        effects_summary: 'Progress boost | Momentum boost | Credits gained | Polarization increase | Unrest increase',
        effects: {
          progress: 0.2,
          meters: {
            momentum: 0.15,
            polarization: 0.15,
            unrest: 0.1
          },
          credits: 600
        }
      },
      {
        text: 'Seek middle ground (calm tensions, gather intel on factions)',
        effects_summary: 'Legitimacy boost | Intel gained | Polarization drop | Unrest drop | Momentum drop',
        effects: {
          progress: 0.05,
          meters: {
            legitimacy: 0.12,
            polarization: -0.1,
            unrest: -0.08,
            momentum: -0.05
          },
          coalitionIntel: 3
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
    'Intelligence reports indicate the law is straining coalition bonds. Several factions have privately expressed alarm. Pressing forward may require emergency spending to hold things together; amending the law preserves resources and builds trust.',
    [
      {
        text: 'Press forward and spend credits on damage control (maintain vision)',
        effects_summary: 'Progress boost | Momentum boost | Credits spent | Polarization increase | Unrest increase',
        effects: {
          progress: 0.18,
          meters: {
            momentum: 0.15,
            polarization: 0.15,
            unrest: 0.1
          },
          credits: -500
        }
      },
      {
        text: 'Amend to address concerns (gain requisitions from freed-up plans, build legitimacy)',
        effects_summary: 'Legitimacy boost | Requisitions gained | Cohesion boost | Unrest drop | Progress drop',
        effects: {
          progress: -0.08,
          meters: {
            legitimacy: 0.2,
            unrest: -0.15,
            polarization: -0.12,
            momentum: -0.1
          },
          requisition: 40,
          coalitionCohesion: 2
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
    'Military and economic factions have reached an impasse over the law. The military offers intelligence cooperation if prioritized; the economic faction promises increased treasury contributions.',
    [
      {
        text: 'Side with the military faction (gain intel and requisitions, lose economic support)',
        effects_summary: 'Progress boost | Momentum boost | Intel gained | Requisitions gained | Approval drop',
        effects: {
          progress: 0.2,
          meters: {
            momentum: 0.15,
            reject_pressure: 0.1,
            polarization: 0.12
          },
          coalitionIntel: 4,
          requisition: 30,
          approval: -1
        }
      },
      {
        text: 'Side with the economic faction (gain credits and approval, lose military backing)',
        effects_summary: 'Legitimacy boost | Credits gained | Approval boost | Momentum drop',
        effects: {
          progress: 0.1,
          meters: {
            legitimacy: 0.15,
            reject_pressure: -0.1,
            momentum: -0.1,
            unrest: 0.05
          },
          credits: 600,
          approval: 1
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
    'The law passed with strong perceived legitimacy. The coalition\'s citizens feel their voices were heard, and public confidence surges. You can channel this goodwill into popular approval or invest it in coalition infrastructure.',
    [
      {
        text: 'Celebrate publicly (boost approval, gain influence from public trust)',
        effects_summary: 'Approval boost to all empires | Influence gained',
        effects: {
          approval: 3,
          influence: 10
        }
      },
      {
        text: 'Reinforce institutions (strengthen cohesion, gain requisitions)',
        effects_summary: 'Coalition cohesion boost | Requisitions gained',
        effects: {
          coalitionCohesion: 3,
          requisition: 40
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
    'The law was enacted through an exemplary process that even skeptics respect. The coalition radiates confidence. Donations pour in from supporters; analysts offer their services pro bono.',
    [
      {
        text: 'Rally the people (major approval surge, treasury donations)',
        effects_summary: 'Major approval boost | Credits gained | Influence gained',
        effects: {
          approval: 5,
          credits: 800,
          influence: 8
        }
      },
      {
        text: 'Shore up the coalition (major cohesion boost, intelligence windfall)',
        effects_summary: 'Major coalition cohesion boost | Intel gained | Requisitions gained',
        effects: {
          coalitionCohesion: 5,
          coalitionIntel: 4,
          requisition: 50
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
    'The law scraped through despite fierce opposition, but the victory itself has energised your base. Inviting critics in builds trust and yields intel; rallying supporters builds influence and approval.',
    [
      {
        text: 'Invite critics into the implementation process (build unity, gain intel)',
        effects_summary: 'Cohesion boost | Intel gained | Slight approval cost',
        effects: {
          coalitionCohesion: 2,
          coalitionIntel: 2,
          approval: -1
        }
      },
      {
        text: 'Rally your supporters around the victory (energise the base)',
        effects_summary: 'Approval boost | Influence gained | Slight cohesion cost',
        effects: {
          approval: 2,
          influence: 12,
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
    'The law was forced through over massive resistance, but the coalition proved it can act decisively. Opposition factions demand a seat at the table — and they bring resources to bargain with.',
    [
      {
        text: 'Offer the opposition a role in implementation (gain credits and cohesion)',
        effects_summary: 'Major cohesion boost | Credits gained | Approval cost',
        effects: {
          coalitionCohesion: 3,
          credits: 500,
          approval: -2
        }
      },
      {
        text: 'Double down on the law\'s benefits in public messaging (rally citizens, build influence)',
        effects_summary: 'Major approval boost | Influence gained | Cohesion cost',
        effects: {
          approval: 3,
          influence: 15,
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
    'The law exposed deep ideological rifts, but the passionate debate has also engaged citizens like never before. Public forums could generate both approval and intelligence about factional dynamics; quiet deal-making brings cohesion and influence.',
    [
      {
        text: 'Host public forums to air differences openly (engage citizens, gather intel)',
        effects_summary: 'Approval boost | Intel gained | Slight cohesion cost',
        effects: {
          approval: 2,
          coalitionIntel: 3,
          coalitionCohesion: -1
        }
      },
      {
        text: 'Forge a compromise narrative both sides can claim (unite factions, gain influence)',
        effects_summary: 'Cohesion boost | Influence gained | Slight approval cost',
        effects: {
          coalitionCohesion: 2,
          influence: 10,
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
    'The law\'s passage has hardened factional lines, but it has also demonstrated that the coalition can weather serious disagreement and still govern. Both sides have resources to offer — the question is how to channel them.',
    [
      {
        text: 'Turn the debate into a showcase of democratic strength (public goodwill, credits from supporters)',
        effects_summary: 'Major approval boost | Credits gained | Cohesion cost',
        effects: {
          approval: 3,
          credits: 600,
          coalitionCohesion: -2
        }
      },
      {
        text: 'Broker a power-sharing agreement (unite the coalition, gain requisitions)',
        effects_summary: 'Major cohesion boost | Requisitions gained | Approval cost',
        effects: {
          coalitionCohesion: 3,
          requisition: 50,
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
    'Civil unrest complicates the law\'s rollout, but the energy in the streets also shows citizens care deeply about governance. You can harness this civic energy for influence, or spend resources to smooth the transition.',
    [
      {
        text: 'Channel protests into structured feedback (gain influence and approval)',
        effects_summary: 'Approval boost | Influence gained | Slight cohesion cost',
        effects: {
          approval: 2,
          influence: 12,
          coalitionCohesion: -1
        }
      },
      {
        text: 'Redirect resources to smooth implementation (spend credits, gain cohesion and intel)',
        effects_summary: 'Cohesion boost | Intel gained | Credits spent | Slight approval cost',
        effects: {
          coalitionCohesion: 2,
          coalitionIntel: 2,
          credits: -400,
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
    'Widespread unrest erupts as the new law takes effect, but amid the chaos, grassroots movements are forming. You can empower these movements to build lasting influence, or invest heavily in peacekeeping to restore economic stability.',
    [
      {
        text: 'Transform protest movements into civic councils (build influence and intel)',
        effects_summary: 'Major approval boost | Influence gained | Intel gained | Cohesion cost',
        effects: {
          approval: 3,
          influence: 15,
          coalitionIntel: 3,
          coalitionCohesion: -2
        }
      },
      {
        text: 'Deploy peacekeepers with community outreach (spend credits, restore order)',
        effects_summary: 'Major cohesion boost | Requisitions gained | Credits spent | Approval cost',
        effects: {
          coalitionCohesion: 3,
          requisition: 40,
          credits: -600,
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
