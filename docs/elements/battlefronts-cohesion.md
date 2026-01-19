# Battlefronts and Cohesion

## Overview
Battlefronts are MP-based engagements that resolve each tick, while cohesion values track the coalition's stability and the Scourge's momentum. Together they drive win/lose conditions.

## Battlefront Elements
Battlefronts are runtime objects that pair two armies on a front.

- Identity: `id`, `leftArmyId`, `rightArmyId`, `battlefieldSize`
- State: `ACTIVE` or `ENDED`
- Morale flags: `moraleBroken` per side
- Loss tracking: `permanentLosses`
- Timing: `startedAtTick`, `endedAtTick`

### Battle Resolution
- Engagement scales with organization, battlefield width, and morale status
- Damage splits into permanent losses and recovery pool losses
- Morale breaks reduce engagement to 50%
- Sustainment applies morale regen, recovery, and reinforcement each tick

## Cohesion Elements
Cohesion represents the coalition's stability and the Scourge's threat.

- `coalitionCohesion`: 0-100, defeat at 0
- `scourgeCohesion`: 0-100, victory at 0
- `scourgeFervor`: increases each turn, boosting Scourge battles

### Cohesion Tiers
- Stable: 67-100
- Strained: 34-66
- Desperate: 1-33

## Content Sources
- Battle system: `src/game/frontBattles.js`
- Turn orchestration: `src/game/turn.js`
- Cohesion tiers: `src/game/cohesion.js`
- System docs: `docs/systems/battles.md`
