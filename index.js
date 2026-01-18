import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { advanceTurn } from './src/game/turn.js';
import { REALTIME_CONSTANTS } from './src/game/constants.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';
import { createPowerSystemPolicy } from './src/game/types.js';
import { initializeLogger, LogLevel } from './src/modules/logger.js';
import { initializeMarket, loadEconomyConfig } from './src/game/marketEconomy.js';
import { DeterministicRNG } from './src/modules/rng.js';
import { initializeImprovementsState, getSampleImprovementRequests } from './src/game/improvements.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize game state
const seed = Math.floor(Math.random() * 1_000_000);
const state = createGameState(seed);
console.log(`Seed: ${seed}`);
const content = createSampleContent(seed);

// Populate state with content
state.empires = content.empires;
state.armies = content.armies;
state.laws = content.laws;
state.events = content.events;

// Initialize economy system EARLY (before UI)
try {
  const config = loadEconomyConfig();
  // Load resources
  const resourcesPath = path.join(__dirname, 'docs', 'input', 'resources.yaml');
  const resourcesContent = fs.readFileSync(resourcesPath, 'utf8');
  const resourcesDoc = yaml.load(resourcesContent);
  const commodities = resourcesDoc.resources?.commodities || [];
  
  // Initialize market
  const marketRng = new DeterministicRNG(state.rngSeed);
  state.market = initializeMarket(commodities, marketRng.random.bind(marketRng));
  
  // Initialize coalition economy
  state.coalitionEconomy = {
    budget_credits: config.coalition.procurement.budget_credits_per_tick * 10, // Start with 10 ticks worth
    stockpiles: {},
    per_commodity_priority: {}
  };
  
  console.log(`Economy initialized: ${commodities.length} commodities, market ready`);
} catch (error) {
  console.warn(`Economy initialization failed: ${error.message}`);
  // Continue without economy - will fall back to old supply system
}

// Initialize improvements system
try {
  state.improvements = initializeImprovementsState();
  state.improvements.requests = getSampleImprovementRequests();
  console.log(`Improvements system initialized: ${state.improvements.requests.length} requests available`);
} catch (error) {
  console.warn(`Improvements initialization failed: ${error.message}`);
}

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
state.playerInfluence = 100; // Start with 100 influence to allow immediate law enactment
state.influenceProgress = 0;
state.lawProcesses = [];

// Initialize UI
const ui = createUI();

// Initialize logger with UI integration
// Set LOG_LEVEL environment variable to 'DEBUG' for verbose logging
// Set DISABLE_FILE_LOGGING='true' to disable file logging
// Set ENABLE_CONSOLE_LOGGING='true' to enable console output
// Note: In dev mode, console is disabled by default. UI and files always show INFO+ logs.
const logLevel = process.env.LOG_LEVEL === 'DEBUG' ? LogLevel.DEBUG : LogLevel.INFO;

const logger = initializeLogger({
  level: logLevel,
  enableConsole: process.env.ENABLE_CONSOLE_LOGGING === 'true', // Disabled by default to avoid terminal pollution
  enableFile: process.env.DISABLE_FILE_LOGGING !== 'true', // Enabled by default
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
    // Stop game loop if game is over
    if (state.gameOver) {
      clearInterval(gameLoopInterval);
      gameLoopInterval = null;
      logger.info(`Game ended: ${state.gameOverReason || 'Unknown reason'}`);
      ui.logBox.log(`{bold}GAME OVER: ${state.gameOverReason || 'Unknown reason'}{/bold}`);
      renderAll(ui, state);
      return;
    }
    
    if (shouldAdvanceTurn(state)) {
      const result = advanceTurn(state);
      result.log.forEach(line => ui.logBox.log(line));
      renderAll(ui, state);
      
      // Stop game loop if game ended this turn
      if (state.gameOver) {
        clearInterval(gameLoopInterval);
        gameLoopInterval = null;
        logger.info(`Game ended: ${state.gameOverReason || 'Unknown reason'}`);
        ui.logBox.log(`{bold}GAME OVER: ${state.gameOverReason || 'Unknown reason'}{/bold}`);
        renderAll(ui, state);
        return;
      }
      
      // Auto-pause on events
      if (state.activeEvent) {
        state.paused = true;
        ui.logBox.log('Game paused: Event requires decision');
        // Event choice keys are bound to screen level, so they'll work regardless of focus
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
logger.info('Use TAB to cycle focus between panels');
logger.info('Press 1/2/3 to choose event options');
logger.info('Press L to view detailed logs window');
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
