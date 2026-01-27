# Events System

## Overview
Events are narrative choices triggered by coalition cohesion tiers. Each event presents choices that modify coalition cohesion, scourge cohesion, empire approval, army fervor, or stockpiles. Law events are handled separately by the law system and use scope `LAW`.

## Design Goals
- Provide narrative pressure tied to coalition cohesion tiers.
- Offer trade-offs that tug on cohesion, approval, and combat readiness.
- Keep event resolution simple and deterministic aside from explicit random effects.
- Support dynamic entity targeting via selectors (no hardcoded empire/army IDs).

## Primary Flow
- Each tick, `checkEvent` rolls against tier-based frequencies derived from coalition cohesion.
- A random non-law event is selected from `state.events`.
- If the event has `variables`, they are resolved against current game state.
- Resolved context is stored on the active event and used for interpolation and effect expansion.
- The event becomes `state.activeEvent` until a player choice resolves it.
- Choice effects mutate coalition cohesion, scourge cohesion, empire approval, army fervor, and stockpiles.
- Events without choices are auto-resolved and logged.

## Dynamic Selectors

Events can use the selector system to dynamically target entities instead of hardcoding IDs. This is defined in the `variables` block of an event.

### Selector Syntax

```yaml
variables:
  - type: empire          # Entity type: "empire" or "army"
    select: random        # Selection strategy (see below)
    count: 1              # How many to select
    as: favored           # Name for later reference
  - type: empire
    select: all
    exclude: ["$favored"] # Exclude previously selected
    as: others
```

### Selection Strategies
| Strategy | Description |
|----------|-------------|
| `all` | Select all entities of the type |
| `random` | Select `count` random entities |
| `highest` | Select `count` entities with highest `by` field |
| `lowest` | Select `count` entities with lowest `by` field |
| `first` | Select first `count` entities |

### Filters
```yaml
filter:
  - { has_tag: "Industrial" }           # Entity has this tag
  - { has_trait: "mechanical" }         # Entity has this trait
  - { field: "approval", op: "gt", value: 50 }  # Field comparison
```

Comparison operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`

### Effect Targeting

Effects can reference resolved variables or use special targets:

```yaml
effects:
  empireApproval:
    "$favored": 15      # Reference resolved variable
    "$others": -8       # Apply to all entities in variable
    "@all": 5           # Apply to all entities of this type
    "@richest": 3       # Apply to richest empire (by credits)
    "@poorest": 5       # Apply to poorest empire (by credits)
```

**Dynamic Empire Selectors:**
- `@all`: All empires
- `@richest`: Empire with most credits
- `@poorest`: Empire with least credits

These selectors are resolved at effect application time based on current game state, allowing events to dynamically reward or penalize empires based on their economic standing.

### Text Interpolation

Event text and choice text can include variable references:

```yaml
description: "${favored.name} is demanding preferential treatment."
choices:
  - text: "Favor ${favored.name}"
```

Interpolation applies when the event is selected, so resolved context is reused for choice resolution.

Interpolation supports:
- `${varName}` - Entity name or value
- `${varName.field}` - Nested field access (e.g., `${favored.approval}`)

## Event Selection
- Cohesion tiers control event frequency (Stable, Strained, Desperate).
- Law events use scope `LAW` and are filtered out of the regular event pool.
- Events are validated for ids and choices before activation.

## Event Balancing

Events are designed with meaningful choice mechanics where no single option is strictly dominant:

### Balance Levers
- **Requisition Costs**: Economic tradeoff (pay resources for better outcomes)
- **Approval Penalties/Bonuses**: Coalition harmony vs performance
- **Cohesion Impact**: Morale cost of decisions
- **Intel Gain**: Knowledge/Scourge Prediction Confidence
- **Strategic Targeting**: Decisions that reward or penalize specific empires

### Design Principles
- Each event presents 2-3 distinct strategic paths with different costs and benefits
- "Cheap" options sacrifice quality (less intelligence, less approval)
- "Expensive" options require requisition but provide greater benefits
- Some choices strategically target weak/strong empires to enable coalition management
- Decisions should feel contextual based on current coalition state (low on requisition, low approval, need intelligence, etc.)

### Example: Scout Report Event
- **Full Analysis** (75 req): Best intel + fervor, costs resources
- **Share with Weak Allies** (free): Help struggling empires, good intel
- **Keep Internal** (free): Modest intel, best morale

Players must decide: invest resources for maximum intelligence, help struggling allies diplomatically, or preserve resources and morale.

## Effect Resolution
- Effects can be static numbers or functions (used for random outcomes).
- Variable references (`$var`) are expanded to concrete entity IDs.
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
- Variable resolution: resolve selectors against current state.
- Activation: `state.activeEvent` set with resolved context, UI pauses until choice.
- Resolution: expand effect targets → apply effects → clear `state.activeEvent`.

## Content Sources
- Core events are defined as module files in `modules/events/*.ds.yml` and loaded into state in `src/game/content.js`.
- Law events are defined in `src/game/lawEventTemplates.js` and in law event module files, then included in `state.events` for the law engine.

## Key Effects
- `coalitionCohesion`, `scourgeCohesion`
- `empireApproval` keyed by empire id or selector target
- `armyFervor` keyed by army id or selector target
- `stockpiles` keyed by resource id

## Files
- `src/game/events.js` - Event checking and choice handling
- `src/game/selectors.js` - Dynamic selector resolution
- `src/game/content.js` - Event loading from modules
- `modules/events/*.ds.yml` - Event definitions
- `src/game/lawEventTemplates.js` - Law event templates
- `modules/events/lawevent_*.ds.yml` - Law event modules
