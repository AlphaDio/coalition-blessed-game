# Improvements and Economy

## Overview
Improvements are the coalition's long-term infrastructure projects. They consume supplies to build, require sustainment, and apply ongoing outputs or bonuses. Economy elements describe how resources, market orders, and budgets interact with those improvements.

## Improvement Catalog (Current Game)
Improvements are grouped by branch and tier. Tier access is per-empire (T2 after 2 T1 completions; T3 after 2 T2 completions).

### Industrial Branch
- Orbital Foundry Complex (T1): cost 100, build 240, capacity 2, sustain biomass 3 + ice 2, produces super_alloys 8, industrial_output +0.02
- Asteroid Mining Operation (T1): cost 80, build 200, capacity 2, sustain ice 2, produces rare_gases 5 + ice 3
- Titan Forge Network (T2): cost 200, build 400, capacity 3, sustain biomass 5 + ice 3, produces super_alloys 15, industrial_output +0.05
- Quantum Fabrication Array (T2): cost 220, build 440, capacity 3, sustain super_alloys 3 + rare_gases 2, produces quantum_circuits 4, tech_level +1
- Dyson Harvester Swarm (T3): cost 400, build 700, capacity 5, sustain quantum_circuits 2 + super_alloys 5, produces super_alloys 30 + rare_gases 15, industrial_output +0.15, energy_production +0.20

### Research Branch
- Deep Space Research Station (T1): cost 90, build 220, capacity 2, sustain biomass 2 + rare_gases 1, produces rare_gases 3, research_speed +0.03
- Universal Data Archive (T1): cost 70, build 160, capacity 1, sustain ice 2, research_speed +0.02, tech_level +0.5
- Ascension Spire (T2): cost 300, build 500, capacity 4, sustain super_alloys 3 + rare_gases 2, produces rare_gases 8 + quantum_circuits 2, research_speed +0.10, tech_level +1
- Xenobiology Research Complex (T2): cost 180, build 360, capacity 3, sustain biomass 4 + genomes 2, produces genomes 5, research_speed +0.05, population_growth +0.01
- Reality Engineering Institute (T3): cost 450, build 800, capacity 6, sustain quantum_circuits 4 + rare_gases 5 + psycho_implants 2, produces quantum_circuits 6, research_speed +0.20, tech_level +3

### Military Branch
- Orbital Defense Platform (T1): cost 100, build 200, capacity 2, sustain super_alloys 2, army_organization +2, supply_efficiency +0.02
- Elite Training Academy (T1): cost 80, build 180, capacity 2, sustain biomass 3, army_organization +3
- Grand War Symposium (T2): cost 150, build 360, capacity 3, sustain super_alloys 4 + biomass 6, army_organization +5, supply_efficiency +0.08
- Fortress World Designation (T2): cost 250, build 480, capacity 4, sustain super_alloys 6 + ice 4, army_organization +8, supply_efficiency +0.10
- Stellar Dreadnought Yards (T3): cost 500, build 900, capacity 6, sustain super_alloys 10 + quantum_circuits 3 + rare_gases 5, army_organization +15, supply_efficiency +0.15

### Cultural Branch
- Interstellar Cultural Center (T1): cost 70, build 160, capacity 1, sustain biomass 2, empire_approval +1, population_growth +0.005
- Diplomatic Enclave (T1): cost 60, build 140, capacity 1, sustain biomass 1 + ice 1, empire_approval +1
- Festival of Worlds (T2): cost 250, build 440, capacity 4, sustain biomass 5 + genomes 3 + psycho_implants 1, produces genomes 4, population_growth +0.03, empire_approval +2
- Coalition Unity Monument (T2): cost 200, build 400, capacity 3, sustain super_alloys 3 + rare_gases 2, empire_approval +3
- Galactic Senate Complex (T3): cost 400, build 760, capacity 5, sustain biomass 8 + genomes 4 + psycho_implants 3, produces genomes 6, empire_approval +5, population_growth +0.02

### Economic Branch
- Interstellar Trade Hub (T1): cost 80, build 180, capacity 2, sustain ice 2, trade_income +200, market_efficiency +0.02
- Strategic Supply Depot (T1): cost 70, build 160, capacity 1, sustain ice 1, produces ice 3, supply_efficiency +0.03
- Convergence Nexus (T2): cost 180, build 400, capacity 3, sustain ice 4 + rare_gases 2, trade_income +500, market_efficiency +0.05
- Galactic Banking Consortium (T2): cost 160, build 360, capacity 3, sustain super_alloys 2 + ice 3, trade_income +400, market_efficiency +0.04
- The Infinite Market (T3): cost 380, build 700, capacity 5, sustain quantum_circuits 3 + rare_gases 4 + psycho_implants 2, produces rare_gases 10, trade_income +1000, market_efficiency +0.15

## Improvement Behavior
- BUILDING: progresses by coalition construction each tick (default 4 build progress)
- ACTIVE: sustainment is paid and outputs/modifiers apply
- DEGRADED: sustainment failed, no production until restored
- Construction capacity limit: total BUILDING capacity cannot exceed 5

## Economy Notes
- Coalition procurement budget: 100 credits per tick (default config), with a fixed 5,000 credit starting budget
- Sustainment buy orders use priority 800 and pay up to 2x market price
- Performance penalties apply when army needs fulfillment drops below 0.80

## Content Sources
- Improvements: `src/game/improvementDefinitions.js`
- Improvements system: `src/game/improvements.js`
- Economy config: `docs/input/economy_system.yaml`
