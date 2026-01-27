# Cohesion System

## Overview

The Cohesion system manages two separate but interconnected cohesion meters: Coalition Cohesion (the player's faction) and Scourge Cohesion (the threat). Coalition cohesion represents how united and stable the coalition of empires is, while Scourge cohesion represents the internal unity of the Scourge threat. These meters determine game-over conditions, event frequencies, and difficulty scaling.

## Design Goals

- Create two opposing meters that represent faction stability
- Provide clear victory/defeat conditions tied to cohesion
- Scale game difficulty based on coalition stability
- Make cohesion meaningful through visible effects on gameplay

## Coalition Cohesion

### Core Properties

- **Range**: 0–100
- **Starting Value**: Typically 50–60
- **Victory Condition**: Defeat Scourge (reduce Scourge Cohesion to 0)
- **Defeat Condition**: Coalition cohesion reaches 0 (coalition collapse)

### Cohesion Tiers

Coalition cohesion is divided into three tiers that dramatically affect gameplay:

| Tier | Range | Name | Status | Event Frequency |
|------|-------|------|--------|-----------------|
| 1 | 67–100 | Stable | Everything functioning normally | 1.0x |
| 2 | 34–66 | Strained | Internal tensions rising | 1.2x |
| 3 | 1–33 | Desperate | Coalition on verge of collapse | 1.5x |

### Effects of Cohesion Tiers

#### Tier 1: Stable (67+)
- Events occur at baseline frequency
- Scourge fervor growth may be slowed
- Intelligence predictions are more reliable
- No structural penalties to army performance

#### Tier 2: Strained (34–66)
- Events occur 20% more frequently
- Coalition faces internal friction
- Intelligence becomes slightly less reliable (-0.05 confidence)
- Possible subtle penalties to morale

#### Tier 3: Desperate (1–33)
- Events occur 50% more frequently
- Coalition near collapse
- Intelligence becomes unreliable (-0.15 confidence)
- Possible army morale and performance penalties
- Risk of insurrection increases

### Cohesion Modifications

Cohesion is modified by various game events:

- **Events**: Most game events modify cohesion
- **Law Outcomes**: Laws may increase or decrease cohesion
- **Battle Losses**: Significant defeats reduce cohesion
- **Supply Failures**: Economic collapse can reduce cohesion
- **Successes**: Victories and good outcomes increase cohesion

### Cohesion Recovery

Coalition cohesion recovers through:

1. **Successful Defense**: Defeating Scourge attacks
2. **Enacted Laws**: Stability-focused laws provide bonuses
3. **Empire Approval**: High empire approval stabilizes coalition
4. **Economic Prosperity**: Surplus and growth improve cohesion
5. **Positive Events**: Some events provide cohesion boosts

## Scourge Cohesion

### Core Properties

- **Range**: 0–100
- **Defeat Condition**: Reduce to 0 (Scourge eliminated)
- **Victory Condition**: Coalition reaches 0 (not defeat, but related)
- **Starting Value**: 50–60 (matches coalition)

### Scourge Cohesion Reduction

Scourge cohesion is reduced through:

1. **Combat Victories**: Defeating Scourge forces in battle
2. **Intelligence Events**: Successful intel operations
3. **Strategic Laws**: Anti-Scourge focused laws
4. **Coordinated Defense**: Multiple empires defending together

### Scourge Cohesion Growth

Scourge cohesion can increase through:

1. **Battle Victories**: When Scourge defeats empires
2. **Low Coalition Cohesion**: Chaos weakens unified defense
3. **Successful Attacks**: Accomplishing objectives strengthens unity
4. **Empire Defeats**: Eliminating or severely damaging empires

## Game Over Conditions

The system checks for victory and defeat each turn:

```
if (coalitionCohesion <= 0) → DEFEAT (Coalition Collapse)
if (scourgeCohesion <= 0) → VICTORY (Scourge Eliminated)
```

### Coalition Collapse Condition

When coalition cohesion reaches 0:

1. **Trigger**: Coalition cohesion value becomes ≤ 0
2. **Reason**: "Coalition collapsed"
3. **Status**: Game Over, Player Loses
4. **What it means**: The empires have fractured so much that coordinated defense is impossible

### Scourge Elimination Condition

When Scourge cohesion reaches 0:

1. **Trigger**: Scourge cohesion value becomes ≤ 0
2. **Reason**: "Scourge defeated"
3. **Status**: Game Over, Player Wins
4. **What it means**: The external threat has been eliminated

## Cohesion Display and Feedback

### Terminal UI

Shows both cohesion meters in the stats panel:

```
Coalition Cohesion: 65 (Strained)
Scourge Cohesion: 45

Tier: Strained (Event Multiplier: 1.2x)
```

### Web Frontend

Shows in the StatusPanel component:

- Coalition cohesion as a horizontal bar (green for Stable, yellow for Strained, red for Desperate)
- Scourge cohesion as a separate bar
- Tier name and current frequency multiplier
- Visual indicator of stability

## Gameplay Integration

### Event Frequency

Tier affects how often random events occur:

```javascript
getTierPenalty(tier) {
  // Tier 1: no penalty
  // Tier 2: -5% penalty
  // Tier 3: -15% penalty
}

getEventFrequencyModifier(tier) {
  // Tier 1: 1.0x
  // Tier 2: 1.2x
  // Tier 3: 1.5x
}
```

Higher tiers generate more events, representing increased chaos and decision-making pressure.

### Prediction Reliability

Coalition cohesion tier directly affects Scourge prediction confidence:

- **Stable**: +0.1 confidence bonus
- **Strained**: -0.05 confidence penalty
- **Desperate**: -0.15 confidence penalty

### Scourge Aggression

The relationship between coalition and Scourge cohesion affects battle frequency:

- **High Coalition / Low Scourge**: Less frequent attacks
- **Low Coalition / High Scourge**: More frequent attacks
- **Desperate Coalition**: Scourge becomes increasingly aggressive

## Strategic Implications

### Maintaining Stability

Players can maintain coalition cohesion by:

1. **Winning Battles**: Defeating Scourge provides morale boosts
2. **Enacting Stability Laws**: Some laws directly increase cohesion
3. **Managing Empire Approval**: Keep empires satisfied
4. **Economic Success**: Surplus and growth improve morale
5. **Making Good Event Choices**: Select options that boost cohesion

### Reaching Critical Points

Players should avoid:

1. **Consecutive Defeats**: Rapid cohesion loss
2. **Economic Collapse**: Supply failures damage morale
3. **Low Empire Approval**: Widespread discontent
4. **Poor Event Choices**: Selecting negative outcomes

### Escalation Cycles

The system creates emergent difficulty escalation:

1. **Early Game**: Coalition stable, Scourge weak (manageable)
2. **Mid Game**: Coalition strained, Scourge growing (challenging)
3. **Late Game**: Coalition desperate, Scourge strong (intense)
4. **Victory Condition**: Reduce Scourge cohesion before coalition collapses

## Data Flow

### Input
- Cohesion modification events
- Battle outcomes
- Event choices
- Law enactment
- Empire interactions

### Processing
1. Apply cohesion modifications with clamping (0–100)
2. Determine tier based on cohesion value
3. Calculate event frequency modifier for this tier
4. Check for game-over conditions
5. Update confidence modifier for Scourge predictions

### Output
- Updated coalition cohesion value
- Updated Scourge cohesion value
- Current tier and frequency modifier
- Game over status (if applicable)
- Events triggered based on frequency

## Logging

All cohesion changes are logged:

```
Coalition Cohesion +5 (successful defense)
Coalition Cohesion -3 (empire dissatisfaction)
Scourge Cohesion -2 (battle losses)
```

## Files

- `src/systems/cohesion.js` - Core cohesion mechanics
- `src/game/constants.js` - Cohesion tier definitions
- `src/game/types.js` - State structure definition
- `src/game/turn.js` - Turn loop integration
- `src/ui/renderer.js` - Terminal UI display
- `src/components/StatusPanel.jsx` - Web UI display

## Integration Points

- **Events System**: Events modify cohesion based on choices
- **Laws System**: Laws can increase/decrease cohesion
- **Battles System**: Battle outcomes affect cohesion
- **Economy System**: Economic prosperity affects cohesion
- **Scourge System**: Scourge cohesion mirrors coalition challenges
- **Prediction System**: Coalition cohesion affects prediction reliability

## Future Enhancements

- Empire-specific cohesion contributions
- Cohesion inertia (slow to change, builds momentum)
- Temporary cohesion boosts from morale events
- Regional cohesion tracking (empires in different regions)
- Fracture mechanics (empires temporarily withdrawn from coalition)
- Diplomatic bonds between empires (provide shared cohesion)
