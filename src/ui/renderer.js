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
  
  // TOP PRIORITY PANELS: Active Battles and Laws (rows 0-3)
  // Active Battles (top-left, rows 0-3, cols 0-6)
  const activeFrontsBox = grid.set(0, 0, 3, 6, blessed.box, {
    label: ' ⚔️  ACTIVE BATTLES ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    style: {
      border: { fg: 'cyan' }
    },
    border: {
      type: 'line'
    }
  });
  
  // Active Laws (top-right, rows 0-3, cols 6-12)
  const activeLawsBox = grid.set(0, 6, 3, 6, blessed.box, {
    label: ' 📜 ACTIVE LAWS ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    style: {
      border: { fg: 'magenta' }
    },
    border: {
      type: 'line'
    }
  });
  
  // SECONDARY PANELS (rows 3-7)
  // Left column: Available Laws (row 3-11)
  const lawsBox = grid.set(3, 0, 8, 3, blessed.list, {
    label: ' Laws (Enter to enact) ',
    keys: true,
    vi: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
  
  // Center: Event box (row 3-5) and Log (row 5-12)
  const eventBox = grid.set(3, 3, 2, 6, blessed.box, {
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
  
  // Use blessed.box instead of blessed.log for better tag support
  const logBox = grid.set(5, 3, 7, 6, blessed.box, {
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
  
  // Store log lines for the logBox
  logBox.logLines = [];
  logBox.maxLines = 100;
  
  // Override log method to properly handle tags
  logBox.log = function(message) {
    this.logLines.push(message);
    if (this.logLines.length > this.maxLines) {
      this.logLines.shift(); // Remove oldest line
    }
    // Join all lines and set content (tags will be properly parsed)
    this.setContent(this.logLines.join('\n'));
    this.setScrollPerc(100); // Auto-scroll to bottom
  };
  
  // Right: Stats (row 3-5), Economy (row 5-8), and Tables (row 8-12)
  const statsBox = grid.set(3, 9, 2, 3, blessed.box, {
    label: ' Stats ',
    content: '',
    tags: true,
    style: {
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
  
  const economyBox = grid.set(5, 9, 3, 3, blessed.box, {
    label: ' 💰 Market Economy ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    style: {
      border: { fg: 'green' }
    },
    border: {
      type: 'line'
    }
  });
  
  const tablesBox = grid.set(8, 9, 4, 3, blessed.box, {
    label: ' Tables ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    style: {
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
  
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
    label: ' 📋 LOGS (Q/Esc: close, R: refresh, ↑↓: scroll) ',
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
  
  return {
    screen,
    lawsBox,
    eventBox,
    activeFrontsBox,
    activeLawsBox,
    logBox,
    statsBox,
    economyBox,
    tablesBox,
    logsWindow
  };
}

export function renderLaws(ui, state) {
  let items = [];
  
  // Show law definitions if available (new system)
  if (state.lawDefinitions && state.lawDefinitions.length > 0) {
    items = state.lawDefinitions.map((lawDef, idx) => {
      const marker = idx === state.selectedLawIndex ? '> ' : '  ';
      const cost = state.playerInfluence >= 100 ? '' : ' {red-fg}(need 100 influence){/red-fg}';
      return `${marker}${lawDef.name}${cost}`;
    });
  } else {
    // Fallback to old law system
    items = state.laws.map((law, idx) => {
      const cooldown = law.currentCooldown > 0 ? ` [CD: ${law.currentCooldown}]` : '';
      const marker = idx === state.selectedLawIndex ? '> ' : '  ';
      return `${marker}${law.name}${cooldown}`;
    });
  }
  
  ui.lawsBox.setItems(items);
  
  // Update border color based on focus
  if (state.focus === 'laws') {
    ui.lawsBox.style.border.fg = 'yellow';
    ui.lawsBox.focus();
  } else {
    ui.lawsBox.style.border.fg = 'white';
  }
}

export function renderEvent(ui, state) {
  if (!state.activeEvent) {
    const pauseHint = state.paused ? 'Press SPACE to resume.' : 'Game running in real-time.';
    ui.eventBox.setContent(`No active event.\n\n${pauseHint}\nPress [ or ] to adjust speed.`);
    ui.eventBox.style.border.fg = 'white';
    return;
  }
  
  const event = state.activeEvent;
  const eventTitle = event.title || event.name || event.id || 'Unknown Event';
  let content = `{bold}${eventTitle}{/bold}\n\n${event.text || event.description || ''}\n\n`;
  
  if (event.choices && event.choices.length > 0) {
    content += `{bold}Choices:{/bold}\n`;
    event.choices.forEach((choice, idx) => {
      content += `  ${idx + 1}. ${choice.text}\n`;
    });
    content += `\nPress 1/2/3 to choose.`;
  }
  
  content += `\n{yellow-fg}Game auto-paused{/yellow-fg}`;
  
  ui.eventBox.setContent(content);
  ui.eventBox.style.border.fg = 'yellow';
}

export function renderStats(ui, state) {
  const tier = getCohesionTier(state.coalitionCohesion);
  
  let content = `{bold}Coalition Cohesion:{/bold} ${formatCohesion(state.coalitionCohesion, tier)}\n`;
  const scourgeCohesion = state.scourgeCohesion ?? 80; // Safety check
  content += `{bold}Scourge Cohesion:{/bold} ${formatNumber(scourgeCohesion, 1)}\n`;
  content += `{bold}Scourge Fervor:{/bold} ${formatNumber(state.scourgeFervor, 1)}\n\n`;
  content += `{bold}Stockpiles:{/bold}\n`;
  content += `  ${formatResource('Supplies', state.stockpiles.supplies)}\n`;
  content += `  ${formatResource('Alloys', state.stockpiles.alloys)}\n`;
  content += `  ${formatResource('Fuel', state.stockpiles.fuel)}\n\n`;
  
  // Player Influence
  if (state.playerInfluence !== undefined) {
    content += `{bold}Player Influence:{/bold} ${state.playerInfluence}\n`;
    content += `  (${state.influenceProgress || 0}/100 ticks)\n\n`;
  }
  
  // Active Law Processes
  if (state.lawProcesses && state.lawProcesses.length > 0) {
    const activeLaws = state.lawProcesses.filter(lawProcess => 
      lawProcess.phase !== 'ENACTED' && lawProcess.phase !== 'BURIED'
    );
    if (activeLaws.length > 0) {
      content += `{bold}Active Laws:{/bold} ${activeLaws.length}\n`;
    }
  }
  
  content += `{bold}Turn:{/bold} ${state.turn}\n`;
  
  // Real-time status
  const pauseStatus = state.paused ? '{red-fg}PAUSED{/red-fg}' : '{green-fg}RUNNING{/green-fg}';
  content += `{bold}Status:{/bold} ${pauseStatus}\n`;
  content += `{bold}Speed:{/bold} ${state.gameSpeed}x`;
  
  ui.statsBox.setContent(content);
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
    content += `  ${empire.name}: Approval ${empire.approval >= 0 ? '+' : ''}${empire.approval.toFixed(0)}, Aid ${empire.aidCapacity}\n`;
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
  
  ui.tablesBox.setContent(content);
  ui.tablesBox.style.border.fg = 'white';
}

export function renderActiveFronts(ui, state) {
  const activeBattles = (state.battleFronts || []).filter(f => f.state === 'ACTIVE');
  
  if (activeBattles.length === 0) {
    ui.activeFrontsBox.setContent('{center}{yellow-fg}No active battles{/yellow-fg}{/center}');
    ui.activeFrontsBox.style.border.fg = 'white';
    return;
  }
  
  let content = '';
  
  activeBattles.forEach((front, idx) => {
    const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
    const rightArmy = state.armies.find(a => a.id === front.rightArmyId);
    
    if (!leftArmy || !rightArmy) {
      return;
    }
    
    if (idx > 0) content += '\n';
    
    // Morale badges
    const leftBadge = front.moraleBroken.left ? '{red-fg}BROKEN{/red-fg}' : '{green-fg}STEADY{/green-fg}';
    const rightBadge = front.moraleBroken.right ? '{red-fg}BROKEN{/red-fg}' : '{green-fg}STEADY{/green-fg}';
    
    // MP values and percentages
    const leftMP = Math.floor(leftArmy.mp.current);
    const leftMaxMP = leftArmy.mp.max;
    const rightMP = Math.floor(rightArmy.mp.current);
    const rightMaxMP = rightArmy.mp.max;
    
    const leftPct = ((leftMP / leftMaxMP) * 100).toFixed(0);
    const rightPct = ((rightMP / rightMaxMP) * 100).toFixed(0);
    
    // Title line
    content += `{bold}{cyan-fg}${front.id}{/cyan-fg}{/bold}\n`;
    
    // Army names and morale status
    content += `{bold}${leftArmy.name}{/bold} [${leftBadge}]  vs  {bold}${rightArmy.name}{/bold} [${rightBadge}]\n`;
    
    // MP Bar visualization
    const totalMP = leftArmy.mp.current + rightArmy.mp.current;
    const barWidth = 40;
    const leftBarWidth = totalMP > 0 ? Math.floor((leftArmy.mp.current / totalMP) * barWidth) : barWidth / 2;
    const rightBarWidth = barWidth - leftBarWidth;
    
    const leftBar = '█'.repeat(Math.max(0, leftBarWidth));
    const rightBar = '█'.repeat(Math.max(0, rightBarWidth));
    
    content += `{cyan-fg}${leftBar}{/cyan-fg}{yellow-fg}${rightBar}{/yellow-fg}\n`;
    
    // MP stats
    content += `MP: ${leftMP}/${leftMaxMP} (${leftPct}%)`;
    content += '  '.repeat(Math.max(1, Math.floor(barWidth / 10) - 5));
    content += `${rightMP}/${rightMaxMP} (${rightPct}%)\n`;
    
    // Morale stats
    const leftMO = Math.floor(leftArmy.mo.current);
    const rightMO = Math.floor(rightArmy.mo.current);
    content += `Morale: ${leftMO}/${leftArmy.mo.max}`;
    content += '  '.repeat(Math.max(1, Math.floor(barWidth / 10)));
    content += `${rightMO}/${rightArmy.mo.max}\n`;
    
    // Battle metadata
    const duration = state.turn - front.startedAtTick;
    content += `{gray-fg}Field Size: ${front.battlefieldSize} | Duration: ${duration} turns{/gray-fg}`;
  });
  
  ui.activeFrontsBox.setContent(content);
  ui.activeFrontsBox.style.border.fg = 'cyan';
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
  
  let content = '';
  
  activeLaws.forEach((lp, idx) => {
    const lawDef = state.lawDefinitions?.find(ld => ld.id === lp.lawId);
    const lawName = lawDef ? lawDef.name : lp.lawId;
    
    if (idx > 0) content += '\n';
    
    // Law name and phase
    content += `{bold}{magenta-fg}${lawName}{/magenta-fg}{/bold}\n`;
    
    // Phase with color coding
    let phaseColor = 'yellow';
    if (lp.phase === 'DEBATE') phaseColor = 'cyan';
    else if (lp.phase === 'FALLOUT') phaseColor = 'yellow';
    else if (lp.phase === 'VOTING') phaseColor = 'green';
    
    const phaseProgress = (lp.phaseProgress * 100).toFixed(0);
    content += `Phase: {${phaseColor}-fg}${lp.phase}{/${phaseColor}-fg} (${phaseProgress}%)\n`;
    
    // Progress bar for phase
    const barWidth = 30;
    const filledWidth = Math.floor((lp.phaseProgress || 0) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    content += `{${phaseColor}-fg}${progressBar}{/${phaseColor}-fg}\n`;
    
    // Rejects counter
    const rejectColor = lp.rejects >= 3 ? 'red' : lp.rejects >= 2 ? 'yellow' : 'white';
    content += `Rejects: {${rejectColor}-fg}${lp.rejects}/4{/${rejectColor}-fg}`;
    
    // Only show additional info if there's space
    if (activeLaws.length <= 2) {
      content += '\n';
      
      // Meter bars (with null checks)
      const momentum = (lp.meters && lp.meters.momentum) || 0;
      const rejectPressure = (lp.meters && lp.meters.reject_pressure) || 0;
      
      // Momentum bar
      const momWidth = Math.floor(momentum * 20);
      const momBar = '█'.repeat(momWidth) + '░'.repeat(20 - momWidth);
      content += `Momentum:       {green-fg}${momBar}{/green-fg} ${(momentum * 100).toFixed(0)}%\n`;
      
      // Reject pressure bar
      const rejWidth = Math.floor(rejectPressure * 20);
      const rejBar = '█'.repeat(rejWidth) + '░'.repeat(20 - rejWidth);
      content += `Reject Pressure: {red-fg}${rejBar}{/red-fg} ${(rejectPressure * 100).toFixed(0)}%`;
    }
  });
  
  ui.activeLawsBox.setContent(content);
  ui.activeLawsBox.style.border.fg = 'magenta';
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


export function renderEconomy(ui, state) {
  if (!state.market || Object.keys(state.market).length === 0) {
    ui.economyBox.setContent('{center}{yellow-fg}Market not initialized{/yellow-fg}{/center}');
    ui.economyBox.style.border.fg = 'green';
    return;
  }
  
  // Load resources to get commodity names
  let commodities = [];
  try {
    const resourcesPath = path.join(__dirname, '..', '..', 'docs', 'input', 'resources.yaml');
    const content = fs.readFileSync(resourcesPath, 'utf8');
    const doc = yaml.load(content);
    commodities = doc.resources?.commodities || [];
  } catch (error) {
    // Fallback: use market keys
    commodities = Object.keys(state.market).map(key => ({ key, name: key }));
  }
  
  // Create a map for quick lookup
  const commodityMap = new Map(commodities.map(c => [c.key, c]));
  
  let content = '';
  
  // Sort commodities by tier (t1, t2, t3, t4) then by name
  const tierOrder = { t1: 1, t2: 2, t3: 3, t4: 4 };
  const sortedCommodities = Object.entries(state.market)
    .map(([key, marketState]) => {
      const commodity = commodityMap.get(key) || { key, name: key, tier: 't1' };
      return { key, commodity, marketState };
    })
    .sort((a, b) => {
      const tierDiff = (tierOrder[a.commodity.tier] || 5) - (tierOrder[b.commodity.tier] || 5);
      if (tierDiff !== 0) return tierDiff;
      return a.commodity.name.localeCompare(b.commodity.name);
    });
  
  // Header
  content += '{bold}{green-fg}Commodity{/green-fg}  {cyan-fg}Price{/cyan-fg}  {yellow-fg}Buy{/yellow-fg}  {red-fg}Sell{/red-fg}  {magenta-fg}Vol{/magenta-fg}{/bold}\n';
  content += '─'.repeat(45) + '\n';
  
  // Display each commodity
  sortedCommodities.forEach(({ key, commodity, marketState }) => {
    const name = commodity.name || key;
    const price = marketState.price || 0;
    const demand = marketState.demand_qty || 0;
    const supply = marketState.supply_qty || 0;
    const traded = marketState.traded_qty || 0;
    
    // Truncate name if too long
    const displayName = name.length > 12 ? name.substring(0, 10) + '..' : name;
    const namePad = ' '.repeat(Math.max(0, 12 - displayName.length));
    
    // Format numbers
    const priceStr = price.toFixed(2).padStart(6);
    const demandStr = formatVolume(demand).padStart(6);
    const supplyStr = formatVolume(supply).padStart(6);
    const tradedStr = formatVolume(traded).padStart(6);
    
    // Color coding for price changes
    let priceColor = 'cyan';
    if (marketState.last_price) {
      const change = price - marketState.last_price;
      const changePct = marketState.last_price > 0 ? (change / marketState.last_price) * 100 : 0;
      if (changePct > 5) priceColor = 'red'; // Significant increase
      else if (changePct < -5) priceColor = 'green'; // Significant decrease
    }
    
    // Color coding for supply/demand imbalance
    let demandColor = 'yellow';
    let supplyColor = 'red';
    if (supply > 0 && demand > 0) {
      const ratio = demand / supply;
      if (ratio > 1.5) {
        demandColor = 'red'; // High demand
        supplyColor = 'yellow';
      } else if (ratio < 0.67) {
        demandColor = 'yellow';
        supplyColor = 'green'; // High supply
      }
    }
    
    content += `${displayName}${namePad} {${priceColor}-fg}${priceStr}{/${priceColor}-fg}  `;
    content += `{${demandColor}-fg}${demandStr}{/${demandColor}-fg}  `;
    content += `{${supplyColor}-fg}${supplyStr}{/${supplyColor}-fg}  `;
    content += `{magenta-fg}${tradedStr}{/magenta-fg}\n`;
  });
  
  // Show coalition economy info if available
  if (state.coalitionEconomy) {
    content += '\n{bold}Coalition:{/bold}\n';
    content += `Budget: {green-fg}${formatNumber(state.coalitionEconomy.budget_credits || 0, 0)}{/green-fg} credits\n`;
    
    const stockpileCount = Object.keys(state.coalitionEconomy.stockpiles || {}).length;
    if (stockpileCount > 0) {
      content += `Stockpiles: {cyan-fg}${stockpileCount}{/cyan-fg} commodities\n`;
    }
  }
  
  ui.economyBox.setContent(content);
  ui.economyBox.style.border.fg = 'green';
}

function formatVolume(volume) {
  if (volume === 0) return '0';
  if (volume < 1) return volume.toFixed(2);
  if (volume < 1000) return volume.toFixed(0);
  if (volume < 1000000) return (volume / 1000).toFixed(1) + 'K';
  return (volume / 1000000).toFixed(1) + 'M';
}

export function renderAll(ui, state) {
  renderActiveFronts(ui, state);
  renderActiveLaws(ui, state);
  renderLaws(ui, state);
  renderEvent(ui, state);
  renderStats(ui, state);
  renderEconomy(ui, state);
  renderTables(ui, state);
  renderLog(ui, state);
  ui.screen.render();
}
