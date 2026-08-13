# Factions and Armies

## Overview
The coalition currently fields five empires and five frontline armies. Each empire contributes unique ideology, production, and economic needs; each army represents an empire's military identity with distinct combat stats.

## Empires in Play

### Stellar Federation (empire_1)
Industrial powerhouse spanning multiple star systems with advanced manufacturing capabilities.
- **Color**: cyan
- **Approval**: 60
- **Population**: 1200, **Influence**: 65
- **Traits**: industrial
- **Tags**: Industrial, Federation
- **Tech Rate Bonus**: 20%
- **Production per tick**:
  - super_alloys: 0.05 units
  - rare_gases: 0.005 units
- **Needs per population**:
  - biomass: 0.05
  - plasma_fuel: 0.03
- **Wants per population**:
  - nano_machines: 0.0005
  - quantum_circuits: 0.0003
  - genomes: 0.001
- **Value Alignment**:
  - authoritarian_liberal: 0.3
  - spiritual_materialistic: 0.7
  - natural_mechanical: 0.8
  - pacifist_militaristic: 0.1
  - stoicist_hedonistic: -0.3
  - essentialist_constructivist: 0.4
- **Consumption Effects** (when stockpiles reach threshold):
  - biomass (100,000): +1% population
  - ancient_relics (1,000): +10 army fervor bonus
  - super_alloys (100,000): +0.1 army protection bonus
  - psycho_implants (1,000): +0.1 army resolve bonus
  - sentient_cores (1,000): +0.1 law progress bonus
  - wormhole_reactors (500): +0.05 army kill rate bonus
  - anti_grav_modules (1,000): +1 coalition construction bonus
  - plasma_fuel (1,000): +0.05 industrial output bonus
  - rare_gases (100,000): +1 empire approval bonus
  - quantum_circuits (1,000): +0.1 research speed bonus

### Verdant Colonies (empire_2)
Biosphere engineers and agricultural supply hub focused on organic development.
- **Color**: green
- **Approval**: 50
- **Population**: 900, **Influence**: 55
- **Traits**: agricultural
- **Tags**: Agricultural, Alliance, Biologic
- **Production per tick**:
  - biomass: 0.015 units
  - genomes: 0.015 units
- **Needs per population**:
  - super_alloys: 0.05
  - plasma_fuel: 0.08
- **Wants per population**:
  - psycho_implants: 0.0008
  - ancient_relics: 0.0002
- **Value Alignment**:
  - authoritarian_liberal: -0.1
  - spiritual_materialistic: -0.4
  - natural_mechanical: -0.7
  - pacifist_militaristic: -0.3
  - stoicist_hedonistic: 0.2
  - essentialist_constructivist: -0.5

### Nexus Dominion (empire_3)
Hyperspace crossroads with strategic military reach and advanced technology.
- **Color**: yellow
- **Approval**: 55
- **Population**: 800, **Influence**: 70
- **Traits**: maritime
- **Tags**: Maritime, Republic, Militaristic
- **Production per tick**:
  - plasma_fuel: 0.012 units
  - psycho_implants: 0.016 units
- **Needs per population**:
  - biomass: 0.12
  - super_alloys: 0.03
- **Wants per population**:
  - rare_gases: 0.0001
  - sentient_cores: 0.00003
- **Value Alignment**:
  - authoritarian_liberal: 0.6
  - spiritual_materialistic: 0.2
  - natural_mechanical: 0.1
  - pacifist_militaristic: 0.5
  - stoicist_hedonistic: 0.4
  - essentialist_constructivist: 0.5

### Quantum Collective (empire_clockwork)
Synthetic collective optimized for high-tech output, prediction, and lethal autonomous warfare.
- **Color**: magenta
- **Approval**: 60
- **Population**: 300, **Influence**: 80
- **Traits**: mechanical, synthetic
- **Tags**: Mechanical, Warped
- **Production per tick**:
  - quantum_circuits: 0.000025 units
  - nano_machines: 0.00005 units
- **Needs per population**:
  - rare_gases: 0.075
  - super_alloys: 0.08
- **Wants per population**:
  - sentient_cores: 0.002
  - wormhole_reactors: 0.001
- **Consumption Effects** (empire-level thresholds):
  - sentient_cores (24): +4 coalition intel
  - wormhole_reactors (8): +0.06 next-battle kill rate to Quantum armies
  - plasma_fuel (700): +0.16 industrial output bonus
  - rare_gases (240): +3 empire approval
  - quantum_circuits (100): +0.6 research speed bonus
  - super_alloys (1,200): +0.50 next-battle army protection
  - anti_grav_modules (100): +3 coalition construction
