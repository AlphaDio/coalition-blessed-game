# Events System

## Overview
Events are narrative choices triggered by coalition cohesion tiers. Each event presents choices that modify coalition cohesion, scourge cohesion, empire approval, army fervor, or stockpiles. Law events are handled separately by the law system and use scope `LAW`.

## Design Goals
- Provide narrative pressure tied to coalition cohesion tiers.
- Offer trade-offs that tug on cohesion, approval, and combat readiness.
- Keep event resolution simple and deterministic aside from explicit random effects.

## Primary Flow
- Each tick, `checkEvent` rolls against tier-based frequencies derived from coalition cohesion.
- A random non-law event is selected from `state.events`.
- The event becomes `state.activeEvent` until a player choice resolves it.
- Choice effects mutate coalition cohesion, scourge cohesion, empire approval, army fervor, and stockpiles.
- Events without choices are auto-resolved and logged.

## Event Selection
- Cohesion tiers control event frequency (Stable, Strained, Desperate).
- Law events use scope `LAW` and are filtered out of the regular event pool.
- Events are validated for ids and choices before activation.

## Effect Resolution
- Effects can be static numbers or functions (used for random outcomes).
- Empire approval and army fervor resolve by id map lookup in the game state.
- Stockpile changes are clamped to avoid negative values.
- Invalid choices return an error and do not mutate state.

## Trigger Frequencies
- Frequency depends on coalition cohesion tier:
  - Stable uses `EVENT_CONSTANTS.TIER_1_FREQUENCY`.
  - Strained uses `EVENT_CONSTANTS.TIER_2_FREQUENCY`.
  - Desperate uses `EVENT_CONSTANTS.TIER_3_FREQUENCY`.

## Data Flow
- Inputs: `state.events`, cohesion tier, RNG roll.
- Selection: filter out `scope === 'LAW'` → pick random event.
- Activation: `state.activeEvent` set, UI pauses until choice.
- Resolution: apply effects → clear `state.activeEvent`.

## Content Sources
- Core events are defined as module files in `modules/events/*.ds.yml` and loaded into state in `src/game/content.js`.
- Law events are defined in `src/game/lawEventTemplates.js` and in law event module files, then included in `state.events` for the law engine.

## Key Effects
- `coalitionCohesion`, `scourgeCohesion`
- `empireApproval` keyed by empire id
- `armyFervor` keyed by army id
- `stockpiles` keyed by resource id

## Files
- `src/game/events.js`
- `src/game/content.js`
- `modules/events/*.ds.yml`
- `src/game/lawEventTemplates.js`
- `modules/events/lawevent_*.ds.yml`
