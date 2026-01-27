#!/usr/bin/env node

// Test script to verify the command parser functionality

import { parseCommand } from './src/ui/commandParser.js';
import { createGameState } from './src/game/types.js';
import { getSampleLawDefinitions } from './src/game/lawDefinitions.js';

console.log('=== Command Parser Test ===\n');

// Create mock state and UI
const state = createGameState();
state.lawDefinitions = getSampleLawDefinitions();
state.paused = false;
state.gameSpeed = 1.0;

const mockUI = {
  logsWindow: { hidden: false }
};

const mockCallbacks = {
  startGameLoop: () => console.log('  [Callback] startGameLoop called'),
  updateGameSpeed: () => console.log('  [Callback] updateGameSpeed called')
};

// Test cases
const tests = [
  { command: 'help', desc: 'Show help' },
  { command: 'h', desc: 'Show help (short)' },
  { command: '?', desc: 'Show help (?)' },
  { command: 'law 1', desc: 'Enact law 1' },
  { command: 'enact 2', desc: 'Enact law 2' },
  { command: 'law', desc: 'Law without number (should fail)' },
  { command: 'law xyz', desc: 'Law with invalid number (should fail)' },
  { command: 'law 999', desc: 'Law out of range (should fail)' },
  { command: 'pause', desc: 'Pause game' },
  { command: 'resume', desc: 'Resume game' },
  { command: 'unpause', desc: 'Resume game (unpause)' },
  { command: 'speed 2.0', desc: 'Set speed to 2.0' },
  { command: 'speed 0.5', desc: 'Set speed to 0.5' },
  { command: 'speed', desc: 'Show current speed' },
  { command: 'speed 5.0', desc: 'Invalid speed (should fail)' },
  { command: 'speed abc', desc: 'Invalid speed value (should fail)' },
  { command: 'next', desc: 'Advance turn (should fail - not paused)' },
  { command: 'logs', desc: 'Toggle logs' },
  { command: 'unknown', desc: 'Unknown command (should fail)' },
  { command: '', desc: 'Empty command (should fail)' },
];

let passed = 0;
let failed = 0;

tests.forEach((test, idx) => {
  console.log(`Test ${idx + 1}: ${test.desc}`);
  console.log(`  Command: "${test.command}"`);
  
  try {
    const result = parseCommand(test.command, state, mockUI, mockCallbacks);
    
    console.log(`  Success: ${result.success}`);
    if (result.message) {
      // Truncate long messages (like help)
      const msg = result.message.length > 100 
        ? result.message.substring(0, 100) + '...' 
        : result.message;
      console.log(`  Message: ${msg}`);
    }
    if (result.action) {
      console.log(`  Action: ${result.action}`);
    }
    
    console.log('  ✓ Test passed');
    passed++;
  } catch (error) {
    console.log(`  ✗ Test failed: ${error.message}`);
    failed++;
  }
  
  console.log();
});

// Test event commands (need active event)
console.log('Setting up active event...');
state.activeEvent = {
  id: 'test_event',
  title: 'Test Event',
  choices: [
    { text: 'Choice 1' },
    { text: 'Choice 2' },
    { text: 'Choice 3' }
  ]
};

const eventTests = [
  { command: 'event 1', desc: 'Choose event option 1' },
  { command: 'choice 2', desc: 'Choose event option 2' },
  { command: 'event', desc: 'Event without number (should fail)' },
  { command: 'event 5', desc: 'Event choice out of range (should fail)' },
];

eventTests.forEach((test, idx) => {
  console.log(`Event Test ${idx + 1}: ${test.desc}`);
  console.log(`  Command: "${test.command}"`);
  
  try {
    const result = parseCommand(test.command, state, mockUI, mockCallbacks);
    
    console.log(`  Success: ${result.success}`);
    if (result.message) {
      console.log(`  Message: ${result.message}`);
    }
    if (result.action) {
      console.log(`  Action: ${result.action}`);
    }
    
    console.log('  ✓ Test passed');
    passed++;
  } catch (error) {
    console.log(`  ✗ Test failed: ${error.message}`);
    failed++;
  }
  
  console.log();
});

// Test next command when paused
state.paused = true;
state.activeEvent = null;

console.log('Test: Advance turn when paused (should succeed)');
console.log('  Command: "next"');
try {
  const result = parseCommand('next', state, mockUI, mockCallbacks);
  console.log(`  Success: ${result.success}`);
  if (result.action) {
    console.log(`  Action: ${result.action}`);
  }
  console.log('  ✓ Test passed');
  passed++;
} catch (error) {
  console.log(`  ✗ Test failed: ${error.message}`);
  failed++;
}
console.log();

// Summary
console.log('=== Test Summary ===');
console.log(`Total tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
}