- **Value Alignment**:
  - authoritarian_liberal: 0.1
  - spiritual_materialistic: 0.9
  - natural_mechanical: 0.95
  - pacifist_militaristic: 0.2
  - stoicist_hedonistic: -0.2
  - essentialist_constructivist: 0.7

### Synaptic Swarm (empire_hive)
Hive-mind collective with massive biological throughput and unified consciousness.
- **Color**: red
- **Approval**: 55
- **Population**: 900, **Influence**: 55
- **Traits**: hive_mind, biologic
- **Tags**: Hive-Mind, Biologic
- **Production per tick**:
  - genomes: 0.02 units
  - ancient_relics: 0.002 units
- **Needs per population**:
  - biomass: 0.025
  - plasma_fuel: 0.002
- **Wants per population**:
  - psycho_implants: 0.0001
  - nano_machines: 0.0005
- **Value Alignment**:
  - authoritarian_liberal: -0.9
  - spiritual_materialistic: 0.2
  - natural_mechanical: -0.6
  - pacifist_militaristic: 0.4
  - stoicist_hedonistic: -0.7
  - essentialist_constructivist: -0.8

## Armies in Play

Army sustain stats:
- **Recovery (recoveryRate)**: Wounded-return rate; temporary casualties go to the wounded pool and are added back to the army *after* the battle.
- **Reinforcement (reinforcementRate)**: Reserves joining the line *during* the battle (default 100 if not set in module).
- **Army consumption thresholds**: Module YAML thresholds are multiplied by `ARMY_CONSUMPTION_EFFECT_THRESHOLD_MULTIPLIER` at content load. The current multiplier is 20, so `threshold: 4` in an army module is a runtime threshold of 80 consumed units.

### 1st Stellar Battle Fleet (army_1)
Elite federation fleet.
- Empire: Stellar Federation
- Organization: 76
- Fervor: 52
- Aggravation (supply need): 42
- Recovery: 62 (wounded return after battle)

### Verdant Planetary Guard (army_3)
Ground defense force for the Verdant Colonies.
- Empire: Verdant Colonies
- Organization: 60
- Fervor: 50
- Aggravation (supply need): 44
- Recovery: 68 (wounded return after battle)

### Nexus Hyperspace Marines (army_4)
Rapid-response strike marines built for high damage, fast reinforcement, and tempo-based scaling.
- Empire: Nexus Dominion
- Organization: 75
- Fervor: 65
- Aggravation (supply need): 34
- Recovery: 45 (wounded return after battle)
- Reinforcement: 68 (reserves joining during battle)
- Damage per unit MP: 3.8
- Base kill rate: 0.12
- Needs:
  - super_alloys: 0.0014
  - rare_gases: 0.0010
- Wants:
  - quantum_circuits: 0.00025
- Consumption Effects (runtime thresholds after 20x multiplier):
  - super_alloys (300): +5 MP capacity/current MP
  - rare_gases (1,600): +0.2 persistent army damage
  - quantum_circuits (1,000): +24% MP growth multiplier

### Quantum Legion (army_clockwork)
Synthetic war machines of the Quantum Collective. This is the coalition's highest base kill-rate army and is designed to become more lethal through advanced-resource consumption.
- Empire: Quantum Collective
- Organization: 80
- Fervor: 40
- Aggravation (supply need): 28
- Recovery: 40 (wounded return after battle)
- Reinforcement: 36 (reserves joining during battle)
- Manpower: 8,000
- Damage per unit MP: 1.2
- Base kill rate: 0.27
- Needs:
  - quantum_circuits: 0.0012
  - nano_machines: 0.0009
- Wants:
  - quantum_circuits: 0.0006
  - sentient_cores: 0.00025
  - wormhole_reactors: 0.00015
- Consumption Effects (runtime thresholds after 20x multiplier):
  - quantum_circuits (160): +0.16 persistent army damage
  - nano_machines (240): +6 MP capacity/current MP
  - sentient_cores (240): +4 coalition intel
  - wormhole_reactors (80): +0.04 next-battle kill rate

### Synaptic Swarm Host (army_hive)
Large bio-engineered host for the Synaptic Swarm.
- Empire: Synaptic Swarm
- Organization: 55
- Fervor: 75
- Aggravation (supply need): 50
- Recovery: 65 (wounded return after battle)
- Reinforcement: 46 (reserves joining during battle)
- Manpower: 15,000
- Damage per unit MP: 0.9
- Base kill rate: 0.15

## Content Sources
- Empires: `modules/empires/*.ds.yml`
- Armies: `modules/armies/*.ds.yml`
