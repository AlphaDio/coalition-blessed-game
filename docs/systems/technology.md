# Technology System

## Overview

The Technology system provides empires with long-term progression through research. Empires accumulate tech points each tick, and when they reach a threshold, a technology event fires offering 3 choices. Each technology grants immediate effects and ongoing modifiers.

## Core Mechanics

### Tech Point Accrual

- **Base Rate**: 100 tech points per tick
- **Research Speed**: Multiplier from improvements and existing technologies
- **Formula**: `points_gained = BASE_POINTS_PER_TICK * research_speed`

Empires accrue tech points passively each tick. The `research_speed` modifier starts at 1.0 and can be increased by:
- Empire stat `tech_rate_bonus` (per-empire starting differences)
- Improvements (e.g., Deep Space Research Station: +0.03)
- Previously unlocked technologies (e.g., Quantum Communications: +0.03)

### Threshold and Events

- **Initial Threshold**: 50,000 points (~500 ticks at base rate)
- **Threshold Curve**: Polynomial `initial * (n+1)^exponent` where n = tech count
- **Default Exponent**: 1.10 (gentle exponential growth)

Threshold progression with exponent 1.10:
- Tech 1: 50,000 (500 ticks)
- Tech 2: 107,177 (1,072 ticks)
- Tech 3: 171,877 (1,719 ticks)
- Tech 4: 243,416 (2,434 ticks)
- Tech 5: 321,177 (3,212 ticks)
- Tech 10: 759,375 (7,594 ticks)

When an empire's `techPoints >= techThreshold`:
1. A tech event is generated with 3 choices
2. Game pauses to await player decision
3. Selected technology is granted
4. Tech points reset to 0
5. Threshold increases by 50%

### Technology Categories

**General** (no requirements)
- Available to all empires
- Basic bonuses like industrial output, supply efficiency

**Aligned** (axis requirements)
- Require specific value axis alignment (e.g., mechanical > 0.3)
- Stronger bonuses reflecting the empire's ideology

**Unique** (tag requirements)
- Require empire tags like `hive`, `mechanical`, `warped`, `biologic`
- Most powerful bonuses, thematically tied to empire nature

## Technology Effects

### Immediate Effects
Applied once when technology is unlocked:
- `approval`: Empire approval change
- `stability`: Empire stability change
- `credits`: Budget credits added
- `cohesion`: Coalition cohesion change

### Ongoing Modifiers
Persist while technology is active:
- `research_speed`: Tech point accrual rate
- `industrial_output`: Production multiplier
- `army_organization`: Army org bonus
- `supply_efficiency`: Supply system efficiency
- `trade_income`: Credits per tick from trade
- `market_efficiency`: Market order efficiency
- `population_growth`: Population growth rate
- `empire_approval`: Ongoing approval bonus
- `energy_production`: Energy output multiplier

## Empire State

Each empire tracks:
- `techPoints`: Current accumulated points (0 to threshold)
- `techThreshold`: Points needed for next tech event
- `technologies`: Array of unlocked technology IDs
- `techModifiers`: Aggregate modifiers from all unlocked techs

## Tech Selection

When generating a tech event, the system:
1. Filters to technologies available to the empire (not already unlocked, meets requirements)
2. Weights selection: unique (2x), aligned (1.5x), general (1x)
3. Selects 3 choices (or fewer if pool is exhausted)

If no technologies are available, points reset and threshold increases without an event.

## UI Display

The Empires view shows:
- Blue progress bar showing tech points / threshold
- Research rate as `+N` (points per tick)
- Count of unlocked technologies

## Content Sources

- Technology definitions: `src/game/technologyDefinitions.js`
- Technology logic: `src/game/technology.js`
- Constants: `src/game/constants.js` (TECH_CONSTANTS)
- Empire state: `src/game/types.js` (createEmpire)
- Turn integration: `src/game/turn.js` (processTechAccrual)
- Event handling: `src/game/events.js` (handleTechEventChoice routing)

## Example Technologies

### General
- **Advanced Metallurgy**: +5% industrial output, +2% supply efficiency, +100 credits
- **Quantum Communications**: +3% research speed, +2% market efficiency, +2 cohesion

### Aligned (Mechanical)
- **Synthetic Workforce Integration**: +8% industrial output, -0.5% population growth, +200 credits
- **Neural Interface Standard**: +6% research speed, +3 army organization, +8 approval

### Unique (Hive)
- **Collective Consciousness Amplifier**: +6 army organization, +5% research speed, +5 cohesion
