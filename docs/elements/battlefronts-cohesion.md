# Battlefronts and Cohesion

## Overview
Battlefronts represent the live military engagements in the war. Cohesion values define how close the coalition is to collapse or victory and gate the intensity of events.

## Battlefront Behavior
- Engagement scales with organization and battlefield width.
- Morale-broken armies fight at 50% engagement.
- Damage splits into permanent losses and recoverable losses.
- Recovery and reinforcement slow during battle (20% recovery, 10% reinforcement).
- Battle end logs include per-side summaries of destroyed, recovered, and remaining MP.

## Battle Stats (Defaults in Code)
These are the baseline combat stats applied to armies when created:
- MP pool: 10,000 max
- Morale pool: 100 max
- MP damage per unit: 1.0
- Morale damage per tick: 2.5
- Protection: 0.2, Resolve: 0.3
- Kill rate: 0.1 (portion of MP damage that is permanent)
- Reinforcement rate: 100 per tick

## Cohesion Values
- Coalition cohesion starts at 75 and ranges 0-100. Defeat at 0.
- Scourge cohesion starts at 80 and ranges 0-100. Victory at 0.
- Scourge fervor starts at 10 and increases each turn.

### Cohesion Tiers
- Stable: 67-100
- Strained: 34-66
- Desperate: 1-33

## Content Sources
- Battle system: `src/game/frontBattles.js`
- Army defaults: `src/game/types.js`
- Cohesion tiers: `src/game/cohesion.js`
