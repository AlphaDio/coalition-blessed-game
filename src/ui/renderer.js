import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { getCohesionTier } from '../game/cohesion.js';
import { formatNumber, formatCohesion, formatResource } from './formatters.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Coalition: The Blessed Game',
    fullUnicode: true
  });

  const grid = new contrib.grid({
    rows: 12,
    cols: 12,
    screen: screen
  });

  const activeFrontsBox = createActiveFrontsBox(grid);
  const activeLawsBox = createActiveLawsBox(grid);
  const lawsBox = createLawsBox(grid);
  const eventBox = createEventBox(grid);
  const logBox = createLogBox(grid);
  const statsBox = createStatsBox(grid);
  const combinedInfoBox = createCombinedInfoBox(grid);
  const { inputBox, commandHistoryBox } = createCommandInputs(screen);
  const logsWindow = createLogsWindow(screen);

  disableWidgetInput([eventBox, logBox, activeFrontsBox, activeLawsBox, statsBox, combinedInfoBox]);
  screen.input = false;

  return {
    screen,
    lawsBox,
    eventBox,
    activeFrontsBox,
    activeLawsBox,
    logBox,
    statsBox,
    combinedInfoBox,
    logsWindow,
    inputBox,
    commandHistoryBox // null when status panel is removed
  };
}

