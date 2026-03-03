# Insurrection System

## Overview

The Insurrection system handles internal rebellions within the coalition. When armies become sufficiently aggravated (due to poor supply, low approval, or other factors), they may rebel against the coalition, triggering internal battles. This adds an internal threat that complements the external Scourge threat.

## Design Goals

- Create consequences for economic failures and poor army management
- Add internal conflict as an alternative failure condition
- Make supply chains and logistics meaningful
- Provide tension between maintaining coalition and supporting armies

## Core Mechanics

### Army Aggravation

Each army has an aggravation meter (0–100) that represents discontent:

- **Increases When**: Supply shortages, low approval, unmet needs
- **Decreases When**: Supply fulfillment, morale events, victories
- **Maximum**: 100
- **Minimum**: 0

#### Aggravation Growth

Aggravation increases through:

1. **Supply Shortage**: +3 per turn when supply fulfillment is inadequate
2. **Unmet Needs**: Stacking penalty for missing requisite supplies
3. **Low Approval**: Indirect effect through empire approval
4. **Defeat in Battle**: Morale damage from combat losses

#### Aggravation Decay

Aggravation decreases through:

1. **Good Supply Fulfillment**: -2 per turn when supplies are adequate
2. **Victory**: Significant morale boost from winning battles
3. **Morale Events**: Positive events affecting armies
4. **Approval Bonuses**: Empire approval provides army stability

### Insurrection Threshold

- **Threshold Value**: 80 (aggravation triggers rebellion)
- **Spawning**: When any army reaches 80+ aggravation and no insurrection is active
- **Multiple Armies**: If multiple armies are aggravated, they rebel together

### Insurrection Spawning

When the threshold is reached:

1. **Identification**: All armies with aggravation ≥ 80 are identified
2. **Unity Check**: If any armies meet threshold and no insurrection exists, spawn
3. **Logging**: "INSURRECTION! N army/armies have rebelled"
4. **Strength Calculation**: Average aggravation of rebelling armies
5. **State Addition**: New insurrection added to state with ID and army list

```javascript
{
  id: `insurrection_${state.turn}`,           // Unique ID based on turn
  armies: [array of army IDs],                // Rebelling armies
  strength: averageAggravation                // Insurrection power
}
```

## Insurrection Resolution

### Battle Setup

When insurrection exists, the system resolves it:

1. **Insurrectionists**: Identified armies fighting against coalition
2. **Loyalists**: All remaining armies defending coalition
3. **No Valid Combat**: If either side has no armies, insurrection auto-resolves
4. **Battle Type**: Uses existing battles system (insurrectionBattle)

### Battle Mechanics

- **Combatants**: Insurrectionist armies vs. Loyal armies
- **Duration**: Resolved within a single turn or extended battle
- **Advantages**: Loyalists fight on home ground; insurrectionists are motivated
- **Outcomes**: Coalition victory removes insurrection or coalition defeat

### Resolution Outcomes

#### Coalition Victory
- Insurrection is removed from state
- Rebelling armies return to coalition control
- Possible reforms to prevent future rebellions
- Morale damage to insurrectionists

#### Coalition Defeat
- Insurrection persists or spreads
- Possible game-over condition if severe
- Significant cohesion loss
- Army losses and logistical breakdown

### Battle Power Calculation

Insurrection strength affects battle outcomes:

```
insurrection_power = average_aggravation / 100   // 0.0 to 1.0
```

This scaling ensures that highly aggravated armies are formidable opponents, while moderately aggravated armies are less threatening.

## Prevention and Management

### Preventing Insurrection

1. **Maintain Supply**: Ensure army supply fulfillment > 0.80
2. **Build Requisition**: Invest in improvements that boost army morale
3. **Win Battles**: Victories reduce aggravation significantly
4. **Support Events**: Select event choices that boost army morale
5. **Approve Empires**: High empire approval provides army stability

### Tactical Considerations

When aggravation is rising:

1. **Increase Supply**: Priority allocation to affected armies
2. **Assign Victories**: Position armies against weak enemies
3. **Event Management**: Choose events that benefit military
4. **Diplomatic Support**: Improve empire approval
5. **Economic Priority**: Ensure army needs are met first

## Aggravation Sources

### Supply System

The economy system increases aggravation when:

```javascript
// Pseudocode from economy integration
if (armySupplyFulfillment < 0.80) {
  aggravation += AGGRAVATION_INCREASE_UNDERFUNDED;  // +3
}
```

### Law Effects

Laws can indirectly affect aggravation through:

