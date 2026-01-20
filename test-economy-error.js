#!/usr/bin/env node

import { createGameState } from './src/game/types.js';
import { createSampleContent } from './src/game/content.js';
import { processEconomyTick } from './src/game/economyTick.js';
import { initializeLogger, LogLevel } from './src/modules/logger.js';

// Initialize logger
initializeLogger({
  level: LogLevel.DEBUG,
  enableConsole: true,
  enableFile: false,
  enableUI: false
});

// Create a new game state
const state = createGameState(12345);
const content = createSampleContent(12345);

state.empires = content.empires;
state.armies = content.armies;
state.units = content.units || [];
state.laws = content.laws;
state.events = content.events;
state.diplomacy = content.diplomacy || { relations: {} };

console.log('State initialized:');
console.log('- Empires:', state.empires?.length);
console.log('- Armies:', state.armies?.length);
console.log('- Coalition Modifiers:', state.coalitionModifiers);

try {
  console.log('\nRunning economy tick...');
  const result = processEconomyTick(state);
  console.log('Economy tick succeeded:', result);
} catch (error) {
  console.error('Economy tick failed:', error.message);
  console.error('Error:', error);
  console.error('Stack:', error.stack);
}
