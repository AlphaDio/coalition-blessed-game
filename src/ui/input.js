import { enactLaw } from '../game/laws.js';
import { handleEventChoice } from '../game/events.js';
import { handleLawEventChoice } from '../game/lawProcessManager.js';
import { advanceTurn } from '../game/turn.js';
import { renderAll, renderLaws, renderLogsWindow } from './renderer.js';
import { REALTIME_CONSTANTS } from '../game/constants.js';
import { startLawProcess } from '../game/lawProcessManager.js';
import { getLogger } from '../modules/logger.js';
import { parseCommand } from './commandParser.js';
import { acceptImprovementRequest, cancelImprovement } from '../game/improvements.js';

export function setupInputHandlers(ui, state, { startGameLoop = null, updateGameSpeed = null } = {}) {
  // Constants for focus modes
  const FOCUS_MODES = {
    MAIN: 'main',
    ACTIONS: 'actions'
  };
  
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
  ui.screen.key(['C-c'], () => {
    return process.exit(0);
  });

  ui.screen.key(['q', 'Q'], () => {
    if (ui.screen.focused === ui.inputBox) return;
    if (state.focus === FOCUS_MODES.ACTIONS) return;
    if (ui.logsWindow && !ui.logsWindow.hidden) {
      ui.logsWindow.hide();
      ui.screen.render();
      return;
    }
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
  ui.screen.key(['-'], () => {
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
  
  ui.screen.key(['+'], () => {
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
    
    // w: Switch to Works view
    ui.screen.key(['w'], () => {
      if (shouldIgnoreKey()) return;
      if (state.focus === FOCUS_MODES.ACTIONS) return;
      ui.combinedInfoBox.currentView = 'queue';
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });

    // ]: Cycle to next view (only if not in input box)
    ui.screen.key([']'], () => {
      if (shouldIgnoreKey()) return;
      if (state.focus === FOCUS_MODES.ACTIONS) return;
      const views = ['market', 'armies', 'empires', 'queue'];
      const currentIndex = views.indexOf(ui.combinedInfoBox.currentView || 'market');
      const nextIndex = (currentIndex + 1) % views.length;
      ui.combinedInfoBox.currentView = views[nextIndex];
      ui.combinedInfoBox.scrollOffset = 0;
      renderAll(ui, state);
    });

    // [: Cycle to previous view (only if not in input box)
    ui.screen.key(['['], (ch, key) => {
      if (shouldIgnoreKey()) return;
      if (state.focus === FOCUS_MODES.ACTIONS) return;
      // Only handle for combined info box if input box doesn't have focus
      if (ui.screen.focused !== ui.inputBox) {
        const views = ['market', 'armies', 'empires', 'queue'];
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
    
    // Combined info box scrolling (when not in action focus)
    ui.screen.key(['up'], () => {
      if (shouldIgnoreKey()) return;
      if (state.focus === FOCUS_MODES.ACTIONS) return;
      ui.combinedInfoBox.scrollOffset = Math.max(0, (ui.combinedInfoBox.scrollOffset || 0) - 1);
      renderAll(ui, state);
    });

    ui.screen.key(['down'], () => {
      if (shouldIgnoreKey()) return;
      if (state.focus === FOCUS_MODES.ACTIONS) return;
      ui.combinedInfoBox.scrollOffset = (ui.combinedInfoBox.scrollOffset || 0) + 1;
      renderAll(ui, state);
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
  
  // Action panel navigation helpers
  const getSelectableItems = () => {
    const items = ui.lawsBox.menuItems || [];
    return items.filter(item => !item.divider && !item.info && !item.disabled);
  };
  
  const findNextSelectableIndex = (currentIdx, direction) => {
    const items = ui.lawsBox.menuItems || [];
    let newIdx = currentIdx + direction;

    while (newIdx >= 0 && newIdx < items.length) {
      const item = items[newIdx];
      if (!item.divider && !item.info && !item.disabled) {
        return newIdx;
      }
      newIdx += direction;
    }
    return currentIdx; // Stay at current if no valid item found
  };
  
  ui.lawsBox.key(['up'], () => {
    if (state.focus !== FOCUS_MODES.ACTIONS) return;
    const panel = ui.lawsBox;
    const currentIdx = panel.selectedIndex || 0;
    const newIdx = findNextSelectableIndex(currentIdx, -1);

    if (newIdx !== currentIdx) {
      panel.selectedIndex = newIdx;
      renderAll(ui, state);
    }
  });

  ui.lawsBox.key(['down'], () => {
    if (state.focus !== FOCUS_MODES.ACTIONS) return;
    const panel = ui.lawsBox;
    const items = panel.menuItems || [];
    const currentIdx = panel.selectedIndex || 0;
    const newIdx = findNextSelectableIndex(currentIdx, 1);

    if (newIdx !== currentIdx && newIdx < items.length) {
      panel.selectedIndex = newIdx;
      renderAll(ui, state);
    }
  });

  ui.lawsBox.key(['enter'], () => {
    if (state.focus !== FOCUS_MODES.ACTIONS) return;
    const panel = ui.lawsBox;
    const items = panel.menuItems || [];
    const selectedItem = items[panel.selectedIndex || 0];

    if (!selectedItem || selectedItem.divider || selectedItem.info || selectedItem.disabled) {
      return;
    }

    // Handle action
    switch (selectedItem.action) {
      case 'SWITCH_MODE':
        panel.currentMode = selectedItem.mode;
        panel.selectedIndex = 0;
        // Find first selectable item
        const newItems = panel.menuItems || [];
        for (let i = 0; i < newItems.length; i++) {
          if (!newItems[i].divider && !newItems[i].info) {
            panel.selectedIndex = i;
            break;
          }
        }
        renderAll(ui, state);
        break;

      case 'SET_VIEW':
        if (ui.combinedInfoBox) {
          ui.combinedInfoBox.currentView = selectedItem.view;
          ui.combinedInfoBox.scrollOffset = 0;
        }
        renderAll(ui, state);
        break;

      case 'ENACT_LAW':
        if (state.lawDefinitions && state.lawDefinitions.length > 0) {
          const lawDef = state.lawDefinitions[selectedItem.lawIndex];
          if (lawDef) {
            executeLawEnactment(startLawProcess(state, lawDef.id, 100));
          }
        } else {
          const law = state.laws[selectedItem.lawIndex];
          if (law) {
            executeLawEnactment(enactLaw(state, law.id));
          }
        }
        // Return to main menu after enacting
        panel.currentMode = 'main';
        panel.selectedIndex = 0;
        renderAll(ui, state);
        break;

      case 'ACCEPT_REQUEST': {
        const request = state.improvements?.requests?.[selectedItem.requestIndex];
        if (request) {
          const empireId = state.empires[0]?.id || 'empire1';
          const result = acceptImprovementRequest(state, request.id, empireId);
          if (result.success) {
            result.log.forEach(line => ui.logBox.log(line));
          } else {
            ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
          }
        }
        renderAll(ui, state);
        break;
      }

      case 'CANCEL_IMPROVEMENT': {
        const improvement = state.improvements?.queue?.[selectedItem.improvementIndex];
        if (improvement) {
          const result = cancelImprovement(state, improvement.id);
          if (result.success) {
            result.log.forEach(line => ui.logBox.log(line));
          } else {
            ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
          }
        }
        renderAll(ui, state);
        break;
      }

      case 'TOGGLE_PAUSE':
        state.paused = !state.paused;
        ui.logBox.log(state.paused ? 'Game PAUSED' : 'Game RESUMED');
        renderAll(ui, state);
        break;

      case 'TOGGLE_LOGS':
        if (ui.logsWindow) {
          const isCurrentlyVisible = !ui.logsWindow.hidden;
          if (isCurrentlyVisible) {
            ui.logsWindow.hide();
          } else {
            const logger = getLogger();
            renderLogsWindow(ui, logger);
            ui.logsWindow.show();
            ui.logsWindow.focus();
          }
          ui.screen.render();
        }
        break;
    }
  });
  
  // ESC to go back in action panel
  ui.lawsBox.key(['escape'], () => {
    const panel = ui.lawsBox;
    if (panel.currentMode !== 'main') {
      panel.currentMode = 'main';
      panel.selectedIndex = 0;
      renderAll(ui, state);
      return;
    }

    if (state.focus === FOCUS_MODES.ACTIONS) {
      state.focus = FOCUS_MODES.MAIN;
      renderAll(ui, state);
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
    // Focus input box when user presses '/'
    ui.screen.key(['/'], () => {
      state.focus = FOCUS_MODES.MAIN;
      ui.inputBox.focus();
      ui.inputBox.setValue('/');
      ui.screen.render();
    });

    // TAB: focus/cycle action panel modes
    ui.screen.key(['tab'], () => {
      if (!ui.lawsBox) return;

      state.focus = FOCUS_MODES.ACTIONS;
      ui.lawsBox.focus();

      const cycleModes = ['laws', 'requests', 'improvements'];
      const currentMode = ui.lawsBox.currentMode || 'main';
      const currentIndex = cycleModes.indexOf(currentMode);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cycleModes.length;
      ui.lawsBox.currentMode = cycleModes[nextIndex];
      ui.lawsBox.selectedIndex = 0;

      const items = ui.lawsBox.menuItems || [];
      for (let i = 0; i < items.length; i++) {
        if (!items[i].divider && !items[i].info && !items[i].disabled) {
          ui.lawsBox.selectedIndex = i;
          break;
        }
      }

      renderAll(ui, state);
    });
    
    // Handle command submission
    ui.inputBox.on('submit', (value) => {
      const raw = value.trim();
      const command = raw.startsWith('/') ? raw.slice(1).trim() : raw;
      
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
        
        if (ui.commandHistoryBox) {
          ui.commandHistoryBox.setContent(`{green-fg}✓{/green-fg} Last: ${command.substring(0, 20)}${command.length > 20 ? '...' : ''}`);
        }
      } else {
        ui.logBox.log(`{red-fg}${result.message}{/red-fg}`);
        if (ui.commandHistoryBox) {
          ui.commandHistoryBox.setContent(`{red-fg}✗{/red-fg} Error`);
        }
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
      state.focus = FOCUS_MODES.MAIN;
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
