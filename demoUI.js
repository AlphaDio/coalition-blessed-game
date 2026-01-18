// Demo script to showcase the new UI panels with battles and laws

import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { advanceTurn } from './src/game/turn.js';
import { REALTIME_CONSTANTS } from './src/game/constants.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
import { getAllLawEvents } from './src/game/lawEventTemplates.js';
import { createPowerSystemPolicy } from './src/game/types.js';
import { startBattle, simulateBattleTick } from './src/game/frontBattles.js';
import { startLawProcess } from './src/game/lawProcessManager.js';

// Initialize game state
const state = createGameState(12345);
const content = createSampleContent(12345);

// Populate state with content
state.empires = content.empires;
state.armies = content.armies;
state.laws = content.laws;
state.events = content.events;

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

// Initialize UI
const ui = createUI();

// Start demonstration with battles and laws
ui.logBox.log('=== DEMONSTRATION: Active Battles and Laws UI ===');
ui.logBox.log('');

// Start two battles
ui.logBox.log('Starting first battle...');
const battle1 = startBattle(state, state.armies[0].id, state.armies[1].id, 1200);
ui.logBox.log(`Battle started: ${state.armies[0].name} vs ${state.armies[1].name}`);

ui.logBox.log('Starting second battle...');
const battle2 = startBattle(state, state.armies[2].id, state.armies[3].id, 1000);
ui.logBox.log(`Battle started: ${state.armies[2].name} vs ${state.armies[3].name}`);

// Start two law processes
ui.logBox.log('');
ui.logBox.log('Starting law process: AI Citizenship Rights...');
const law1Result = startLawProcess(state, 'law_ai_citizenship', 100);
if (law1Result.success) {
  ui.logBox.log('Law process started successfully');
}

ui.logBox.log('Starting law process: Universal Military Conscription...');
const law2Result = startLawProcess(state, 'law_military_draft', 100);
if (law2Result.success) {
  ui.logBox.log('Law process started successfully');
}

ui.logBox.log('');
ui.logBox.log('=== TOP PANELS NOW SHOW ACTIVE BATTLES AND LAWS ===');
ui.logBox.log('Notice the prominent panels at the top of the screen:');
ui.logBox.log('- Left: Active Battles with MP bars and morale status');
ui.logBox.log('- Right: Active Laws with progress and meter bars');
ui.logBox.log('');
ui.logBox.log('Press Q to quit, SPACE to pause/unpause');

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

// Start the game loop
startGameLoop();

ui.screen.render();
