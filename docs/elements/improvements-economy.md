# Improvements and Economy

## Overview
Improvements are coalition infrastructure projects proposed by empires. They spend coalition requisition up front, consume BUILDING capacity while under construction, require ongoing sustainment after completion, and provide production outputs or modifiers while active.

The current economy uses fixed market prices and consumption-based requisition. There is no coalition procurement bank, no stockpile rollover, and no emergency-law economy layer.

## Requisition Basics
- Live new games start with 1000 requisition.
- Improvements spend requisition when accepted.
- Active improvements with `requisitionUpkeep` charge `requisitionUpkeep / 10` each tick.
- Direct improvement output of `requisition` is added immediately to the coalition economy.
- Commodity consumption by empires, armies, and improvement sustainment is converted into pooled requisition every 15 turns.

## Suggestions and Unlocks
- Each empire maintains up to 3 improvement suggestions.
- A new game offers Mycelial Biosphere and Biofuel Refinery across the coalition, providing both a biomass producer that can start without biomass and an industrial option. Later suggestions continue to rotate normally.
- Accepting a suggestion starts construction and immediately opens room for another suggestion.
- T1 improvements are available immediately.
- T2 requires 2 completed T1 improvements for that empire.
- T3 requires 3 completed T2 improvements for that empire.
- The same improvement can be suggested more than once.

## Construction and Sustainment
- Starting BUILDING capacity limit: 4.
- Capacity only counts improvements in `BUILDING`.
- Every BUILDING improvement receives the full coalition construction value each tick.
- Base coalition construction: 4 build progress per tick.
- Active improvements queue sustainment demand before market clearing.
- All projects queue their sustainment before local production is allocated, so project order does not block same-empire supply. Production banks can satisfy local sustainment every turn, before releasing surplus to the market.
- Missing sustainment degrades an improvement; degraded improvements stop producing until sustainment resumes.

## Runtime Scaling
Catalog production numbers are definition values. Runtime applies:

- Base production efficiency of 10%.
- Population scaling to non-requisition commodity output.
- Commodity-specific supply multipliers from economy balance constants.
- Production bank thresholds before non-requisition commodities are released.
- The release threshold is based on expected output after the producing project's own sustainment, so a small surplus is not held behind output the project consumes itself.

Catalog sustainment numbers are definition values. Runtime applies rationing, supply efficiency, population, sustainment scaling, and demand balance multipliers before market orders are emitted.

## Tier Summary
| Tier | Count | Cost Range | Avg Cost | Build Range | Avg Build | Total Capacity | Avg Upkeep |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 | 23 | 110-240 | 168.5 | 120-260 | 181.3 | 43 | 2.2 |
| T2 | 13 | 440-620 | 511.5 | 300-540 | 449.2 | 40 | 7.0 |
| T3 | 9 | 900-1400 | 1192.2 | 720-1100 | 932.2 | 54 | 10.2 |

## Branch Summary
| Branch | Count | Avg Cost | Total Building Capacity | Role |
| --- | ---: | ---: | ---: | --- |
| Industrial | 7 | 440.0 | 19 | Production, construction speed, strategic materials |
| Research | 4 | 447.5 | 14 | Research speed and advanced inputs |
| Military | 7 | 568.6 | 23 | Army power, replenishment, protection, supply efficiency |
| Cultural | 4 | 492.5 | 14 | Population growth, approval, hero support |
| Economic | 5 | 546.0 | 15 | Trade income, market efficiency, logistics |
| Spiritual | 4 | 470.0 | 14 | Fervor, cohesion, approval |
| Governance | 5 | 492.0 | 18 | Law speed, queue capacity, research/economy support |
| Resource | 9 | 373.9 | 20 | Biomass production, commodity bootstrapping, and rare resource supply |

## Biomass Development

- **Mycelial Biosphere** produces biomass and genomes using plasma fuel and rare gases; it does not require biomass to start.
- **Biofuel Refinery** produces both biomass and plasma fuel, using alloys and some biomass for upkeep. Its biomass output exceeds that input at base efficiency.
- **Biosphere Arcology** produces biomass while supporting population and approval, but consumes some of its own biomass for upkeep.

