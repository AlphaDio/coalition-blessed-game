import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { applyWarFundAllocation } from './src/game/economy.js';
import { advanceTurn } from './src/game/turn.js';
import { REALTIME_CONSTANTS } from './src/game/constants.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';
import { createPowerSystemPolicy } from './src/game/types.js';
import { initializeLogger, LogLevel } from './src/modules/logger.js';

// Initialize game state
const state = createGameState();
const content = createSampleContent();

// Populate state with content
state.empires = content.empires;
state.armies = content.armies;
state.laws = content.laws;
state.events = content.events;

// Initialize law enactment system
state.lawDefinitions = getSampleLawDefinitions();
state.events = [...state.events, ...getAllLawEvents()]; // Add law events
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
state.playerInfluence = 0; // Start with 0, will accumulate over time
state.influenceProgress = 0;
state.lawProcesses = [];

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

// Initialize logger with UI integration
const logger = initializeLogger({
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.ENABLE_FILE_LOGGING === 'true',
  enableUI: true,
  uiLogBox: ui.logBox
});

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
  if (state.gameSpeed <= 0 || 
      !isFinite(state.gameSpeed) || 
      state.gameSpeed < REALTIME_CONSTANTS.MIN_SPEED ||
      state.gameSpeed > REALTIME_CONSTANTS.MAX_SPEED) {
    logger.error('Invalid game speed:', state.gameSpeed);
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
logger.info('Welcome to Coalition: The Blessed Game!');
logger.info('REAL-TIME MODE: Game advances automatically');
logger.info('Press SPACE to pause/unpause, Q to quit');
logger.info('Press [ and ] to adjust game speed');
logger.info('Use TAB to cycle focus, +/- to adjust war funds, C to confirm');
logger.info('Press 1/2/3 to choose event options');
logger.info('');
logger.info('Game starting in real-time...');

ui.screen.render();

// Start the game loop
startGameLoop();

// Graceful shutdown handler
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
  }
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
  }
  logger.close();
  process.exit(0);
});
