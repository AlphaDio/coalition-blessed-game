import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { getCohesionTier } from '../game/cohesion.js';
import { formatNumber, formatCohesion, formatResource } from './formatters.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { getAvailableLaws } from '../game/lawDefinitions.js';
import { getAvailableImprovements, isImprovementTierUnlocked } from '../game/improvements/definitions.js';
import { EMERGENCY_LAW_DEFINITIONS, getActiveEmergencyLaws, getEmergencyLawCooldown, canActivateEmergencyLaw } from '../game/emergencyLaws.js';
import { calculateTechPointsPerTick } from '../game/technology.js';
import { MARKET_CONSTANTS } from '../game/constants.js';
import { BANK_THRESHOLD } from '../game/coalitionProcurement.js';
import { TECH_BY_ID } from '../game/technologyDefinitions.js';


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
  const stockpilesBox = createStockpilesBox(grid);
  const lawsBox = createLawsBox(grid);
  const eventBox = createEventBox(grid);
  const logBox = createLogBox(grid);
  const statsBox = createStatsBox(grid);
  const combinedInfoBox = createCombinedInfoBox(grid);
  const { inputBox, commandHistoryBox } = createCommandInputs(screen);
  const logsWindow = createLogsWindow(screen);

  // Disable input on widgets that shouldn't accept text input
  // NOTE: Do NOT disable screen.input as it prevents ALL key events from working!
  disableWidgetInput([eventBox, logBox, activeFrontsBox, activeLawsBox, stockpilesBox, statsBox, combinedInfoBox]);

  return {
    screen,
    lawsBox,
    stockpilesBox,
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

function createStockpilesBox(grid) {
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


function createLawsBox(grid) {
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

function createLogBox(grid) {
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
  combinedInfoBox.currentView = 'empires'; // 'market' | 'armies' | 'empires' | 'queue' | 'empire_detail' | 'stockpiles' | 'commodity_detail'
  combinedInfoBox.scrollOffset = 0;
  combinedInfoBox.selectedRequestIndex = 0; // For request selection
  combinedInfoBox.selectedImprovementIndex = 0; // For improvement selection
  combinedInfoBox.selectedEmpireIndex = 0; // For empire detail view
  combinedInfoBox.selectedCommodityIndex = 0; // For commodity detail view
  return combinedInfoBox;
}

function createCommandInputs(screen) {
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
    case 'emergency':
      label = ' Emergency Powers (ESC: back) ';
      items = buildEmergencyMenuItems(state);
      break;
    case 'requests':
      label = ' Improvement Requests (TAB: cycle, ESC: back) ';
      items = buildRequestMenuItems(state);
      break;
    case 'improvements':
      label = ' Works (TAB: cycle, ESC: back) ';
      items = buildImprovementMenuItems(state);
      break;
     case 'procurement_view':
       label = ' Procurement (↑↓: select, ←→: theta, -/+: throttle, TAB: back) ';
       content = renderProcurementView(state, panel);
       break;
     case 'info_select':
       label = ' Select Info Panel (ESC: back) ';
       items = buildInfoSelectItems();
       break;
     default:
       label = ' Actions ';
       items = buildMainMenuItems(state);
   }

   if (mode !== 'procurement_view') {
     panel.menuItems = items;
     content = formatMenuItemsWithScroll(items, selectedIndex, panel);
   }

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
  // Count active emergency laws
  const activeEmergencyLaws = getActiveEmergencyLaws(state);
  const emergencyHint = activeEmergencyLaws.length > 0 
    ? `${activeEmergencyLaws.length} active`
    : 'Crisis powers';
  
  const items = [
    { id: 'propose_law', label: 'Propose Law', hint: 'TAB: laws', action: 'SWITCH_MODE', mode: 'laws' },
    { id: 'emergency_powers', label: 'Emergency Powers', hint: emergencyHint, action: 'SWITCH_MODE', mode: 'emergency' },
    { id: 'view_requests', label: 'Improvement Requests', hint: 'TAB: requests', action: 'SWITCH_MODE', mode: 'requests' },
    { id: 'view_improvements', label: 'Improvements Queue', hint: 'TAB: improvements', action: 'SWITCH_MODE', mode: 'improvements' },
    { id: 'info_panel', label: 'Info Panel', hint: 'Switch right panel view', action: 'SWITCH_MODE', mode: 'info_select' },
    { id: 'divider1', label: '─────────────────', divider: true },
    { id: 'view_market', label: 'View Market', hint: '[M]', action: 'SET_VIEW', view: 'market' },
    { id: 'view_armies', label: 'View Armies', hint: '[A]', action: 'SET_VIEW', view: 'armies' },
    { id: 'view_empires', label: 'View Empires', hint: '[E]', action: 'SET_VIEW', view: 'empires' },
    { id: 'view_procurement', label: 'View Procurement', hint: '[P]', action: 'SWITCH_MODE', mode: 'procurement_view' },
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

  // Get only laws that meet tier requirements and haven't been enacted
  const availableLaws = getAvailableLaws(state);
  const activeLawCount = getActiveLawCount(state);
  const hasActiveLaw = activeLawCount > 0;
  
  if (availableLaws && availableLaws.length > 0) {
    availableLaws.forEach((lawDef) => {
      const canAfford = state.playerInfluence >= 100;
      const isBlocked = hasActiveLaw || !canAfford;
      const hint = hasActiveLaw
        ? '{yellow-fg}Law already in progress{/yellow-fg}'
        : (canAfford ? `T${lawDef.tier} • 100 inf` : `T${lawDef.tier} • {red-fg}need 100{/red-fg}`);
      
      // Find the original index in lawDefinitions for action handling
      const originalIndex = state.lawDefinitions?.findIndex(l => l.id === lawDef.id) ?? -1;
      
       items.push({
         id: `law_${lawDef.id}`,
         label: `${lawDef.name}`,
         hint: hint,
         action: 'ENACT_LAW',
         lawIndex: originalIndex,
         lawId: lawDef.id,
         disabled: isBlocked,
         detailLine: formatLawEffects(lawDef.coalitionModifiers)
       });
    });
  } else if (state.laws && state.laws.length > 0) {
    state.laws.forEach((law, idx) => {
      const onCooldown = law.currentCooldown > 0;
      const isBlocked = hasActiveLaw || onCooldown;
      const hint = hasActiveLaw
        ? '{yellow-fg}Law already in progress{/yellow-fg}'
        : (onCooldown ? `CD: ${law.currentCooldown}` : '');
      items.push({
        id: `law_${law.id}`,
        label: law.name,
        hint: hint,
        action: 'ENACT_LAW',
        lawIndex: idx,
        disabled: isBlocked
      });
    });
  } else {
    items.push({ id: 'no_laws', label: 'No laws available', info: true });
  }

  return items;
}

/**
 * Build emergency powers menu items
 */
function buildEmergencyMenuItems(state) {
  const items = [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' },
    { id: 'divider_header', label: '─────────────────', divider: true }
  ];

  // Show active emergency laws first
  const activeEmergencyLaws = getActiveEmergencyLaws(state);
  if (activeEmergencyLaws.length > 0) {
    items.push({ id: 'active_header', label: '{yellow-fg}ACTIVE EMERGENCY POWERS{/yellow-fg}', info: true });
    for (const activeLaw of activeEmergencyLaws) {
      const progress = Math.round((1 - activeLaw.remainingDuration / activeLaw.totalDuration) * 100);
      const progressBar = formatProgressBar(progress / 100, 8);
      items.push({
        id: `active_${activeLaw.lawId}`,
        label: `  ${activeLaw.name} ${progressBar}`,
        hint: `${activeLaw.remainingDuration}t left`,
        info: true
      });
    }
    items.push({ id: 'divider_active', label: '─────────────────', divider: true });
  }

  // Show available emergency laws
  items.push({ id: 'available_header', label: 'Available Emergency Powers', info: true });

  for (const def of EMERGENCY_LAW_DEFINITIONS) {
    const check = canActivateEmergencyLaw(def.id, state);
    const cooldown = getEmergencyLawCooldown(def.id, state);

    let hint = '';
    let disabled = false;

    if (!check.canActivate) {
      disabled = true;
      if (cooldown.onCooldown) {
        hint = `{cyan-fg}CD: ${cooldown.remainingTicks}t{/cyan-fg}`;
      } else {
        hint = `{red-fg}${check.reason}{/red-fg}`;
      }
    } else {
      // Show cost preview
      const costs = def.costs_per_tick;
      const costParts = [`${costs.supplies} req/t`];
      for (const [comm, qty] of Object.entries(costs.commodities || {})) {
        costParts.push(`${qty} ${comm}/t`);
      }
      hint = `${def.duration}t • ${costParts.slice(0, 2).join(', ')}`;
    }

    // Format modifiers for detail line
    const modParts = [];
    for (const [mod, val] of Object.entries(def.modifiers)) {
      const sign = val >= 0 ? '+' : '';
      if (mod.includes('multiplier') || mod.includes('output') || mod.includes('efficiency') || mod.includes('speed')) {
        modParts.push(`${mod.replace(/_/g, ' ')}: ${sign}${Math.round(val * 100)}%`);
      } else {
        modParts.push(`${mod.replace(/_/g, ' ')}: ${sign}${val}`);
      }
    }

    items.push({
      id: `emergency_${def.id}`,
      label: def.name,
      hint: hint,
      action: 'ACTIVATE_EMERGENCY',
      emergencyLawId: def.id,
      disabled: disabled,
      detailLine: modParts.slice(0, 3).join(' • ')
    });
  }

  return items;
}

/**
 * Build a comprehensive improvement requests view from scratch
 * Displays categorized improvement suggestions with full details
 */
function buildRequestMenuItems(state) {
  const items = [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' }
  ];

  // Validate data
  if (!state.improvements || !state.improvements.requests) {
    items.push({ id: 'empty', label: 'Improvements system not initialized', info: true });
    return items;
  }

  if (state.improvements.requests.length === 0) {
    items.push({ id: 'empty', label: 'No improvement requests available', info: true });
    return items;
  }

  // Get coalition requisition budget
  const coalitionRequisition = state.coalitionEconomy?.requisition || 0;
  
  // Calculate current building capacity
  const buildingCapacity = (state.improvements.queue || [])
    .filter(i => i.state === 'BUILDING')
    .reduce((sum, i) => sum + (i.capacity || 0), 0);

  // Categorize requests by empire
  const byEmpire = {};
  state.improvements.requests.forEach(request => {
    if (!request.empireId) return;

    const empire = state.empires?.find(e => e.id === request.empireId);
    if (!empire) return;

    // Filter by tier unlock
    if (!isImprovementTierUnlocked(request.tier || 1, state, request.empireId)) {
      return;
    }

    if (!byEmpire[empire.id]) {
      byEmpire[empire.id] = { empire, requests: [] };
    }
    byEmpire[empire.id].requests.push(request);
  });

  const empireIds = Object.keys(byEmpire);
  
  if (empireIds.length === 0) {
    items.push({ id: 'empty', label: 'No unlocked improvement requests', info: true });
    return items;
  }

  // Add header with global info
  items.push({ id: 'header_budget', label: 'Budget:', info: true });
  items.push({
    id: 'budget_info',
    label: `{yellow-fg}${coalitionRequisition}{/yellow-fg} requisition • Max capacity: {cyan-fg}${state.improvements.maxTotalCapacity}{/cyan-fg} (building: {green-fg}${buildingCapacity}{/green-fg})`,
    info: true
  });
  items.push({ id: 'spacer_1', label: '', info: true });

  // Add categorized requests
  empireIds.forEach(empireId => {
    const { empire, requests } = byEmpire[empireId];
    const { label: empireLabel, colorTag } = formatSuggestionLabel(empireId, state);

    // Empire header
    items.push({
      id: `empire_${empireId}`,
      label: `{${colorTag}-fg}${empire.name}{/${colorTag}-fg} {gray-fg}[${empireLabel}]{/gray-fg}`,
      info: true
    });

    // Sort requests by tier (ascending), then name
    const sortedRequests = [...requests].sort((a, b) => {
      const tierDiff = (a.tier || 1) - (b.tier || 1);
      if (tierDiff !== 0) return tierDiff;
      return (a.name || '').localeCompare(b.name || '');
    });

    sortedRequests.forEach((request, idx) => {
      const tierLabel = request.tier ? `T${request.tier}` : 'T1';
      const originalRequestIndex = state.improvements.requests.findIndex(r => r.id === request.id);

      // Check if buildable
      const capacityOk = buildingCapacity + request.capacity <= state.improvements.maxTotalCapacity;
      const budgetOk = coalitionRequisition >= request.suppliesCost;
      const allOk = capacityOk && budgetOk;

      // Status color based on affordability
      const statusColor = allOk ? 'green' : 'red';

      // Build main label with availability indicator
      const availabilityIcon = allOk ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
      const mainLabel = `  ${availabilityIcon} {bold}${request.name}{/bold}`;

      // Build hint string with critical info
      let hintParts = [`${tierLabel}`];
      hintParts.push(`${request.suppliesCost} req`);
      
      if (!budgetOk) {
        hintParts.push(`{red-fg}NEED ${request.suppliesCost - coalitionRequisition}{/red-fg}`);
      }

      hintParts.push(`cap +${request.capacity}`);
      
      if (!capacityOk) {
        const needed = buildingCapacity + request.capacity - state.improvements.maxTotalCapacity;
        hintParts.push(`{red-fg}CAP +${needed}{/red-fg}`);
      }

      if (request.requisitionUpkeep) {
        hintParts.push(`${request.requisitionUpkeep}/turn`);
      }

      const hintStr = hintParts.join(' • ');

      // Build detail line showing benefits
      let detailLine = '';
      const benefits = [];

      // Sustainment costs (what it needs)
      if (request.sustainmentCost && Object.keys(request.sustainmentCost).length > 0) {
        const sustain = Object.entries(request.sustainmentCost)
          .map(([k, v]) => `${k}: {red-fg}${v}{/red-fg}`)
          .join(', ');
        benefits.push(`Needs: ${sustain}`);
      }

      // Production outputs (what it generates)
      if (request.productionOutputs && Object.keys(request.productionOutputs).length > 0) {
        const outputs = Object.entries(request.productionOutputs)
          .map(([k, v]) => `${k}: {green-fg}+${v}{/green-fg}`)
          .join(', ');
        benefits.push(`Produces: ${outputs}`);
      }

      // Modifiers (bonuses)
      if (request.modifiers && Object.keys(request.modifiers).length > 0) {
        const mods = Object.entries(request.modifiers)
          .map(([k, v]) => `${formatImprovementModifier(k, v)}`)
          .join(', ');
        benefits.push(`Bonuses: {cyan-fg}${mods}{/cyan-fg}`);
      }

      if (benefits.length > 0) {
        detailLine = benefits.join(' | ');
      }

      items.push({
        id: `request_${request.id}`,
        label: mainLabel,
        hint: hintStr,
        detailLine: detailLine,
        action: allOk ? 'ACCEPT_REQUEST' : 'NOOP',
        requestIndex: originalRequestIndex,
        requestId: request.id
      });

      // Add explanatory sub-line if not buildable
      if (!allOk) {
        const reasons = [];
        if (!budgetOk) reasons.push(`Not enough requisition ({red-fg}need ${request.suppliesCost - coalitionRequisition} more{/red-fg})`);
        if (!capacityOk) reasons.push(`Exceeds capacity limit`);
        items.push({
          id: `request_${request.id}_reason`,
          label: `      {gray-fg}${reasons.join(', ')}{/gray-fg}`,
          info: true
        });
      }

      // Add description if available
      if (request.description) {
        items.push({
          id: `request_${request.id}_desc`,
          label: `      {gray-fg}${request.description}{/gray-fg}`,
          info: true
        });
      }
    });

    // Spacer between empires
    items.push({ id: `spacer_${empireId}`, label: '', info: true });
  });

  return items;
}

function buildImprovementMenuItems(state) {
  const items = [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' }
  ];

  if (!state.improvements || !state.improvements.queue) {
    items.push({ id: 'no_queue', label: 'No works in progress', info: true });
    return items;
  }

  if (state.improvements.queue.length === 0) {
    items.push({ id: 'no_queue', label: 'No works in progress', info: true });
  } else {
    items.push({ id: 'queue_header', label: 'Works in Progress', info: true });
    state.improvements.queue.forEach((improvement, idx) => {
      const stateLabel = improvement.state || 'BUILDING';
      const progress = improvement.build > 0
        ? Math.min(1, improvement.buildProgress / improvement.build)
        : 0;
      const bar = formatProgressBar(progress, 12);
      const { label, colorTag } = formatSuggestionLabel(improvement.empireId, state);
      items.push({
        id: `improvement_${improvement.id}`,
        label: `${improvement.name} ${bar} [${stateLabel}] {${colorTag}-fg}[${label}]{/${colorTag}-fg}`,
        hint: 'cancel',
        detailLine: formatImprovementDetailLine(improvement),
        action: 'CANCEL_IMPROVEMENT',
        improvementIndex: idx
      });
    });
  }

  items.push({ id: 'add_header', label: 'Add to Queue', info: true });


  if (!state.improvements.requests || state.improvements.requests.length === 0) {
    items.push({ id: 'no_requests', label: 'No requests available', info: true });
    return items;
  }

  const buildingCapacity = state.improvements.queue
    .filter(i => i.state === 'BUILDING')
    .reduce((sum, i) => sum + i.capacity, 0);

  const filteredRequests = state.improvements.requests.filter(request => {
    if (!request.empireId) {
      return false;
    }
    return isImprovementTierUnlocked(request.tier || 1, state, request.empireId);
  });

  if (filteredRequests.length === 0) {
    items.push({ id: 'no_requests', label: 'No requests available', info: true });
    return items;
  }

   filteredRequests.forEach((request) => {
    const { label, colorTag } = formatSuggestionLabel(request.empireId, state);
    const tierLabel = request.tier ? `T${request.tier}` : 'T1';
    const originalIndex = state.improvements.requests.findIndex(r => r.id === request.id);

    const capacityNeeded = buildingCapacity + request.capacity;
    const capacityOk = capacityNeeded <= state.improvements.maxTotalCapacity;

    // Check coalition requisition for improvement cost
    const coalitionRequisition = state.coalitionEconomy?.requisition || 0;
    const budgetOk = coalitionRequisition >= request.suppliesCost;
    const disabled = !capacityOk || !budgetOk;

    let hint = `${tierLabel} • ${request.suppliesCost} req`;
    if (request.requisitionUpkeep) {
      hint += ` • ${request.requisitionUpkeep}/turn`;
    }

    // Add benefit details
    const benefitParts = [];
    const sustainKeys = Object.keys(request.sustainmentCost || {});
    if (sustainKeys.length > 0) {
      const sustainStr = sustainKeys.map(k => `${k}:${request.sustainmentCost[k]}`).join(', ');
      benefitParts.push(`-${sustainStr}`);
    }

    const outputKeys = Object.keys(request.productionOutputs || {});
    if (outputKeys.length > 0) {
      const outputStr = outputKeys.map(k => `${k}:+${request.productionOutputs[k]}`).join(', ');
      benefitParts.push(`+${outputStr}`);
    }

    const modKeys = Object.keys(request.modifiers || {});
    if (modKeys.length > 0) {
      const modStr = modKeys.map(k => formatImprovementModifier(k, request.modifiers[k])).join('  ');
      benefitParts.push(modStr);
    }

    const benefitHint = benefitParts.length > 0 ? ` • ${benefitParts.join(' -> ')}` : '';
    hint += benefitHint;

    if (!capacityOk) {
      hint = `{red-fg}cap ${capacityNeeded}/${state.improvements.maxTotalCapacity}{/red-fg}`;
    } else if (!budgetOk) {
      hint = `{red-fg}need ${request.suppliesCost} req (have ${state.coalitionEconomy?.requisition || 0}){/red-fg}`;
    }

    items.push({
      id: `request_${request.id}`,
      label: `${request.name} {${colorTag}-fg}[${label}]{/${colorTag}-fg}`,
      hint: hint,
      detailLine: formatImprovementDetailLine(request),
      action: 'ACCEPT_REQUEST',
      requestIndex: originalIndex,
      requestId: request.id,
      disabled
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
  if (!suggestedBy) {
    return { label: 'Unknown', colorTag: 'gray' };
  }


  const empire = state.empires?.find(e => e.id === suggestedBy || e.name === suggestedBy);
  const label = empire?.name || suggestedBy;
  const colorTag = empire?.color || 'yellow';
  return { label, colorTag };
}

function formatImprovementModifier(key, value) {
  const sign = value > 0 ? '+' : '';
  
   const percentageModifiers = [
     'research_speed', 'industrial_output', 'supply_efficiency',
     'market_efficiency', 'population_growth', 'energy_production',
     'combat_strength', 'defense_bonus', 'speed_bonus',
     'law_progress_speed', 'tick_delay_multiplier', 'coalition_construction_mult',
     'coalition_construction_add'
   ];
  
  if (percentageModifiers.includes(key)) {
    return `${sign}${(value * 100).toFixed(0)}% ${key.replace(/_/g, ' ')}`;
  }
  
  return `${sign}${value} ${key.replace(/_/g, ' ')}`;
}

function buildInfoSelectItems() {
  return [
    { id: 'back', label: '← Back', hint: '[ESC]', action: 'SWITCH_MODE', mode: 'main' },
    { id: 'divider', label: '─────────────────', divider: true },
    { id: 'market', label: 'Market Economy', hint: '[M]', action: 'SET_VIEW', view: 'market' },
    { id: 'armies', label: 'Armies', hint: '[A]', action: 'SET_VIEW', view: 'armies' },
    { id: 'empires', label: 'Empires', hint: '[E]', action: 'SET_VIEW', view: 'empires' },
    { id: 'stockpiles', label: 'Coalition Stockpiles', hint: '[S]', action: 'SET_VIEW', view: 'stockpiles' },
    { id: 'procurement', label: 'Coalition Procurement', hint: '[P]', action: 'SET_VIEW', view: 'procurement' },
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
      if (item.detailLine) {
        lines.push(`{white-fg}   ${item.detailLine}{/white-fg}`);
      }
    } else {
      lines.push(`${marker}{${labelColor}-fg}${item.label}{/${labelColor}-fg}${hintText}`);
    }
  });

  return lines.join('\n');
}

/**
 * Format menu items with automatic scrolling based on selected index
 * Ensures the selected item is always visible in the viewport
 */
function formatMenuItemsWithScroll(items, selectedIndex, panel) {
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
      if (item.detailLine) {
        lines.push(`{white-fg}   ${item.detailLine}{/white-fg}`);
      }
    } else {
      lines.push(`${marker}{${labelColor}-fg}${item.label}{/${labelColor}-fg}${hintText}`);
    }
  });

  // Get the panel's visible height (approximate - blessed box height minus margins/borders)
  const visibleHeight = (panel.height || 20) - 2; // Account for borders/padding
  
  // Calculate scroll offset to keep selected item visible
  const scrollOffset = panel.scrollOffset || 0;
  let newScrollOffset = scrollOffset;

  // If selected item is above visible area, scroll up
  if (selectedIndex < scrollOffset) {
    newScrollOffset = selectedIndex;
  }
  // If selected item is below visible area, scroll down
  else if (selectedIndex >= scrollOffset + visibleHeight) {
    newScrollOffset = Math.max(0, selectedIndex - visibleHeight + 1);
  }

  panel.scrollOffset = newScrollOffset;

  // Slice visible lines based on scroll offset
  const visibleLines = lines.slice(newScrollOffset, newScrollOffset + visibleHeight);
  const content = visibleLines.join('\n');

  // Add scroll indicator if there's more content
  let finalContent = content;
  if (lines.length > visibleHeight) {
    const scrollPct = ((newScrollOffset / Math.max(1, lines.length - visibleHeight)) * 100).toFixed(0);
    finalContent += `\n{gray-fg}[Scroll: ${newScrollOffset + 1}-${Math.min(newScrollOffset + visibleHeight, lines.length)}/${lines.length}]{/gray-fg}`;
  }

  return finalContent;
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

export function renderStockpiles(ui, state) {
  if (!ui.stockpilesBox) {
    return;
  }

  const stockpiles = state.stockpiles || {};
  const commodityMap = loadCommodityMap(state.market || {});
  const entries = Object.entries(stockpiles)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const commodity = commodityMap.get(key) || { key, name: key, tier: 't1' };
      return { key, value, commodity };
    })
    .sort((a, b) => {
      const tierOrder = { t1: 1, t2: 2, t3: 3, t4: 4 };
      const tierDiff = (tierOrder[a.commodity.tier] || 5) - (tierOrder[b.commodity.tier] || 5);
      if (tierDiff !== 0) return tierDiff;
      return (a.commodity.name || a.key).localeCompare(b.commodity.name || b.key);
    });

  if (entries.length === 0) {
    ui.stockpilesBox.setContent('{center}{yellow-fg}No stockpiles{/yellow-fg}{/center}');
    ui.stockpilesBox.style.border.fg = 'white';
    return;
  }

  const lines = entries.map(({ commodity, value }) => {
    const displayName = commodity.name || commodity.key;
    return `  ${formatResource(displayName, value)}`;
  });
  ui.stockpilesBox.setContent(lines.join('\n'));
  ui.stockpilesBox.style.border.fg = 'green';
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
    const effectiveApproval = empire.approval + (empire.stats.approvalBonus || 0);
    content += `  ${empire.name}: Approval ${effectiveApproval >= 0 ? '+' : ''}${effectiveApproval.toFixed(0)}\n`;

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

  // Guard against undefined or NaN values
  const leftMP = Math.floor(leftArmy.mp?.current || 0);
  const leftMaxMP = leftArmy.mp?.max || 1;
  const rightMP = Math.floor(rightArmy.mp?.current || 0);
  const rightMaxMP = rightArmy.mp?.max || 1;

  const leftPct = leftMaxMP > 0 ? ((leftMP / leftMaxMP) * 100).toFixed(0) : '0';
  const rightPct = rightMaxMP > 0 ? ((rightMP / rightMaxMP) * 100).toFixed(0) : '0';

  const battleType = getBattleTypeTag(front);
  const barWidth = 40;
  const mpBar = buildBattleMpBar(
    typeof leftArmy.mp?.current === 'number' && !isNaN(leftArmy.mp.current) ? leftArmy.mp.current : 0,
    typeof rightArmy.mp?.current === 'number' && !isNaN(rightArmy.mp.current) ? rightArmy.mp.current : 0,
    barWidth
  );
  const mpSpacing = '  '.repeat(Math.max(1, Math.floor(barWidth / 10) - 5));
  const moraleSpacing = '  '.repeat(Math.max(1, Math.floor(barWidth / 10)));

  const leftMO = Math.floor(leftArmy.mo?.current || 0);
  const rightMO = Math.floor(rightArmy.mo?.current || 0);
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
  // Guard against NaN or invalid values
  const safeLeftMp = typeof leftMp === 'number' && !isNaN(leftMp) ? Math.max(0, leftMp) : 0;
  const safeRightMp = typeof rightMp === 'number' && !isNaN(rightMp) ? Math.max(0, rightMp) : 0;
  const totalMP = safeLeftMp + safeRightMp;
  const leftBarWidth = totalMP > 0 ? Math.floor((safeLeftMp / totalMP) * barWidth) : Math.floor(barWidth / 2);
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
  } else {
    const legitimacy = (lawProcess.meters && lawProcess.meters.legitimacy) || 0;
    const unrest = (lawProcess.meters && lawProcess.meters.unrest) || 0;
    lines.push(`Legitimacy: ${(legitimacy * 100).toFixed(0)}%  Unrest: ${(unrest * 100).toFixed(0)}%`);
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
  const legitimacy = (lawProcess.meters && lawProcess.meters.legitimacy) || 0;
  const unrest = (lawProcess.meters && lawProcess.meters.unrest) || 0;

  const momBar = buildProgressBar(momentum, 20);
  const rejBar = buildProgressBar(rejectPressure, 20);

  return [
    `Momentum:       {green-fg}${momBar}{/green-fg} ${(momentum * 100).toFixed(0)}%`,
    `Reject Pressure: {red-fg}${rejBar}{/red-fg} ${(rejectPressure * 100).toFixed(0)}%`,
    `Legitimacy:     ${(legitimacy * 100).toFixed(0)}%`,
    `Unrest:         ${(unrest * 100).toFixed(0)}%`
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
function renderMarketView(state, ui) {
  if (!state.market || Object.keys(state.market).length === 0) {
    return '{center}{yellow-fg}Market not initialized{/yellow-fg}{/center}';
  }

  const selectedIndex = ui?.combinedInfoBox?.selectedCommodityIndex || 0;
  const commodityMap = loadCommodityMap(state.market);
  const sortedCommodities = sortMarketCommodities(state.market, commodityMap);

   const lines = [
    '{bold}{green-fg}Commodity{/green-fg}     {cyan-fg}Price{/cyan-fg}     {yellow-fg}Buy{/yellow-fg}   {red-fg}Sell{/red-fg}   {magenta-fg}Vol{/magenta-fg}{/bold}',
    '─'.repeat(60)
  ];

  sortedCommodities.forEach((entry, index) => {
    const isSelected = index === selectedIndex;
    const prefix = isSelected ? '{bold}{cyan-bg}' : '';
    const suffix = isSelected ? '{/bold}{/cyan-bg}' : '';
    lines.push(`${prefix}${formatMarketRow(entry)}${suffix}`);
  });

  appendCoalitionEconomyInfo(lines, state.coalitionEconomy);

  lines.push('');
  lines.push('{gray-fg}Controls: ↑↓ select commodity, M: detail view{/gray-fg}');

  return lines.join('\n');
}

/**
 * Render market orders view - shows all active buy and sell orders
 */
function renderMarketOrdersView(state) {
  if (!state.marketOrders) {
    return '{center}{yellow-fg}No market orders{/yellow-fg}{/center}';
  }

  const buyOrders = state.marketOrders.buyOrders || [];
  const sellOffers = state.marketOrders.sellOffers || [];

  // Filter to unfilled orders
  const activeBuys = buyOrders.filter(o => (o.filled_qty || 0) < o.qty);
  const activeSells = sellOffers.filter(o => (o.filled_qty || 0) < o.qty);

  if (activeBuys.length === 0 && activeSells.length === 0) {
    return '{center}{yellow-fg}No active market orders{/yellow-fg}{/center}';
  }

  const lines = ['{bold}Active Market Orders:{/bold}', ''];

  // Group buy orders by commodity
  const buysByCommodity = {};
  activeBuys.forEach(order => {
    if (!buysByCommodity[order.commodity]) {
      buysByCommodity[order.commodity] = [];
    }
    buysByCommodity[order.commodity].push(order);
  });

  // Group sell orders by commodity
  const sellsByCommodity = {};
  activeSells.forEach(order => {
    if (!sellsByCommodity[order.commodity]) {
      sellsByCommodity[order.commodity] = [];
    }
    sellsByCommodity[order.commodity].push(order);
  });

   // Show buy orders by commodity
  if (activeBuys.length > 0) {
    lines.push('{yellow-fg}Buy Orders:{/yellow-fg}');
    Object.entries(buysByCommodity).forEach(([commodity, orders]) => {
      const totalQty = orders.reduce((sum, o) => sum + (o.qty - (o.filled_qty || 0)), 0);
      const impOrders = orders.filter(o => o.tags?.originator);
      const impCount = impOrders.length;
      const impLabel = impCount > 0 ? ` (${impCount} from improvements)` : '';
      lines.push(`  {cyan-fg}${commodity}{/cyan-fg}: ${formatVolume(totalQty)} total (${orders.length} orders)${impLabel}`);
    });
    lines.push('');
  }

  // Show sell orders by commodity
  if (activeSells.length > 0) {
    lines.push('{green-fg}Sell Offers:{/green-fg}');
    Object.entries(sellsByCommodity).forEach(([commodity, orders]) => {
      const totalQty = orders.reduce((sum, o) => sum + (o.qty - (o.filled_qty || 0)), 0);
      const impOrders = orders.filter(o => o.tags?.originator);
      const impCount = impOrders.length;
      const impLabel = impCount > 0 ? ` (${impCount} from improvements)` : '';
      lines.push(`  {cyan-fg}${commodity}{/cyan-fg}: ${formatVolume(totalQty)} total (${orders.length} orders)${impLabel}`);
    });
    lines.push('');
  }

  // Show improvement orders detail if any
  const impSellOrders = activeSells.filter(o => o.tags?.originator);
  if (impSellOrders.length > 0) {
    lines.push('{blue-fg}Improvement Production:{/blue-fg}');
    impSellOrders.forEach(order => {
      const originator = order.tags?.originator || 'unknown';
      const remaining = order.qty - (order.filled_qty || 0);
      lines.push(`  {cyan-fg}${order.commodity}{/cyan-fg}: ${formatVolume(remaining)} @ ${order.ask_price?.toFixed(2)} (${originator})`);
    });
    lines.push('');
  }

  // Summary
  lines.push(`{gray-fg}Total: ${activeBuys.length} buy orders, ${activeSells.length} sell offers${impSellOrders.length > 0 ? ' (' + impSellOrders.length + ' from improvements)' : ''}{/gray-fg}`);
  lines.push(`{gray-fg}Controls: M: market view, C: commodity detail{/gray-fg}`);

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
    const empire = empireMap.get(army.empireId);
    const empireName = empire?.name || 'Unknown';
    lines.push('', formatArmyBlock(army, empireName, empire));
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
    lines.push('', formatEmpireBlock(empire, regularArmies, state));
  });

  return lines.join('\n');
}

function renderStockpilesView(state) {
  // Aggregate all commodities from all empires' stockpiles
  const aggregatedStockpiles = {};
  
  if (state.empires) {
    state.empires.forEach(empire => {
      if (empire.stockpiles) {
        Object.entries(empire.stockpiles).forEach(([key, value]) => {
          if (value > 0) {
            aggregatedStockpiles[key] = (aggregatedStockpiles[key] || 0) + value;
          }
        });
      }
    });
  }
  
  // Add coalition-level stockpiles (like supplies)
  if (state.stockpiles) {
    Object.entries(state.stockpiles).forEach(([key, value]) => {
      if (value > 0) {
        aggregatedStockpiles[key] = (aggregatedStockpiles[key] || 0) + value;
      }
    });
  }
  
  const commodityMap = loadCommodityMap(state.market || {});
  const entries = Object.entries(aggregatedStockpiles)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const commodity = commodityMap.get(key) || { key, name: key, tier: 't1' };
      return { key, value, commodity };
    })
    .sort((a, b) => {
      const tierOrder = { t1: 1, t2: 2, t3: 3, t4: 4 };
      const tierDiff = (tierOrder[a.commodity.tier] || 5) - (tierOrder[b.commodity.tier] || 5);
      if (tierDiff !== 0) return tierDiff;
      return (a.commodity.name || a.key).localeCompare(b.commodity.name || b.key);
    });

  if (entries.length === 0) {
    return '{center}{yellow-fg}No stockpiles{/yellow-fg}{/center}';
  }

  const lines = ['{bold}Coalition Stockpiles:{/bold}'];
  entries.forEach(({ commodity, value }) => {
    const displayName = commodity.name || commodity.key;
    lines.push(`  ${formatResource(displayName, value)}`);
  });

   return lines.join('\n');
}