function createActiveFrontsBox(grid) {
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

function createActiveLawsBox(grid) {
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

function createLawsBox(grid) {
  // SECONDARY PANELS (rows 3-7)
  // Left column: Action Panel (row 3-10) - formerly Laws box
  const actionPanel = grid.set(3, 0, 7, 3, blessed.box, {
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

function disableListSearch(lawsBox) {
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

function createEventBox(grid) {
  // Center: Event box (row 3-5) and Log (row 5-12)
  return grid.set(3, 3, 2, 5, blessed.box, {
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

function createLogBox(grid) {
  // Use blessed.box instead of blessed.log for better tag support
  const logBox = grid.set(5, 3, 5, 5, blessed.box, {
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

function attachLogHistory(logBox) {
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

function createStatsBox(grid) {
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

function createCombinedInfoBox(grid) {
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
  combinedInfoBox.currentView = 'empires'; // 'market' | 'armies' | 'empires' | 'queue'
  combinedInfoBox.scrollOffset = 0;
  combinedInfoBox.selectedRequestIndex = 0; // For request selection
  combinedInfoBox.selectedImprovementIndex = 0; // For improvement selection
  return combinedInfoBox;
}

function createCommandInputs(screen) {
  // Input box at the bottom (rows 10-11 out of 12 total rows)
  // Position: 10/12 = 83.33% from top
  const INPUT_BOX_TOP_PERCENT = '83.33%';
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

function createLogsWindow(screen) {
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

function disableWidgetInput(widgets) {
  widgets.forEach(widget => {
    if (widget) {
      widget.input = false;
      // Override focus to ensure input stays disabled
      const originalFocus = widget.focus;
      if (originalFocus) {
        widget.focus = function() {
          this.input = false;
          return originalFocus.call(this);
        };
      }
    }
  });
}

export function renderLaws(ui, state) {
  renderActionPanel(ui, state);
}

/**
 * Render the action panel (left panel) with different modes
 */
export function renderActionPanel(ui, state) {
  const panel = ui.lawsBox;
  if (!panel) return;

  const mode = panel.currentMode || 'main';
  const selectedIndex = panel.selectedIndex || 0;

  let content = '';
  let label = '';
  let items = [];

  switch (mode) {
    case 'main':
      label = ' Actions (ENTER: select) ';
      items = buildMainMenuItems(state);
      break;
    case 'laws':
      label = ' Propose Law (TAB: cycle, ESC: back) ';
      items = buildLawMenuItems(state);
      break;
    case 'requests':
      label = ' Improvement Requests (TAB: cycle, ESC: back) ';
      items = buildRequestMenuItems(state);
      break;
    case 'improvements':
      label = ' Works (TAB: cycle, ESC: back) ';
      items = buildImprovementMenuItems(state);
      break;
    case 'info_select':
      label = ' Select Info Panel (ESC: back) ';
      items = buildInfoSelectItems();
      break;
    default:
      label = ' Actions ';
      items = buildMainMenuItems(state);
  }

  panel.menuItems = items;
  content = formatMenuItems(items, selectedIndex);

  panel.setLabel(label);
  panel.setContent(content);

  // Update border color based on focus
  if (state.focus === 'actions') {
    panel.style.border.fg = 'yellow';
  } else {
    panel.style.border.fg = 'white';
  }
}

/**
 * Build main menu items for action panel
 */
function buildMainMenuItems(state) {
  const items = [
    { id: 'propose_law', label: 'Propose Law', hint: 'TAB: laws', action: 'SWITCH_MODE', mode: 'laws' },
    { id: 'view_requests', label: 'Improvement Requests', hint: 'TAB: requests', action: 'SWITCH_MODE', mode: 'requests' },
    { id: 'view_improvements', label: 'Improvements Queue', hint: 'TAB: improvements', action: 'SWITCH_MODE', mode: 'improvements' },
    { id: 'info_panel', label: 'Info Panel', hint: 'Switch right panel view', action: 'SWITCH_MODE', mode: 'info_select' },
    { id: 'divider1', label: '─────────────────', divider: true },
    { id: 'view_market', label: 'View Market', hint: '[M]', action: 'SET_VIEW', view: 'market' },
    { id: 'view_armies', label: 'View Armies', hint: '[A]', action: 'SET_VIEW', view: 'armies' },
    { id: 'view_empires', label: 'View Empires', hint: '[E]', action: 'SET_VIEW', view: 'empires' },
    { id: 'view_queue', label: 'View Works', hint: '[W]', action: 'SET_VIEW', view: 'queue' },
    { id: 'divider2', label: '─────────────────', divider: true },
    { id: 'toggle_pause', label: state.paused ? 'Resume Game' : 'Pause Game', hint: '[SPACE]', action: 'TOGGLE_PAUSE' },
    { id: 'view_logs', label: 'View Logs', hint: '[L]', action: 'TOGGLE_LOGS' }
  ];

  // Add active law count indicator
  const activeLawCount = getActiveLawCount(state);
  if (activeLawCount > 0) {
    items.splice(1, 0, { 
      id: 'active_laws_info', 
      label: `  Active Laws: ${activeLawCount}`, 
      hint: '', 
      info: true 
    });
  }

  return items;
}

/**
 * Build law menu items
 */
function buildLawMenuItems(state) {
  const items = [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' },
    { id: 'divider', label: '─────────────────', divider: true }
  ];

  if (state.lawDefinitions && state.lawDefinitions.length > 0) {
    state.lawDefinitions.forEach((lawDef, idx) => {
      const canAfford = state.playerInfluence >= 100;
      const costHint = canAfford ? '100 inf' : '{red-fg}need 100{/red-fg}';
      items.push({
        id: `law_${lawDef.id}`,
        label: lawDef.name,
        hint: costHint,
        action: 'ENACT_LAW',
        lawIndex: idx,
        disabled: !canAfford
      });
    });
  } else if (state.laws && state.laws.length > 0) {
    state.laws.forEach((law, idx) => {
      const onCooldown = law.currentCooldown > 0;
      const hint = onCooldown ? `CD: ${law.currentCooldown}` : '';
      items.push({
        id: `law_${law.id}`,
        label: law.name,
        hint: hint,
        action: 'ENACT_LAW',
        lawIndex: idx,
        disabled: onCooldown
      });
    });
  } else {
    items.push({ id: 'no_laws', label: 'No laws available', info: true });
  }

  return items;
}

function buildRequestMenuItems(state) {
  const items = [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' },
    { id: 'divider', label: '─────────────────', divider: true }
  ];

  if (!state.improvements || !state.improvements.requests || state.improvements.requests.length === 0) {
    items.push({ id: 'no_requests', label: 'No requests available', info: true });
    return items;
  }

  state.improvements.requests.forEach((request, idx) => {
    const { label, colorTag } = formatSuggestionLabel(request.suggestedBy, state);
    items.push({
      id: `request_${request.id}`,
      label: `${request.name} {${colorTag}-fg}[${label}]{/${colorTag}-fg}`,
      hint: `${request.suppliesCost} supplies`,
      action: 'ACCEPT_REQUEST',
      requestIndex: idx
    });
  });

  return items;
}

function buildImprovementMenuItems(state) {
  const items = [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' },
    { id: 'divider', label: '─────────────────', divider: true }
  ];

  if (!state.improvements || !state.improvements.queue || state.improvements.queue.length === 0) {
    items.push({ id: 'no_queue', label: 'No works in progress', info: true });
    return items;
  }

  state.improvements.queue.forEach((improvement, idx) => {
    const stateLabel = improvement.state || 'BUILDING';
    const progress = improvement.build > 0
      ? Math.min(1, improvement.buildProgress / improvement.build)
      : 0;
    const bar = formatProgressBar(progress, 12);
    const { label, colorTag } = formatSuggestionLabel(improvement.suggestedBy, state);
    items.push({
      id: `improvement_${improvement.id}`,
      label: `${improvement.name} ${bar} [${stateLabel}] {${colorTag}-fg}[${label}]{/${colorTag}-fg}`,
      hint: 'cancel',
      action: 'CANCEL_IMPROVEMENT',
      improvementIndex: idx
    });
  });

  return items;
}

function formatProgressBar(progress, width) {
  const clamped = Math.max(0, Math.min(1, progress));
  const filled = Math.round(clamped * width);
  const empty = Math.max(0, width - filled);
  return `{green-fg}[${'#'.repeat(filled)}${'-'.repeat(empty)}]{/green-fg}`;
}

function formatSuggestionLabel(suggestedBy, state) {
  if (!suggestedBy || suggestedBy === 'coalition') {
    return { label: 'Coalition', colorTag: 'cyan' };
  }

  const empire = state.empires?.find(e => e.id === suggestedBy || e.name === suggestedBy);
  const label = empire?.name || suggestedBy;
  const colorTag = empire?.color || 'yellow';
  return { label, colorTag };
}

/**
 * Build info panel selection items
 */
function buildInfoSelectItems() {
  return [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' },
    { id: 'divider', label: '─────────────────', divider: true },
    { id: 'market', label: 'Market Economy', hint: '[M]', action: 'SET_VIEW', view: 'market' },
    { id: 'armies', label: 'Armies', hint: '[A]', action: 'SET_VIEW', view: 'armies' },
    { id: 'empires', label: 'Empires', hint: '[E]', action: 'SET_VIEW', view: 'empires' },
    { id: 'queue', label: 'Works', hint: '[W]', action: 'SET_VIEW', view: 'queue' }
  ];
}


/**
 * Format menu items for display
 */
function formatMenuItems(items, selectedIndex) {
  const lines = [];

  items.forEach((item, idx) => {
    if (item.divider) {
      lines.push(`{gray-fg}${item.label}{/gray-fg}`);
      return;
    }

    if (item.info) {
      lines.push(`{cyan-fg}${item.label}{/cyan-fg}`);
      return;
    }

    const isSelected = idx === selectedIndex;
    const marker = isSelected ? '{inverse} › {/inverse}' : '   ';
    const labelColor = item.disabled ? 'gray' : (isSelected ? 'white' : 'white');
    const hintText = item.hint ? ` {gray-fg}${item.hint}{/gray-fg}` : '';

    if (item.disabled) {
      lines.push(`${marker}{gray-fg}${item.label}{/gray-fg}${hintText}`);
    } else if (isSelected) {
      lines.push(`${marker}{bold}{yellow-fg}${item.label}{/yellow-fg}{/bold}${hintText}`);
    } else {
      lines.push(`${marker}{${labelColor}-fg}${item.label}{/${labelColor}-fg}${hintText}`);
    }
  });

  return lines.join('\n');
}

export function renderEvent(ui, state) {
  if (!state.activeEvent) {
    const pauseHint = state.paused ? 'Press SPACE to resume.' : 'Game running in real-time.';
    ui.eventBox.setContent(`No active event.\n\n${pauseHint}\nPress - or + to adjust speed.`);
    ui.eventBox.style.border.fg = 'white';
    return;
  }

  ui.eventBox.setContent(formatActiveEvent(state.activeEvent));
  ui.eventBox.style.border.fg = 'yellow';
}

export function renderStats(ui, state) {
  ui.statsBox.setContent(formatStats(state));
  ui.statsBox.style.border.fg = 'white';
}

export function renderTables(ui, state) {
  let content = '';
  
  // Show law processes if any are active
  if (state.lawProcesses && state.lawProcesses.length > 0) {
    const activeLaws = state.lawProcesses.filter(lp => lp.phase !== 'ENACTED' && lp.phase !== 'BURIED');
    if (activeLaws.length > 0) {
      content += `{bold}Law Processes:{/bold}\n`;
      activeLaws.forEach(lp => {
        const lawDef = state.lawDefinitions?.find(ld => ld.id === lp.lawId);
        const lawName = lawDef ? lawDef.name : lp.lawId;
        content += `  {cyan-fg}${lawName}{/cyan-fg}\n`;
        content += `    Phase: {yellow-fg}${lp.phase}{/yellow-fg} (${(lp.phaseProgress * 100).toFixed(0)}%)\n`;
        content += `    Rejects: ${lp.rejects}/4\n`;
        content += `    Momentum: ${(lp.meters.momentum * 100).toFixed(0)}%\n`;
        content += `    Reject Pressure: ${(lp.meters.reject_pressure * 100).toFixed(0)}%\n`;
      });
      content += '\n';
    }
  }
  
  content += `{bold}Empires:{/bold}\n`;
  state.empires.forEach(empire => {
    content += `  ${empire.name}: Approval ${empire.approval >= 0 ? '+' : ''}${empire.approval.toFixed(0)}\n`;

  });
  
  content += `\n{bold}Armies:{/bold}\n`;
  // Build empire lookup map for O(1) access instead of O(n) per army
  const empireMap = new Map(state.empires.map(empire => [empire.id, empire]));
  state.armies.forEach(army => {
    const empire = empireMap.get(army.empireId);
    const empireName = empire ? empire.name : 'Unknown';
    content += `  ${army.name} (${empireName}):\n`;
    content += `    Fervor: ${formatNumber(army.fervor)}, Org: ${formatNumber(army.organization)}\n`;
    content += `    Supply Need: ${army.supplyNeed}, Aggravation: ${formatNumber(army.aggravation)}\n`;
  });
  
  if (state.insurrections.length > 0) {
    content += `\n{bold}Insurrections:{/bold}\n`;
    state.insurrections.forEach(ins => {
      content += `  Active: ${ins.armies.length} armies\n`;
    });
  } else {
    content += `\n{bold}Insurrections:{/bold} None`;
  }
  
  // renderTables is deprecated - content is now shown in renderCombinedInfo
  // This function is kept for backwards compatibility
}

export function renderActiveFronts(ui, state) {
  const activeBattles = (state.battleFronts || []).filter(f => f.state === 'ACTIVE');

  if (activeBattles.length === 0) {
    ui.activeFrontsBox.setContent('{center}{yellow-fg}No active battles{/yellow-fg}{/center}');
    ui.activeFrontsBox.style.border.fg = 'white';
    return;
  }

  const content = activeBattles
    .map(front => formatActiveBattle(front, state))
    .filter(Boolean)
    .join('\n\n');

  ui.activeFrontsBox.setContent(content);
  ui.activeFrontsBox.style.border.fg = 'cyan';
}

function formatActiveBattle(front, state) {
  const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
  const rightArmy = state.armies.find(a => a.id === front.rightArmyId);

  if (!leftArmy || !rightArmy) {
    return '';
  }

  const leftBadge = front.moraleBroken.left ? '{red-fg}BROKEN{/red-fg}' : '{green-fg}STEADY{/green-fg}';
  const rightBadge = front.moraleBroken.right ? '{red-fg}BROKEN{/red-fg}' : '{green-fg}STEADY{/green-fg}';

  const leftMP = Math.floor(leftArmy.mp.current);
  const leftMaxMP = leftArmy.mp.max;
  const rightMP = Math.floor(rightArmy.mp.current);
  const rightMaxMP = rightArmy.mp.max;

  const leftPct = ((leftMP / leftMaxMP) * 100).toFixed(0);
  const rightPct = ((rightMP / rightMaxMP) * 100).toFixed(0);

  const battleType = getBattleTypeTag(front);
  const barWidth = 40;
  const mpBar = buildBattleMpBar(leftArmy.mp.current, rightArmy.mp.current, barWidth);
  const mpSpacing = '  '.repeat(Math.max(1, Math.floor(barWidth / 10) - 5));
  const moraleSpacing = '  '.repeat(Math.max(1, Math.floor(barWidth / 10)));

  const leftMO = Math.floor(leftArmy.mo.current);
  const rightMO = Math.floor(rightArmy.mo.current);
  const duration = state.turn - front.startedAtTick;

  return [
    `${battleType}{bold}{cyan-fg}${front.id}{/cyan-fg}{/bold}`,
    `{bold}${leftArmy.name}{/bold} [${leftBadge}]  vs  {bold}${rightArmy.name}{/bold} [${rightBadge}]`,
    mpBar,
    `MP: ${leftMP}/${leftMaxMP} (${leftPct}%)${mpSpacing}${rightMP}/${rightMaxMP} (${rightPct}%)`,
    `Morale: ${leftMO}/${leftArmy.mo.max}${moraleSpacing}${rightMO}/${rightArmy.mo.max}`,
    `{gray-fg}Field Size: ${front.battlefieldSize} | Duration: ${duration} turns{/gray-fg}`
  ].join('\n');
}

function getBattleTypeTag(front) {
  if (front.isScourgeBattle) {
    return '{red-fg}[SCOURGE BATTLE]{/red-fg} ';
  }
  if (front.isInsurrectionBattle) {
    return '{yellow-fg}[INSURRECTION]{/yellow-fg} ';
  }
  return '';
}

function buildBattleMpBar(leftMp, rightMp, barWidth) {
  const totalMP = leftMp + rightMp;
  const leftBarWidth = totalMP > 0 ? Math.floor((leftMp / totalMP) * barWidth) : Math.floor(barWidth / 2);
  const rightBarWidth = barWidth - leftBarWidth;

  const leftBar = '█'.repeat(Math.max(0, leftBarWidth));
  const rightBar = '█'.repeat(Math.max(0, rightBarWidth));

  return `{cyan-fg}${leftBar}{/cyan-fg}{yellow-fg}${rightBar}{/yellow-fg}`;
}

export function renderActiveLaws(ui, state) {
  if (!state.lawProcesses || state.lawProcesses.length === 0) {
    ui.activeLawsBox.setContent('{center}{yellow-fg}No active laws{/yellow-fg}{/center}');
    ui.activeLawsBox.style.border.fg = 'white';
    return;
  }

  const activeLaws = state.lawProcesses.filter(lp => lp.phase !== 'ENACTED' && lp.phase !== 'BURIED');

  if (activeLaws.length === 0) {
    ui.activeLawsBox.setContent('{center}{yellow-fg}No active laws{/yellow-fg}{/center}');
    ui.activeLawsBox.style.border.fg = 'white';
    return;
  }

  const content = activeLaws
    .map(lp => formatActiveLaw(lp, state, activeLaws.length))
    .join('\n\n');

  ui.activeLawsBox.setContent(content);
  ui.activeLawsBox.style.border.fg = 'magenta';
}

function formatActiveLaw(lawProcess, state, activeLawCount) {
  const lawDef = state.lawDefinitions?.find(ld => ld.id === lawProcess.lawId);
  const lawName = lawDef ? lawDef.name : lawProcess.lawId;

  const phaseColor = getPhaseColor(lawProcess.phase);
  const phaseProgress = (lawProcess.phaseProgress * 100).toFixed(0);
  const progressBar = buildProgressBar(lawProcess.phaseProgress || 0, 30);
  const rejectColor = getRejectColor(lawProcess.rejects);

  const lines = [
    `{bold}{magenta-fg}${lawName}{/magenta-fg}{/bold}`,
    `Phase: {${phaseColor}-fg}${lawProcess.phase}{/${phaseColor}-fg} (${phaseProgress}%)`,
    `{${phaseColor}-fg}${progressBar}{/${phaseColor}-fg}`,
    `Rejects: {${rejectColor}-fg}${lawProcess.rejects}/4{/${rejectColor}-fg}`
  ];

  if (activeLawCount <= 2) {
    lines.push(formatLawMeters(lawProcess));
  }

  return lines.join('\n');
}

function getPhaseColor(phase) {
  if (phase === 'DEBATE') return 'cyan';
  if (phase === 'FALLOUT') return 'yellow';
  if (phase === 'VOTING') return 'green';
  return 'yellow';
}

function getRejectColor(rejects) {
  if (rejects >= 3) return 'red';
  if (rejects >= 2) return 'yellow';
  return 'white';
}

function buildProgressBar(value, width) {
  const filledWidth = Math.floor(value * width);
  const emptyWidth = Math.max(0, width - filledWidth);
  return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

function formatLawMeters(lawProcess) {
  const momentum = (lawProcess.meters && lawProcess.meters.momentum) || 0;
  const rejectPressure = (lawProcess.meters && lawProcess.meters.reject_pressure) || 0;

  const momBar = buildProgressBar(momentum, 20);
  const rejBar = buildProgressBar(rejectPressure, 20);

  return [
    `Momentum:       {green-fg}${momBar}{/green-fg} ${(momentum * 100).toFixed(0)}%`,
    `Reject Pressure: {red-fg}${rejBar}{/red-fg} ${(rejectPressure * 100).toFixed(0)}%`
  ].join('\n');
}

export function renderLog(ui, state) {
  // Log is auto-updated via logBox.log()
  // Just ensure it's scrolled to bottom
  ui.logBox.setScrollPerc(100);
}

export function renderLogsWindow(ui, logger) {
  if (!logger || !ui.logsWindow) return;
  
  const history = logger.getHistory(500); // Show last 500 entries
  let content = '';
  
  if (history.length === 0) {
    content = '{center}{yellow-fg}No log entries yet{/yellow-fg}{/center}';
  } else {
    history.forEach(entry => {
      const levelName = entry.level === 0 ? 'DEBUG' : 
                       entry.level === 1 ? 'INFO' :
                       entry.level === 2 ? 'WARN' : 'ERROR';
      
      let levelColor = 'white';
      if (entry.level === 0) levelColor = 'gray';
      else if (entry.level === 2) levelColor = 'yellow';
      else if (entry.level === 3) levelColor = 'red';
      
      // Format: [LEVEL] message (data if present)
      let line = `[{${levelColor}-fg}${levelName}{/${levelColor}-fg}] ${entry.message}`;
      
      if (entry.data !== null && entry.data !== undefined) {
        const dataStr = typeof entry.data === 'object' 
          ? JSON.stringify(entry.data, null, 2).split('\n').join('\n  ')
          : String(entry.data);
        line += `\n  {gray-fg}${dataStr}{/gray-fg}`;
      }
      
      content += line + '\n';
    });
  }
  
  ui.logsWindow.setContent(content);
  ui.logsWindow.setScrollPerc(100); // Auto-scroll to bottom
}


/**
 * Render market economy view
 */
function renderMarketView(state) {
  if (!state.market || Object.keys(state.market).length === 0) {
    return '{center}{yellow-fg}Market not initialized{/yellow-fg}{/center}';
  }

  const commodityMap = loadCommodityMap(state.market);
  const sortedCommodities = sortMarketCommodities(state.market, commodityMap);

  const lines = [
    '{bold}{green-fg}Commodity{/green-fg}  {cyan-fg}Price{/cyan-fg}  {yellow-fg}Buy{/yellow-fg}  {red-fg}Sell{/red-fg}  {magenta-fg}Vol{/magenta-fg}{/bold}',
    '─'.repeat(45)
  ];

  sortedCommodities.forEach(entry => {
    lines.push(formatMarketRow(entry));
  });

  appendCoalitionEconomyInfo(lines, state.coalitionEconomy);
  return lines.join('\n');
}

/**
 * Render armies view
 */
function renderArmiesView(state) {
  const lines = ['{bold}Armies:{/bold}'];

  if (!state.armies || state.armies.length === 0) {
    lines.push('  {yellow-fg}No armies{/yellow-fg}');
    return lines.join('\n');
  }

  const empireMap = new Map(state.empires.map(empire => [empire.id, empire]));
  const regularArmies = filterRegularArmies(state.armies);

  regularArmies.forEach(army => {
    const empireName = empireMap.get(army.empireId)?.name || 'Unknown';
    lines.push('', formatArmyBlock(army, empireName));
  });

  appendInsurrectionInfo(lines, state.insurrections);
  return lines.join('\n');
}

/**
 * Render empires view
 */
function renderEmpiresView(state) {
  const lines = ['{bold}Empires:{/bold}'];

  if (!state.empires || state.empires.length === 0) {
    lines.push('  {yellow-fg}No empires{/yellow-fg}');
    return lines.join('\n');
  }

  const regularArmies = filterRegularArmies(state.armies || []);

  state.empires.forEach(empire => {
    lines.push('', formatEmpireBlock(empire, regularArmies));
  });

  return lines.join('\n');
}

/**
 * Render combined info panel (Market, Armies, or Empires based on current view)
 */
export function renderCombinedInfo(ui, state) {
  const box = ui.combinedInfoBox;
  if (!box) return;
  
  const view = box.currentView || 'market';
  let content = '';
  let label = '';
  let borderColor = 'green';
  
  // Apply scroll offset
  const scrollOffset = box.scrollOffset || 0;
  const viewConfig = COMBINED_INFO_VIEWS[view] || COMBINED_INFO_VIEWS.market;

  label = viewConfig.label;
  borderColor = viewConfig.borderColor;
  content = viewConfig.render(state);
  
  // Apply scrolling by splitting content into lines and showing subset
  const lines = content.split('\n');
  const visibleHeight = box.height - 2; // Account for border
  const totalLines = lines.length;
  
  // Clamp scroll offset
  const maxScroll = Math.max(0, totalLines - visibleHeight);
  box.scrollOffset = Math.max(0, Math.min(scrollOffset, maxScroll));
  
  // Get visible lines
  const visibleLines = lines.slice(box.scrollOffset, box.scrollOffset + visibleHeight);
  const scrolledContent = visibleLines.join('\n');
  
  // Add scroll indicator if needed
  let finalContent = scrolledContent;
  if (totalLines > visibleHeight) {
    const scrollPct = totalLines > 0 ? ((box.scrollOffset / maxScroll) * 100).toFixed(0) : '0';
    finalContent += `\n{gray-fg}--- Scroll: ${box.scrollOffset}/${maxScroll} (${scrollPct}%) ---{/gray-fg}`;
  }
  
  box.setLabel(label);
  box.setContent(finalContent);
  box.style.border.fg = borderColor;
}

const COMBINED_INFO_VIEWS = {
  market: {
    label: ' Market Economy (m/a/e/w: switch, [/]: cycle) ',
    borderColor: 'green',
    render: renderMarketView
  },
  armies: {
    label: ' Armies (m/a/e/w: switch, [/]: cycle) ',
    borderColor: 'cyan',
    render: renderArmiesView
  },
  empires: {
    label: ' Empires (m/a/e/w: switch, [/]: cycle) ',
    borderColor: 'yellow',
    render: renderEmpiresView
  },
  queue: {
    label: ' Works (m/a/e/w: switch, [/]: cycle) ',
    borderColor: 'blue',
    render: renderImprovementsQueueView
  }
};

// Legacy: renderRequestsView remains for future reuse.

function formatStats(state) {
  const tier = getCohesionTier(state.coalitionCohesion);

  const lines = [
    `{bold}Coalition Cohesion:{/bold} ${formatCohesion(state.coalitionCohesion, tier)}`
  ];

  const scourgeCohesion = state.scourgeCohesion ?? 80;
  lines.push(`{bold}Scourge Cohesion:{/bold} ${formatNumber(scourgeCohesion, 1)}`);
  lines.push(`{bold}Scourge Fervor:{/bold} ${formatNumber(state.scourgeFervor, 1)}`);
  lines.push('', '{bold}Stockpiles:{/bold}');
  lines.push(`  ${formatResource('Supplies', state.stockpiles.supplies)}`, '');

  if (state.playerInfluence !== undefined) {
    lines.push(`{bold}Player Influence:{/bold} ${state.playerInfluence}`);
    lines.push(`  (+1 per tick)`, '');
  }

  const activeLawCount = getActiveLawCount(state);
  if (activeLawCount > 0) {
    lines.push(`{bold}Active Laws:{/bold} ${activeLawCount}`);
  }

  lines.push(`{bold}Turn:{/bold} ${state.turn}`);
  const pauseStatus = state.paused ? '{red-fg}PAUSED{/red-fg}' : '{green-fg}RUNNING{/green-fg}';
  lines.push(`{bold}Status:{/bold} ${pauseStatus}`);
  lines.push(`{bold}Speed:{/bold} ${state.gameSpeed}x`);

  return lines.join('\n');
}

function loadCommodityMap(market) {
  // Load resources to get commodity names
  let commodities = [];
  try {
    const resourcesPath = path.join(__dirname, '..', '..', 'docs', 'input', 'resources.yaml');
    const content = fs.readFileSync(resourcesPath, 'utf8');
    const doc = yaml.load(content);
    commodities = doc.resources?.commodities || [];
  } catch (error) {
    // Fallback: use market keys
    commodities = Object.keys(market).map(key => ({ key, name: key }));
  }

  return new Map(commodities.map(c => [c.key, c]));
}

function sortMarketCommodities(market, commodityMap) {
  const tierOrder = { t1: 1, t2: 2, t3: 3, t4: 4 };
  return Object.entries(market)
    .map(([key, marketState]) => {
      const commodity = commodityMap.get(key) || { key, name: key, tier: 't1' };
      return { key, commodity, marketState };
    })
    .sort((a, b) => {
      const tierDiff = (tierOrder[a.commodity.tier] || 5) - (tierOrder[b.commodity.tier] || 5);
      if (tierDiff !== 0) return tierDiff;
      return a.commodity.name.localeCompare(b.commodity.name);
    });
}

function formatMarketRow({ key, commodity, marketState }) {
  const name = commodity.name || key;
  const price = marketState.price || 0;
  const demand = marketState.demand_qty || 0;
  const supply = marketState.supply_qty || 0;
  const traded = marketState.traded_qty || 0;

  const displayName = name.length > 12 ? name.substring(0, 10) + '..' : name;
  const namePad = ' '.repeat(Math.max(0, 12 - displayName.length));

  const priceStr = price.toFixed(2).padStart(6);
  const demandStr = formatVolume(demand).padStart(6);
  const supplyStr = formatVolume(supply).padStart(6);
  const tradedStr = formatVolume(traded).padStart(6);

  const priceColor = getPriceColor(marketState, price);
  const { demandColor, supplyColor } = getSupplyDemandColors(demand, supply);

  return `${displayName}${namePad} {${priceColor}-fg}${priceStr}{/${priceColor}-fg}  ` +
    `{${demandColor}-fg}${demandStr}{/${demandColor}-fg}  ` +
    `{${supplyColor}-fg}${supplyStr}{/${supplyColor}-fg}  ` +
    `{magenta-fg}${tradedStr}{/magenta-fg}`;
}

function getPriceColor(marketState, price) {
  if (!marketState.last_price) {
    return 'cyan';
  }

  const change = price - marketState.last_price;
  const changePct = marketState.last_price > 0 ? (change / marketState.last_price) * 100 : 0;
  if (changePct > 5) return 'red';
  if (changePct < -5) return 'green';
  return 'cyan';
}

function getSupplyDemandColors(demand, supply) {
  let demandColor = 'yellow';
  let supplyColor = 'red';
  if (supply > 0 && demand > 0) {
    const ratio = demand / supply;
    if (ratio > 1.5) {
      demandColor = 'red';
      supplyColor = 'yellow';
    } else if (ratio < 0.67) {
      demandColor = 'yellow';
      supplyColor = 'green';
    }
  }

  return { demandColor, supplyColor };
}

function appendCoalitionEconomyInfo(lines, coalitionEconomy) {
  if (!coalitionEconomy) {
    return;
  }

  lines.push('', '{bold}Coalition:{/bold}');
  lines.push(`Budget: {green-fg}${formatNumber(coalitionEconomy.budget_credits || 0, 0)}{/green-fg} credits`);

  const stockpileCount = Object.keys(coalitionEconomy.stockpiles || {}).length;
  if (stockpileCount > 0) {
    lines.push(`Stockpiles: {cyan-fg}${stockpileCount}{/cyan-fg} commodities`);
  }
}

function filterRegularArmies(armies) {
  return armies.filter(army =>
    !army.id.startsWith('_scourge') &&
    !army.id.startsWith('_coalition_combined') &&
    !army.id.startsWith('_insurrection')
  );
}

function formatArmyBlock(army, empireName) {
  const lines = [`{bold}${army.name}{/bold} (${empireName})`];
  lines.push(`  Fervor: ${formatNumber(army.fervor)}, Org: ${formatNumber(army.organization)}`);
  lines.push(`  Supply Need: ${army.supplyNeed}, Aggravation: ${formatNumber(army.aggravation)}`);

  if (army.mp && army.mo) {
    const mpPct = army.mp.max > 0 ? ((army.mp.current / army.mp.max) * 100).toFixed(0) : '0';
    const moPct = army.mo.max > 0 ? ((army.mo.current / army.mo.max) * 100).toFixed(0) : '0';
    lines.push(`  MP: ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)} (${mpPct}%)`);
    lines.push(`  Morale: ${Math.floor(army.mo.current)}/${Math.floor(army.mo.max)} (${moPct}%)`);
  }

  return lines.join('\n');
}

function appendInsurrectionInfo(lines, insurrections) {
  if (!insurrections || insurrections.length === 0) {
    return;
  }

  lines.push('', '{bold}Insurrections:{/bold}');
  insurrections.forEach(ins => {
    lines.push(`  Active: ${ins.armies.length} armies`);
  });
}

function formatEmpireBlock(empire, regularArmies) {
  const lines = [`{bold}${empire.name}{/bold}`];
  lines.push(`  Approval: ${empire.approval >= 0 ? '+' : ''}${empire.approval.toFixed(0)}`);
  const stabilityValue = empire.stability !== undefined ? empire.stability.toFixed(0) : 'N/A';
  let stabilityDisplay = stabilityValue;
  if (empire.stability !== undefined) {
    if (empire.stability < 40) {
      stabilityDisplay = `{red-fg}${stabilityValue}{/red-fg}`;
    } else if (empire.stability < 60) {
      stabilityDisplay = `{yellow-fg}${stabilityValue}{/yellow-fg}`;
    }
  }
  lines.push(`  Stability: ${stabilityDisplay}`);

  if (empire.stats) {
    lines.push(`  Population: ${formatNumber(empire.stats.population || 0)}`);
    lines.push(`  Influence: ${formatNumber(empire.stats.influence || 0)}`);
  }
  if (empire.budget_credits !== undefined) {
    lines.push(`  Budget: {green-fg}${formatNumber(empire.budget_credits, 0)}{/green-fg} credits`);
  }

  const empireArmies = regularArmies.filter(army => army.empireId === empire.id);
  lines.push(`  Armies: ${empireArmies.length}`);
  return lines.join('\n');
}

function formatActiveEvent(event) {
  const eventTitle = event.title || event.name || event.id || 'Unknown Event';
  const eventText = event.text || event.description || '';
  const lines = [`{bold}${eventTitle}{/bold}`, '', eventText, ''];

  if (event.choices && event.choices.length > 0) {
    lines.push('{bold}Choices:{/bold}');
    event.choices.forEach((choice, idx) => {
      lines.push(`  ${idx + 1}. ${choice.text}`);
    });
    lines.push('', 'Press 1/2/3 to choose.');
  }

  lines.push('{yellow-fg}Game auto-paused{/yellow-fg}');
  return lines.join('\n');
}

function getActiveLawCount(state) {
  if (!state.lawProcesses || state.lawProcesses.length === 0) {
    return 0;
  }

  return state.lawProcesses.filter(lawProcess =>
    lawProcess.phase !== 'ENACTED' && lawProcess.phase !== 'BURIED'
  ).length;
}

function formatVolume(volume) {
  if (volume === 0) return '0';
  if (volume < 1) return volume.toFixed(2);
  if (volume < 1000) return volume.toFixed(0);
  if (volume < 1000000) return (volume / 1000).toFixed(1) + 'K';
  return (volume / 1000000).toFixed(1) + 'M';
}

/**
 * Render Requests view (available improvements to accept)
 */
function renderRequestsView(state) {
  const lines = [];

  if (!state.improvements || !state.improvements.requests) {
    lines.push('{yellow-fg}No improvements system initialized{/yellow-fg}');
    return lines.join('\n');
  }

  const improvements = state.improvements;
  const requests = improvements.requests;

  lines.push('{bold}Improvement Limits:{/bold}');
  lines.push(`  Capacity: ${improvements.currentCapacity || 0}/${improvements.maxTotalCapacity}`);
  lines.push(`  Construction: {cyan-fg}${state.coalitionConstruction || 1}{/cyan-fg}/tick`);
  lines.push(`  Supplies: {green-fg}${state.stockpiles.supplies || 0}{/green-fg}`);
  lines.push('');

  if (requests.length === 0) {
    lines.push('{yellow-fg}No improvement requests available{/yellow-fg}');
    return lines.join('\n');
  }

  lines.push('{bold}Available Requests:{/bold}');
  lines.push('');

  requests.forEach((request) => {
    lines.push(`{bold}${request.name}{/bold}`);
    lines.push(`  Cost: {red-fg}${request.suppliesCost}{/red-fg} Supplies | Build: {yellow-fg}${request.build}{/yellow-fg}`);
    lines.push(`  Capacity: ${request.capacity}`);

    const sustainKeys = Object.keys(request.sustainmentCost);
    if (sustainKeys.length > 0) {
      const sustainStr = sustainKeys.map(k => `${k}:${request.sustainmentCost[k]}`).join(', ');
      lines.push(`  Sustain: {yellow-fg}${sustainStr}{/yellow-fg}`);
    }

    const outputKeys = Object.keys(request.productionOutputs);
    if (outputKeys.length > 0) {
      const outputStr = outputKeys.map(k => `${k}:+${request.productionOutputs[k]}`).join(', ');
      lines.push(`  Produces: {green-fg}${outputStr}{/green-fg}`);
    }

    const modKeys = Object.keys(request.modifiers);
    if (modKeys.length > 0) {
      const modStr = modKeys.map(k => `${k}:${request.modifiers[k]}`).join(', ');
      lines.push(`  Bonus: {cyan-fg}${modStr}{/cyan-fg}`);
    }

    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Render Improvements view (active and building improvements)
 */
function renderImprovementsQueueView(state) {
  const lines = [];

  if (!state.improvements || !state.improvements.queue) {
    lines.push('{yellow-fg}No improvements system initialized{/yellow-fg}');
    return lines.join('\n');
  }

  const improvements = state.improvements;
  const queue = improvements.queue;

  lines.push('{bold}Improvement Stats:{/bold}');
  lines.push(`  Building: ${queue.filter(i => i.state === 'BUILDING').length}`);
  lines.push(`  Capacity: ${improvements.currentCapacity || 0}/${improvements.maxTotalCapacity}`);
  lines.push(`  Construction: {cyan-fg}${state.coalitionConstruction || 1}{/cyan-fg}/tick`);
  lines.push('');

  if (queue.length === 0) {
    lines.push('{yellow-fg}No improvements in queue{/yellow-fg}');
    return lines.join('\n');
  }

  lines.push('{bold}Improvements Queue:{/bold}');
  lines.push('');

  queue.forEach((improvement) => {
    lines.push(`{bold}${improvement.name}{/bold} [${improvement.state}]`);
    lines.push(`  Progress: ${improvement.buildProgress}/${improvement.build}`);
    lines.push(`  Capacity: ${improvement.capacity}`);

    const sustainKeys = Object.keys(improvement.sustainmentCost);
    if (sustainKeys.length > 0) {
      const sustainStr = sustainKeys.map(k => `${k}:${improvement.sustainmentCost[k]}`).join(', ');
      lines.push(`  Sustain: {yellow-fg}${sustainStr}{/yellow-fg}`);
    }

    const outputKeys = Object.keys(improvement.productionOutputs);
    if (outputKeys.length > 0) {
      const outputStr = outputKeys.map(k => `${k}:+${improvement.productionOutputs[k]}`).join(', ');
      lines.push(`  Produces: {green-fg}${outputStr}{/green-fg}`);
    }

    const modKeys = Object.keys(improvement.modifiers);
    if (modKeys.length > 0) {
      const modStr = modKeys.map(k => `${k}:${improvement.modifiers[k]}`).join(', ');
      lines.push(`  Bonus: {cyan-fg}${modStr}{/cyan-fg}`);
    }

    lines.push('');
  });

  return lines.join('\n');
}


export function renderAll(ui, state) {
  renderActiveFronts(ui, state);
  renderActiveLaws(ui, state);
  renderLaws(ui, state);
  renderEvent(ui, state);
  renderStats(ui, state);
  renderCombinedInfo(ui, state);
  renderLog(ui, state);
  ui.screen.render();
}
