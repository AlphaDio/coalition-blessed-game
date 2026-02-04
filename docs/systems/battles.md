# Battles System

## Overview
The battle system simulates MP-based front battles with morale, reinforcement, and recovery. Battles are resolved per tick on active fronts; morale breaks impact engagement. **Reinforcement** is reserves joining the line during the battle; **recovery** is temporary (non-permanent) casualties treated as wounded—retired from the fight and added back to the army only after the battle ends.

## Design Goals
- Model attrition over time with clear morale breakpoints.
- Separate permanent losses (kills) from temporary damage (wounded).
- Make organization meaningful via participation limits.
- Reinforcement during battle; wounded return only after battle.

## Primary Flow
- Battles start via `startBattle` or specialized battle triggers in the turn flow.
- Each tick, `simulateBattleTick` processes both sides, applies damage, checks for shattering, and handles sustainment.
- Morale breaks are tracked per side and lower engagement.
- When an army shatters, the battle ends; then wounded are returned to each army and morale resets to max.

## Engagement Model
- Organization controls participation rate (0–100% of MP can engage).
- Battlefield width caps the total engaged MP per side.
- Morale-broken armies fight at 50% engagement.

## Damage Model
- MP damage scales with engaged MP and per-unit damage.
- Damage is split into **permanent loss** (kill rate) and **temporary loss** (wounded pool). Temporary losses go to `army.woundedPool` and do not re-enter the battle until it ends.
- Kill rate gains a fervor bonus up to +5% at max fervor.
- Morale damage is applied separately and does not scale with battlefield width.

## Sustainment (during battle)
- **Morale regeneration**: `0.5 + (organization / 100) * 1.5` per tick when not broken.
- **Reinforcement**: Reserves join the line from `reinforcementRate` (capped by `mp.max`). In battle the rate is 10% of normal.
- **Recovery (wounded)**: Wounded do not return during the battle; they stay in `woundedPool` and are added back to `mp.current` only when the battle ends (in `endBattle`).

## Army sustain stats
- **reinforcementRate**: Reserves joining per tick (during battle: 10% of this). Default 100.
- **recoveryRate** / **recovery**: Wounded-return rate. Wounded in the pool are returned up to `mp.max` when the battle ends.

## Battle Lifecycle
- Battles end when an army reaches 0 MP (shattered).
- On end: for each army, `woundedPool` is added back to `mp.current` (capped by `mp.max`), then `woundedPool` is cleared.
- Morale resets to max and morale-broken flags are cleared.
- Battle metadata (permanent losses, wounded returned, reinforced MP, events) is emitted into `worldState.battleEvents`.
- Battle end logs include per-side: destroyed, recovered (wounded), reinforced, remaining MP.

## Army Composition
- Army combat stats are aggregated from attached units via `src/game/armyComposition.js`.
- Combined battle resolution syncs MP/MO back into units to keep aggregates consistent.

## Data Flow
- Inputs: battle front, army stats, battlefield size, RNG for triggers.
- Tick: calculate engagement → apply MP + morale damage (temporary → woundedPool) → check for shatter.
- Sustainment: morale regen → reinforcement only (no during-battle wounded return).
- On end: return wounded to both armies → reset morale → emit events.
- Outputs: updated army MP/MO/woundedPool, battle logs, battle events.

## Integration Points
- `src/game/frontBattles.js` defines battle front simulation and logging.
- `src/game/turn.js` orchestrates battle phases and triggers scourge/insurrection engagements.

## Files
- `src/game/frontBattles.js`
- `src/game/turn.js`