function renderProcurementView(state, ui) {
  if (!ui) return '{center}{yellow-fg}UI not provided{/yellow-fg}{/center}';
  if (!state.coalitionEconomy) {
    return '{center}{yellow-fg}Coalition procurement not initialized{/yellow-fg}{/center}';
  }

   const ce = state.coalitionEconomy;
   const selectedIndex = ui?.selectedCommodityIndex ?? ui?.combinedInfoBox?.selectedCommodityIndex ?? 0;
   const lines = ['{bold}Coalition Procurement Status{/bold}'];

  // Treasury and spending info
   const treasury = ce.treasury_credits || 0;
   const allowance = ce.allowance_credits || 0;
   const reserve = ce.reserve_floor_credits || 0;
   const requisition = ce.requisition || 0;

   lines.push(`Treasury: {green-fg}${formatNumber(treasury, 0)}{/green-fg} credits`);
   lines.push(`Allowance: {cyan-fg}${formatNumber(allowance, 0)}{/cyan-fg} credits`);
   lines.push(`Reserve Floor: {yellow-fg}${formatNumber(reserve, 0)}{/yellow-fg} credits`);
   lines.push(`Requisition: {magenta-fg}${formatNumber(requisition, 0)}{/magenta-fg}`);

  // Bank state - show total progress percentage
  const bank = ce.stockpile_bank || {};
  const bankTotal = Object.values(bank).reduce((sum, qty) => sum + qty, 0);
  const bankPercent = BANK_THRESHOLD > 0 ? Math.min(100, Math.floor((bankTotal / BANK_THRESHOLD) * 100)) : 0;
  lines.push(`Bank: {yellow-fg}${bankPercent}%{/yellow-fg}`);

  lines.push('');

  // Commodity table header
  lines.push('{bold}Commodity{/bold}  {bold}Stockpile{/bold}  {bold}Theta{/bold}  {bold}Threshold{/bold}  {bold}Throttle{/bold}');
  lines.push('─'.repeat(60));

  const commodityMap = loadCommodityMap(state.market || {});
  const sortedCommodities = sortMarketCommodities(state.market || {}, commodityMap);

   sortedCommodities.forEach((entry, index) => {
     const { key, commodity, marketState } = entry;
     const stockpile = ce.stockpiles?.get(key) || 0;
     const settings = ce.per_commodity_settings?.get(key) || {};
     const theta = ce.procurement?.theta_preset_by_commodity?.[key] || settings.theta_preset || 'Balanced';
     const throttle = (settings.spend_throttle || 0.75) * 100;

    // Calculate threshold price
    const refPrice = marketState.floor_price || marketState.last_price || marketState.price || 1.0;
    const thetaMultiplier = { Scavenge: 0.80, Frugal: 0.90, Balanced: 1.00, Assertive: 1.10, Emergency: 1.25 }[theta] || 1.00;
    const threshold = refPrice * thetaMultiplier;

    const name = commodity.name || key;
   const displayName = name.length > 14 ? name.substring(0, 12) + '..' : name;
   const namePad = ' '.repeat(Math.max(0, 14 - displayName.length));

    const stockpileStr = formatVolume(stockpile).padStart(8);
    const thetaStr = theta.substring(0, 4).padStart(7);
    const thresholdStr = threshold.toFixed(2).padStart(9);
    const throttleStr = `${throttle.toFixed(0)}%`.padStart(8);

    const isSelected = index === selectedIndex;
    const prefix = isSelected ? '{bold}{cyan-bg}' : '';
    const suffix = isSelected ? '{/bold}{/cyan-bg}' : '';

    lines.push(`${prefix}${displayName}${namePad} ${stockpileStr}  ${thetaStr}  ${thresholdStr}  ${throttleStr}${suffix}`);
  });

  // Add instructions
  lines.push('');
  lines.push('{gray-fg}Controls: ↑↓ select commodity, ←→ adjust theta, -/+ adjust throttle{/gray-fg}');

  return lines.join('\n');
}

