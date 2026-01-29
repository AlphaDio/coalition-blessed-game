# Laws and Events

## Overview
This section covers active laws (player-enacted) and standard non-law events. Law enactment choice events are documented separately in `docs/elements/law-events.md`.

## Laws in Play
Each law costs influence to start and is enacted through the multi-phase law process. Laws are grouped into three categories:
- Economy
- Military
- Gouvernance

Only one law per category can be active at a time. Enacting a new law in a category replaces the previous law and removes its ongoing modifiers.

### Law Properties
Each law definition includes:
- `tier` (1-3)
- `category` (economy | military | governance)
- `law_type` (varies per category)
- `axis_vector` for alignment and reactions
- `modifiers` (ongoing effects while active)
- `immediate_effects` (one-time adoption rewards)

### Tier Unlocks
Tier unlocks are global and history-based:
- T1 is always available.
- T2 unlocks after any T1 law is enacted.
- T3 unlocks after any T2 law is enacted.

## Standard Events in Play
Standard events are narrative choices not tied to the law system. Law-scoped events are handled by the law engine and are not part of the regular event pool.

## Content Sources
- Laws: `src/game/lawDefinitions.js`
- Events: `modules/events/event_*.ds.yml`
