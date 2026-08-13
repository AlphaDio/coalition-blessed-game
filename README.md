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
yarn new
```

- `yarn start` loads an autosave if one exists, otherwise starts a new game.
- `yarn new` starts a fresh game and ignores autosave.

## Controls

### Command Input
The game has a command input box at the bottom of the screen.

- `/` or `:` - Focus command input.
- `TAB` - Switch between input box and keyboard mode.
- `ESC` - Unfocus or cancel input.
- `Up/Down` - Navigate command history.

Available commands:

- `help` - Show available commands.
- `law <number>` or `enact <number>` - Enact a law.
- `event <number>` or `choice <number>` - Choose an event option.
- `pause` - Pause the game.
- `resume` or `unpause` - Resume the game.
- `speed <value>` - Set game speed, from 0.5 to 3.0.
- `next` or `advance` - Advance one turn while paused.
- `logs` or `log` - Toggle full logs window.
- `quit` or `exit` - Exit the game.

### Keyboard Shortcuts
- `SPACE` - Pause or unpause real-time mode.
- `N` - Advance a single turn while paused.
- `[` / `]` - Decrease/increase game speed or cycle info panel views.
- `TAB` - Switch to input box or cycle focus.
- `Q` - Quit.
- `Enter` - Enact selected law or accept selected improvement request.
- `1` / `2` / `3` - Choose an active event option.
- `L` - Toggle full logs window.
- `M` - Market view.
- `A` - Armies view.
- `E` - Empires view.
- `R` - Requests view.
- `I` - Improvements view.
- `Up/Down` - Navigate lists.
- `X` - Cancel selected improvement without refund.

## Game Overview

You manage a coalition of empires fighting the Scourge in real time. The game advances automatically, but you can pause to make decisions. Manage the economy, build improvements, enact laws, handle events, and win battles to maintain Coalition Cohesion while reducing Scourge Cohesion to zero.

### Core Mechanics
- **Coalition Cohesion**: Game over at 0. Tiers are Stable, Strained, and Desperate.
- **Scourge Cohesion**: Victory when reduced to 0.
- **Scourge Fervor**: Increases over time and makes Scourge battles harder.
- **Economy and Requisition**: Fixed-price commodity markets convert empire, army, and sustainment consumption into coalition requisition.
- **Improvements**: Build and maintain infrastructure that produces resources, direct requisition, and modifiers.
- **Laws**: Enact policies that affect approval, armies, economy pacing, and resource generation.
- **Events**: Resolve random events with choices that affect coalition state.
- **Battles**: Fight external battles against the Scourge and internal battles against insurrections.

## Economy and Requisition

The economy uses seeded fixed commodity prices and order matching.

- New games start with 1,000 requisition, 10,000 treasury credits, and 1,000 allowance credits.
- Commodity prices are seeded at game start and do not dynamically move.
- Empires, armies, and improvements create buy/sell orders that clear by priority and compatible prices.
- Scarcity appears as unfilled orders, backlog, reserves, and fulfillment penalties rather than price spikes.
- Empire, army, and improvement sustainment consumption is valued at static market prices.
- Consumption-generated requisition is pooled and pays out every 15 turns by default.
- Army advanced-resource consumption can trigger scaling effects such as MP growth, persistent damage, intel, and next-battle kill-rate prep.
- Improvements are the primary requisition sink and some can produce direct requisition.

See `docs/systems/economy.md` for detailed mechanics.

## Improvements

The improvements system lets the coalition build infrastructure proposed by empires.

- Requests view (`R`) shows available improvement suggestions.
- Improvements spend requisition up front and do not refund on cancellation.
- BUILDING improvements consume capacity while under construction.
- Starting BUILDING capacity is 4.
- Every BUILDING improvement receives full coalition construction progress each tick.
- ACTIVE improvements pay requisition upkeep, demand sustainment resources, and provide outputs/modifiers.
- DEGRADED improvements failed sustainment and stop producing until restored.

See `docs/systems/improvements.md` for mechanics and `docs/elements/improvements-economy.md` for the current catalog.

## Win and Loss

- **Victory**: Reduce Scourge Cohesion to 0.
- **Defeat**: Coalition Cohesion reaches 0.

## Project Structure

```text
src/
  game/
    constants.js
    types.js
    cohesion.js
    battles.js
    economy.js
    economyTick/
    events.js
    improvements/
    insurrection.js
    laws.js
    marketEconomy.js
    turn/
  ui/
    renderer.js
    input.js
docs/
  systems/
    economy.md
    events.md
    battles.md
    laws.md
    improvements.md
  elements/
    improvements-economy.md
    resources-commodities.md
modules/
  resources.yaml
```

## Development

The codebase separates simulation logic in `src/game/` from terminal UI logic in `src/ui/`. Game logic is deterministic and testable.

System documentation lives in `docs/systems`. Element and catalog documentation lives in `docs/elements`. Update the corresponding docs when behavior changes.

## Testing

```bash
npm test
```

The test suite covers determinism, battles, gameplay flows, economy behavior, fulfillment, laws, and improvement mechanics.
