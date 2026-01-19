# Law Enactment System

## Overview

The Law Enactment system is a deterministic, event-driven framework for processing laws through a 3-phase lifecycle: **DEBATE** → **FALLOUT** → **VOTING**. It integrates seamlessly with the existing event system and uses ideological alignment, dynamic meters, and voting mechanics to create emergent gameplay.

## Architecture

### Core Principles

1. **Event-Driven**: Laws are not hardcoded outcomes. Instead, they are resolved by browsing eligible events, computing weights, and applying effects.
2. **Deterministic**: Same seed + same inputs = identical event log and outcomes.
3. **Modular**: Law definitions and events are content, not code. Easy to add new laws and events.
4. **Composable**: Meters, triggers, weights, and effects form a flexible modifier stack.

### Data Models

#### LawDefinition
Defines a law's ideological position and how it's perceived:
```javascript
{
  id: 'law_ai_citizenship',
  name: 'AI Citizenship Rights',
  axis_vector: {
    natural_mechanical: 0.9,
    essentialist_constructivist: 0.6,
    authoritarian_liberal: 0.3
  },
  law_tags: ['mechanical', 'rights'],
  support_weights: {
    population_incentive: 0.3,
    security_incentive: -0.2,
    economy_incentive: 0.1
  },
  phase_tags: {
    DEBATE: ['rights', 'mechanical', 'philosophical'],
    FALLOUT: ['social', 'economic', 'unrest'],
    VOTING: ['procedural', 'compromise']
  }
}
```

#### LawProcess
Runtime state for an in-flight law:
```javascript
{
  lawId: 'law_ai_citizenship',
  phase: 'DEBATE', // DEBATE | FALLOUT | VOTING | ENACTED | BURIED
  phaseProgress: 0.5, // 0..1, advances to next phase at 1.0
  rejects: 1, // 0..4, burial at 4
  
  meters: {
    momentum: 0.7,        // forward drive (0..1)
    reject_pressure: 0.3, // fragility/heat (0..1)
    unrest: 0.2,          // populace volatility (0..1)
    polarization: 0.4,    // extremeness of positions (0..1)
    legitimacy: 0.8,      // perceived validity (0..1)
    economy_shock: 0.1    // economic disruption (0..1)
  },
  
  empireStances: {
    'empire_1': {
      empireId: 'empire_1',
      stance_score: 0.65,
      stance_tier: 'APPROVE',
      vote_intent: 'support',
      modifiers: { bribed: 0, threatened: 0, scandalized: 0 }
    }
    // ... one per empire
  },
  
  eventLog: [
    { tick: 1, phase: 'DEBATE', eventId: 'debate_passionate_speech', nature: 'APPROVE' }
  ]
}
```

#### Event Template (Law-Scoped)
```javascript
{
  id: 'debate_passionate_speech',
  name: 'Passionate Speech in Council',
  scope: 'LAW',
  phase_tags: ['DEBATE'],
  nature: 'APPROVE', // APPROVE | ADVANCE | REJECT | LAUD | DENOUNCE | NEUTRAL
  tier: 'MAJOR', // MAJOR | MINOR
  triggers: [
    { type: 'meter_above', meter: 'momentum', threshold: 0.4 }
  ],
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
```

#### PowerSystemPolicy
Defines voting rules:
```javascript
{
  id: 'equal_council',
  name: 'Equal Council Votes',
  type: 'equal_council', // equal_council | pressure_weighted | hegemonic
  config: {
    base_votes_per_empire: 1,
    quorum_threshold: 0.5,  // 50% of votes must be cast
    pass_threshold: 0.5     // 50% of votes needed to pass
  }
}
```

## Resolution Flow

### Per-Law Resolution Cycle

1. **Build Context**: Gather law process, definition, empires, and meters.
2. **Filter Events**: Find events matching `scope=LAW`, current phase tag, and passing triggers.
3. **Compute Weights**: For each eligible event:
   - Start with `base_weight`
   - Apply trigger-based modifiers
   - Apply context bias (momentum boosts APPROVE, reject_pressure boosts REJECT)
4. **Pick Events**: 
   - 1 MAJOR event (weighted random)
   - 0-3 MINOR events (weighted random, no duplicates)
5. **Apply Effects**:
   - Update meters
   - Update phaseProgress
   - Track empire relations
6. **Enforce Rules**:
   - If event nature == REJECT: increment rejects
   - If rejects == 4: set BURIED and apply burial consequences
7. **Check Phase Advancement**:
   - If phaseProgress >= 1.0 and not final phase: advance to next phase
8. **Check Completion**:
   - If VOTING phase completes: tally votes and set ENACTED or BURIED

