# Law Enactment System

## Overview

The Law Enactment system is a streamlined framework for enacting laws that provide permanent coalition-wide modifiers. Laws are organized in tiers (T1, T2, T3) within ideological branches, with tier progression requiring enacted laws from previous tiers. Once enacted, laws apply their effects permanently via coalitionModifiers.

## Architecture

### Core Principles

1. **Immediate Enactment**: Laws are enacted instantly upon selection, applying permanent effects.
2. **Tiered Progression**: T1 laws always available, T2 requires 2 enacted T1, T3 requires 2 enacted T2.
3. **Ideological Alignment**: Laws positioned on 6 ideological axes: Pacifist-Militaristic, Authoritarian-Liberal, Stoicist-Hedonistic, Natural-Mechanical, Essentialist-Constructivist, Spiritual-Materialistic.
4. **Branch Organization**: Laws grouped into 6 branches: Military, Rights, Economic, Governance, Biologic, Emergency.
5. **Permanent Effects**: All effects are permanent coalitionModifiers (no expiration or trade-offs).

### Data Models

#### LawDefinition (Tiered)
Defines a law's properties, requirements, and effects:
```javascript
{
  id: 'law_peace_accord_initiative',
  name: 'Peace Accord Initiative',
  tier: 1,
  branch: 'military',
  axis_vector: {
    pacifist_militaristic: 0.4
  },
  law_tags: ['peace', 'diplomacy'],
  support_weights: {
    population_incentive: 0.1,
    security_incentive: 0.2,
    economy_incentive: 0.1
  },
  phase_tags: {
    DEBATE: ['peace', 'diplomacy', 'cooperation'],
    FALLOUT: ['social', 'economic'],
    VOTING: ['diplomacy', 'compromise']
  },
  coalitionModifiers: {
    army_maintenance_cost_modifier: 0.9, // 10% reduction
    relations_strength_modifier: 1.075   // 7.5% boost
  }
}
```

#### Coalition Modifiers
Permanent effects applied to the coalition state:
- `industrial_output`: Multiplier for industrial production (+7.5% for Mechanical laws)
- `army_maintenance_cost_modifier`: Multiplier for army maintenance costs (0.9 = -10%)
- `relations_strength_modifier`: Multiplier for diplomatic relations (1.075 = +7.5%)
- `trade_income`: Flat income bonus per tick (+150)
- `empire_approval`: Flat approval bonus per empire (+1)
- `population_growth`: Flat population growth bonus per tick (+2.5)

#### LawProcess (Legacy - Not Used)
The new system uses immediate enactment, so LawProcess is not applicable.

#### Event Template (Law-Scoped) - Legacy
Not used in the new system.

#### PowerSystemPolicy - Legacy
Not used in the new system.

## Resolution Flow

### Law Enactment Process

1. **Check Requirements**: Verify tier is unlocked (T1 always, T2/T3 require previous tier laws).
2. **Check Cost**: Player must have 100 influence.
3. **Deduct Cost**: Remove 100 influence from player.
4. **Apply Effects**: Immediately apply coalitionModifiers to state.coalitionModifiers.
5. **Mark Enacted**: Add law ID to state.enactedLaws array.
6. **Update UI**: Refresh law availability and display active laws.

### Tier Unlock Requirements

- **T1**: Always available (6 laws per ideological axis, one per branch).
- **T2**: Requires 2 enacted T1 laws.
- **T3**: Requires 2 enacted T2 laws.

### Ideological Axes

Laws are positioned on 6 axes, each with opposing ideologies:
- **Pacifist-Militaristic**: Peace vs. War focus
- **Authoritarian-Liberal**: Control vs. Freedom
- **Stoicist-Hedonistic**: Discipline vs. Pleasure
- **Natural-Mechanical**: Organic vs. Synthetic
- **Essentialist-Constructivist**: Fixed Identity vs. Fluid Change
- **Spiritual-Materialistic**: Faith vs. Reason

Each T1 law represents one ideology with +0.4 positioning on its axis.

## Player Influence Economy

- **Generation**: +1 influence per tick (simplified from 100 ticks).
- **Starting a Law**: Costs 100 influence.
- **Concurrent Laws**: No limit - can enact multiple laws simultaneously.
- **No Active Law Limit**: Unlike old system, no restriction on concurrent law processes.

## Law Modifiers

CoalitionModifiers are applied permanently to the game state:

