# Coalition: The Blessed Game

A Victoria-like grand-strategy CLI game built with Node.js, blessed, and blessed-contrib.

## Quick Start

1. Install dependencies:
```bash
yarn install
```

2. Run the game:
```bash
yarn start
```

## Controls

### Command Input Box (New!)

The game now features a command input box at the bottom of the screen for text-based commands:

- **/ or :** - Focus the command input box
- **TAB** - Switch between input box and keyboard mode
- **ESC** - Unfocus/cancel input
- **↑/↓** - Navigate command history

**Available Commands:**
- `help` - Show all available commands
- `law <number>` or `enact <number>` - Enact a law (e.g., `law 1`)
- `event <number>` or `choice <number>` - Choose event option (e.g., `event 1`)
- `pause` - Pause the game
- `resume` or `unpause` - Resume the game
- `speed <value>` - Set game speed (0.5-3.0, e.g., `speed 2`)
- `next` or `advance` - Advance one turn (when paused)
- `logs` or `log` - Toggle full logs window
- `quit` or `exit` - Exit the game

### Keyboard Shortcuts (Still Available!)

All traditional keyboard shortcuts continue to work alongside the command input:

- **SPACE** - Pause/Unpause game (real-time mode)
- **N** - Advance single turn (when paused, for testing)
- **[ / ]** - Decrease/Increase game speed or cycle info panel views
- **TAB** - Switch to input box or cycle focus
- **Q** - Quit game
- **Enter** - Enact selected law / Accept selected request
- **1/2/3** - Choose event option (when event is active)
- **L** - Toggle full logs window
- **M/A/E/R/I** - Switch info panel views (Market/Armies/Empires/Requests/Improvements)
- **Up/Down** - Navigate lists (laws, requests, improvements)
- **X** - Cancel selected improvement (no refund)

## Game Overview

You manage a coalition of empires fighting against the Scourge in **real-time**. The game advances automatically, but you can pause at any time to make decisions. Manage supplies, build improvements, enact laws, handle events, and win battles to maintain Coalition Cohesion while reducing Scourge Cohesion to zero.

### Real-Time Gameplay

- The game runs in **real-time mode** - turns advance automatically every 2 seconds (at normal speed)
- Press **SPACE** to pause/unpause the game at any time
- Use **[ ]** to slow down or speed up the game (0.5x to 3x speed)
- Events automatically pause the game, allowing you to make choices without time pressure
- Game status (PAUSED/RUNNING) and speed are shown in the Stats panel

### Core Mechanics

- **Coalition Cohesion** (0-100): Game over if it reaches 0. Three tiers: Stable (67-100), Strained (34-66), Desperate (1-33)
- **Scourge Cohesion** (0-100): Victory condition - reduce to 0
- **Scourge Fervor**: Increases each turn, making Scourge battles harder
- **Supplies**: Manage supply stockpiles to keep armies operational. Shortages reduce Organization and increase Aggravation
- **Improvements**: Build and maintain infrastructure that produces resources and provides stat bonuses
- **Laws**: Enact policies to modify empire approval, army effectiveness, and resource generation
- **Events**: Random events with choices that affect various game metrics
- **Battles**: External (vs Scourge) and internal (vs Insurrections)

### Improvements System (NEW!)

The Improvements system lets you build infrastructure that provides ongoing benefits:

- **Requests Panel (R key)**: Browse available improvements to build
  - Each improvement costs Supplies (paid upfront, no refunds)
  - Has a build duration (turns to complete)
  - Requires ongoing sustainment (resources per tick)
  - Produces outputs (resources or credits)
  - Provides stat modifiers (bonuses to empires/armies)

- **Improvements Panel (I key)**: Monitor your active improvements
  - **BUILDING**: Under construction (shows progress %)
  - **ACTIVE**: Operating normally, producing outputs
  - **DEGRADED**: Sustainment failed, no production until restored

- **Concurrency Limits**:
  - Max 3 improvements building at once
  - Max total Capacity: 10
  - Max total Potency: 20

- **Epic Mega-Structures & Grand Events**:
  - **Titan Forge Network**: Galaxy-spanning forges producing Super Alloys
  - **Ascension Spire**: Monument to knowledge producing Rare Gases & Quantum Circuits, boosting research
  - **Grand War Symposium**: Galactic military coordination improving army organization
  - **Festival of Worlds**: Star-system-wide celebration boosting population growth and approval
  - **Convergence Nexus**: Hyperspatial marketplace generating credits per tick

See `docs/systems/improvements.md` for detailed mechanics.

### Win/Lose Conditions

- **Victory**: Reduce Scourge Cohesion to 0
- **Defeat**: Coalition Cohesion reaches 0

## Project Structure

```
src/
  game/          # Core simulation logic (pure functions)
    constants.js # Tunable game constants
    types.js     # Game state types and initializers
    cohesion.js  # Cohesion tier calculations
    battles.js   # Battle resolution
    economy.js   # Supply management
    insurrection.js # Insurrection spawning
    laws.js      # Law enactment
    events.js    # Event handling
    turn.js      # Turn advancement
    content.js   # Sample game content
    improvements.js # Improvements system (NEW!)
    marketEconomy.js # Market-based economy
  ui/            # Terminal UI (blessed)
    renderer.js  # UI rendering functions
    input.js     # Input handling
  docs/systems/  # System documentation
    economy.md   # Economy system
    events.md    # Event system
    battles.md   # Battle system
    laws.md      # Law system
    improvements.md # Improvements system (NEW!)
  docs/elements/ # Game element documentation
```


## Development

The codebase follows a clean separation between simulation (pure functions in `src/game/`) and UI (blessed components in `src/ui/`). All game logic is deterministic and testable.

System documentation lives in `docs/systems` for Economy, Events, Battles, Laws, Improvements, and law enactment/value alignment. Update those docs whenever the corresponding implementation changes so they stay aligned with the game behavior.



## Testing

The project includes several test suites to ensure gameplay mechanics work correctly:

```bash
# Run all tests
npm test

# Run individual test suites
npm run test:determinism    # Test law enactment determinism
npm run test:battles        # Test front battle mechanics
npm run test:gameplay       # Test extended gameplay scenarios
```

### Test Suites

1. **testDeterminism.js** - Verifies that the law enactment system produces identical results with the same seed
2. **testFrontBattles.js** - Tests the MP-axis battle system including morale, recovery pools, and battlefield mechanics
3. **testExtendedGameplay.js** - Integration tests for extended gameplay periods, including:
   - Victory and defeat scenarios
   - Law enactment over multiple turns
   - Battle outcomes over time
   - Resource management and economy stability
   - Rapid turn advancement (skip testing)
   - Multiple concurrent game systems

The extended gameplay tests use modified turn intervals and turn skips to efficiently simulate long-running game sessions while maintaining deterministic behavior through seeded RNG.
