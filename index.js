import { initializeCoalitionProcurement } from './src/game/coalitionProcurement.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { advanceTurn } from './src/game/turn.js';
import { REALTIME_CONSTANTS, COALITION_ECONOMY } from './src/game/constants.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';
import { createGameState, createPowerSystemPolicy } from './src/game/types.js';
import { initializeLogger, LogLevel } from './src/modules/logger.js';
import { initializeMarket, loadEconomyConfig } from './src/game/marketEconomy.js';
import { DeterministicRNG } from './src/modules/rng.js';
import { initializeImprovementsState, getSampleImprovementRequests, initializeImprovementSuggestions } from './src/game/improvements/index.js';
import { generateImprovementSuggestions } from './src/game/improvements/definitions.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for --new flag to force new game
const forceNewGame = process.argv.includes('--new');

const AUTOSAVE_DIR = path.join(__dirname, 'saves');
const AUTOSAVE_FILE = path.join(AUTOSAVE_DIR, 'autosave.json');

function ensureAutosaveDir() {
  if (!fs.existsSync(AUTOSAVE_DIR)) {
    fs.mkdirSync(AUTOSAVE_DIR, { recursive: true });
  }
}

function saveGameState(state) {
  try {
    ensureAutosaveDir();
    fs.writeFileSync(AUTOSAVE_FILE, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn(`Autosave failed: ${error.message}`);
    return false;
  }
}

function loadGameState() {
  if (!fs.existsSync(AUTOSAVE_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(AUTOSAVE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to load autosave: ${error.message}`);
    return null;
  }
}

function replaceState(target, source) {
  Object.keys(target).forEach(key => {
    delete target[key];
  });
  Object.assign(target, source);
}

function ensureDiplomacy(state) {
  state.diplomacy = state.diplomacy || { relations: {} };
  if (!state.empires || state.empires.length === 0) {
    return;
  }
  if (Object.keys(state.diplomacy.relations || {}).length === 0) {
    state.diplomacy.relations = {};
    state.empires.forEach(empire => {
      state.diplomacy.relations[empire.id] = {};
      state.empires.forEach(other => {
        if (empire.id === other.id) return;
        state.diplomacy.relations[empire.id][other.id] = 0;
      });
    });
  }
}

function initializeEconomyState(state) {
  try {
    loadEconomyConfig();
    const resourcesPath = path.join(__dirname, 'docs', 'input', 'resources.yaml');
    const resourcesContent = fs.readFileSync(resourcesPath, 'utf8');
    const resourcesDoc = yaml.load(resourcesContent);
    const commodities = resourcesDoc.resources?.commodities || [];
    
    const marketRng = new DeterministicRNG(state.rngSeed);
    state.market = initializeMarket(commodities, marketRng.random.bind(marketRng));
    
    state.coalitionEconomy = initializeCoalitionProcurement();
    
    console.log(`Economy initialized: ${commodities.length} commodities, market ready`);
  } catch (error) {
    console.warn(`Economy initialization failed: ${error.message}`);
  }
}

function initializeImprovementsStateForGame(state) {
  try {
    state.improvements = initializeImprovementsState();
    
    const improvementRng = new DeterministicRNG(state.rngSeed + 1000);
    state.improvements.requests = generateImprovementSuggestions(state, improvementRng.random.bind(improvementRng));
    
    console.log(`Improvements system initialized: ${state.improvements.requests.length} requests available`);
  } catch (error) {
    console.warn(`Improvements initialization failed: ${error.message}`);
  }
}

function applyLawSystemDefaults(state, { force = false } = {}) {
  if (force || !state.lawDefinitions || state.lawDefinitions.length === 0) {
    state.lawDefinitions = getSampleLawDefinitions();
  }

  if (!state.events) {
    state.events = [];
  }

  const lawEvents = getAllLawEvents();
  const hasLawEvents = state.events.some(event => event.scope === 'LAW');
  if (force || !hasLawEvents) {
    state.events = [...state.events, ...lawEvents];
  }

  if (force || !state.powerSystemPolicy) {
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
  }

  if (force || typeof state.playerInfluence !== 'number') {
    state.playerInfluence = 100;
  }
  if (force || typeof state.influenceProgress !== 'number') {
    state.influenceProgress = 0;
  }
  if (force || !Array.isArray(state.lawProcesses)) {
    state.lawProcesses = [];
  }
  if (force || !Array.isArray(state.heroes)) {
    state.heroes = [];
  }
  if (state.scourgeTargetEmpireId === undefined) {
    state.scourgeTargetEmpireId = null;
  }
}

function buildNewGameState(seed) {
  const state = createGameState(seed);
  const content = createSampleContent(seed);

  state.empires = content.empires;
  state.armies = content.armies;
  state.units = content.units || [];
  state.laws = content.laws;
  state.events = content.events;
  state.diplomacy = content.diplomacy || { relations: {} };

  ensureDiplomacy(state);
  initializeEconomyState(state);
  initializeImprovementsStateForGame(state);
  applyLawSystemDefaults(state, { force: true });

  return state;
}

function hydrateLoadedState(snapshot) {
  const seed = snapshot.rngSeed ?? Math.floor(Math.random() * 1_000_000);
  const baseState = createGameState(seed);
  const hydrated = { ...baseState, ...snapshot };

  hydrated.coalitionColor = {
    ...baseState.coalitionColor,
    ...(snapshot.coalitionColor || {})
  };

  hydrated.activeEmergencyLaws = hydrated.activeEmergencyLaws || [];
  hydrated.emergencyLawCooldowns = hydrated.emergencyLawCooldowns || {};
  hydrated.lawProcesses = hydrated.lawProcesses || [];
  hydrated.heroes = hydrated.heroes || [];
  hydrated.insurrections = hydrated.insurrections || [];
  hydrated.battleFronts = hydrated.battleFronts || [];
  hydrated.units = hydrated.units || [];
  hydrated.armies = hydrated.armies || [];
  hydrated.empires = hydrated.empires || [];

  ensureDiplomacy(hydrated);

  if (!hydrated.market || !hydrated.coalitionEconomy) {
    initializeEconomyState(hydrated);
  }

  if (!hydrated.improvements) {
    initializeImprovementsStateForGame(hydrated);
  }

  applyLawSystemDefaults(hydrated, { force: false });

  return hydrated;
}

const autosaveState = forceNewGame ? null : loadGameState();
const fallbackSeed = Math.floor(Math.random() * 1_000_000);
const initialSeed = autosaveState?.rngSeed ?? fallbackSeed;
const state = createGameState(initialSeed);
let startupMessage = '';

if (autosaveState && !forceNewGame) {
  const hydrated = hydrateLoadedState(autosaveState);
  replaceState(state, hydrated);
  startupMessage = `Autosave loaded (turn ${state.turn}).`;
  console.log(startupMessage);
} else {
  const newState = buildNewGameState(initialSeed);
  replaceState(state, newState);
  startupMessage = forceNewGame ? 'New game started (forced).' : 'New game started.';
  console.log(`${startupMessage} Seed: ${initialSeed}`);
}


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
      saveGameState(state);
      
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

function startNewGame() {
  const newSeed = Math.floor(Math.random() * 1_000_000);
  const newState = buildNewGameState(newSeed);
  replaceState(state, newState);
  logger.info('New game started.');
  ui.logBox.log('New game started.');
  renderAll(ui, state);
  saveGameState(state);
  startGameLoop();
}

// Setup input handlers with real-time controls
setupInputHandlers(ui, state, { startGameLoop, updateGameSpeed, startNewGame });


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
if (startupMessage) {
  logger.info(startupMessage);
}
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
  saveGameState(state);
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
  }
  saveGameState(state);
  logger.close();
  process.exit(0);
});

