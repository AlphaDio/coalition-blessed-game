#!/usr/bin/env node

/**
 * Demo Front Battles UI
 * Creates a test battle and shows the Active Fronts panel
 */

import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { startBattle } from './src/game/frontBattles.js';

// Initialize game state
const state = createGameState(12345);
const content = createSampleContent(12345);

// Populate state with content
state.empires = content.empires;
state.armies = content.armies;
state.turn = 1;

// Create a test battle between the first two armies
if (state.armies.length >= 2) {
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  // Make army1 stronger to eventually win
  army1.dmgPerUnitMP = 5;
  
  // Create battle
  const front = startBattle(state, army1.id, army2.id, 1000);
  
  console.log(`Created battle: ${army1.name} vs ${army2.name}`);
  console.log(`Battle ID: ${front.id}`);
  console.log(`Battlefield Size: ${front.battlefieldSize}`);
}

// Initialize UI
const ui = createUI();

// Initial render
renderAll(ui, state);

// Welcome message
ui.logBox.log('=== Front Battles Demo ===');
ui.logBox.log('A battle has been created between two armies.');
ui.logBox.log('Check the "Active Fronts" panel to see the battle status.');
ui.logBox.log('Press Q to quit.');
ui.logBox.log('');
ui.logBox.log('Left side shows MP values, morale badges:');
ui.logBox.log('  [M] = Morale intact');
ui.logBox.log('  [B] = Morale Broken');

// Handle quit
ui.screen.key(['q', 'Q', 'C-c'], () => {
  process.exit(0);
});

ui.screen.render();

// Simulate a few battle ticks to show the UI
import { simulateBattleTick } from './src/game/frontBattles.js';

let tickCount = 0;
const interval = setInterval(() => {
  const activeBattles = state.battleFronts.filter(f => f.state === 'ACTIVE');
  
  if (activeBattles.length === 0) {
    ui.logBox.log('Battle ended! Press Q to quit.');
    clearInterval(interval);
    renderAll(ui, state);
    return;
  }
  
  // Simulate tick
  activeBattles.forEach(front => {
    const log = simulateBattleTick(front, state);
    log.forEach(line => ui.logBox.log(line));
  });
  
  state.turn++;
  tickCount++;
  
  renderAll(ui, state);
  
  // Stop after 50 ticks to prevent infinite loop
  if (tickCount >= 50) {
    ui.logBox.log('Demo finished (50 ticks). Press Q to quit.');
    clearInterval(interval);
  }
}, 500); // Update every 500ms
