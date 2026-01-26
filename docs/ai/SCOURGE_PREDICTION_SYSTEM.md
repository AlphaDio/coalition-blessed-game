# Scourge Prediction System

## Overview

The Scourge Prediction System provides players with valuable intelligence about future Scourge attacks. It predicts:

1. **Next Target Empire**: Which empire the Scourge will likely attack next
2. **Battle Timing**: Estimated turns until the next Scourge battle (with uncertainty range)
3. **Confidence Level**: How certain this prediction is based on current game state

This system makes the game more strategic by allowing players to prepare defenses, move armies, or enact protective laws before the predicted attack.

## Key Features

### Deterministic but Uncertain

- **Not 100% certain**: The Scourge can still change targets or attack earlier/later than predicted
- **Deterministic base**: The same game state will always produce the same prediction
- **Uncertainty range**: Shows min/max turn estimates with `±` variance
- **Confidence modifier**: Players can improve prediction accuracy through gameplay

### Confidence Levels

The system uses three confidence tiers:

| Level | Modifier | Uncertainty Range | Meaning |
|-------|----------|-------------------|---------|
| LOW | < 1.0 | ±5-20 turns | Wild predictions, very unreliable |
| MEDIUM | 1.0-1.49 | ±2-8 turns | Reasonable estimate, but could be off |
| HIGH | ≥ 1.5 | ±1-3 turns | Strong prediction, very reliable |

### Confidence Modifiers

The confidence modifier is calculated based on several factors:

1. **Coalition Cohesion Tier** (+/- 0.05 to 0.15)
   - Stable: +0.1 (better intelligence network)
   - Strained: -0.05 (information breakdown)
   - Desperate: -0.15 (chaos and confusion)

2. **Scourge Fervor** (-0.0 to -0.1)
   - Higher fervor = more chaotic = less predictable
   - Calculated as: fervor_penalty = (fervor / 50) * 0.1

3. **Army Organization** (-0.1 to +0.1)
   - Higher avg organization = more visible patterns
   - Better organized armies are easier for Scourge to target

4. **Active Intelligence Laws** (+0.05 per law)
   - Laws with keywords: "intell", "scout", "fortif"
   - Each relevant law adds 0.05 to confidence

**Range**: Clamped between 0.1 (minimum, very uncertain) and 2.0 (maximum, very certain)

## Implementation Details

### State Structure

```javascript
scourgePrediction: {
  targetEmpireId: null,                    // Predicted target empire ID
  estimatedTurnsToNextBattle: null,        // Number of turns (null if very uncertain)
  confidenceModifier: 1.0,                 // Multiplier for confidence (1.0 = baseline)
  confidenceLevel: 'low|medium|high',      // String label for UI display
  uncertaintyRange: { min: null, max: null } // Min/max turn estimates
}
```

### Target Prediction Algorithm

1. Filters out the current Scourge target (if any)
2. Weights remaining empires by vulnerability:
   - Lower approval = higher vulnerability (40% weight)
   - Lower stability = higher vulnerability (40% weight)
   - More armies = higher priority (20% weight)
3. Selects from top 30% of candidates using weighted randomness
4. Uses deterministic seeding based on turn number and empire ID

### Battle Timing Estimation

1. Gets the base battle chance for current cohesion tier:
   - Stable: 2% per turn
   - Strained: 4% per turn
   - Desperate: 6% per turn

2. Calculates expected value: `expectedTurns = 1 / battleChance`

3. Applies confidence modifier to reduce variance:
   - Higher confidence = narrower uncertainty range
   - Variance = baseVariation * (1 - min(0.7, (modifier - 1.0) * 0.5))

4. Adds small random noise for non-determinism

5. Returns rounded estimate

### Update Frequency

The prediction is recalculated **every turn** as part of step 7.5 of the turn sequence. This ensures it stays current with:
- Changes in cohesion
- Army organization changes
- New laws being enacted
- Scourge fervor growth
- Empire approval/stability changes

## UI Display

### Terminal UI (TUI)

Shows in the stats panel:

```
Scourge Fervor: 15.5

Next Target: [Empire Name] (ETA: 8 turns (±3), Confidence: MEDIUM)
```

Confidence badge colors:
- HIGH: Green
- MEDIUM: Yellow
- LOW: Red

Uncertainty range: Shows max deviation from estimated turns

### Web Frontend

Shows in the Stats Panel component:

- Current Target Empire (if active battle)
- Next Target Empire prediction
- ETA in turns with uncertainty range
- Confidence level with color-coded display

## Game Integration

### How Players Can Improve Prediction Confidence

1. **Stabilize Coalition Cohesion**: Maintain "Stable" tier (67+)
2. **Reduce Scourge Fervor**: Some laws/events can reduce fervor
3. **Maintain Army Organization**: Keep armies well-organized
4. **Enact Intelligence Laws**: Use laws that improve information gathering
5. **Participate in Events**: Intelligence events directly boost confidence:
   - Scout Report on Scourge Movement
   - Strategic Insight into Scourge Patterns
   - Combat encounters provide tactical knowledge

See [SCOURGE_EVENTS_AND_CONFIDENCE.md](./SCOURGE_EVENTS_AND_CONFIDENCE.md) for details on event-based confidence mechanics.

### Future Expansion Opportunities

- Intelligence improvements that boost confidence
- Laws that provide "scouts" for early warning
- Technologies that improve predictive capabilities
- Events that temporarily reduce/increase confidence
- Emergency laws that grant temporary confidence bonuses

## Code Files

- `src/game/scourgePrediction.js` - Core prediction logic
- `src/game/turn.js` - Integration point (step 7.5)
- `src/game/constants.js` - Constants and thresholds
- `src/game/types.js` - State structure definition
- `src/ui/renderer.js` - Terminal UI display
- `src/components/StatsPanel.jsx` - Web UI display
- `src/hooks/useGameState.js` - Frontend state management
