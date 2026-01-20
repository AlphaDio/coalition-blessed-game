# Resources and Commodities

## Overview
Resources are the tangible commodities that fuel the war effort. They are tiered by scarcity and volatility and appear in sustainment costs, market pricing, and event rewards.

## Commodity List (Current Game)

### Tier 1
- Super Alloys: floor price 1.0, tags industrial/construction/military
- Biomass: floor price 0.8, tags civilian/fuel/sustenance
- Solid Ice (solid_ice): floor price 0.5, tags logistics/coolant/life_support

### Tier 2
- Rare Gases: floor price 5.0, tags industrial/electronics/science
- Genomes: floor price 8.0, tags medical/agriculture/biotech
- Ancient Relics: floor price 12.0, tags science/culture/strategic
- Psycho Implants: floor price 10.0, tags medical/psychology/military

### Tier 3
- Nano Machines: floor price 50.0, tags industrial/repair/military
- Quantum Circuits: floor price 75.0, tags electronics/intel/command
- Sentient Cores: floor price 100.0, tags command/ethics/strategic
- Wormhole Reactors: floor price 150.0

### Tier 4
- Dark Matter: floor price 1000.0, tags legendary/propulsion/megastructure
- Anti-Grav Modules: floor price 800.0, tags propulsion/megastructure/strategic

## Where They Show Up
- Market pricing and order clearing: `src/game/marketEconomy.js`
- Improvement sustainment and production: `src/game/improvements.js`
- Event rewards and penalties: `modules/events/event_*.ds.yml`

## Content Sources
- Commodities: `docs/input/resources.yaml`
