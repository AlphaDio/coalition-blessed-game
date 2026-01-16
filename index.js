import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { applyWarFundAllocation } from './src/game/economy.js';

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

// Setup input handlers
setupInputHandlers(ui, state);

// Initial render
renderAll(ui, state);

// Welcome message
ui.logBox.log('Welcome to Coalition: The Blessed Game!');
ui.logBox.log('Press SPACE to advance turn, TAB to cycle focus, Q to quit');
ui.logBox.log('Use +/- to adjust war fund allocation, C to confirm');
ui.logBox.log('Press 1/2/3 to choose event options');

ui.screen.render();
