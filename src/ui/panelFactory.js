/**
 * Panel Factory - Creates blessed-contrib panels for the game UI
 * Handles creation and configuration of all UI panels/boxes
 */

import blessed from 'blessed';

/**
 * Create the active battles/fronts panel
 */
export function createActiveFrontsBox(grid) {
  // TOP PRIORITY PANELS: Active Battles and Laws (rows 0-3)
  // Active Battles (top-left, rows 0-3, cols 0-4) - 1/3 of width
  return grid.set(0, 0, 3, 4, blessed.box, {
    label: ' ACTIVE BATTLES ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    input: false, // Disable text input
    keys: false, // Don't capture keys
    style: {
      border: { fg: 'cyan' }
    },
    border: {
      type: 'line'
    }
  });
}

/**
 * Create the active laws panel
 */
export function createActiveLawsBox(grid) {
  // Active Laws (top-center, rows 0-3, cols 4-8) - 1/3 of width
  return grid.set(0, 4, 3, 4, blessed.box, {
    label: ' ACTIVE LAWS ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    input: false, // Disable text input
    keys: false, // Don't capture keys
    style: {
      border: { fg: 'magenta' }
    },
    border: {
      type: 'line'
    }
  });
}

/**
 * Create the stockpiles display panel
 */
export function createStockpilesBox(grid) {
  // Stockpiles (left column, rows 3-4, cols 0-3)
  return grid.set(3, 0, 1, 3, blessed.box, {
    label: ' Stockpiles ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    input: false,
    keys: false,
    style: {
      border: { fg: 'green' }
    },
    border: {
      type: 'line'
    }
  });
}

/**
 * Create the actions/laws panel (interactive menu)
 */
export function createLawsBox(grid) {
  // SECONDARY PANELS (rows 3-7)
  // Left column: Action Panel (row 4-10) - below stockpiles box
  const actionPanel = grid.set(4, 0, 7, 3, blessed.box, {
    label: ' Actions (TAB: cycle panels, ENTER: select) ', 
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    input: false,
    tags: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });

  // Track action panel state
  actionPanel.currentMode = 'main'; // 'main' | 'laws' | 'info_select'
  actionPanel.selectedIndex = 0;
  actionPanel.menuItems = [];

  return actionPanel;
}

/**
 * Disable list search functionality (prevent '/' from entering search)
 */
export function disableListSearch(lawsBox) {
  if (!lawsBox) {
    return;
  }

  lawsBox.input = false;
  lawsBox.search = false;
  // Override any methods that might enable input/search
  const originalOnKeyPress = lawsBox._onKeyPress;
  if (originalOnKeyPress) {
    lawsBox._onKeyPress = function(ch, key) {
      // Prevent '/' from entering search mode
      if (ch === '/' || key.name === 'slash') {
        return;
      }
      return originalOnKeyPress.call(this, ch, key);
    };
  }
}

/**
 * Create the event display panel
 */