- **industrial_output**: Multiplies industrial production output (e.g., 1.075 = +7.5%)
- **army_maintenance_cost_modifier**: Multiplies army maintenance costs (e.g., 0.9 = -10%)
- **relations_strength_modifier**: Multiplies diplomatic relation strength (e.g., 1.075 = +7.5%)
- **trade_income**: Adds flat income per tick (e.g., +150 credits)
- **empire_approval**: Adds flat approval per empire per tick (e.g., +1 approval)
- **population_growth**: Adds flat population growth per empire per tick (e.g., +2.5)

Effects are cumulative across all enacted laws.

## Law Branches

Laws are organized into 6 branches, each containing T1-T3 laws:

- **Military**: Defense, conscription, warfare (Pacifist/Militaristic axis)
- **Rights**: Civil liberties, citizenship, personhood (Authoritarian/Liberal axis)  
- **Economic**: Trade, markets, resource management (Spiritual/Materialistic axis)
- **Governance**: Political structure, decision-making (Stoicist/Hedonistic axis)
- **Biologic**: Genetic enhancement, hive integration (Essentialist/Constructivist axis)
- **Emergency**: Crisis response, rationing (Natural/Mechanical axis)

Each branch has 1 T1 law representing one ideology, with potential for multiple T2/T3 laws adding complexity.

## Determinism

- **Immediate Effects**: Law enactment is deterministic - same law selection always produces same modifier application.
- **No RNG**: Unlike old event-driven system, no random elements in enactment.
- **Testing**: Unit tests verify modifier application correctness.

## Content Creation

### Adding a New Law Definition

Create a tiered law definition in `src/game/lawDefinitions.js`:

```javascript
createTieredLawDefinition(
  'law_example',
  'Example Law Name',
  1, // tier
  'military', // branch
  {
    pacifist_militaristic: 0.4 // ideological positioning
  },
  ['peace', 'diplomacy'], // law tags
  {
    population_incentive: 0.1,
    security_incentive: 0.2,
    economy_incentive: 0.1
  },
  {
    DEBATE: ['peace', 'diplomacy'],
    FALLOUT: ['social', 'economic'],
    VOTING: ['diplomacy', 'compromise']
  },
  {
    industrial_output: 0.075 // 7.5% production boost
  }
)
```

### Law Effect Types

- **industrial_output**: Production multiplier (0.075 = +7.5%)
- **army_maintenance_cost_modifier**: Maintenance cost multiplier (0.9 = -10%)
- **relations_strength_modifier**: Relations multiplier (1.075 = +7.5%)
- **trade_income**: Flat income bonus (+150)
- **empire_approval**: Approval per empire (+1)
- **population_growth**: Population growth bonus (+2.5)

## Usage

### CLI Testing
```bash
# Run tests
npm run test

# Individual test suites
npm run test:determinism
npm run test:gameplay
```

### In Game
1. Start the game: `npm start`
2. Accumulate influence (+1 per tick)
3. Navigate to Actions panel (TAB key)
4. Select "Propose Law" and choose from available T1 laws
5. Press Enter to enact (costs 100 influence, immediate effect)
6. Effects are permanent coalition modifiers
7. Unlock T2 laws after enacting 2 T1 laws, T3 after 2 T2 laws

### UI Features
- Law selection shows tier, cost, and effect tooltips
- Active laws display in separate panel
- Modifier effects visible in stats and tooltips

## Files

- **src/game/types.js**: Type definitions and constructors
- **src/game/laws.js**: Law enactment logic and modifier application
- **src/game/lawDefinitions.js**: Tiered law definitions with effects
- **src/game/lawProcessManager.js**: Law process management (simplified)
- **src/ui/renderer.js**: Law display and tooltips
- **src/ui/input.js**: Law selection input handling
- **testCoalitionLaws.js**: Law enactment tests

## Current Implementation Status

- ✅ **T1 Laws**: 6 laws implemented, one per ideological axis
- ✅ **Immediate Enactment**: Laws apply effects instantly
- ✅ **Tier Progression**: T1 always available, T2/T3 gated by previous tiers
- ✅ **Permanent Modifiers**: Effects persist indefinitely
- ✅ **UI Integration**: Law selection with tooltips, active law display
- ✅ **Testing**: Comprehensive test coverage for enactment logic

## Future Enhancements

- **T2/T3 Laws**: Implement complex laws with prerequisites
- **Law Conflicts**: Mutual exclusion between opposing ideologies
- **Dynamic Effects**: Modifiers that scale with game state
- **Law Repeal**: Ability to repeal previously enacted laws
- **Ideological Drift**: Empire values shift based on enacted laws
- **Coalition Politics**: Empire approval affects based on ideological alignment
