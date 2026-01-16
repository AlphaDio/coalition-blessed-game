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

- **SPACE** - Pause/Unpause game (real-time mode)
- **N** - Advance single turn (when paused, for testing)
- **[ / ]** - Decrease/Increase game speed
- **TAB** - Cycle focus between panels
- **Q** - Quit game
- **Enter** - Enact selected law / Open context action
- **1/2/3** - Choose event option (when event is active)
- **+/-** - Adjust war fund allocation (when war funds panel is focused)
- **C** - Confirm war fund allocation

## Game Overview

You manage a coalition of empires fighting against the Scourge in **real-time**. The game advances automatically, but you can pause at any time to make decisions. Balance war fund allocation, enact laws, handle events, and win battles to maintain Coalition Cohesion while reducing Scourge Cohesion to zero.

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
- **War Funds**: Allocate percentages across armies to boost Organization and reduce Aggravation
- **Laws**: Enact policies to modify empire approval, army effectiveness, and resource generation
- **Events**: Random events with choices that affect various game metrics
- **Battles**: External (vs Scourge) and internal (vs Insurrections)

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
    economy.js   # War funds and supply management
    insurrection.js # Insurrection spawning
    laws.js      # Law enactment
    events.js    # Event handling
    turn.js      # Turn advancement
    content.js   # Sample game content
  ui/            # Terminal UI (blessed)
    renderer.js  # UI rendering functions
    input.js     # Input handling
```

## Development

The codebase follows a clean separation between simulation (pure functions in `src/game/`) and UI (blessed components in `src/ui/`). All game logic is deterministic and testable.

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