- Taxes (economic impact on supply)
- Military policy changes
- Morale-affecting legislation
- Conscription (affects army morale)

### Event Choices

Event outcomes can modify aggravation:

- Military success events: reduce aggravation
- Defeat events: increase aggravation
- Morale events: affect affected armies

## State Structure

### Insurrection Tracking

```javascript
insurrections: [
  {
    id: 'insurrection_150',
    armies: ['army_1', 'army_3'],
    strength: 75.3,
    resolved: false
  }
]
```

### Army Aggravation

```javascript
army: {
  id: 'army_1',
  aggravation: 45,              // 0-100
  // ... other properties
}
```

## Data Flow

### Input
- Army supply fulfillment (from economy)
- Battle outcomes (from battles system)
- Event effects (from events system)
- Law effects (from laws system)

### Processing
1. **Aggravation Update**: Modify based on supply and events
2. **Threshold Check**: Check if any armies ≥ 80
3. **Spawn Check**: Spawn insurrection if no existing one
4. **Resolution**: Resolve active insurrections via battles
5. **Outcomes**: Apply results and adjust state

### Output
- Updated army aggravation values
- New insurrections created
- Battle outcomes and losses
- Cohesion changes
- Log entries

## Game Integration

### Turn Sequence

Insurrection handling occurs:

1. **Economy Phase**: Supply fulfillment calculated (affects aggravation)
2. **Insurrection Update**: Aggravation modified based on supply
3. **Spawn Check**: Check for new insurrections
4. **Battle Phase**: Resolve any active insurrections
5. **Aftermath**: Apply outcomes to armies and cohesion

### Relationships to Other Systems

#### Economy System
- Supply shortages increase aggravation
- Requisition improvements can boost army morale
- Market failures trigger aggravation growth

#### Battles System
- Insurrection battles use same resolution system
- Victory reduces aggravation
- Defeat damages morale and increases aggravation

#### Events System
- Events can directly modify aggravation
- Military-themed events affect army morale
- Disaster events may trigger aggravation

#### Cohesion System
- Insurrections damage coalition cohesion
- Coalition collapse may enable multiple insurrections
- Stable tier reduces aggravation growth

## Strategic Implications

### Early Prevention

In early game, focus on:

1. **Supply Chain**: Ensure reliable supply fulfillment
2. **Build Infrastructure**: Improvements that boost army morale
3. **Maintain Approval**: Keep empires satisfied
4. **Win Battles**: Build army confidence through victory

### Responding to Rising Aggravation

If aggravation approaches threshold:

1. **Emergency Supply**: Reallocate supplies to affected armies
2. **Victory Opportunities**: Position armies for wins
3. **Event Management**: Choose army-beneficial outcomes
4. **Approval Boost**: Improve empire approval quickly
5. **Investment**: Build improvements that reduce maintenance

### Managing Active Insurrection

If insurrection occurs:

1. **Prepare Loyalists**: Position loyal armies for battle
2. **Minimize Casualties**: Avoid unnecessary losses
3. **Quick Resolution**: End insurrection quickly to limit damage
4. **Recovery**: Restore supply and morale after victory
5. **Investigation**: Prevent future insurrections

## Logging

Insurrection events are logged for player visibility:

```
INSURRECTION! 2 army/armies have rebelled
Insurrection resolved - Coalition victory
Coalition Cohesion -10 (insurrection losses)
```

## Files

- `src/systems/insurrection.js` - Core insurrection mechanics
- `src/game/economyTick.js` - Economy integration (aggravation growth)
- `src/systems/battles.js` - Battle resolution for insurrections
- `src/game/turn.js` - Turn loop integration
- `src/game/types.js` - State and army structure definition
- `src/ui/renderer.js` - Terminal UI display of aggravation

## Integration Points

- **Economy System**: Supply failures trigger aggravation growth
- **Battles System**: Insurrection battles use battle resolution
- **Events System**: Events modify aggravation and outcomes
- **Cohesion System**: Insurrections damage coalition cohesion
- **Army System**: Tracks aggravation and rebellion status
- **Improvement System**: Some improvements boost army morale

## Future Enhancements

- Insurrection negotiation (compromise instead of battle)
- Aggravation spreading (nearby armies become aggravated)
- Faction formation (rebelling armies form alliance)
- Regional insurrections (specific geographic uprising)
- Insurrection leaders (special rebel commanders)
- Long-term insurrection (extended conflict, spreading)
- Ideological insurrection (based on law disagreement, not just supply)
- Amnesty laws (reduce aggravation through policy)
