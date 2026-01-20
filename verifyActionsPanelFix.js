#!/usr/bin/env node

/**
 * Verify Actions Panel Fix
 * Tests that the Actions panel responds to TAB and arrow keys
 */

import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { refreshArmyAggregates } from './src/game/armyComposition.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { setupInputHandlers } from './src/ui/input.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';
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
state.diplomacy = content.diplomacy || { relations: {} };
state.heroes = [];
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
state.playerInfluence = 200; // Give player enough influence to start laws
state.influenceProgress = 0;
state.lawProcesses = [];
state.gameSpeed = 1.0;
state.paused = true; // Start paused to make it easier to test

// Initialize UI
const ui = createUI();

// Setup input handlers
setupInputHandlers(ui, state, {});

// Add a helpful message to the log
ui.logBox.log('{green-fg}=== ACTIONS PANEL FIX VERIFICATION ==={/green-fg}');
ui.logBox.log('');
ui.logBox.log('This test verifies that the Actions panel responds to keyboard input.');
ui.logBox.log('');
ui.logBox.log('{cyan-fg}Instructions:{/cyan-fg}');
ui.logBox.log('1. Press {yellow-fg}TAB{/yellow-fg} to focus the Actions panel');
ui.logBox.log('2. Use {yellow-fg}UP/DOWN{/yellow-fg} arrows to navigate menu items');
ui.logBox.log('3. Press {yellow-fg}ENTER{/yellow-fg} to select an item');
ui.logBox.log('4. Press {yellow-fg}TAB{/yellow-fg} again to exit Actions panel focus');
ui.logBox.log('5. Press {yellow-fg}Q{/yellow-fg} or {yellow-fg}Ctrl+C{/yellow-fg} to quit');
ui.logBox.log('');
ui.logBox.log('{green-fg}If you can navigate the Actions panel, the fix is working!{/green-fg}');

// Render the UI
renderAll(ui, state);

// Wait for user to quit
ui.screen.key(['q', 'Q', 'C-c'], function() {
  process.exit(0);
});

ui.screen.render();
console.log('=== ACTIONS PANEL FIX VERIFICATION ===');
console.log('Press TAB to focus Actions panel, UP/DOWN to navigate, ENTER to select');
console.log('Press Q or Ctrl+C to quit');
