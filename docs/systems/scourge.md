# Scourge System

## Overview

The Scourge system represents an external existential threat that targets empires with coordinated attacks. The Scourge has its own cohesion meter (separate from coalition cohesion) and fervor that grows over time. Players must manage relationships with empires, strengthen the coalition, and prepare defenses to counter the Scourge threat.

## Design Goals

- Create a persistent external threat that poses an escalating challenge
- Make Scourge attacks predictable enough to allow strategy, but uncertain enough for challenge
- Connect Scourge aggression to coalition cohesion and engagement
- Provide players with intelligence systems to predict and prepare for attacks

## Core Mechanics

### Scourge Fervor

Scourge fervor represents the aggression and power level of the Scourge threat:

- **Growth Rate**: +0.5 per turn (deterministic)
- **Maximum**: 50
- **Battle Power Bonus**: Fervor × 0.1 multiplier on Scourge combat power
- **Starting Value**: 0 (typically increases over the game)
- **Effect on Battle Damage**: Higher fervor increases the damage dealt by Scourge forces

### Scourge Cohesion

Scourge cohesion represents the internal unity and coordination of the Scourge faction:

- **Range**: 0–100
- **Victory Condition**: Defeating all Scourge forces reduces this to 0 (coalition victory)
- **Reduction via Combat**: Successful battles reduce Scourge cohesion
- **Modification via Events**: Events may increase or decrease Scourge cohesion based on outcomes
- **Starting Value**: Typically 50–60

### Scourge Target Prediction

The prediction system helps players anticipate attacks:

#### Target Selection Algorithm

1. **Candidate Filtering**: Excludes the current Scourge target (if any)
2. **Vulnerability Weighting**:
   - Lower approval: 40% weight
   - Lower stability: 40% weight
   - More armies: 20% weight
3. **Selection**: Picks from top 30% of vulnerable candidates using weighted randomness
4. **Deterministic Seeding**: Uses turn number and empire ID for consistency

#### Confidence Modifiers

Confidence affects how reliable the prediction is:

| Modifier Range | Level | Uncertainty | Meaning |
|---|---|---|---|
| < 1.0 | LOW | ±5-20 turns | Wild predictions, unreliable |
| 1.0–1.49 | MEDIUM | ±2-8 turns | Reasonable estimate |
| ≥ 1.5 | HIGH | ±1-3 turns | Strong prediction, reliable |

**Factors Affecting Confidence**:

1. **Coalition Cohesion Tier** (+/- 0.05 to 0.15):
   - Stable: +0.1 (better intelligence)
   - Strained: -0.05 (information breakdown)
   - Desperate: -0.15 (chaos)

2. **Scourge Fervor** (-0.0 to -0.1):
   - Higher fervor = less predictable
   - Penalty: (fervor / 50) × 0.1

3. **Army Organization** (-0.1 to +0.1):
   - Better organized armies = more visible patterns

4. **Intelligence Laws** (+0.05 per law):
   - Laws with keywords: "intell", "scout", "fortif"
   - Each relevant law adds 0.05

5. **Event-Based Confidence Changes**:
   - Intelligence gathering events: +0.1 to +0.4
   - Scout losses: -0.2 to -0.3
   - Combat learning: +0.1 to +0.4

**Range**: Clamped 0.1 (minimum) to 2.0 (maximum)

### Battle Timing Estimation

1. **Base Battle Chance** (per cohesion tier):
   - Stable: 2% per turn
   - Strained: 4% per turn
   - Desperate: 6% per turn

2. **Expected Turns**: 1 / battleChance

3. **Variance Calculation**:
   - Base variation scaled by confidence
   - Higher confidence = narrower range
   - Formula: variance = baseVariation × (1 - min(0.7, (modifier - 1.0) × 0.5))

4. **Final Estimate**: Rounded with small random noise

## Integration with Battles

### Scourge Battle Triggers

Each turn, the system checks if a Scourge battle should occur:

1. **Battle Chance**: Based on coalition cohesion tier
2. **Target Check**: Uses predicted target or current target
3. **Power Scaling**: Uses fervor to scale Scourge damage
4. **Results**: Affects Scourge cohesion, army losses, and cohesion changes

### Battle Participation

