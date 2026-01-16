import { applyWarFundAllocation } from '../game/economy.js';
import { enactLaw } from '../game/laws.js';
import { handleEventChoice } from '../game/events.js';
import { advanceTurn } from '../game/turn.js';
import { renderAll, renderLaws, renderWarFunds, renderLogsWindow } from './renderer.js';
import { REALTIME_CONSTANTS } from '../game/constants.js';
import { startLawProcess } from '../game/lawProcessManager.js';
import { getLogger } from '../modules/logger.js';

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
    if (!state.activeEvent) {
      return;
    }
    
    const result = handleEventChoice(state, state.activeEvent.id, choiceIndex);
    if (result.success) {
      result.log.forEach(line => ui.logBox.log(line));
      // Unpause after event choice
      state.paused = false;
      ui.logBox.log('Game RESUMED');
      renderAll(ui, state);
    } else if (result.error) {
      ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
      renderAll(ui, state);
    }
  }
  
  // Event choice keys - bind to screen and eventBox to ensure they work
  const handleEventKey = (choiceIndex) => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(choiceIndex);
      return true; // Prevent default behavior
    }
    return false;
  };
  
  // Bind to screen (global) - highest priority
  ui.screen.key(['1'], () => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(0);
      return; // Prevent event propagation
    }
  });
  ui.screen.key(['2'], () => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(1);
      return; // Prevent event propagation
    }
  });
  ui.screen.key(['3'], () => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(2);
      return; // Prevent event propagation
    }
  });
  
  // Also bind to eventBox to ensure keys work when it has focus
  ui.eventBox.key(['1'], () => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(0);
    }
  });
  ui.eventBox.key(['2'], () => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(1);
    }
  });
  ui.eventBox.key(['3'], () => {
    if (state.activeEvent) {
      handleEventChoiceAndResume(2);
    }
  });
  
  // Bind to all widgets that might capture keys to prevent input capture
  // This ensures event choice keys work regardless of which widget has focus
  const bindEventKeysToWidget = (widget) => {
    if (widget) {
      widget.key(['1'], () => {
        if (state.activeEvent) {
          handleEventChoiceAndResume(0);
          return; // Prevent default widget behavior
        }
      });
      widget.key(['2'], () => {
        if (state.activeEvent) {
          handleEventChoiceAndResume(1);
          return; // Prevent default widget behavior
        }
      });
      widget.key(['3'], () => {
        if (state.activeEvent) {
          handleEventChoiceAndResume(2);
          return; // Prevent default widget behavior
        }
      });
    }
  };
  
  // Bind to all widgets that might have focus
  bindEventKeysToWidget(ui.logBox);
  bindEventKeysToWidget(ui.lawsBox);
  bindEventKeysToWidget(ui.warFundsBox);
  bindEventKeysToWidget(ui.eventBox);
  bindEventKeysToWidget(ui.activeFrontsBox);
  bindEventKeysToWidget(ui.activeLawsBox);
  bindEventKeysToWidget(ui.statsBox);
  bindEventKeysToWidget(ui.tablesBox);
  
  // Laws box - disable number keys when event is active
  ui.lawsBox.key(['1', '2', '3'], (ch, key) => {
    if (state.activeEvent) {
      // Event choice keys are handled above, prevent list from processing them
      return;
    }
    // Allow normal list behavior when no event is active
  });
  
  ui.lawsBox.key(['up'], () => {
    const maxIndex = (state.lawDefinitions?.length > 0 
      ? state.lawDefinitions.length 
      : state.laws?.length || 0) - 1;
    if (maxIndex >= 0 && state.selectedLawIndex > 0) {
      state.selectedLawIndex--;
      renderLaws(ui, state);
    }
  });
  
  ui.lawsBox.key(['down'], () => {
    const maxIndex = (state.lawDefinitions?.length > 0 
      ? state.lawDefinitions.length 
      : state.laws?.length || 0) - 1;
    if (maxIndex >= 0 && state.selectedLawIndex < maxIndex) {
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
  
  // War Funds box - disable number keys when event is active
  ui.warFundsBox.key(['1', '2', '3'], (ch, key) => {
    if (state.activeEvent) {
      // Event choice keys are handled above, prevent list from processing them
      return;
    }
    // Allow normal list behavior when no event is active
  });
  
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
  
  // Toggle logs window (full-screen overlay)
  ui.screen.key(['l', 'L'], () => {
    if (ui.logsWindow) {
      const isCurrentlyVisible = !ui.logsWindow.hidden;
      
      if (isCurrentlyVisible) {
        // Hide logs window
        ui.logsWindow.hide();
        // Screen doesn't have focus() method, but keys work at screen level
      } else {
        // Show logs window (full screen)
        const logger = getLogger();
        renderLogsWindow(ui, logger);
        ui.logsWindow.show();
        ui.logsWindow.focus();
      }
      
      ui.screen.render();
    }
  });
  
  // Close logs window with Q when focused
  if (ui.logsWindow) {
    ui.logsWindow.key(['q', 'escape'], () => {
      ui.logsWindow.hide();
      // Screen doesn't have focus() method, but keys work at screen level
      ui.screen.render();
    });
    
    // Refresh logs window
    ui.logsWindow.key(['r', 'R'], () => {
      const logger = getLogger();
      renderLogsWindow(ui, logger);
      ui.screen.render();
    });
    
    // Allow scrolling in logs window
    ui.logsWindow.key(['up'], () => {
      ui.logsWindow.scroll(-1);
      ui.screen.render();
    });
    
    ui.logsWindow.key(['down'], () => {
      ui.logsWindow.scroll(1);
      ui.screen.render();
    });
    
    ui.logsWindow.key(['pageup'], () => {
      ui.logsWindow.scroll(-10);
      ui.screen.render();
    });
    
    ui.logsWindow.key(['pagedown'], () => {
      ui.logsWindow.scroll(10);
      ui.screen.render();
    });
    
    // Home/End keys
    ui.logsWindow.key(['home'], () => {
      ui.logsWindow.setScrollPerc(0);
      ui.screen.render();
    });
    
    ui.logsWindow.key(['end'], () => {
      ui.logsWindow.setScrollPerc(100);
      ui.screen.render();
    });
  }
}