Actual output and sustainment depend on population, efficiency, and modifiers.

Biosphere Arcology also increases Hero funding efficiency by 5%, and Harmony Halo
by 10%. These bonuses increase the apparatus rating gained per credit of actual
funding; they do not generate Charge. Current definitions use
`hero_funding_efficiency_mult`. Legacy saved improvement modifiers named
`hero_siphon_efficiency_mult` or `hero_siphon_efficiency_add` remain compatible
funding-efficiency aliases, without renaming or converting the saved keys. The
terminal describes both versions as Hero funding efficiency (an old additive
`0.01` bonus is equivalent to +5% at the base funding rate).

## Advanced Resource Uses

Tier 1 projects can supply advanced commodities from basic inputs. The Circuit Synthesis Vault supplies Quantum Circuits, the Genome Crucible supplies Genomes, the Relic Cathedral supplies Ancient Relics, and the Signal Intelligence Bureau supplies Sentient Cores. The Nano-Lattice Crucible supplies Nanomachines, and the Commodity Exchange Spire supplies Psycho-Implants.

Some projects still use materials they produce. The Biofuel Refinery processes Biomass into fuel, the Nano-Logistics Corridor uses Nanomachine couriers, and the Wormhole Forge Complex uses Nanomachines in its forge. Other buildings or member empires can supply those inputs.

The T2 Exotic Matter Lattice produces dark matter for the T2 Anti-Grav Assembly Platform and T3 Imperial Bastion World. The assembly platform produces anti-grav modules for the T2 Nano-Logistics Corridor and T3 Dyson Mantle. Consuming anti-grav modules also feeds the owning empire's existing construction-effect pool.

