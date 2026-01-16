# Content Modules

This directory contains the game content organized as modular YAML files. Each content type (empires, armies, laws, events) has its own subdirectory.

## Directory Structure

```
modules/
├── empires/       # Empire faction definitions
├── armies/        # Army unit definitions
├── laws/          # Law/policy definitions
├── events/        # Event definitions
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
  type: "empire|army|law|event"  # Module type
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