export function createEventBox(grid) {
  // Center: Event box (row 3-6) and Log (row 6-10)
  return grid.set(3, 3, 3, 5, blessed.box, {
    label: ' Event ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: false, // Disable vi mode to prevent key conflicts
    input: false, // Disable text input to prevent keys being treated as text
    tags: true,
    style: {
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
}

/**
 * Create the log panel with history support
 */
export function createLogBox(grid) {
  // Use blessed.box instead of blessed.log for better tag support
  const logBox = grid.set(6, 3, 4, 5, blessed.box, {
    label: ' Log ',
    scrollable: true,
    alwaysScroll: true,
    keys: true, // Enable keys so we can bind event choice keys to prevent input capture
    input: false, // Don't accept text input
    vi: false, // Disable vi mode
    mouse: false, // Disable mouse
    tags: true,
    style: {
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });

  attachLogHistory(logBox);
  return logBox;
}

/**
 * Attach log history functionality to a log box
 */
export function attachLogHistory(logBox) {
  if (!logBox) {
    return;
  }

  // Store log lines for the logBox
  logBox.logLines = [];
  logBox.maxLines = 100;

  // Override log method to properly handle tags
  logBox.log = function(message) {
    const raw = String(message ?? '');
    const singleLine = raw.replace(/\s+/g, ' ').trim();
    const maxLength = 120;
    const compact = singleLine.length > maxLength
      ? `${singleLine.slice(0, maxLength - 3)}...`
      : singleLine;

    this.logLines.push(compact);
    if (this.logLines.length > this.maxLines) {
      this.logLines.shift(); // Remove oldest line
    }
    // Join all lines and set content (tags will be properly parsed)
    this.setContent(this.logLines.join('\n'));
    this.setScrollPerc(100); // Auto-scroll to bottom
  };
}

/**
 * Create the stats panel
 */
export function createStatsBox(grid) {
  // Right: Stats (row 0-3) and Combined Info (row 3-12) - now 1/3 of width (4 cols), moved up
  return grid.set(0, 8, 3, 4, blessed.box, {
    label: ' Stats ',
    content: '',
    tags: true,
    input: false, // Disable text input
    keys: false, // Don't capture keys
    style: {
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
}

/**
 * Create the combined info panel (market, armies, empires, etc.)
 */
export function createCombinedInfoBox(grid) {
  // Combined info panel showing Market, Armies, Empires, Requests, and Improvements
  // Located at rows 3-11, cols 8-11 (right side of screen)
  const combinedInfoBox = grid.set(3, 8, 9, 4, blessed.box, {
    label: ' Market Economy ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    input: false, // Disable text input
    keys: true, // Enable keys for scrolling and tab switching
    vi: false,
    mouse: false,
    style: {
      border: { fg: 'green' }
    },
    border: {
      type: 'line'
    }
  });

  // Track current view state (market, armies, empires, queue)
  combinedInfoBox.currentView = 'empires'; // 'market' | 'armies' | 'empires' | 'queue' | 'empire_detail' | 'stockpiles' | 'commodity_detail'
  combinedInfoBox.scrollOffset = 0;
  combinedInfoBox.selectedRequestIndex = 0; // For request selection
  combinedInfoBox.selectedImprovementIndex = 0; // For improvement selection
  combinedInfoBox.selectedEmpireIndex = 0; // For empire detail view
  combinedInfoBox.selectedCommodityIndex = 0; // For commodity detail view
  return combinedInfoBox;
}

/**
 * Create command input box
 */
export function createCommandInputs(screen) {
  // Input box at the bottom (rows 11-12 out of 12 total rows)
  // Position: 11/12 = 91.67% from top
  const INPUT_BOX_TOP_PERCENT = '91.67%';
  const INPUT_BOX_WIDTH_PERCENT = '33%';

  const inputBox = blessed.textbox({
    top: INPUT_BOX_TOP_PERCENT,
    left: 0,
    width: INPUT_BOX_WIDTH_PERCENT,
    height: 3,
    label: ' Command Input (/help, ESC to cancel, TAB: cycle actions) ',   
    border: {
      type: 'line'
    },
    style: {
      border: { fg: 'green' },
      focus: {
        border: { fg: 'yellow' }
      }
    },
    keys: true,
    mouse: true,
    inputOnFocus: true,
    tags: true
  });

  screen.append(inputBox);

  // Store command history
  inputBox.commandHistory = [];
  inputBox.historyIndex = -1;

  return { inputBox, commandHistoryBox: null };
}

/**
 * Create the logs window overlay
 */
export function createLogsWindow(screen) {
  // Logs window (full-screen overlay, hidden by default, shown when toggled with L)
  const logsWindow = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    tags: true,
    label: ' LOGS (Q/Esc: close, R: refresh, Up/Down: scroll) ',
    hidden: true,
    style: {
      border: { fg: 'cyan' },
      bg: 'black',
      focus: {
        border: { fg: 'yellow' }
      }
    },
    border: {
      type: 'line'
    }
  });

  // Make logs window appear on top of everything
  screen.append(logsWindow);
  logsWindow.hide(); // Explicitly hide it
  return logsWindow;
}

/**
 * Disable text input on widgets that shouldn't accept it
 */
export function disableWidgetInput(widgets) {
  widgets.forEach(widget => {
    if (widget) {
      widget.input = false;
      // Override focus to ensure input stays disabled
      const originalFocus = widget.focus;
      widget.focus = function() {
        this.input = false;
        return originalFocus.call(this);
      };
    }
  });
}
