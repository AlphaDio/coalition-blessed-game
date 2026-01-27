// Test script to verify the new UI with active battles and laws

import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { refreshArmyAggregates } from './src/game/armyComposition.js';
import { createUI, renderAll } from './src/ui/renderer.js';
import { startBattle } from './src/game/frontBattles.js';
import { startLawProcess } from './src/game/lawProcessManager.js';
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

// Initialize UI
const ui = createUI();

// Start a battle
console.log('Starting battle...');
const battle = startBattle(state, state.armies[0].id, state.armies[1].id, 1200);
console.log('Battle started:', battle.id);

// Start a law process
console.log('Starting law process...');
const lawResult = startLawProcess(state, 'law_ai_citizenship', 100);
console.log('Law process result:', lawResult);

// Render the UI
console.log('Rendering UI...');
renderAll(ui, state);

// Wait for user to quit
ui.screen.key(['q', 'C-c'], function() {
  process.exit(0);
});

ui.screen.render();
console.log('Press Q to quit');
