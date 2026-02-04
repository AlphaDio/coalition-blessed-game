# Factions and Armies

## Overview
The coalition currently fields five empires and four frontline armies. Each empire contributes unique ideology, production, and economic needs; each army represents an empire's military identity with distinct combat stats.

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
Synthetic collective optimized for high-tech output and computational efficiency.
- **Color**: magenta
- **Approval**: 60
- **Population**: 300, **Influence**: 80
- **Traits**: mechanical, synthetic
- **Tags**: Mechanical, Warped
- **Production per tick**:
  - quantum_circuits: 0.005 units
  - nano_machines: 0.003 units
- **Needs per population**:
  - rare_gases: 0.015
  - super_alloys: 0.008
- **Wants per population**:
  - sentient_cores: 0.0002
  - wormhole_reactors: 0.000001
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

### 1st Stellar Battle Fleet (army_1)
Elite federation fleet.
- Empire: Stellar Federation
- Organization: 70
- Fervor: 60
- Aggravation (supply need): 60
- Recovery: 55 (wounded return after battle)

### 2nd Stellar Defense Fleet (army_2)
Support fleet for defensive operations.
- Empire: Stellar Federation
- Organization: 65
- Fervor: 55
- Aggravation (supply need): 50
- Recovery: 52 (wounded return after battle)

### Verdant Planetary Guard (army_3)
Ground defense force for the Verdant Colonies.
- Empire: Verdant Colonies
- Organization: 60
- Fervor: 50
- Aggravation (supply need): 55
- Recovery: 48 (wounded return after battle)

### Nexus Hyperspace Marines (army_4)
Rapid-response strike marines.
- Empire: Nexus Dominion
- Organization: 75
- Fervor: 65
- Aggravation (supply need): 45
- Recovery: 58 (wounded return after battle)

## Content Sources
- Empires: `modules/empires/*.ds.yml`
- Armies: `modules/armies/*.ds.yml`
