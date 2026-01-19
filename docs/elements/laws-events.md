# Laws and Events

## Overview
Laws and events provide narrative and systemic pressure during play. Laws are multi-phase political processes, while events are discrete choices that modify game state.

## Law Elements
Laws are defined as content modules and processed through the law enactment system.

- Definition fields: `id`, `name`, `axis_vector`, `law_tags`
- Support bias: `support_weights` for population, security, and economy incentives
- Phase tags: `phase_tags` determine eligible law events by phase
- Modifiers: `tick_delay_multiplier`, `enactment_chance_bonus`, `progress_per_event`

### Law Process Runtime
When a law is started, a law process tracks:
- Phase: `DEBATE`, `FALLOUT`, `VOTING`, then `ENACTED` or `BURIED`
- Progress meters: momentum, reject_pressure, unrest, legitimacy, polarization, economy_shock
- Reject counter: burial on 4 rejects
- Empire stances: per-empire alignment and vote intent

### Law Events with Choices
Some law events pause the game and offer 1-3 player choices. Each choice can adjust meters and progress, allowing players to steer enactment outcomes.

## Event Elements
Events are independent narrative choices triggered by cohesion tiers.

- Event fields: `id`, `name`, `description`, `choices`
- Effects: changes to cohesion, approval, stockpiles, and army fervor
- Selection: tier-based frequency and deterministic selection logic

## Content Sources
- Law modules: `modules/laws/*.ds.yml`
- Law definitions: `modules/laws/lawdef_*.ds.yml`
- Events: `modules/events/*.ds.yml`
- Law event modules: `modules/events/lawevent_*.ds.yml`
- Systems: `docs/systems/laws.md`, `docs/systems/law-enactment.md`, `docs/systems/law-events-with-choices.md`
