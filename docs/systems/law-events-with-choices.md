# Law Events with Player Choices

## Overview

The law enactment system now supports interactive law events that require player choices during the DEBATE, FALLOUT, and VOTING phases. These events allow players to influence how laws progress through the enactment process by making strategic decisions.

## Law Event Structure

Law events can now include player choices. When a law event with choices is selected, the game pauses and presents the player with 1-3 options to choose from.

### Event Properties

```javascript
{
  id: "event_id",
  name: "Event Name",
  description: "Description presented to player",
  scope: "LAW",
  phase_tags: ["DEBATE", "FALLOUT", "VOTING"],
  nature: "APPROVE" | "REJECT" | "ADVANCE" | "STALL" | "EXTERNALITY" | "NEUTRAL",

  tier: "MAJOR" | "MINOR",
  triggers: [],
  base_weight: 1.0,
  choices: [
    {
      text: "Choice description",
      effects: {
        progress: 0.25,
        meters: {
          momentum: 0.15,
          legitimacy: -0.1
        }
      }
    }
  ],
  weight_modifiers: []
}
```

### Choice Effects

Each choice can modify:
- **progress**: Direct change to phase progress (-1.0 to 1.0)
- **meters**: Changes to law process meters
  - momentum: Forward drive (0..1)
  - reject_pressure: Fragility/heat (0..1)
  - unrest: Populace volatility (0..1)
  - polarization: Extremeness of positions (0..1)
  - legitimacy: Perceived validity (0..1)
  - economy_shock: Economic disruption (0..1)

## Example Law Events

### DEBATE Phase Events

#### Lobbyist Pressure
Players choose how to respond to lobbying efforts:
1. Accept support (gain momentum, lose legitimacy)
2. Reject influence (lose momentum, gain legitimacy)
3. Negotiate middle ground (moderate effects)

#### Public Forum Requested
Citizens demand a public forum:
1. Hold open forum (slow progress, high legitimacy)
2. Decline and expedite (fast progress, low legitimacy)

#### Expert Panel Consultation
Experts offer recommendations:
1. Accept all recommendations (high legitimacy, slow)
2. Cherry-pick favorable points (balanced)
3. Dismiss the panel (maintain momentum, risk legitimacy)

### FALLOUT Phase Events

#### Opposition Rally
Handle a large protest:
1. Engage with protesters (reduce unrest, slow progress)
2. Suppress the rally (increase unrest, reduce momentum)
3. Ignore and continue (moderate risk)

#### Economic Impact Report
Address economic concerns:
1. Fund mitigation programs (high legitimacy, slow)
2. Dismiss concerns (fast progress, risk backlash)

#### Empire Makes Demands
A major empire demands concessions:
1. Grant concessions (gain support)
2. Refuse demands (maintain vision, risk opposition)
3. Seek compromise (balanced approach)

### VOTING Phase Events

#### Last-Minute Amendment
Coalition proposes changes:
1. Accept amendment (high pass chance, alters intent)
2. Reject amendment (maintain vision, risk failure)

#### Abstention Bloc Forms
Empires threaten to abstain:
1. Offer incentives (gain votes, lose legitimacy)
2. Appeal to values (maintain integrity)
3. Delay vote (slow but safer)

#### Scandal Threatens Vote
Handle a scandal:
1. Launch investigation (delay, preserve legitimacy)
2. Proceed anyway (risk legitimacy for speed)

## Player Interaction

### UI Controls

When a law event with choices appears:
- The game pauses automatically
- Event description is displayed
- Players press **1**, **2**, or **3** to select a choice
- Game resumes after selection
- Effects are applied immediately

### Command Line

Players can also use commands:
```
choose 1
choose 2
choose 3
```

## Law Modifiers

New law definitions can include modifiers that affect how laws are enacted:

### tick_delay_multiplier
Controls how often law events fire:
- `0.5`: 50% faster (events fire twice as often)
- `1.0`: Normal speed (default)
- `2.0`: 100% slower (events fire half as often)

### enactment_chance_bonus
Increases the chance a law passes:
- `0.0`: No bonus (default)
- `0.1`: +10% easier to pass (reduces threshold by 10%)
- `0.2`: +20% easier to pass

### Example Laws

#### Streamlined Digital Governance Act
- **Type**: Materialistic/AI-friendly
- **tick_delay_multiplier**: 0.5 (faster processing)
- **enactment_chance_bonus**: 0.0
- **Effect**: Laws process events twice as fast

#### Organic Deliberation and Consensus Act
- **Type**: Biological-friendly
- **tick_delay_multiplier**: 2.0 (slower processing)
- **enactment_chance_bonus**: 0.1 (+10% pass chance)
- **Effect**: Laws take longer but have higher success rate

## Technical Implementation

### Event Selection

1. Filter events by phase (DEBATE/FALLOUT/VOTING)
2. Check trigger conditions
3. Calculate weighted probabilities
4. Select major and minor events
5. If major event has choices, pause and wait for input

### Choice Resolution

1. Player selects choice index (0-2)
2. `handleLawEventChoice()` is called
3. Choice effects are applied to law process meters
4. Phase progress is updated
5. Event is logged
6. Game resumes

### Auto-Resolution for Testing

The `lawRunner.js` script automatically selects random choices for testing purposes. In the actual game, players must manually select choices.

## Best Practices

### For Players

- **High Momentum**: Choose options that maintain or increase momentum to advance phases quickly
- **High Reject Pressure**: Choose defensive options to reduce risk of burial (4 rejects = buried)
- **Low Legitimacy**: Choose options that increase legitimacy to avoid opposition
- **High Unrest**: Choose calming options to prevent reject events

### For Designers

- Ensure choice effects are balanced (risk vs reward)
- Provide meaningful strategic decisions
- Include at least 2 choices per major event
- Consider phase context when designing effects
- Use triggers to create dynamic event selection

## File Locations

- **Event Templates**: `src/game/lawEventTemplates.js`
- **Event Handler**: `src/game/lawProcessManager.js`
- **UI Integration**: `src/ui/input.js`
- **YAML Events**: `modules/events/lawevent_*.ds.yml`
- **YAML Laws**: `modules/laws/law_*.ds.yml`

## Future Enhancements

Potential improvements:
- Empire-specific law events based on tags
- Multi-turn event chains
- Dynamic choice generation based on game state
- Event consequences that persist across phases
- Player reputation system affecting event outcomes