### Empire Stance Calculation

At law start, calculate each empire's stance:
1. **Base Alignment**: Dot product of empire values and law axis_vector, normalized.
2. **Support Biases**: Apply population_incentive, security_incentive, economy_incentive based on game state.
3. **Stance Tier**: Map score to LAUD/APPROVE/NEUTRAL/DISAPPROVE/DENOUNCE.
4. **Vote Intent**: Derive from stance tier (LAUD/APPROVE → support, DENOUNCE/DISAPPROVE → oppose).

### Vote Tallying

In VOTING phase, when phaseProgress >= 1.0:
1. Calculate votes per empire using PowerSystemPolicy.
2. Aggregate votes by vote_intent (support/oppose/abstain).
3. Check quorum: `(support + oppose) >= totalVotes * quorum_threshold`
4. Check pass: `support >= totalVotes * pass_threshold`
5. If both pass: ENACTED, else: BURIED.

## Player Influence Economy

- **Generation**: +1 influence per 100 ticks (fractional accumulator).
- **Starting a Law**: Costs 100 influence.
- **Concurrent Laws**: Multiple laws can be in-flight simultaneously.

## Law Modifiers

- **tick_delay_multiplier**: Scales how many ticks are needed between law events (lower is faster).
- **enactment_chance_bonus**: Lowers the pass threshold during vote tallying.

## Rejection & Burial

- **Reject Tracking**: Each REJECT-nature major event increments rejects.
- **Burial Rule**: 4th reject immediately sets phase to BURIED.
- **Burial Effects**: Supporters lose approval, opponents gain approval.

## Determinism

- **Seeded RNG**: `DeterministicRNG` ensures same seed → same sequence.
- **Event Log**: Every event chosen is recorded with its nature and tick.
- **Testing**: `testDeterminism.js` validates identical outcomes from identical seeds.

## Content Creation

### Adding a New Law Definition

Create a JS object or YAML module:

```yaml
module:
  id: "lawdef_genetic_enhancement"
  type: "law_definition"

declares:
  law_definition:
    id: "law_genetic_enhancement"
    name: "Genetic Enhancement Program"
    axis_vector:
      natural_mechanical: 0.5
      essentialist_constructivist: 0.7
    law_tags: ["biologic", "enhancement"]
    support_weights:
      population_incentive: 0.4
      security_incentive: 0.3
      economy_incentive: -0.2
    phase_tags:
      DEBATE: ["scientific", "biologic", "philosophical"]
      FALLOUT: ["social", "ethical", "cultural"]
      VOTING: ["procedural", "compromise"]
```

### Adding a New Law Event

```yaml
module:
  id: "lawevent_protest"
  type: "law_event"

declares:
  law_event:
    id: "fallout_public_protest"
    name: "Public Protests Erupt"
    scope: "LAW"
    phase_tags: ["FALLOUT"]
    nature: "REJECT"
    tier: "MAJOR"
    triggers:
      - type: "meter_above"
        meter: "polarization"
        threshold: 0.5
    base_weight: 1.0
    effects:
      progress: -0.2
      meters:
        unrest: 0.2
        reject_pressure: 0.15
        momentum: -0.15
    weight_modifiers:
      - type: "polarization_boost"
        multiplier: 1.0
```

## Usage

### CLI Runner
```bash
# Run with default seed (42)
node lawRunner.js

# Run with custom seed
node lawRunner.js 999

# Test determinism
node testDeterminism.js
```

### In Game
1. Start the game: `node index.js`
2. Accumulate influence (1 per 100 ticks)
3. Select a law with arrow keys
4. Press Enter to start the law process (costs 100 influence)
5. Watch the law progress through DEBATE → FALLOUT → VOTING
6. Laws can be ENACTED (passed) or BURIED (rejected or failed)

## Files

- **src/game/types.js**: Type definitions and constructors
- **src/game/lawEngine.js**: Core event filtering, weighting, picking, and effect application
- **src/game/lawProcessManager.js**: Law process lifecycle management
- **src/game/lawDefinitions.js**: Sample law definitions
- **src/game/lawEventTemplates.js**: Sample law events
- **lawRunner.js**: CLI runner for testing
- **testDeterminism.js**: Determinism validation test

## Future Enhancements

- **AI Machinations**: Empire AI can spend resources to influence votes during VOTING phase
- **Diminishing Returns**: Repeated machinations on the same empire become less effective
- **Dynamic Events**: Events with empire-specific targeting
- **Coalition Effects**: Laws that modify coalition mechanics
- **Chained Laws**: Laws that unlock follow-up laws
