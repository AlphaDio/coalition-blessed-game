#!/usr/bin/env node

// Demo script to showcase the new input box feature

import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { advanceTurn } from './src/game/turn.js';
import { REALTIME_CONSTANTS } from './src/game/constants.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { refreshArmyAggregates } from './src/game/armyComposition.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';
import { createPowerSystemPolicy } from './src/game/types.js';

// Initialize game state
const state = createGameState(12345);
const content = createSampleContent(12345);

// Populate state with content
state.empires = content.empires;
state.armies = content.armies;
state.units = content.units || [];
state.laws = content.laws;
state.events = content.events;
state.heroes = [];
state.diplomacy = content.diplomacy || { relations: {} };
refreshArmyAggregates(state);

// Initialize law enactment system
state.lawDefinitions = getSampleLawDefinitions();
state.events = [...state.events, ...getAllLawEvents()];
state.powerSystemPolicy = createPowerSystemPolicy(
  'equal_council',
  'Equal Council Votes',
  'equal_council',
  {
    base_votes_per_empire: 1,
    quorum_threshold: 0.5,
    pass_threshold: 0.5
  }
);
state.playerInfluence = 300; // Give player enough influence
state.influenceProgress = 0;
state.lawProcesses = [];

// Pause by default for demo
state.paused = true;

// Initialize UI
const ui = createUI();

// Welcome message
ui.logBox.log('=== DEMONSTRATION: Input Box Feature ===');
ui.logBox.log('');
ui.logBox.log('{bold}{green-fg}NEW: Command Input Box at the bottom!{/green-fg}{/bold}');
ui.logBox.log('');
ui.logBox.log('Try these commands:');
ui.logBox.log('  {cyan-fg}help{/cyan-fg}      - Show all available commands');
ui.logBox.log('  {cyan-fg}law 1{/cyan-fg}     - Enact the first law');
ui.logBox.log('  {cyan-fg}pause{/cyan-fg}     - Pause the game');
ui.logBox.log('  {cyan-fg}resume{/cyan-fg}    - Resume the game');
ui.logBox.log('  {cyan-fg}speed 2{/cyan-fg}   - Set game speed to 2x');
ui.logBox.log('');
ui.logBox.log('{yellow-fg}Press / or : to focus the input box{/yellow-fg}');
ui.logBox.log('{yellow-fg}Press TAB to switch between input and keyboard mode{/yellow-fg}');
ui.logBox.log('{yellow-fg}Press ESC to unfocus the input box{/yellow-fg}');
ui.logBox.log('');
ui.logBox.log('{bold}Keyboard shortcuts still work:{/bold}');
ui.logBox.log('  SPACE - Pause/Resume');
ui.logBox.log('  Q - Quit');
ui.logBox.log('  [ / ] - Adjust speed');
ui.logBox.log('');
ui.logBox.log('Game is currently {yellow-fg}PAUSED{/yellow-fg}. Type "resume" or press SPACE to start.');

// Initial render
renderAll(ui, state);

// Real-time game loop
let gameLoopInterval = null;

function shouldAdvanceTurn(state) {
  return !state.paused && !state.gameOver && !state.activeEvent;
}

function startGameLoop() {
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
  
  const tickInterval = Math.max(
    REALTIME_CONSTANTS.BASE_TICK_INTERVAL / (state.gameSpeed || 1),
    REALTIME_CONSTANTS.MIN_TICK_INTERVAL
  );
  
  gameLoopInterval = setInterval(() => {
    if (shouldAdvanceTurn(state)) {
      const result = advanceTurn(state);
      result.log.forEach(line => ui.logBox.log(line));
      renderAll(ui, state);
      
      if (state.activeEvent) {
        state.paused = true;
        ui.logBox.log('Game paused: Event requires decision');
        ui.logBox.log('{cyan-fg}Type "event 1", "event 2", or "event 3" to choose{/cyan-fg}');
        renderAll(ui, state);
      }
    }
  }, tickInterval);
}

function updateGameSpeed() {
  startGameLoop();
}

// Setup input handlers
setupInputHandlers(ui, state, { startGameLoop, updateGameSpeed });

// Focus input box by default
setTimeout(() => {
  ui.inputBox.focus();
  ui.screen.render();
}, 100);

// Start the game loop
startGameLoop();

ui.screen.render();

// Graceful shutdown handler
process.on('SIGINT', () => {
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
  }
  process.exit(0);
});