function renderEmpireDetailView(state, ui) {
  if (!state.empires || state.empires.length === 0) {
    return '{center}{yellow-fg}No empires{/yellow-fg}{/center}';
  }

  const selectedIndex = ui?.combinedInfoBox?.selectedEmpireIndex || 0;
  const empireIndex = Math.min(selectedIndex, state.empires.length - 1);
  const empire = state.empires[empireIndex];
  if (!empire) {
    return '{center}{yellow-fg}No empire data{/yellow-fg}{/center}';
  }

  const commodityMap = loadCommodityMap(state.market || {});
  const lines = [`{bold}${empire.name}{/bold}`];

  const effectiveApproval = empire.approval + (empire.stats.approvalBonus || 0);
  const approval = `${effectiveApproval >= 0 ? '+' : ''}${effectiveApproval.toFixed(0)}`;
  const stabilityValue = empire.stability !== undefined ? empire.stability.toFixed(0) : 'N/A';
  let stabilityDisplay = stabilityValue;
  if (empire.stability !== undefined) {
    if (empire.stability < 40) {
      stabilityDisplay = `{red-fg}${stabilityValue}{/red-fg}`;
    } else if (empire.stability < 60) {
      stabilityDisplay = `{yellow-fg}${stabilityValue}{/yellow-fg}`;
    }
  }

  lines.push(`Approval: ${approval}  Stability: ${stabilityDisplay}`);

   if (empire.stats) {
     const statParts = [];
     statParts.push(`Population: ${formatNumber(empire.stats.population || 0)}`);
     statParts.push(`Influence: ${formatNumber(empire.stats.influence || 0)}`);
     if (empire.stats.tech_rate_bonus) {
       statParts.push(`Tech Bonus: +${formatNumber(empire.stats.tech_rate_bonus * 100, 0)}%`);
     }
     lines.push(statParts.join('  '));
   }

   const multiplier = empire.modifiers?.multiplication || 1.0;
   if (multiplier !== 1.0) {
     lines.push(`Production Multiplier: {green-fg}${multiplier.toFixed(1)}x{/green-fg}`);
   }

   if (empire.budget_credits !== undefined) {
    lines.push(`Budget: {green-fg}${formatNumber(empire.budget_credits, 0)}{/green-fg} credits`);
  }

  if (empire.economy_spend) {
    const needsSpend = formatNumber(empire.economy_spend.needs || 0, 0);
    const wantsSpend = formatNumber(empire.economy_spend.wants || 0, 0);
    lines.push(`Spend/tick: Needs {yellow-fg}${needsSpend}{/yellow-fg}  Wants {cyan-fg}${wantsSpend}{/cyan-fg}`);
  }

  if (empire.production?.outputs_per_tick) {
    const outputKeys = Object.keys(empire.production.outputs_per_tick);
    if (outputKeys.length > 0) {
      let totalProduceCredits = 0;
      const outputStr = outputKeys.map(key => {
        const qty = empire.production.outputs_per_tick[key];
        const marketPrice = state.market?.[key]?.price || 0;
        const askPrice = marketPrice * MARKET_CONSTANTS.SELL_PRICE_DISCOUNT;
        totalProduceCredits += qty * askPrice;
        const commodity = commodityMap.get(key);
        const name = commodity?.name || key;
        return `${name}:+${formatVolume(qty)}`;
      }).join(', ');
      const creditsStr = formatNumber(totalProduceCredits, 0);
      lines.push(`Produces: {green-fg}${outputStr}{/green-fg}`);
      lines.push(`Output value: {green-fg}${creditsStr}{/green-fg} credits/tick`);
    }
  }

  const needLines = formatDemandLine('Needs', empire.needs?.per_pop, commodityMap);
  if (needLines) {
    lines.push(needLines);
  }
  const wantLines = formatDemandLine('Wants', empire.wants?.per_pop, commodityMap);
  if (wantLines) {
    lines.push(wantLines);
  }

  if (empire.stockpiles && Object.keys(empire.stockpiles).length > 0) {
    const stockLines = Object.entries(empire.stockpiles)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => {
        const commodity = commodityMap.get(key);
        const name = commodity?.name || key;
        return `${name}:${formatVolume(value)}`;
      });
    if (stockLines.length > 0) {
      lines.push(`Stockpiles: ${stockLines.join(', ')}`);
    }
  }

  const marketOrders = formatEmpireMarketOrders(state, empire, commodityMap);
  if (marketOrders.length > 0) {
    lines.push('', '{bold}Market Orders:{/bold}', ...marketOrders);
  }

   if (empire.techPoints !== undefined && empire.techThreshold !== undefined) {
     const progress = Math.min(1, empire.techPoints / empire.techThreshold);
     const barWidth = 14;
     const filledWidth = Math.floor(progress * barWidth);
     const emptyWidth = barWidth - filledWidth;
     const techBar = `{blue-fg}[${'#'.repeat(filledWidth)}${'-'.repeat(emptyWidth)}]{/blue-fg}`;
     const pct = (progress * 100).toFixed(0);
     lines.push(`Research: ${techBar} ${pct}%`);
   }

   // Show technologies for this empire
   if (empire.technologies && empire.technologies.length > 0) {
     lines.push('', '{bold}Technologies:{/bold}');
     empire.technologies.forEach(techId => {
       const techDef = TECH_BY_ID[techId];
       const name = techDef?.name || techId;
       lines.push(`  ${name}`);
     });
   }

   // Show active improvements for this empire
   if (state.improvements?.queue) {
     const empireImprovements = state.improvements.queue.filter(i => i.empireId === empire.id && (i.state === 'ACTIVE' || i.state === 'DEGRADED'));
     if (empireImprovements.length > 0) {
       lines.push('', '{bold}Improvements:{/bold}');
       empireImprovements.forEach(imp => {
         const stateIcon = imp.state === 'DEGRADED' ? '{yellow-fg}[D]{/yellow-fg}' : '';
         lines.push(`  ${imp.name}${stateIcon}`);
       });
     }
   }

   // Diplomatic relations
  const relations = state.diplomacy?.relations?.[empire.id];
  if (relations && Object.keys(relations).length > 0) {
    const relationLines = Object.entries(relations)
      .map(([otherId, relation]) => {
        const otherEmpire = state.empires.find(e => e.id === otherId);
        const otherName = otherEmpire?.name || otherId;
        const sign = relation >= 0 ? '+' : '';
        const color = relation > 0 ? 'green' : relation < 0 ? 'red' : 'white';
        return `{${color}-fg}${otherName}: ${sign}${relation}{/${color}-fg}`;
      });
    if (relationLines.length > 0) {
      lines.push('', '{bold}Diplomatic Relations:{/bold}');
      lines.push(`  ${relationLines.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function renderCommodityDetailView(state, ui) {
  if (!state.market || Object.keys(state.market).length === 0) {
    return '{center}{yellow-fg}Market not initialized{/yellow-fg}{/center}';
  }

  const selectedIndex = ui?.combinedInfoBox?.selectedCommodityIndex || 0;
  const commodityMap = loadCommodityMap(state.market);
  const sortedCommodities = sortMarketCommodities(state.market, commodityMap);
  const entry = sortedCommodities[selectedIndex];

  if (!entry) {
    return '{center}{yellow-fg}No commodity selected{/yellow-fg}{/center}';
  }

  const { key, commodity, marketState } = entry;
  const name = commodity.name || key;

  const lines = [`{bold}${name}{/bold} (${key})`];

  // Price information
  const price = marketState.price || 0;
  const lastPrice = marketState.last_price || price;
  const priceChange = price - lastPrice;
  const priceChangePct = lastPrice > 0 ? (priceChange / lastPrice) * 100 : 0;
  const changeStr = priceChange >= 0 ? `+${priceChange.toFixed(2)} (+${priceChangePct.toFixed(1)}%)` : `${priceChange.toFixed(2)} (${priceChangePct.toFixed(1)}%)`;
  const changeColor = priceChange > 0 ? 'green' : priceChange < 0 ? 'red' : 'cyan';

  lines.push(`Current Price: {cyan-fg}${price.toFixed(2)}{/cyan-fg} credits`);
  lines.push(`Change: {${changeColor}-fg}${changeStr}{/${changeColor}-fg}`);

  // Market activity
  const demand = marketState.demand_qty || 0;
  const supply = marketState.supply_qty || 0;
  const traded = marketState.traded_qty || 0;

  lines.push(`Demand: {yellow-fg}${formatVolume(demand)}{/yellow-fg}  Supply: {red-fg}${formatVolume(supply)}{/red-fg}  Traded: {magenta-fg}${formatVolume(traded)}{/magenta-fg}`);

  // Market orders from state.marketOrders
  const marketOrders = state.marketOrders || {};
  const buyOrders = (marketOrders.buyOrders || []).filter(o => o.commodity === key && (o.filled_qty || 0) < o.qty);
  const sellOrders = (marketOrders.sellOffers || []).filter(o => o.commodity === key && (o.filled_qty || 0) < o.qty);

  if (buyOrders.length > 0) {
    lines.push('', '{bold}Buy Orders:{/bold}');
    buyOrders.forEach(order => {
      const remaining = Math.max(0, order.qty - (order.filled_qty || 0));
      const price = order.max_price ?? order.ask_price ?? 0;
      const empire = state.empires.find(e => e.id === order.owner_id);
      const empireName = empire?.name || order.owner_id;
      lines.push(`  ${empireName}: ${formatVolume(remaining)} @ ${price.toFixed(2)}`);
    });
  }

  if (sellOrders.length > 0) {
    lines.push('', '{bold}Sell Offers:{/bold}');
    sellOrders.forEach(order => {
      const remaining = Math.max(0, order.qty - (order.filled_qty || 0));
      const price = order.ask_price ?? order.max_price ?? 0;
      const empire = state.empires.find(e => e.id === order.owner_id);
      const empireName = empire?.name || order.owner_id;
      lines.push(`  ${empireName}: ${formatVolume(remaining)} @ ${price.toFixed(2)}`);
    });
  }

  // Coalition stockpiles (bank)
  const bankQty = state.coalitionEconomy?.stockpile_bank?.[key] || 0;
  const readyQty = state.coalitionEconomy?.stockpile_ready?.[key] || 0;
  const totalStockpile = bankQty + readyQty;
  if (totalStockpile > 0) {
    const status = readyQty > 0 ? '{green-fg}[READY]{/green-fg}' : `{yellow-fg}[${bankQty}/${BANK_THRESHOLD}]{/yellow-fg}`;
    lines.push('', `{bold}Coalition Stockpile:{/bold} ${status}`);
    lines.push(`  ${formatVolume(totalStockpile)} units`);
  }

  // Empire stockpiles
  const empireStockpiles = [];
  state.empires?.forEach(empire => {
    const stockpile = empire.stockpiles?.[key] || 0;
    if (stockpile > 0) {
      empireStockpiles.push({ empire: empire.name, stockpile });
    }
  });

  if (empireStockpiles.length > 0) {
    lines.push('', '{bold}Empire Stockpiles:{/bold}');
    empireStockpiles.slice(0, 10).forEach(({ empire, stockpile }) => {
      lines.push(`  ${empire}: ${formatVolume(stockpile)}`);
    });
    if (empireStockpiles.length > 10) {
      lines.push(`  ...${empireStockpiles.length - 10} more`);
    }
  }

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
  content = viewConfig.render(state, ui);

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
    label: ' Market Economy (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'green',
    render: renderMarketView
  },
  market_orders: {
    label: ' Market Orders (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'cyan',
    render: renderMarketOrdersView
  },
  armies: {
    label: ' Armies (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'cyan',
    render: renderArmiesView
  },
  empires: {
    label: ' Empires (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'yellow',
    render: renderEmpiresView
  },
  stockpiles: {
    label: ' Coalition Stockpiles (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'green',
    render: renderStockpilesView
  },
  procurement: {
    label: ' Coalition Procurement (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'magenta',
    render: renderProcurementView
  },
  queue: {
    label: ' Works (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'blue',
    render: renderImprovementsQueueView
  },
  empire_detail: {
    label: ' Empire Detail (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'yellow',
    render: renderEmpireDetailView
  },
  commodity_detail: {
    label: ' Commodity Detail (m/a/e/s/w: switch, [/]: cycle) ',
    borderColor: 'green',
    render: renderCommodityDetailView
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
  
  // Display current target
  const targetEmpire = state.empires?.find(empire => empire.id === state.scourgeTargetEmpireId);
  if (targetEmpire) {
    lines.push(`{bold}Scourge Target:{/bold} ${targetEmpire.name}`);
  }
  
  // Display next predicted target
  if (state.scourgePrediction && state.scourgePrediction.targetEmpireId) {
    const predictedEmpire = state.empires?.find(empire => empire.id === state.scourgePrediction.targetEmpireId);
    if (predictedEmpire) {
      const confidenceBadge = 
        state.scourgePrediction.confidenceLevel === 'high' ? '{green-fg}HIGH{/green-fg}' :
        state.scourgePrediction.confidenceLevel === 'medium' ? '{yellow-fg}MEDIUM{/yellow-fg}' :
        '{red-fg}LOW{/red-fg}';
      
      let eta = 'UNKNOWN';
      if (state.scourgePrediction.estimatedTurnsToNextBattle !== null) {
        eta = `${state.scourgePrediction.estimatedTurnsToNextBattle} turns`;
        if (state.scourgePrediction.uncertaintyRange?.min !== null) {
          eta += ` ({cyan-fg}±${state.scourgePrediction.uncertaintyRange.max - state.scourgePrediction.estimatedTurnsToNextBattle}{/cyan-fg})`;
        }
      }
      
      lines.push(`{bold}Next Target:{/bold} ${predictedEmpire.name} (ETA: ${eta}, Confidence: ${confidenceBadge})`);
    }
  }
  
   lines.push('', '{bold}Stockpiles:{/bold}');
   lines.push(`  ${formatResource('Requisition', state.coalitionEconomy?.requisition || 0)}`, '');

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

export function loadCommodityMap(market) {
  // Load resources to get commodity names
  let commodities = [];
  try {
    const resourcesPath = path.join(__dirname, '..', '..', 'modules', 'resources.yaml');
    const content = fs.readFileSync(resourcesPath, 'utf8');
    const doc = yaml.load(content);
    commodities = doc.resources?.commodities || [];
  } catch (error) {
    // Fallback: use market keys
    commodities = Object.keys(market).map(key => ({ key, name: key }));
  }

  return new Map(commodities.map(c => [c.key, c]));
}

export function sortMarketCommodities(market, commodityMap) {
  const tierOrder = { t1: 1, t2: 2, t3: 3, t4: 4 };
  
  // Filter out metadata keys that are not actual commodities
  const METADATA_KEYS = ['price_by_commodity', 'last_price_by_commodity', 'floor_price_by_commodity', 'remaining_sell_offers_post_clear'];
  
  return Object.entries(market)
    .filter(([key]) => !METADATA_KEYS.includes(key))
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

   const priceStr = price.toFixed(3).padStart(9);
   const demandStr = formatVolume(demand).padStart(7);
   const supplyStr = formatVolume(supply).padStart(7);
   const tradedStr = formatVolume(traded).padStart(7);

  const priceColor = getPriceColor(marketState, price);
  const { demandColor, supplyColor } = getSupplyDemandColors(demand, supply);

   return `${displayName}${namePad}  {${priceColor}-fg}${priceStr}{/${priceColor}-fg}   ` +
    `{${demandColor}-fg}${demandStr}{/${demandColor}-fg}   ` +
    `{${supplyColor}-fg}${supplyStr}{/${supplyColor}-fg}   ` +
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

  const bankKeys = Object.keys(coalitionEconomy.stockpile_bank || {}).filter(k => (coalitionEconomy.stockpile_bank[k] || 0) > 0);
  const readyKeys = Object.keys(coalitionEconomy.stockpile_ready || {}).filter(k => (coalitionEconomy.stockpile_ready[k] || 0) > 0);
  const totalKeys = new Set([...bankKeys, ...readyKeys]);
  if (totalKeys.size > 0) {
    lines.push(`Stockpiles: {cyan-fg}${totalKeys.size}{/cyan-fg} commodities`);
  }
}

function filterRegularArmies(armies) {
  return armies.filter(army =>
    !army.id.startsWith('_scourge') &&
    !army.id.startsWith('_coalition_combined') &&
    !army.id.startsWith('_insurrection')
  );
}

function formatArmyBlock(army, empireName, empire = null) {
  const parts = [`{bold}${army.name}{/bold} (${empireName})`];

  // Stats line
  const effectiveProtection = Math.min(1, (army.protection || 0) + (army.protectionBonus || 0));
  const effectiveResolve = Math.min(1, (army.resolve || 0) + (army.resolveBonus || 0));

  const stats = [
    `Fervor: ${formatNumber(army.fervor)}`,
    `Org: ${formatNumber(army.organization)}`,
    `Agg: ${formatNumber(army.aggravation)}`,
    `Cmd: ${formatNumber(army.command || 50)}`,
    `Prot: ${formatNumber(effectiveProtection * 100, 1)}%`,
    `Res: ${formatNumber(effectiveResolve * 100, 1)}%`,
    `Kill: ${formatNumber((army.killRate || 0.1) * 100, 1)}%`
  ];
  parts.push(`  ${stats.join(', ')}`);

  // MP/Morale line
  if (army.mp && army.mo) {
    const mpPct = army.mp.max > 0 ? ((army.mp.current / army.mp.max) * 100).toFixed(0) : '0';
    const moPct = army.mo.max > 0 ? ((army.mo.current / army.mo.max) * 100).toFixed(0) : '0';
    parts.push(`  MP: ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)} (${mpPct}%), Morale: ${Math.floor(army.mo.current)}/${Math.floor(army.mo.max)} (${moPct}%)`);
  }

  // Signature commodity line
  if (army.signatureCommodity && army.signatureThreshold > 0 && empire) {
    const stockpile = empire.stockpiles || {};
    const available = stockpile[army.signatureCommodity] || 0;
    const threshold = army.signatureThreshold;
    const pct = threshold > 0 ? ((available / threshold) * 100).toFixed(1) : '0';
    const color = available >= threshold ? '{green-fg}' : '';
    const reset = available >= threshold ? '{/green-fg}' : '';
    parts.push(`  ${army.signatureCommodity}: ${formatNumber(available)}/${formatNumber(threshold)} (${color}${pct}%${reset})`);
  }

  return parts.join('\n');
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

function formatEmpireBlock(empire, regularArmies, state) {
  const lines = [];
  const effectiveApproval = empire.approval + (empire.stats.approvalBonus || 0);
  const approval = `${effectiveApproval >= 0 ? '+' : ''}${effectiveApproval.toFixed(0)}`;
  const stabilityValue = empire.stability !== undefined ? empire.stability.toFixed(0) : 'N/A';
  let stabilityDisplay = stabilityValue;
  if (empire.stability !== undefined) {
    if (empire.stability < 40) {
      stabilityDisplay = `{red-fg}${stabilityValue}{/red-fg}`;
    } else if (empire.stability < 60) {
      stabilityDisplay = `{yellow-fg}${stabilityValue}{/yellow-fg}`;
    }
  }

  lines.push(`{bold}${empire.name}{/bold}  Approval: ${approval}  Stability: ${stabilityDisplay}`);

  const statParts = [];
  if (empire.stats) {
    statParts.push(`Population: ${formatNumber(empire.stats.population || 0)}`);
    statParts.push(`Influence: ${formatNumber(empire.stats.influence || 0)}`);
  }
  if (empire.budget_credits !== undefined) {
    statParts.push(`Budget: {green-fg}${formatNumber(empire.budget_credits, 0)}{/green-fg}`);
  }
   const empireArmies = regularArmies.filter(army => army.empireId === empire.id);
   statParts.push(`Armies: ${empireArmies.length}`);

   const multiplier = empire.modifiers?.multiplication || 1.0;
   if (multiplier !== 1.0) {
     statParts.push(`Prod: {green-fg}${multiplier.toFixed(1)}x{/green-fg}`);
   }

   if (statParts.length > 0) {
     lines.push(`  ${statParts.join('  ')}`);
   }

   // Technology progress
  if (empire.techPoints !== undefined && empire.techThreshold !== undefined) {
    const progress = Math.min(1, empire.techPoints / empire.techThreshold);
    const barWidth = 12;
    const filledWidth = Math.floor(progress * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const techBar = `{blue-fg}[${'#'.repeat(filledWidth)}${'-'.repeat(emptyWidth)}]{/blue-fg}`;
    const pct = (progress * 100).toFixed(0);

    // Calculate points per tick for display
    let rateStr = '';
    if (state) {
      const pointsPerTick = calculateTechPointsPerTick(empire, state);
      rateStr = ` {gray-fg}+${pointsPerTick}{/gray-fg}`;
    }

    const techCount = empire.technologies?.length || 0;
    const techCountText = techCount > 0 ? `  Techs: {cyan-fg}${techCount}{/cyan-fg}` : '';
    lines.push(`  Research: ${techBar} ${pct}%${rateStr}${techCountText}`);
  }

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

function formatDemandLine(label, demandMap, commodityMap) {
  const entries = Object.entries(demandMap || {})
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const commodity = commodityMap.get(key);
      const name = commodity?.name || key;
      return `${name}:${formatVolume(value)}`;
    });

  if (entries.length === 0) {
    return '';
  }

  return `${label}: ${entries.join(', ')}`;
}

function formatEmpireMarketOrders(state, empire, commodityMap) {
  const orders = [];
  if (!state.market || !empire) {
    return orders;
  }

  const buyOrders = [];
  const sellOrders = [];

  // Read from state.marketOrders (current orders)
  const marketOrders = state.marketOrders || {};
  (marketOrders.buyOrders || []).forEach(order => {
    if (order.owner_type === 'empire' && order.owner_id === empire.id) {
      buyOrders.push(order);
    }
  });
  (marketOrders.sellOffers || []).forEach(order => {
    if (order.owner_type === 'empire' && order.owner_id === empire.id) {
      sellOrders.push(order);
    }
  });

  // Show buy orders
  if (buyOrders.length > 0) {
    const orderLines = buyOrders.slice(0, 6).map(order => {
      const commodity = commodityMap.get(order.commodity);
      const name = commodity?.name || order.commodity;
      const remaining = Math.max(0, order.qty - (order.filled_qty || 0));
      const price = order.max_price ?? order.ask_price ?? 0;
      return `  Buy ${name}: ${formatVolume(remaining)} @ ${price.toFixed(2)}`;
    });
    orders.push('{yellow-fg}Buy Orders:{/yellow-fg}');
    orders.push(...orderLines);
    if (buyOrders.length > 6) {
      orders.push(`  ...${buyOrders.length - 6} more`);
    }
  }

  // Show sell orders
  if (sellOrders.length > 0) {
    const orderLines = sellOrders.slice(0, 6).map(order => {
      const commodity = commodityMap.get(order.commodity);
      const name = commodity?.name || order.commodity;
      const remaining = Math.max(0, order.qty - (order.filled_qty || 0));
      const price = order.ask_price ?? order.max_price ?? 0;
      return `  Sell ${name}: ${formatVolume(remaining)} @ ${price.toFixed(2)}`;
    });
    orders.push('{green-fg}Sell Offers:{/green-fg}');
    orders.push(...orderLines);
    if (sellOrders.length > 6) {
      orders.push(`  ...${sellOrders.length - 6} more`);
    }
  }

  return orders;
}

function formatLawEffects(modifiers) {
  if (!modifiers || Object.keys(modifiers).length === 0) {
    return '';
  }
  
  const effects = [];
  
  if (modifiers.industrial_output) {
    const pct = (modifiers.industrial_output * 100).toFixed(1);
    effects.push(`+${pct}% Industrial Output`);
  }
  
  if (modifiers.army_maintenance_cost_modifier) {
    const reduction = ((1 - modifiers.army_maintenance_cost_modifier) * 100).toFixed(0);
    effects.push(`-${reduction}% Army Maintenance`);
  }
  
  if (modifiers.relations_strength_modifier) {
    const boost = ((modifiers.relations_strength_modifier - 1) * 100).toFixed(1);
    effects.push(`+${boost}% Relations Strength`);
  }
  
  if (modifiers.trade_income) {
    effects.push(`+${modifiers.trade_income} Trade Income`);
  }
  
  if (modifiers.empire_approval) {
    effects.push(`+${modifiers.empire_approval} Empire Approval`);
  }
  
  if (modifiers.population_growth) {
    effects.push(`+${modifiers.population_growth} Population Growth`);
  }
  
  return effects.join(', ');
}

function formatImprovementDetailLine(improvement) {
  const detailParts = [];

  // Add description/game hint first
  if (improvement.description) {
    detailParts.push(improvement.description);
  }

  // Add upkeep info if present
  if (improvement.requisitionUpkeep) {
    detailParts.push(`${improvement.requisitionUpkeep} req/turn`);
  }

  const sustainKeys = Object.keys(improvement.sustainmentCost || {});
  if (sustainKeys.length > 0) {
    const sustainStr = sustainKeys.map(k => `${k}:${improvement.sustainmentCost[k]}`).join(', ');
    detailParts.push(`-${sustainStr}`);
  }

  const outputKeys = Object.keys(improvement.productionOutputs || {});
  if (outputKeys.length > 0) {
    const outputStr = outputKeys.map(k => `${k}:+${improvement.productionOutputs[k]}`).join(', ');
    detailParts.push(`+${outputStr}`);
  }

  const modKeys = Object.keys(improvement.modifiers || {});
  if (modKeys.length > 0) {
    const modStr = modKeys.map(k => formatImprovementModifier(k, improvement.modifiers[k])).join('  ');
    detailParts.push(modStr);
  }

  return detailParts.join(' • ');
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
   lines.push(`  Requisition: {green-fg}${state.coalitionEconomy?.requisition || 0}{/green-fg}`);
   lines.push('');

  if (requests.length === 0) {
    lines.push('{yellow-fg}No improvement requests available{/yellow-fg}');
    return lines.join('\n');
  }

  lines.push('{bold}Available Requests:{/bold}');

   requests.forEach((request, index) => {
     if (index > 0) lines.push(''); // Single blank line between items

     // Header with name and tier
     const tierStr = request.tier ? `[T${request.tier}]` : '';
     lines.push(`{bold}${request.name}{/bold} ${tierStr}`);

     // Description/game hint
     if (request.description) {
       lines.push(`  {white-fg}${request.description}{/white-fg}`);
     }

     // Cost and upkeep info
     const upkeepStr = request.requisitionUpkeep ? ` | Upkeep: {yellow-fg}${request.requisitionUpkeep}{/yellow-fg} req/turn` : '';
     lines.push(`  Cost: {red-fg}${request.suppliesCost}{/red-fg} req | Build: {yellow-fg}${request.build}{/yellow-fg} ticks | Capacity: ${request.capacity}${upkeepStr}`);

     // Production and sustainment
     const infoParts = [];

    const sustainKeys = Object.keys(request.sustainmentCost || {});
    if (sustainKeys.length > 0) {
      const sustainStr = sustainKeys.map(k => `${k}:${request.sustainmentCost[k]}`).join(', ');
      infoParts.push(`Sustain: {yellow-fg}-${sustainStr}{/yellow-fg}`);
    }

    const outputKeys = Object.keys(request.productionOutputs || {});
    if (outputKeys.length > 0) {
      const outputStr = outputKeys.map(k => `${k}:+${request.productionOutputs[k]}`).join(', ');
      infoParts.push(`Produce: {green-fg}+${outputStr}{/green-fg}`);
    }

     if (infoParts.length > 0) {
       lines.push(`  ${infoParts.join(' | ')}`);
     }

     // Modifiers
     const modKeys = Object.keys(request.modifiers || {});
     if (modKeys.length > 0) {
       const modStr = modKeys.map(k => formatImprovementModifier(k, request.modifiers[k])).join('  ');
       lines.push(`  Modifiers: {cyan-fg}${modStr}{/cyan-fg}`);
     }
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
     const { label, colorTag } = formatSuggestionLabel(improvement.empireId, state);
     lines.push(`{bold}${improvement.name}{/bold} [${improvement.state}] {${colorTag}-fg}[${label}]{/${colorTag}-fg}`);
     if (improvement.description) {
       lines.push(`  {white-fg}${improvement.description}{/white-fg}`);
     }
     lines.push(`  Progress: ${improvement.buildProgress}/${improvement.build}  Capacity: ${improvement.capacity}`);

    const benefitParts = [];

     const sustainKeys = Object.keys(improvement.sustainmentCost);
     if (sustainKeys.length > 0) {
       const sustainStr = sustainKeys.map(k => `${k}:${improvement.sustainmentCost[k]}`).join(', ');
       benefitParts.push(`{yellow-fg}Sustain: -${sustainStr}/tick{/yellow-fg}`);
     }

     const outputKeys = Object.keys(improvement.productionOutputs);
     if (outputKeys.length > 0) {
       const outputStr = outputKeys.map(k => `${k}:+${improvement.productionOutputs[k]}`).join(', ');
       benefitParts.push(`{green-fg}Produce: +${outputStr}/tick{/green-fg}`);
     }

     const modKeys = Object.keys(improvement.modifiers);
     if (modKeys.length > 0) {
       const modStr = modKeys.map(k => formatImprovementModifier(k, improvement.modifiers[k])).join('  ');
       benefitParts.push(`{cyan-fg}Mods: ${modStr}{/cyan-fg}`);
     }

    if (benefitParts.length > 0) {
      lines.push(`  ${benefitParts.join('  {white-fg}->{/white-fg}  ')}`);
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
  renderStockpiles(ui, state);
  renderCombinedInfo(ui, state);
  renderLog(ui, state);
  ui.screen.render();
}

