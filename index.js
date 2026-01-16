import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { applyWarFundAllocation } from './src/game/economy.js';
import { advanceTurn } from './src/game/turn.js';
import { REALTIME_CONSTANTS } from './src/game/constants.js';

// Initialize game state
const state = createGameState();
const content = createSampleContent();

// Populate state with content
state.empires = content.empires;
state.armies = content.armies;
state.laws = content.laws;
state.events = content.events;

// Initialize war fund allocation (equal shares)
const equalShare = 100 / state.armies.length;
state.armies.forEach(army => {
  army.warFundShare = equalShare;
});

// Apply initial allocation
const initialAllocations = {};
state.armies.forEach(army => {
  initialAllocations[army.id] = army.warFundShare;
});
applyWarFundAllocation(state, initialAllocations);

// Initialize UI
const ui = createUI();

// Real-time game loop
let gameLoopInterval = null;

// Helper function to check if turn should advance
function shouldAdvanceTurn(state) {
  return !state.paused && !state.gameOver && !state.activeEvent;
}

function startGameLoop() {
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
  
  // Validate gameSpeed is within expected bounds
  if (state.gameSpeed <= 0 || !isFinite(state.gameSpeed)) {
    console.error('Invalid game speed:', state.gameSpeed);
    state.gameSpeed = 1; // Reset to default
  }
  
  // Calculate tick interval with minimum threshold to prevent performance issues
  const calculatedInterval = REALTIME_CONSTANTS.BASE_TICK_INTERVAL / state.gameSpeed;
  const tickInterval = Math.max(calculatedInterval, REALTIME_CONSTANTS.MIN_TICK_INTERVAL);
  
  gameLoopInterval = setInterval(() => {
    if (shouldAdvanceTurn(state)) {
      const result = advanceTurn(state);
      result.log.forEach(line => ui.logBox.log(line));
      renderAll(ui, state);
      
      // Auto-pause on events
      if (state.activeEvent) {
        state.paused = true;
        ui.logBox.log('Game paused: Event requires decision');
        renderAll(ui, state);
      }
    }
  }, tickInterval);
}

function updateGameSpeed() {
  startGameLoop(); // Restart loop with new speed
}

// Setup input handlers with real-time controls
setupInputHandlers(ui, state, { startGameLoop, updateGameSpeed });

// Initial render
renderAll(ui, state);

// Welcome message
ui.logBox.log('Welcome to Coalition: The Blessed Game!');
ui.logBox.log('REAL-TIME MODE: Game advances automatically');
ui.logBox.log('Press SPACE to pause/unpause, Q to quit');
ui.logBox.log('Press [ and ] to adjust game speed');
ui.logBox.log('Use TAB to cycle focus, +/- to adjust war funds, C to confirm');
ui.logBox.log('Press 1/2/3 to choose event options');
ui.logBox.log('');
ui.logBox.log('Game starting in real-time...');

ui.screen.render();

// Start the game loop
startGameLoop();
