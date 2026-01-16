import { applyWarFundAllocation } from '../game/economy.js';
import { enactLaw } from '../game/laws.js';
import { handleEventChoice } from '../game/events.js';
import { advanceTurn } from '../game/turn.js';
import { renderAll, renderLaws, renderWarFunds } from './renderer.js';
import { REALTIME_CONSTANTS } from '../game/constants.js';
import { startLawProcess } from '../game/lawProcessManager.js';

export function setupInputHandlers(ui, state, { startGameLoop = null, updateGameSpeed = null } = {}) {
  // Helper to safely call optional callbacks
  const safeCall = (fn, ...args) => {
    if (typeof fn === 'function') {
      fn(...args);
    }
  };
  
  // Global keybinds
  ui.screen.key(['q', 'C-c'], () => {
    return process.exit(0);
  });
  
  // SPACE: Toggle pause/unpause (real-time mode)
  ui.screen.key(['space'], () => {
    if (state.gameOver) return;
    
    // Toggle pause
    state.paused = !state.paused;
    
    if (state.paused) {
      ui.logBox.log('Game PAUSED');
    } else {
      ui.logBox.log('Game RESUMED');
    }
    
    renderAll(ui, state);
  });
  
  // Manual turn advance when paused (for debugging/testing)
  ui.screen.key(['n'], () => {
    if (state.gameOver) return;
    if (!state.paused) return; // Only allow when paused
    if (state.activeEvent) return; // Can't advance with active event
    
    const result = advanceTurn(state);
    result.log.forEach(line => ui.logBox.log(line));
    renderAll(ui, state);
  });
  
  // Speed controls
  ui.screen.key(['['], () => {
    // Decrease speed
    const newSpeed = Math.max(
      REALTIME_CONSTANTS.MIN_SPEED,
      state.gameSpeed - REALTIME_CONSTANTS.SPEED_STEP
    );
    
    if (newSpeed !== state.gameSpeed) {
      state.gameSpeed = newSpeed;
      ui.logBox.log(`Game speed: ${state.gameSpeed}x`);
      safeCall(updateGameSpeed);
      renderAll(ui, state);
    }
  });
  
  ui.screen.key([']'], () => {
    // Increase speed
    const newSpeed = Math.min(
      REALTIME_CONSTANTS.MAX_SPEED,
      state.gameSpeed + REALTIME_CONSTANTS.SPEED_STEP
    );
    
    if (newSpeed !== state.gameSpeed) {
      state.gameSpeed = newSpeed;
      ui.logBox.log(`Game speed: ${state.gameSpeed}x`);
      safeCall(updateGameSpeed);
      renderAll(ui, state);
    }
  });
  
  ui.screen.key(['tab'], () => {
    const focuses = ['main', 'laws', 'warfunds'];
    const currentIdx = focuses.indexOf(state.focus);
    state.focus = focuses[(currentIdx + 1) % focuses.length];
    renderAll(ui, state);
  });
  
  // Helper function to handle event choice and resume game
  function handleEventChoiceAndResume(choiceIndex) {
    if (state.activeEvent) {
      const result = handleEventChoice(state, state.activeEvent.id, choiceIndex);
      if (result.success) {
        result.log.forEach(line => ui.logBox.log(line));
        // Unpause after event choice
        state.paused = false;
        ui.logBox.log('Game RESUMED');
        renderAll(ui, state);
      }
    }
  }
  
  // Event choice keys
  ui.screen.key(['1'], () => handleEventChoiceAndResume(0));
  ui.screen.key(['2'], () => handleEventChoiceAndResume(1));
  ui.screen.key(['3'], () => handleEventChoiceAndResume(2));
  
  // Laws box
  ui.lawsBox.key(['up'], () => {
    const maxIndex = state.lawDefinitions?.length > 0 
      ? state.lawDefinitions.length - 1 
      : state.laws.length - 1;
    if (state.selectedLawIndex > 0) {
      state.selectedLawIndex--;
      renderLaws(ui, state);
    }
  });
  
  ui.lawsBox.key(['down'], () => {
    const maxIndex = state.lawDefinitions?.length > 0 
      ? state.lawDefinitions.length - 1 
      : state.laws.length - 1;
    if (state.selectedLawIndex < maxIndex) {
      state.selectedLawIndex++;
      renderLaws(ui, state);
    }
  });
  
  ui.lawsBox.key(['enter'], () => {
    // Try new law system first
    if (state.lawDefinitions && state.lawDefinitions.length > 0) {
      const lawDef = state.lawDefinitions[state.selectedLawIndex];
      if (lawDef) {
        const result = startLawProcess(state, lawDef.id, 100);
        if (result.success) {
          result.log.forEach(line => ui.logBox.log(line));
          renderAll(ui, state);
        } else if (result.error) {
          ui.logBox.log(`Error: ${result.error}`);
          renderAll(ui, state);
        }
      }
    } else {
      // Fallback to old law system
      const law = state.laws[state.selectedLawIndex];
      if (law) {
        const result = enactLaw(state, law.id);
        if (result.success) {
          result.log.forEach(line => ui.logBox.log(line));
          renderAll(ui, state);
        } else if (result.error) {
          ui.logBox.log(`Error: ${result.error}`);
          renderAll(ui, state);
        }
      }
    }
  });
  
  // War Funds box
  ui.warFundsBox.key(['up'], () => {
    if (state.selectedArmyIndex > 0) {
      state.selectedArmyIndex--;
      renderWarFunds(ui, state);
    }
  });
  
  ui.warFundsBox.key(['down'], () => {
    if (state.selectedArmyIndex < state.armies.length - 1) {
      state.selectedArmyIndex++;
      renderWarFunds(ui, state);
    }
  });
  
  ui.warFundsBox.key(['enter'], () => {
    // Toggle war fund allocation mode
    // For simplicity, we'll use +/- keys to adjust
    ui.logBox.log('Use +/- to adjust allocation, Enter to confirm');
    renderAll(ui, state);
  });
  
  ui.warFundsBox.key(['+', '='], () => {
    if (state.armies[state.selectedArmyIndex]) {
      const army = state.armies[state.selectedArmyIndex];
      const currentTotal = state.armies.reduce((sum, a) => sum + a.warFundShare, 0);
      const available = 100 - (currentTotal - army.warFundShare);
      if (available > 0) {
        army.warFundShare = Math.min(100, army.warFundShare + 5);
        renderWarFunds(ui, state);
      }
    }
  });
  
  ui.warFundsBox.key(['-', '_'], () => {
    if (state.armies[state.selectedArmyIndex]) {
      const army = state.armies[state.selectedArmyIndex];
      army.warFundShare = Math.max(0, army.warFundShare - 5);
      renderWarFunds(ui, state);
    }
  });
  
  // Confirm war fund allocation
  ui.screen.key(['c'], () => {
    if (state.focus === 'warfunds') {
      const allocations = {};
      state.armies.forEach(army => {
        allocations[army.id] = army.warFundShare;
      });
      
      const result = applyWarFundAllocation(state, allocations);
      if (result.success) {
        ui.logBox.log('War funds allocated!');
        renderAll(ui, state);
      } else if (result.error) {
        ui.logBox.log(`Error: ${result.error}`);
        renderAll(ui, state);
      }
    }
  });
}