## Current Catalog
| Branch | Tier | Improvement | Cost | Build | Capacity | Upkeep | Outputs | Modifiers |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| industrial | T1 | Foundry Ring | 160 | 180 | 2 | 2 | super_alloys: 0.037 | industrial_output: 0.03 |
| industrial | T1 | Asteroid Strip Array | 220 | 240 | 2 | 2 | rare_gases: 0.04, plasma_fuel: 0.023 | supply_efficiency: 0.02 |
| industrial | T1 | Coalition Requisition Forge | 170 | 210 | 2 | 2 | plasma_fuel: 0.115, requisition: 9 | industrial_output: 0.02 |
| industrial | T1 | Nano-Lattice Crucible | 180 | 200 | 2 | 2 | nano_machines: 0.032 | supply_efficiency: 0.03 |
| industrial | T2 | Quantum Fabrication Lattice | 460 | 460 | 2 | 7 | quantum_circuits: 0.064 | industrial_output: 0.05 |
| industrial | T2 | Wormhole Forge Complex | 540 | 500 | 3 | 8 | wormhole_reactors: 0.045, nano_machines: 0.04 | industrial_output: 0.06, coalition_construction_mult: 0.15 |
| industrial | T3 | Dyson Mantle | 1350 | 1000 | 6 | 10 | dark_matter: 0.007, quantum_circuits: 0.092 | industrial_output: 0.16, coalition_construction_mult: 0.3 |
| research | T1 | Stellar Research Arcology | 240 | 260 | 2 | 2 | rare_gases: 0.024, genomes: 0.01 | research_speed: 0.2 |
| research | T1 | Circuit Synthesis Vault | 210 | 230 | 2 | 2 | quantum_circuits: 0.026 | research_speed: 0.08 |
| research | T2 | Neural Constellation Grid | 440 | 420 | 4 | 7 | quantum_circuits: 0.048, sentient_cores: 0.014 | research_speed: 0.4 |
| research | T3 | Ascension Spire Array | 900 | 900 | 6 | 10 | rare_gases: 0.12, quantum_circuits: 0.055, sentient_cores: 0.02 | research_speed: 0.7 |
| military | T1 | Strategic War Citadel | 160 | 160 | 2 | 2 | super_alloys: 0.026, plasma_fuel: 0.03 | army_organization: 0.8, army_fervor: 0.8, army_damage_mult: 0.04, army_replenishment_mult: 0.06 |
| military | T1 | Mobilization Drydock Ring | 190 | 180 | 2 | 3 | plasma_fuel: 0.058 | army_replenishment_mult: 0.12, army_consumption_mp_gain_mult: 0.15 |
| military | T1 | Aegis Shield Bastion | 170 | 170 | 2 | 2 | super_alloys: 0.03 | army_protection: 0.02, army_organization: 0.5, supply_efficiency: 0.02 |
| military | T2 | Grand War Conclave | 460 | 420 | 2 | 7 | super_alloys: 0.038, quantum_circuits: 0.018 | army_organization: 1.4, army_protection: 0.02, supply_efficiency: 0.08, army_damage_mult: 0.06, army_replenishment_mult: 0.12, army_consumption_mp_gain_mult: 0.15 |
| military | T2 | Combat Cloning Vault | 520 | 360 | 3 | 6 | genomes: 0.045, psycho_implants: 0.03 | army_replenishment_mult: 0.18, army_consumption_mp_gain_mult: 0.22, army_fervor: 1 |
| military | T3 | Imperial Bastion World | 1200 | 900 | 6 | 10 | super_alloys: 0.125, nano_machines: 0.092 | army_organization: 2.4, army_fervor: 1.4, army_protection: 0.04, supply_efficiency: 0.12, army_damage_add: 0.16, army_damage_mult: 0.09, army_replenishment_mult: 0.18, army_consumption_mp_gain_mult: 0.22 |
| military | T3 | Cataphract Forge Halo | 1280 | 980 | 6 | 11 | super_alloys: 0.074, nano_machines: 0.052, wormhole_reactors: 0.011 | army_organization: 2.5, army_protection: 0.03, army_damage_add: 0.22, army_damage_mult: 0.1, army_replenishment_mult: 0.24, army_consumption_mp_gain_mult: 0.3 |
| cultural | T1 | Biosphere Arcology | 140 | 180 | 2 | 2 | biomass: 0.046 | population_growth: 0.06, empire_approval: 4, hero_funding_efficiency_mult: 0.05 |
| cultural | T1 | Heritage Memory Vault | 160 | 200 | 2 | 2 | ancient_relics: 0.022, psycho_implants: 0.012 | empire_approval: 5, population_growth: 0.04 |
| cultural | T2 | Festival Ring of Worlds | 620 | 300 | 4 | 7 | genomes: 0.072, psycho_implants: 0.018 | population_growth: 0.12, empire_approval: 7 |
| cultural | T3 | Harmony Halo | 1050 | 720 | 6 | 10 | genomes: 0.055, psycho_implants: 0.11 | population_growth: 0.22, empire_approval: 12, hero_funding_efficiency_mult: 0.1 |
| economic | T1 | Trade Relay Nexus | 220 | 240 | 2 | 2 | rare_gases: 0.028 | trade_income: 140 |
| economic | T1 | Commodity Exchange Spire | 200 | 220 | 2 | 2 | psycho_implants: 0.018, genomes: 0.015 | trade_income: 110, market_efficiency: 0.04 |
| economic | T2 | Convergence Exchange Ring | 520 | 480 | 2 | 7 | rare_gases: 0.056, quantum_circuits: 0.019 | trade_income: 360, market_efficiency: 0.08 |
| economic | T2 | Nano-Logistics Corridor | 490 | 440 | 3 | 7 | nano_machines: 0.038, rare_gases: 0.032 | market_efficiency: 0.1, supply_efficiency: 0.06, trade_income: 200 |
| economic | T3 | Treasury Singularity | 1300 | 980 | 6 | 10 | sentient_cores: 0.1, quantum_circuits: 0.04, psycho_implants: 0.06 | trade_income: 900, market_efficiency: 0.12, industrial_output: 0.05 |
| spiritual | T1 | Relic Cathedral | 140 | 160 | 2 | 2 | ancient_relics: 0.046 | army_fervor: 4 |
| spiritual | T1 | Psycho-Implant Sanctum | 170 | 190 | 2 | 2 | psycho_implants: 0.028, ancient_relics: 0.015 | army_fervor: 3, empire_approval: 3 |
| spiritual | T2 | Monument of Endless Ages | 520 | 460 | 4 | 7 | ancient_relics: 0.075 | army_fervor: 8, cohesionModifier: 1.03 |
| spiritual | T3 | Eternity Reliquary | 1050 | 850 | 6 | 10 | ancient_relics: 0.19, psycho_implants: 0.05, sentient_cores: 0.03 | army_fervor: 15, cohesionModifier: 1.06, empire_approval: 3 |
| governance | T1 | Civic Command Arcology | 130 | 150 | 2 | 4 | rare_gases: 0.019, super_alloys: 0.016 | law_progress_speed: 0.14, improvement_queue_capacity: 3, trade_income: 60 |
| governance | T1 | Signal Intelligence Bureau | 150 | 170 | 2 | 3 | sentient_cores: 0.008, rare_gases: 0.018 | research_speed: 0.06, market_efficiency: 0.03, law_progress_speed: 0.08 |
| governance | T2 | Council Constellarium | 520 | 520 | 4 | 7 | sentient_cores: 0.042, quantum_circuits: 0.033 | law_progress_speed: 0.24, tick_delay_multiplier: 0.6, improvement_queue_capacity: 2, trade_income: 180 |
| governance | T2 | Cognition Vault | 460 | 420 | 4 | 6 | sentient_cores: 0.058 | law_progress_speed: 0.18, market_efficiency: 0.06, research_speed: 0.08, trade_income: 120 |
| governance | T3 | Omniscient Synod | 1200 | 960 | 6 | 10 | sentient_cores: 0.1, quantum_circuits: 0.04 | law_progress_speed: 0.38, tick_delay_multiplier: 0.7, cohesionModifier: 1.05, improvement_queue_capacity: 4, trade_income: 420 |
| resource | T1 | Fuel Mantle Extractor | 110 | 120 | 1 | 2 | plasma_fuel: 0.185 | industrial_output: 0.01 |
| resource | T1 | Biofuel Refinery | 165 | 150 | 2 | 3 | biomass: 0.07, plasma_fuel: 0.05 | industrial_output: 0.02 |
| resource | T1 | Alloy Spine Foundry | 180 | 150 | 2 | 2 | super_alloys: 0.064 | industrial_output: 0.01 |
| resource | T1 | Genome Crucible | 150 | 150 | 2 | 2 | genomes: 0.021 | research_speed: 0.18 |
| resource | T1 | Mycelial Biosphere | 130 | 130 | 1 | 2 | biomass: 0.08, genomes: 0.023 | population_growth: 0.02 |
| resource | T1 | Nebula Harvest Lattice | 130 | 130 | 1 | 2 | rare_gases: 0.185, plasma_fuel: 0.035 | research_speed: 0.04 |
| resource | T2 | Exotic Matter Lattice | 520 | 520 | 2 | 7 | wormhole_reactors: 0.115, dark_matter: 0.007, nano_machines: 0.07 | industrial_output: 0.05 |
| resource | T2 | Anti-Grav Assembly Platform | 580 | 540 | 3 | 8 | anti_grav_modules: 0.006, nano_machines: 0.035 | industrial_output: 0.04 |
| resource | T3 | Singularity Harvest Well | 1400 | 1100 | 6 | 11 | dark_matter: 0.014, anti_grav_modules: 0.009, wormhole_reactors: 0.06 | industrial_output: 0.08, supply_efficiency: 0.06 |

## Content Sources
- Improvement definitions: `src/game/improvements/definitions.js`
- Improvement engine: `src/game/improvements/engine`
- Economy flow: `docs/systems/economy.md`
- Commodity definitions: `modules/resources.yaml`
