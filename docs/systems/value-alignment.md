# Value Alignment System

## Overview

The value alignment system provides a sophisticated method for calculating empire reactions to laws based on their ideological values, rather than using hard-coded approval changes. This creates a more dynamic and emergent gameplay experience.

## Core Concepts

### 1. Value Axes

Six continuous scales from -1 to +1:

- **authoritarian_liberal**: -1 = Authoritarian, +1 = Liberal
- **spiritual_materialistic**: -1 = Spiritual, +1 = Materialistic
- **natural_mechanical**: -1 = Natural, +1 = Mechanical
- **pacifist_militaristic**: -1 = Pacifist, +1 = Militaristic
- **stoicist_hedonistic**: -1 = Stoicist, +1 = Hedonistic
- **essentialist_constructivist**: -1 = Essentialist, +1 = Constructivist

### 2. Empire Properties

Each empire has:

```yaml
values:                          # Position on each axis [-1..+1]
  authoritarian_liberal: 0.3
  spiritual_materialistic: 0.7
  # ... other axes

stats:
  population: 1200              # Empire size/manpower
  influence: 65                 # Galactic leverage

tags: ["Industrial", "Federation"]  # Identity traits

modifiers:
  intensity: 1.0               # Reaction intensity multiplier
  axis_gates:                  # Dampen specific axes
    authoritarian_liberal: 0.6
```

### 3. Law Properties

Each law has:

```yaml
vector:                         # Law's position on axes [-1..+1]
  natural_mechanical: 0.8
  spiritual_materialistic: 0.5

weights:                        # Importance of each axis [0..1]
  natural_mechanical: 1.0
  spiritual_materialistic: 0.7

tag_effects:                    # Special effects for tagged empires
  - if_empire_has_tag: "Industrial"
    add_alignment: 0.20         # Add to alignment score
    multiply_intensity: 1.15    # Multiply intensity
```

## Reaction Calculation

### Step 1: Base Alignment

For each axis present in the law's vector:

```
alignment_contribution = empire.values[axis] * law.vector[axis] * law.weights[axis] * empire.axis_gates[axis]
```

Sum all contributions and normalize:

```
alignment = sum(contributions) / sum(weights)
```

Result is in range [-1..+1] where:
- +1 = strongly aligned
- 0 = neutral
- -1 = strongly opposed

### Step 2: Tag Effects

Apply tag modifiers:
- Add alignment offsets
- Multiply intensity
- Apply additional axis gates

### Step 3: Calculate Score

```
score = alignment * intensity
```

### Step 4: Determine Reaction

Based on score thresholds:
- score >= 0.60 → **Laud** (strong approval)
- 0.20 <= score < 0.60 → **Approve**
- -0.20 < score < 0.20 → **Neutral**
- -0.60 < score <= -0.20 → **Disapprove**
- score <= -0.60 → **Denounce** (strong disapproval)

### Step 5: Approval Change

Convert reaction to approval change:
- Laud: +15 (base)
- Approve: +8 (base)
- Neutral: 0
- Disapprove: -8 (base)
- Denounce: -15 (base)

Scaled by empire pressure:
```
pressure = influence * (population ^ 0.5)
approval_change = base_change * log_scale(pressure)
```

## Example

### Chorus Synapse (Hive-Mind) vs AI Citizenship Law

**Empire values:**
- natural_mechanical: -0.6 (prefers biological)
- essentialist_constructivist: -0.8 (essentialist)
- Tags: Hive-Mind, Biologic
- Intensity: 1.15

**Law vector:**
- natural_mechanical: 0.9 (strongly mechanical)
- essentialist_constructivist: 0.6 (constructivist)

**Tag effect for "Biologic":**
- add_alignment: -0.25
- multiply_intensity: 1.10

**Calculation:**
1. Base alignment: (-0.6 * 0.9) + (-0.8 * 0.6) ≈ -0.72
2. Apply tag: -0.72 - 0.25 = -0.97 (clamped to -1.0)
3. Intensity: 1.15 * 1.10 = 1.26
4. Score: -1.0 * 1.26 = -1.26
5. Reaction: **DENOUNCE** (score <= -0.60)
6. Approval: -15 (strong disapproval)

This makes sense: a biological hive-mind strongly opposes granting rights to artificial beings!

## Implementation Files

- **src/game/constants.js**: Axis definitions and reaction thresholds
- **src/game/types.js**: Empire and law type definitions
- **src/game/reactions.js**: Alignment calculation logic
- **src/game/laws.js**: Law enactment with reaction system
- **src/game/content.js**: Content loading from YAML modules
- **modules/empires/*.ds.yml**: Empire definitions
- **modules/laws/*.ds.yml**: Law definitions

## Usage in Game

When a law is enacted:

1. System calculates reaction for each empire
2. Applies approval changes based on reactions
3. Logs reaction messages (e.g., "The Northern Federation: Laud (+10)")
4. Updates empire approval values

This creates dynamic, emergent behavior where empire reactions are consistent with their values rather than arbitrary.

## Design Benefits

1. **Emergent Behavior**: New laws automatically generate appropriate reactions based on value alignment
2. **Consistency**: Empire reactions are predictable based on their ideological position
3. **Depth**: Tag effects and modifiers add nuance without overwhelming complexity
4. **Composability**: Easy to add new empires, laws, and tags without changing code
5. **Balance**: Alignment normalization ensures all laws are equally comparable
