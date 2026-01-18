import { enactLaw } from '../game/laws.js';
import { handleEventChoice } from '../game/events.js';
import { handleLawEventChoice } from '../game/lawProcessManager.js';
import { advanceTurn } from '../game/turn.js';
import { renderAll, renderLaws, renderLogsWindow } from './renderer.js';
import { REALTIME_CONSTANTS } from '../game/constants.js';
import { startLawProcess } from '../game/lawProcessManager.js';
import { getLogger } from '../modules/logger.js';
import { parseCommand } from './commandParser.js';

export function setupInputHandlers(ui, state, { startGameLoop = null, updateGameSpeed = null } = {}) {
  // Constants for focus modes
  const FOCUS_MODES = {
    MAIN: 'main',
    LAWS: 'laws'
  };
  const FOCUS_CYCLE = [FOCUS_MODES.MAIN, FOCUS_MODES.LAWS];
  
  // Helper to safely call optional callbacks
  const safeCall = (fn, ...args) => {
    if (typeof fn === 'function') {
      fn(...args);
    }
  };
  
  // Helper to execute law enactment and log results
  const executeLawEnactment = (lawResult) => {
    if (lawResult.success) {
      lawResult.log.forEach(line => ui.logBox.log(line));
    } else if (lawResult.error) {
      ui.logBox.log(`{red-fg}Error: ${lawResult.error}{/red-fg}`);
    }
  };
  
  // Ensure screen doesn't accept text input (redundant but safe)
  ui.screen.input = false;
  
  // Set up a periodic check to ensure input stays disabled
  // This prevents any widget from accidentally enabling input mode
  const ensureNoInputMode = () => {
    ui.screen.input = false;
    const widgets = [
      ui.lawsBox, ui.eventBox, ui.logBox, ui.activeFrontsBox,
      ui.activeLawsBox, ui.statsBox, ui.combinedInfoBox
    ];
    widgets.forEach(widget => {
      if (widget && widget.input !== false) {
        widget.input = false;
      }
    });
  };
  
  // Check periodically (every 100ms) to ensure input stays disabled
  setInterval(ensureNoInputMode, 100);
  
  // Also check whenever screen renders
  const originalRender = ui.screen.render;
  ui.screen.render = function() {
    ensureNoInputMode();
    return originalRender.call(this);
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
  
  
  // Helper function to handle event choice and resume game
  function handleEventChoiceAndResume(choiceIndex) {
    if (!state.activeEvent) {
      return false;
    }
    
    let result;
    
    // Check if this is a law event
    if (state.activeEvent.isLawEvent) {
      result = handleLawEventChoice(
        state, 
        state.activeEvent.lawProcessId, 
        state.activeEvent.id, 
        choiceIndex
      );
    } else {
      result = handleEventChoice(state, state.activeEvent.id, choiceIndex);
    }
    
    if (result.success) {
      result.log.forEach(line => ui.logBox.log(line));
      // Unpause after event choice
      state.paused = false;
      ui.logBox.log('Game RESUMED');
      renderAll(ui, state);
      return true; // Indicate we handled the key
    } else if (result.error) {
      ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
      renderAll(ui, state);
      return true; // Still handled, even if error
    }
    return false;
  }
  
  // Bind to screen (global) - highest priority
  // Screen-level handlers should work regardless of widget focus
  ui.screen.key(['1'], (ch, key) => {
    if (state.activeEvent && handleEventChoiceAndResume(0)) {
      // Key was handled, prevent further processing
      return;
    }
  });
  ui.screen.key(['2'], (ch, key) => {
    if (state.activeEvent && handleEventChoiceAndResume(1)) {
      return;
    }
  });
  ui.screen.key(['3'], (ch, key) => {
    if (state.activeEvent && handleEventChoiceAndResume(2)) {
      return;
    }
  });
  
  // Bind to all widgets that might capture keys to prevent input capture
  // This ensures event choice keys work regardless of which widget has focus
  const bindEventKeysToWidget = (widget) => {
    if (!widget) return;
    
    // Override widget's key handling to check for active events first
    widget.key(['1'], (ch, key) => {
      if (state.activeEvent && handleEventChoiceAndResume(0)) {
        // Event was handled, prevent widget from processing the key
        return;
      }
      // Otherwise allow widget to process normally
    });
    widget.key(['2'], (ch, key) => {
      if (state.activeEvent && handleEventChoiceAndResume(1)) {
        return;
      }
    });
    widget.key(['3'], (ch, key) => {
      if (state.activeEvent && handleEventChoiceAndResume(2)) {
        return;
      }
    });
  };
  
  // Bind to all widgets that might have focus
  bindEventKeysToWidget(ui.logBox);
  bindEventKeysToWidget(ui.lawsBox);
  bindEventKeysToWidget(ui.eventBox);
  bindEventKeysToWidget(ui.activeFrontsBox);
  bindEventKeysToWidget(ui.activeLawsBox);
  bindEventKeysToWidget(ui.statsBox);
  bindEventKeysToWidget(ui.combinedInfoBox);
  
  // Combined Info Box: m/a/e to switch views, [/] to cycle, Page Up/Down to scroll
  // Bind at screen level so they work even when input box has focus (unless input box is actively typing)
  if (ui.combinedInfoBox) {
    // Helper to check if input box is focused and should capture keys
    const shouldIgnoreKey = () => {
      return ui.screen.focused === ui.inputBox && ui.inputBox.value && ui.inputBox.value.length > 0;
    };
    
    // m: Switch to Market view
    ui.screen.key(['m'], () => {
      if (shouldIgnoreKey()) return; // Let input box handle it if typing
      ui.combinedInfoBox.currentView = 'market';
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });
    
    // a: Switch to Armies view
    ui.screen.key(['a'], () => {
      if (shouldIgnoreKey()) return;
      ui.combinedInfoBox.currentView = 'armies';
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });
    
    // e: Switch to Empires view
    ui.screen.key(['e'], () => {
      if (shouldIgnoreKey()) return;
      ui.combinedInfoBox.currentView = 'empires';
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });
    
    // r: Switch to Requests view
    ui.screen.key(['r'], () => {
      if (shouldIgnoreKey()) return;
      ui.combinedInfoBox.currentView = 'requests';
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });
    
    // i: Switch to Improvements view
    ui.screen.key(['i'], () => {
      if (shouldIgnoreKey()) return;
      ui.combinedInfoBox.currentView = 'improvements';
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });
    
    // ]: Cycle to next view (only if not in input box)
    ui.screen.key([']'], () => {
      if (shouldIgnoreKey()) return;
      const views = ['market', 'armies', 'empires', 'requests', 'improvements'];
      const currentIndex = views.indexOf(ui.combinedInfoBox.currentView || 'market');
      const nextIndex = (currentIndex + 1) % views.length;
      ui.combinedInfoBox.currentView = views[nextIndex];
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });
    
    // [: Cycle to previous view (only if not in input box)
    // Note: [ is already used for speed decrease, so we need to check focus
    ui.screen.key(['['], (ch, key) => {
      if (shouldIgnoreKey()) return;
      // Only handle for combined info box if input box doesn't have focus
      if (ui.screen.focused !== ui.inputBox) {
        const views = ['market', 'armies', 'empires', 'requests', 'improvements'];
        const currentIndex = views.indexOf(ui.combinedInfoBox.currentView || 'market');
        const prevIndex = (currentIndex - 1 + views.length) % views.length;
        ui.combinedInfoBox.currentView = views[prevIndex];
        ui.combinedInfoBox.scrollOffset = 0;
        renderAll(ui, state);
      }
      // Otherwise let speed control handle it
    });
    
    // Page Up: Scroll up
    ui.screen.key(['pageup'], () => {
      if (shouldIgnoreKey()) return;
      const scrollAmount = Math.max(5, Math.floor((ui.combinedInfoBox.height - 2) * 0.5));
      ui.combinedInfoBox.scrollOffset = Math.max(0, (ui.combinedInfoBox.scrollOffset || 0) - scrollAmount);
      renderAll(ui, state);
    });
    
    // Page Down: Scroll down
    ui.screen.key(['pagedown'], () => {
      if (shouldIgnoreKey()) return;
      const scrollAmount = Math.max(5, Math.floor((ui.combinedInfoBox.height - 2) * 0.5));
      ui.combinedInfoBox.scrollOffset = (ui.combinedInfoBox.scrollOffset || 0) + scrollAmount;
      renderAll(ui, state);
    });
    
    // Vim-style scrolling: k for up, j for down (half screen)
    ui.screen.key(['k'], () => {
      if (shouldIgnoreKey()) return;
      const scrollAmount = Math.max(5, Math.floor((ui.combinedInfoBox.height - 2) * 0.5));
      ui.combinedInfoBox.scrollOffset = Math.max(0, (ui.combinedInfoBox.scrollOffset || 0) - scrollAmount);
      renderAll(ui, state);
    });
    
    ui.screen.key(['j'], () => {
      if (shouldIgnoreKey()) return;
      const scrollAmount = Math.max(5, Math.floor((ui.combinedInfoBox.height - 2) * 0.5));
      ui.combinedInfoBox.scrollOffset = (ui.combinedInfoBox.scrollOffset || 0) + scrollAmount;
      renderAll(ui, state);
    });
    
    // Also bind to the box itself for when it has focus
    ui.combinedInfoBox.key(['up'], () => {
      ui.combinedInfoBox.scrollOffset = Math.max(0, (ui.combinedInfoBox.scrollOffset || 0) - 1);
      renderAll(ui, state);
    });
    
    ui.combinedInfoBox.key(['down'], () => {
      ui.combinedInfoBox.scrollOffset = (ui.combinedInfoBox.scrollOffset || 0) + 1;
      renderAll(ui, state);
    });
    
    // Improvements: Up/Down to navigate requests/improvements list
    ui.screen.key(['up'], () => {
      if (shouldIgnoreKey()) return;
      if (!state._ui) state._ui = {};
      
      if (ui.combinedInfoBox.currentView === 'requests' && state.improvements) {
        const maxIndex = (state.improvements.requests?.length || 1) - 1;
        if (maxIndex >= 0) {
          state._ui.selectedRequestIndex = Math.max(0, 
            (state._ui.selectedRequestIndex || 0) - 1);
          renderAll(ui, state);
        }
      } else if (ui.combinedInfoBox.currentView === 'improvements' && state.improvements) {
        const maxIndex = (state.improvements.queue?.length || 1) - 1;
        if (maxIndex >= 0) {
          state._ui.selectedImprovementIndex = Math.max(0, 
            (state._ui.selectedImprovementIndex || 0) - 1);
          renderAll(ui, state);
        }
      }
    });
    
    ui.screen.key(['down'], () => {
      if (shouldIgnoreKey()) return;
      if (!state._ui) state._ui = {};
      
      if (ui.combinedInfoBox.currentView === 'requests' && state.improvements) {
        const maxIndex = (state.improvements.requests?.length || 1) - 1;
        if (maxIndex >= 0) {
          state._ui.selectedRequestIndex = Math.min(maxIndex, 
            (state._ui.selectedRequestIndex || 0) + 1);
          renderAll(ui, state);
        }
      } else if (ui.combinedInfoBox.currentView === 'improvements' && state.improvements) {
        const maxIndex = (state.improvements.queue?.length || 1) - 1;
        if (maxIndex >= 0) {
          state._ui.selectedImprovementIndex = Math.min(maxIndex, 
            (state._ui.selectedImprovementIndex || 0) + 1);
          renderAll(ui, state);
        }
      }
    });
    
    // Enter key: Accept selected request (when in Requests view)
    ui.screen.key(['enter'], () => {
      if (shouldIgnoreKey()) return;
      if (state.activeEvent) return; // Don't interfere with event choices
      
      if (ui.combinedInfoBox.currentView === 'requests' && state.improvements) {
        const { acceptImprovementRequest } = require('../game/improvements.js');
        if (!state._ui) state._ui = {};
        const selectedIndex = state._ui.selectedRequestIndex || 0;
        const request = state.improvements.requests[selectedIndex];
        
        if (request) {
          // Use first empire as default (or could add empire selection UI)
          const empireId = state.empires[0]?.id || 'empire1';
          const result = acceptImprovementRequest(state, request.id, empireId);
          
          if (result.success) {
            result.log.forEach(line => ui.logBox.log(line));
          } else {
            ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
          }
          
          renderAll(ui, state);
        }
      }
    });
    
    // X key: Cancel selected improvement (when in Improvements view)
    ui.screen.key(['x', 'X'], () => {
      if (shouldIgnoreKey()) return;
      
      if (ui.combinedInfoBox.currentView === 'improvements' && state.improvements) {
        const { cancelImprovement } = require('../game/improvements.js');
        if (!state._ui) state._ui = {};
        const selectedIndex = state._ui.selectedImprovementIndex || 0;
        const improvement = state.improvements.queue[selectedIndex];
        
        if (improvement) {
          const result = cancelImprovement(state, improvement.id);
          
          if (result.success) {
            result.log.forEach(line => ui.logBox.log(line));
            // Reset selection if needed
            if (selectedIndex >= state.improvements.queue.length) {
              state._ui.selectedImprovementIndex = Math.max(0, state.improvements.queue.length - 1);
            }
          } else {
            ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
          }
          
          renderAll(ui, state);
        }
      }
    });
  }
  
  // Laws box - disable number keys when event is active
  // Note: This is handled by bindEventKeysToWidget above, but we keep this
  // as an extra safeguard to prevent list navigation during events
  ui.lawsBox.key(['1', '2', '3'], (ch, key) => {
    if (state.activeEvent) {
      // Event choice keys are handled above, prevent list from processing them
      // Try to handle the event choice
      const keyNum = parseInt(ch);
      if (keyNum >= 1 && keyNum <= 3) {
        if (handleEventChoiceAndResume(keyNum - 1)) {
          return; // Event handled, don't process as list navigation
        }
      }
      return; // Event active, don't allow list navigation
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
        executeLawEnactment(startLawProcess(state, lawDef.id, 100));
        renderAll(ui, state);
      }
    } else {
      // Fallback to old law system
      const law = state.laws[state.selectedLawIndex];
      if (law) {
        executeLawEnactment(enactLaw(state, law.id));
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
  
  // Input box handlers
  if (ui.inputBox) {
    // Focus input box when user presses '/' or ':'
    ui.screen.key(['/', ':'], () => {
      ui.inputBox.focus();
      ui.inputBox.setValue('');
      ui.screen.render();
    });
    
    // Also allow TAB to focus input box
    ui.screen.key(['tab'], () => {
      // If input box is already focused, cycle to laws
      if (ui.screen.focused === ui.inputBox) {
        const currentIdx = FOCUS_CYCLE.indexOf(state.focus);
        state.focus = FOCUS_CYCLE[(currentIdx + 1) % FOCUS_CYCLE.length];
        renderAll(ui, state);
      } else {
        // Otherwise focus input box
        ui.inputBox.focus();
        ui.screen.render();
      }
    });
    
    // Handle command submission
    ui.inputBox.on('submit', (value) => {
      const command = value.trim();
      
      if (!command) {
        ui.inputBox.clearValue();
        ui.inputBox.focus();
        ui.screen.render();
        return;
      }
      
      // Add to command history
      ui.inputBox.commandHistory.push(command);
      if (ui.inputBox.commandHistory.length > 50) {
        ui.inputBox.commandHistory.shift(); // Keep only last 50 commands
      }
      ui.inputBox.historyIndex = -1;
      
      // Parse and execute command
      const result = parseCommand(command, state, ui, { startGameLoop, updateGameSpeed });
      
      // Handle the result
      if (result.success) {
        if (result.message) {
          ui.logBox.log(result.message);
        }
        
        // Execute specific actions
        if (result.action === 'ENACT_LAW') {
          // Trigger law enactment
          if (state.lawDefinitions && state.lawDefinitions.length > 0) {
            const lawDef = state.lawDefinitions[result.lawIndex];
            if (lawDef) {
              executeLawEnactment(startLawProcess(state, lawDef.id, 100));
            }
          } else {
            const law = state.laws[result.lawIndex];
            if (law) {
              executeLawEnactment(enactLaw(state, law.id));
            }
          }
        } else if (result.action === 'CHOOSE_EVENT') {
          let eventResult;
          
          // Check if this is a law event
          if (state.activeEvent.isLawEvent) {
            eventResult = handleLawEventChoice(
              state, 
              state.activeEvent.lawProcessId, 
              state.activeEvent.id, 
              result.choiceIndex
            );
          } else {
            eventResult = handleEventChoice(state, state.activeEvent.id, result.choiceIndex);
          }
          
          if (eventResult.success) {
            eventResult.log.forEach(line => ui.logBox.log(line));
            state.paused = false;
            ui.logBox.log('Game RESUMED');
          } else if (eventResult.error) {
            ui.logBox.log(`{red-fg}Error: ${eventResult.error}{/red-fg}`);
          }
        } else if (result.action === 'UPDATE_SPEED') {
          safeCall(updateGameSpeed);
        } else if (result.action === 'ADVANCE_TURN') {
          const turnResult = advanceTurn(state);
          turnResult.log.forEach(line => ui.logBox.log(line));
        } else if (result.action === 'TOGGLE_LOGS') {
          const isCurrentlyVisible = !ui.logsWindow.hidden;
          if (isCurrentlyVisible) {
            ui.logsWindow.hide();
          } else {
            const logger = getLogger();
            renderLogsWindow(ui, logger);
            ui.logsWindow.show();
            ui.logsWindow.focus();
          }
        } else if (result.action === 'QUIT_GAME') {
          // Graceful shutdown
          process.exit(0);
        }
        
        ui.commandHistoryBox.setContent(`{green-fg}✓{/green-fg} Last: ${command.substring(0, 20)}${command.length > 20 ? '...' : ''}`);
      } else {
        ui.logBox.log(`{red-fg}${result.message}{/red-fg}`);
        ui.commandHistoryBox.setContent(`{red-fg}✗{/red-fg} Error`);
      }
      
      // Clear input and refocus
      ui.inputBox.clearValue();
      ui.inputBox.focus();
      renderAll(ui, state);
    });
    
    // Handle ESC to unfocus input box
    ui.inputBox.key(['escape'], () => {
      ui.inputBox.clearValue();
      ui.inputBox.cancel();
      ui.screen.render();
    });
    
    // Prevent input box from capturing m/a/e/j/k when empty - let them go to combined info box
    ui.inputBox.key(['m', 'a', 'e', 'j', 'k'], (ch, key) => {
      // If input box is empty, don't process these keys - let screen handlers handle them
      if (!ui.inputBox.value || ui.inputBox.value.length === 0) {
        // Trigger the screen-level handlers by calling them directly
        if (ch === 'm' && ui.combinedInfoBox) {
          ui.combinedInfoBox.currentView = 'market';
          ui.combinedInfoBox.scrollOffset = 0;
          renderAll(ui, state);
        } else if (ch === 'a' && ui.combinedInfoBox) {
          ui.combinedInfoBox.currentView = 'armies';
          ui.combinedInfoBox.scrollOffset = 0;
          renderAll(ui, state);
        } else if (ch === 'e' && ui.combinedInfoBox) {
          ui.combinedInfoBox.currentView = 'empires';
          ui.combinedInfoBox.scrollOffset = 0;
          renderAll(ui, state);
        } else if (ch === 'j' && ui.combinedInfoBox) {
          const scrollAmount = Math.max(5, Math.floor((ui.combinedInfoBox.height - 2) * 0.5));
          ui.combinedInfoBox.scrollOffset = (ui.combinedInfoBox.scrollOffset || 0) + scrollAmount;
          renderAll(ui, state);
        } else if (ch === 'k' && ui.combinedInfoBox) {
          const scrollAmount = Math.max(5, Math.floor((ui.combinedInfoBox.height - 2) * 0.5));
          ui.combinedInfoBox.scrollOffset = Math.max(0, (ui.combinedInfoBox.scrollOffset || 0) - scrollAmount);
          renderAll(ui, state);
        }
        return; // Don't let input box process these keys
      }
      // If input box has content, allow normal input processing
    });
    
    // Command history navigation
    ui.inputBox.key(['up'], () => {
      if (ui.inputBox.commandHistory.length === 0) return;
      
      if (ui.inputBox.historyIndex === -1) {
        ui.inputBox.historyIndex = ui.inputBox.commandHistory.length - 1;
      } else if (ui.inputBox.historyIndex > 0) {
        ui.inputBox.historyIndex--;
      }
      
      ui.inputBox.setValue(ui.inputBox.commandHistory[ui.inputBox.historyIndex]);
      ui.screen.render();
    });
    
    ui.inputBox.key(['down'], () => {
      if (ui.inputBox.historyIndex === -1) return;
      
      if (ui.inputBox.historyIndex < ui.inputBox.commandHistory.length - 1) {
        ui.inputBox.historyIndex++;
        ui.inputBox.setValue(ui.inputBox.commandHistory[ui.inputBox.historyIndex]);
      } else {
        ui.inputBox.historyIndex = -1;
        ui.inputBox.setValue('');
      }
      
      ui.screen.render();
    });
  }
}
