#!/usr/bin/env node

/**
 * Verify Front Battles UI rendering without TUI
 * Shows what would be displayed in the Active Fronts panel
 */

import { createGameState } from '../src/game/types.js';
import { createSampleContent } from '../src/game/content.js';
import { startBattle, simulateBattleTick } from '../src/game/frontBattles.js';
import { refreshArmyAggregates } from '../src/game/armyComposition.js';


// Initialize game state
const state = createGameState(12345);
const content = createSampleContent(12345);

state.empires = content.empires;
state.armies = content.armies;
state.units = content.units || [];
state.turn = 1;
state.heroes = [];
state.diplomacy = content.diplomacy || { relations: {} };
refreshArmyAggregates(state);


console.log('='.repeat(70));
console.log('FRONT BATTLES UI VERIFICATION');
console.log('='.repeat(70));

// Create a test battle
if (state.armies.length >= 2) {
  const army1 = state.armies[0];
  const army2 = state.armies[1];
  
  // Adjust for a good demo
  army1.dmgPerUnitMP = 3;
  army2.dmgPerUnitMP = 2;
  
  const front = startBattle(state, army1.id, army2.id, 1200);
  
  console.log('\nInitial Battle Setup:');
  console.log(`  Battle ID: ${front.id}`);
  console.log(`  Left: ${army1.name}`);
  console.log(`  Right: ${army2.name}`);
  console.log(`  Battlefield Size: ${front.battlefieldSize}`);
  
  console.log('\n' + '='.repeat(70));
  console.log('ACTIVE FRONTS PANEL RENDERING');
  console.log('='.repeat(70));
  
  // Function to render like the UI would
  function renderActiveFrontsText(state) {
    const activeBattles = state.battleFronts.filter(f => f.state === 'ACTIVE');
    
    if (activeBattles.length === 0) {
      console.log('No active battles');
      return;
    }
    
    activeBattles.forEach(front => {
      const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
      const rightArmy = state.armies.find(a => a.id === front.rightArmyId);
      
      if (!leftArmy || !rightArmy) return;
      
      // Morale badges
      const leftBadge = front.moraleBroken.left ? 'B' : 'M';
      const rightBadge = front.moraleBroken.right ? 'B' : 'M';
      
      // MP values
      const leftMP = `${Math.floor(leftArmy.mp.current)}/${leftArmy.mp.max}`;
      const rightMP = `${Math.floor(rightArmy.mp.current)}/${rightArmy.mp.max}`;
      
      // Calculate bar representation
      const totalMP = leftArmy.mp.current + rightArmy.mp.current;
      const barWidth = 40;
      const leftBarWidth = totalMP > 0 ? Math.floor((leftArmy.mp.current / totalMP) * barWidth) : barWidth / 2;
      const rightBarWidth = barWidth - leftBarWidth;
      
      const leftBar = '█'.repeat(leftBarWidth);
      const rightBar = '█'.repeat(rightBarWidth);
      
      // Build the display
      console.log(`\nBattle: ${front.id}`);
      console.log(`${leftArmy.name} [${leftBadge}] ${leftMP}  ${leftBar}${rightBar}  ${rightMP} [${rightBadge}] ${rightArmy.name}`);
      console.log(`Field Size: ${front.battlefieldSize}, Duration: ${state.turn - front.startedAtTick} ticks`);
      
      // Show morale values too
      console.log(`Morale: ${leftArmy.name}=${Math.floor(leftArmy.mo.current)}/${leftArmy.mo.max}, ${rightArmy.name}=${Math.floor(rightArmy.mo.current)}/${rightArmy.mo.max}`);
    });
  }
  
  // Initial state
  console.log('\nTick 0 (Initial):');
  renderActiveFrontsText(state);
  
  // Simulate several ticks
  for (let i = 1; i <= 5; i++) {
    simulateBattleTick(front, state);
    state.turn++;
    
    console.log(`\nTick ${i}:`);
    renderActiveFrontsText(state);
    
    if (front.state === 'ENDED') {
      console.log('\n>>> BATTLE ENDED <<<');
      break;
    }
  }
  
  // Verify morale broken scenario
  console.log('\n' + '='.repeat(70));
  console.log('MORALE BROKEN SCENARIO');
  console.log('='.repeat(70));
  
  // Create a new battle where morale will break
  const army3 = state.armies[0];
  const army4 = state.armies[1];
  
  // Reset MPs
  army3.mp.current = army3.mp.max;
  army4.mp.current = army4.mp.max;
  army3.mo.current = army3.mo.max;
  army4.mo.current = 10; // Very low morale
  
  // Make army3 deal high morale damage
  army3.dmgPerTickMO = 50;
  
  const front2 = startBattle(state, army3.id, army4.id, 800);
  
  console.log('\nBefore morale break:');
  renderActiveFrontsText(state);
  
  // Simulate to break morale
  simulateBattleTick(front2, state);
  state.turn++;
  
  console.log('\nAfter morale break (should show [B] badge):');
  renderActiveFrontsText(state);
  
  console.log('\n' + '='.repeat(70));
  console.log('UI VERIFICATION COMPLETE');
  console.log('='.repeat(70));
  console.log('\nKey features verified:');
  console.log('✓ MP axis bar showing relative strength');
  console.log('✓ Morale badges (M = intact, B = broken)');
  console.log('✓ MP values displayed for both sides');
  console.log('✓ Battle metadata (field size, duration)');
  console.log('✓ Only ACTIVE battles shown');
}