- **Scourge Forces**: Equivalent to a hostile army attacking the target empire
- **Defense**: The target empire's armies defend
- **Other Empires**: May provide support based on approval/alliance
- **Outcomes**: Victory reduces Scourge cohesion, defeat damages empire approval

## Game Integration Points

### Turn Sequence Integration

Scourge processing occurs at specific points in the turn:

1. **Fervor Growth**: Applied at start of economy phase (+0.5 per turn)
2. **Prediction Update**: Recalculated after cohesion changes (step 7.5)
3. **Battle Check**: Occurs during battle phase
4. **Battle Resolution**: Applies outcomes to Scourge cohesion and armies

### Scourge Events

Events can interact with the Scourge system:

- **Intelligence Events**: Boost or reduce prediction confidence
- **Combat Encounters**: Provide tactical knowledge
- **Diplomatic Events**: May affect Scourge cohesion indirectly

### Scourge-Related Effects

- Laws with intelligence keywords improve prediction
- Empire approval affects Scourge prioritization
- Army organization makes empires easier/harder to target

## Prediction State Structure

```javascript
scourgePrediction: {
  targetEmpireId: null,                    // Predicted target empire ID
  estimatedTurnsToNextBattle: null,        // Estimated turns
  confidenceModifier: 1.0,                 // Confidence multiplier
  confidenceLevel: 'low|medium|high',      // UI label
  uncertaintyRange: {
    min: null,                             // Minimum turns
    max: null                              // Maximum turns
  }
}
```

## Data Flow

### Input
- Coalition cohesion tier
- Empire approval and stability
- Army count and organization
- Scourge fervor value
- Current game state (laws, cohesion changes)

### Processing
1. Calculate confidence modifier from game state
2. Estimate target empire from vulnerability weighting
3. Calculate uncertainty range based on confidence
4. Estimate turns to battle based on cohesion tier

### Output
- Updated prediction with target, ETA, and confidence
- Used by UI to display predictions
- Affects player strategy and preparation

## UI Display

### Terminal UI

Shows in the stats panel:

```
Scourge Fervor: 15.5

Next Target: [Empire Name] (ETA: 8 turns (±3), Confidence: MEDIUM)
```

Confidence badges:
- HIGH: Green
- MEDIUM: Yellow  
- LOW: Red

### Web Frontend

Shows in StatsPanel component:

- Current target (if active battle)
- Next predicted target
- ETA with uncertainty range
- Confidence level with color

## Strategic Implications

### Improving Prediction Confidence

1. **Stabilize Coalition Cohesion**: Maintain "Stable" tier (67+)
2. **Reduce Scourge Fervor**: Some laws/events reduce fervor
3. **Maintain Army Organization**: Keep armies well-organized
4. **Enact Intelligence Laws**: Use laws with "intell", "scout", "fortif" keywords
5. **Engage Strategically**: Combat encounters boost confidence

### Preparing for Attacks

With high confidence predictions, players can:

1. Move armies to the predicted target empire
2. Build up defenses and supplies
3. Prepare morale-boosting events
4. Enact protective laws
5. Accumulate approval with the target empire

## Determinism and Testing

- **Deterministic Base**: Same game state always produces same prediction
- **Uncertainty Range**: Provides variance for player challenge
- **Seeding**: Uses turn number and empire ID for consistency
- **RNG Integration**: Small random noise for non-determinism

## Files

- `src/game/scourgePrediction.js` - Core prediction logic
- `src/game/turn.js` - Turn loop integration (step 7.5)
- `src/systems/scourge.js` - Scourge fervor and cohesion
- `src/game/constants.js` - SCOURGE_PREDICTION_CONSTANTS
- `src/game/types.js` - State structure definition
- `src/ui/renderer.js` - Terminal UI display
- `src/components/StatsPanel.jsx` - Web UI display

## Integration Points

- **Economy System**: Used for market orders and fulfillment checks
- **Events System**: Events can modify prediction confidence
- **Battles System**: Scourge battles resolve combat outcomes
- **Laws System**: Intelligence laws boost prediction confidence
- **Cohesion System**: Cohesion tier affects prediction reliability

## Future Enhancements

- Empire-specific Scourge targeting preferences
- Scourge evolution (becomes more aggressive/strategic over time)
- Coalition counter-intelligence operations
- Scourge faction preferences (targeting certain empire types)
- Permanent loss tracking for Scourge forces
- Alliance bonuses for defending target empires
