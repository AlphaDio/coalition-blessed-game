# Battles System

## Overview
The battle system simulates MP-based front battles with morale, recovery, and reinforcement. Battles are resolved per tick on active fronts; morale breaks impact engagement, and permanent losses are tracked separately from temporary recovery damage.

## Design Goals
- Model attrition over time with clear morale breakpoints.
- Separate permanent losses from temporary recoverable damage.
- Make organization meaningful via participation limits and recovery speed.

## Primary Flow
- Battles start via `startBattle` or specialized battle triggers in the turn flow.
- Each tick, `simulateBattleTick` processes both sides, applies damage, checks for shattering, and handles sustainment.
- Morale breaks are tracked per side and lower engagement.
- When an army shatters, the battle ends and morale resets to max.

## Engagement Model
- Organization controls participation rate (0–100% of MP can engage).
- Battlefield width caps the total engaged MP per side.
- Morale-broken armies fight at 50% engagement.

## Damage Model
- MP damage scales with engaged MP and per-unit damage.
- Damage is split into permanent loss (kill rate) and temporary loss (recovery pool).
- Kill rate gains a fervor bonus up to +5% at max fervor.
- Morale damage is applied separately and does not scale with battlefield width.

## Sustainment
- Morale regeneration is `0.5 + (organization / 100) * 1.5` per tick when not broken.
- Recovery is `recovery * 10` MP/tick scaled by organization; in battle it is 20% of normal.
- Reinforcement is reduced to 10% of normal during battle.

## Battle Lifecycle
- Battles end when an army reaches 0 MP.
- Morale resets to max and morale-broken flags are cleared at end.
- Battle metadata (permanent losses, events) is emitted into `worldState.battleEvents`.

## Data Flow
- Inputs: battle front, army stats, battlefield size, RNG for triggers.
- Tick: calculate engagement → apply MP + morale damage → check for shatter.
- Sustainment: morale regen → recovery → reinforcement.
- Outputs: updated army MP/MO, battle logs, battle events.

## Integration Points
- `src/game/frontBattles.js` defines battle front simulation and logging.
- `src/game/turn.js` orchestrates battle phases and triggers scourge/insurrection engagements.

## Files
- `src/game/frontBattles.js`
- `src/game/turn.js`
