import { enactLaw } from '../game/laws.js';
import { handleEventChoice } from '../game/events.js';
import { handleLawEventChoice } from '../game/lawProcessManager.js';
import { advanceTurn } from '../game/turn.js';
import { renderAll, renderLaws, renderLogsWindow, renderCombinedInfo } from './renderer.js';
import { REALTIME_CONSTANTS } from '../game/constants.js';
import { startLawProcess } from '../game/lawProcessManager.js';
import { getLogger } from '../modules/logger.js';
import { parseCommand } from './commandParser.js';
import { acceptImprovementRequest, cancelImprovement } from '../game/improvements/index.js';
import { activateEmergencyLaw } from '../game/emergencyLaws.js';

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
  
   // Combined Info Box: m/a/e/s/w to switch views, [/] to cycle, Page Up/Down to scroll
   // Bind at screen level so they work even when input box has focus (unless input box is actively typing)
   if (ui.combinedInfoBox) {
     // View switching keys
     ui.screen.key(['m', 'M'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.currentView = 'market';
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key(['a', 'A'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.currentView = 'armies';
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key(['e', 'E'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.currentView = 'empires';
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key(['s', 'S'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.currentView = 'stockpiles';
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key(['p', 'P'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.currentView = 'procurement';
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key(['w', 'W'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.currentView = 'queue';
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     // Cycle views with [ and ]
     ui.screen.key(['['], () => {
       if (ui.combinedInfoBox) {
         const views = ['market', 'armies', 'empires', 'stockpiles', 'procurement', 'queue'];
         const currentIndex = views.indexOf(ui.combinedInfoBox.currentView);
         const nextIndex = currentIndex > 0 ? currentIndex - 1 : views.length - 1;
         ui.combinedInfoBox.currentView = views[nextIndex];
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key([']'], () => {
       if (ui.combinedInfoBox) {
         const views = ['market', 'armies', 'empires', 'stockpiles', 'procurement', 'queue'];
         const currentIndex = views.indexOf(ui.combinedInfoBox.currentView);
         const nextIndex = currentIndex < views.length - 1 ? currentIndex + 1 : 0;
         ui.combinedInfoBox.currentView = views[nextIndex];
         ui.combinedInfoBox.scrollOffset = 0;
         renderCombinedInfo(ui, state);
       }
     });
     
     // Scrolling with Page Up/Down
     ui.screen.key(['pageup'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.scrollOffset = Math.max(0, ui.combinedInfoBox.scrollOffset - 10);
         renderCombinedInfo(ui, state);
       }
     });
     
     ui.screen.key(['pagedown'], () => {
       if (ui.combinedInfoBox) {
         ui.combinedInfoBox.scrollOffset += 10;
         renderCombinedInfo(ui, state);
       }
     });
   }
    
  // Laws box - disable number keys when event is active
  // Note: This is handled by bindEventKeysToWidget above, but we keep this
  // as an extra safeguard to prevent list navigation during events
  // ui.lawsBox.key(['1', '2', '3'], (ch, key) => {
  //   if (state.activeEvent) {
  //     // Event choice keys are handled above, prevent list from processing them
  //     // Try to handle the event choice
  //     const keyNum = parseInt(ch);
  //     if (keyNum >= 1 && keyNum <= 3) {
  //       if (handleEventChoiceAndResume(keyNum - 1)) {
  //         return; // Event handled, don't process as list navigation
  //       }
  //     }
  //   }
  // });
  
  // Helper functions for procurement adjustments
  const THETA_PRESETS = ['Scavenge', 'Frugal', 'Balanced', 'Assertive', 'Emergency'];
  
  function adjustProcurementTheta(state, commodityIndex, delta) {
    if (!state.coalitionEconomy?.procurement) return;
    
    const commodities = Object.keys(state.market || {});
    if (commodities.length === 0) return;
    
    const commodityId = commodities[commodityIndex];
    if (!commodityId) return;
    
    const currentPreset = state.coalitionEconomy.procurement.theta_preset_by_commodity?.[commodityId] || 'Balanced';
    const currentIndex = THETA_PRESETS.indexOf(currentPreset);
    if (currentIndex === -1) return;
    
    const newIndex = Math.max(0, Math.min(THETA_PRESETS.length - 1, currentIndex + delta));
    state.coalitionEconomy.procurement.theta_preset_by_commodity[commodityId] = THETA_PRESETS[newIndex];
  }
  
  function adjustProcurementThrottle(state, commodityIndex, delta) {
    if (!state.coalitionEconomy?.procurement) return;
    
    const commodities = Object.keys(state.market || {});
    if (commodities.length === 0) return;
    
    const commodityId = commodities[commodityIndex];
    if (!commodityId) return;
    
    if (!state.coalitionEconomy.per_commodity_settings) {
      state.coalitionEconomy.per_commodity_settings = new Map();
    }
    
    const settings = state.coalitionEconomy.per_commodity_settings.get(commodityId) || {};
    const currentThrottle = settings.spend_throttle || 0.75;
    const newThrottle = Math.max(0.1, Math.min(2.0, currentThrottle + delta));
    settings.spend_throttle = newThrottle;
    state.coalitionEconomy.per_commodity_settings.set(commodityId, settings);
  }
  
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

      case 'ACTIVATE_EMERGENCY': {
        const lawId = selectedItem.emergencyLawId;
        if (lawId) {
          const result = activateEmergencyLaw(lawId, state);
          if (result.success) {
            ui.logBox.log(`{green-fg}EMERGENCY POWER ACTIVATED:{/green-fg} ${result.message}`);
          } else {
            ui.logBox.log(`{red-fg}Cannot activate:{/red-fg} ${result.message}`);
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
   
   // Toggle logs window (full-screen overlay)
   ui.screen.key(['l', 'L'], () => {
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
   });
   
   // Close logs window with Q when focused
   if (ui.logsWindow) {
     ui.logsWindow.key(['q', 'Q'], () => {
       ui.logsWindow.hide();
       ui.screen.render();
       return false; // Prevent event bubbling
     });
   }
   
   // Input box handlers
   if (ui.inputBox) {
     ui.inputBox.key(['enter'], () => {
       const command = ui.inputBox.getValue();
       if (command.trim()) {
         ui.logBox.log(`> ${command}`);
         try {
           const result = parseCommand(state, command);
           if (result.success) {
             result.log.forEach(line => ui.logBox.log(line));
           } else {
             ui.logBox.log(`{red-fg}Error: ${result.error}{/red-fg}`);
           }
         } catch (error) {
           ui.logBox.log(`{red-fg}Command error: ${error.message}{/red-fg}`);
         }
       }
       ui.inputBox.clearValue();
       ui.inputBox.focus();
       renderAll(ui, state);
     });
     
     ui.inputBox.key(['escape'], () => {
       ui.inputBox.clearValue();
       ui.screen.focusNext();
       renderAll(ui, state);
     });
   }
 }

