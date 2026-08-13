# Resources and Commodities

## Overview
Resources are the tangible commodities that fuel the economy, improvement sustainment, production outputs, army demand, event rewards, and consumption-to-requisition valuation. Each commodity also defines a backlog persistence policy and the pressure key used when its unmet demand expires.

Commodity prices are seeded from each commodity's floor price when a game starts. Prices are fixed after initialization in the current implementation.

## Commodity List

### Tier 1
- Super Alloys (`super_alloys`): floor price 0.1, tags industrial/construction/military
- Biomass (`biomass`): floor price 0.08, perishable, `biomass_pressure`, tags civilian/fuel/sustenance
- Plasma Fuel (`plasma_fuel`): floor price 0.05, deferred for 3 turns, `fuel_pressure`, tags logistics/coolant/life_support

### Tier 2
- Rare Gases (`rare_gases`): floor price 0.5, tags industrial/electronics/science
- Genomes (`genomes`): floor price 0.8, tags medical/agriculture/biotech
- Ancient Relics (`ancient_relics`): floor price 1.2, tags science/culture/strategic
- Psycho Implants (`psycho_implants`): floor price 1.0, tags medical/psychology/military

### Tier 3
- Nano Machines (`nano_machines`): floor price 5.0, tags industrial/repair/military
- Quantum Circuits (`quantum_circuits`): floor price 7.5, tags electronics/intel/command
- Sentient Cores (`sentient_cores`): floor price 10.0, tags command/ethics/strategic
- Wormhole Reactors (`wormhole_reactors`): floor price 15.0, tags energy/propulsion/strategic

### Tier 4
- Dark Matter (`dark_matter`): floor price 100.0, tags legendary/propulsion/megastructure
- Anti-Grav Modules (`anti_grav_modules`): floor price 80.0, tags propulsion/megastructure/strategic

## Demand Persistence and Pressure

Unfilled buy demand is retained as backlog with its resource, remaining quantity, age, source, source validity, and persistence policy. Current demand creates a new backlog item; older valid items are carried forward and compete for supply.

- Perishable demand generally lasts one turn. Expiry converts the unresolved quantity to pressure.
- Deferred demand lasts a configured number of turns before converting to pressure.
- Persistent demand has no age expiry and remains until fulfilled or its conditional source is cancelled.

Pressure is stored by resource and pressure key in `state.economyPressure`. Conditional demand that becomes invalid is cancelled without pressure because the underlying commitment no longer exists.

## Where They Show Up
- Market price initialization and order clearing: `src/game/marketEconomy.js`
- Economy resource loading: `src/game/economyTick/resources.js`
- Improvement sustainment and production: `src/game/improvements/engine`
- Event rewards and penalties: `modules/events/event_*.ds.yml`
- Source definitions: `modules/resources.yaml`
