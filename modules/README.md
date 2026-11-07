# Content Modules

This directory contains the game content organized as modular YAML files. Each content type (empires, armies, laws, events) has its own subdirectory.

## Directory Structure

```
modules/
├── empires/       # Empire faction definitions
├── armies/        # Army unit definitions
├── units/         # Unit definitions
├── laws/          # Law/policy definitions
├── events/        # Event definitions
├── heroes/        # Empire-affiliated Hero agendas and Charge triggers
├── hero_abilities/ # Signature ability hooks, thresholds and contexts
├── hero_passives/ # Existing passive hooks and trigger definitions
├── abilities/     # Ability definitions (for other modules)
├── ai/            # AI behavior definitions (for other modules)
├── creatures/     # Creature definitions (for other modules)
└── maps/          # Map definitions (for other modules)
```


## Module Format

All content modules use the `.ds.yml` extension and follow a standard structure:

```yaml
module:
  id: "unique_id"           # Unique identifier
  name: "Display Name"      # Human-readable name
  description: "..."        # Brief description
  version: "1.0.0"          # Semantic version
  type: "empire|army|unit|law|event"  # Module type
  category: "..."           # Category grouping
  dependencies: []          # List of required module IDs

metadata:
  author: "Coalition Team"
  tags: ["tag1", "tag2"]
  created_at: "2026-01-16T00:00:00Z"

schema_version: "0.1"

declares:
  # Type-specific data structure (see below)
```

## Content Types

### Empires

```yaml
declares:
  empire_data:
    id: "empire_1"
    name: "The Northern Federation"
    approval: 60              # Initial approval rating
    aggravation: 120          # Aid capacity
    traits:
      industrial: true        # Empire-specific traits
```

### Armies

```yaml
declares:
  army_data:
    id: "army_1"
    empireId: "empire_1"     # Parent empire
    name: "1st Northern Division"
    organization: 70          # Organization stat
    fervor: 60               # Fervor stat
    aggravation: 60          # Supply need value
```

### Units

```yaml
declares:
  unit_data:
    id: "unit_1"
    armyId: "army_1"
    empireId: "empire_1"
    name: "1st Northern Division Core"
    stats:
      mp:
        current: 10000
        max: 10000
      mo:
        current: 100
        max: 100
      dmgPerUnitMP: 1.0
      dmgPerTickMO: 2.5
      protection: 0.2
      resolve: 0.3
      killRate: 0.1
      command: 50
      recovery: 50
      reinforcementRate: 100
    demands:
      needs:
        super_alloys: 0.02
      wants:
        rare_gases: 0.01
```

### Laws

```yaml

declares:
  law_data:
    id: "law_1"
    name: "War Tax"
    tier: 0                  # Law tier
    cost: 0                  # Enactment cost
    effects:
      empireApproval:        # Empire approval changes
        empire_1: -5
        empire_2: -5
      armyOrgConversion:     # Army stat modifiers
        multiplier: 1.1
      stockpiles:            # Resource changes
        supplies: 200
      cohesionModifier: 0.9  # Coalition cohesion modifier
```

### Events

```yaml
declares:
  event_data:
    id: "event_1"
    name: "Supply Convoy Attacked"
    description: "Event description text"
    choices:
      - text: "Choice 1 text"
        effects:
          stockpiles:
            supplies: -100
          empireApproval:
            empire_1: 5
      - text: "Choice 2 text"
        effects:
          coalitionCohesion: "random"  # Use "random" for dynamic effects
```

### Heroes

Hero content defines identity, ideological values, passives, signature ability and
six thematic Charge rules per built-in Hero. Funding is a separate apparatus rating:
`budget_share` requests actual credits each tick and never generates Charge.

```yaml
declares:
  hero_data:
    id: hero_example
    empireId: empire_1
    name: Example Reformer
    tags: [political, reform]
    values:
      authoritarian_liberal: 0.7
    budget_share: 0.0012
    ability_id: ABILITY_LEGISLATIVE_SURGE
    charge_triggers:
      - event: LAW_ENACTED
        amount: 55
        description: "Aligned law enacted: advance the reform agenda"
        empire_scope: any
        alignment: support
      - event: LAW_ENACTED
        amount: 60
        description: "Opposed law enacted: mobilize reform opposition"
        empire_scope: any
        alignment: oppose
      - event: LAW_REJECTED
        amount: 75
        description: "Aligned law rejected: rally for reform"
        empire_scope: any
        alignment: support
      - event: LAW_PROPOSED
        amount: 40
        description: "Own governance proposal: advance the reform agenda"
        empire_scope: own
        proposer_only: true
        law_tags_any: [governance]
      - event: BATTLE_LOST
        amount: 80
        description: "Empire loses battle: demand reform"
        empire_scope: participant
      - event: LAW_PROPOSED
        amount: 12
        description: "Ideological law proposed: mobilize around reform"
        empire_scope: any
        alignment: either
    passive:
      phase: VOTING
      cadence: OnStart
      passive_id: PASSIVE_VOTING_START_WHIP
```

Supported Charge event types are `LAW_PROPOSED`, `LAW_ENACTED`, `LAW_REJECTED`,
`BATTLE_STARTED`, `BATTLE_WON`, `BATTLE_LOST`, `TECH_UNLOCKED`,
`IMPROVEMENT_STARTED` and `IMPROVEMENT_COMPLETED`. Optional filters are:

- `empire_scope: own | participant | any`: require ownership, battle participation,
  or allow coalition-wide events.
- `alignment: support | oppose | either`: compare live Hero values with law
  values (cosine alignment threshold `+0.15` or `-0.15`).
- `law_tags_any: [tags]`: match a thematic law tag/category.
- `proposer_only: true`: require the Hero to be the law's proposer.

Only the strongest matching rule awards Charge for an event, after status scaling.
Duplicate delivery uses a stable, namespaced event ID recorded in the Hero's
`charge_events`; the ledger is saved and restored. Event producers must preserve
the same ID when observing the same occurrence. Recurring law ticks are not Charge
events. Tune rule amounts against meaningful event frequency. Current Heroes gain
12 Charge from an ideological proposal, with personal thematic proposal rules
awarding 35–45 instead. Enactments award 55–60, aligned rejections 75, battle starts
45, victories 65, defeats 75–90, technology unlocks 70–85, and completed improvements
65–75. Modest proposal awards sustain activity between rarer outcomes; stronger
matching rules replace that award without stacking. Ability thresholds remain
100–200 with content-defined cooldowns.

Hero ability data supplies `chargeRequired`, `cooldown`, `description`, and optional
`requires_context: law | army`. The engine requires a useful effect before spending
Charge or starting a cooldown. Existing ability hooks may continue using
`scope.popularity_scalar`, which now carries the combined Funding/Popularity ability
multiplier. New hooks can use the explicit `scope.ability_scalar`,
`scope.funding_scalar`, and `scope.popularity_only_scalar` values. Passive hook
Popularity remains unchanged. See [Heroes System](../docs/systems/heroes_system_v0_3.md)
for funding rates and save compatibility.

## Adding New Content

1. Create a new `.ds.yml` file in the appropriate subdirectory
2. Follow the module format structure
3. Ensure the `id` is unique across all modules
4. Add any dependencies to the `dependencies` array
5. Test by running the game - new content will be automatically loaded

## Module Loading

The module system automatically:
- Scans all subdirectories recursively
- Loads all `.ds.yml` files
- Validates module structure
- Makes content available to the game

No code changes are needed to add new content - just add the YAML files!
