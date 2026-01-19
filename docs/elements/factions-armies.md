# Factions and Armies

## Overview
Factions (empires) and armies are content modules that define the coalition members, their ideology, and their military forces. Empires provide the political and economic backbone of the coalition; armies represent combat-ready forces that participate in battles, consume supplies, and accrue fervor.

## Empire Elements
Empires are declared in `modules/empires/*.ds.yml` and loaded into game state during startup.

- Identity: `id`, `name`, `color`, `tags`, `traits`
- Approval: initial `approval` drives cohesion impacts
- Ideology: `values` across six axes for value alignment
- Stats: `population`, `influence`, and stability (calculated on load)
- Economy: `budget_credits`, `production.outputs_per_tick`, `needs.per_pop`, `wants.per_pop`, `stockpiles`
- Modifiers: `modifiers.intensity` and `modifiers.axis_gates`

### Value Axes
Empires express ideology across the alignment axes used by the law system:
- `authoritarian_liberal`
- `spiritual_materialistic`
- `natural_mechanical`
- `pacifist_militaristic`
- `stoicist_hedonistic`
- `essentialist_constructivist`

### Tags and Traits
Tags and traits influence improvement synergies, law alignment, and narrative flavor. Use tags to drive conditional logic (for example, biologic empires gain extra population growth from biologic improvements).

## Army Elements
Armies are declared in `modules/armies/*.ds.yml` and tied to empires by `empireId`.

- Identity: `id`, `name`, `empireId`
- Core stats: `organization`, `fervor`, `aggravation` (supply need)
- Recovery: `recovery` (0-100) influences MP recovery rate
- Combat pools: `mp` and `mo` are initialized at runtime

### Combat-Relevant Stats
- `organization`: participation rate for MP engagement and recovery modifier
- `fervor`: impacts kill rate bonuses and event effects
- `recovery`: sets MP recovery base rate
- `aggravation`: drives insurrection risk and supply strain

## Content Sources
- Empires: `modules/empires/*.ds.yml`
- Armies: `modules/armies/*.ds.yml`
- Content loader: `src/game/content.js`
- Types: `src/game/types.js`
