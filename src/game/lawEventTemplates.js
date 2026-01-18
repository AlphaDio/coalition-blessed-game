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

/**
 * Create a law event template
 */
export function createLawEvent(id, name, scope, phase_tags, nature, tier, triggers, base_weight, effects) {
  return {
    id,
    name,
    scope,
    phase_tags,
    nature,
    tier,
    triggers,
    base_weight,
    effects
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
      meters: { momentum: 0.1 }  // Primary: momentum
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
      meters: { momentum: 0.08 }  // Primary: momentum
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
    0.4,  // Slightly lower weight
    {
      meters: { unrest: 0.05 }  // Reduced from 0.08 - less impactful
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
 * Get all law events
 */
export function getAllLawEvents() {
  return [
    ...DEBATE_EVENTS,
    ...FALLOUT_EVENTS,
    ...VOTING_EVENTS,
    ...EXTERNALITY_EVENTS
  ];
}
