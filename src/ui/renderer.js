import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { getCohesionTier } from '../game/cohesion.js';

export function createUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Coalition: The Blessed Game'
  });
  
  const grid = new contrib.grid({
    rows: 12,
    cols: 12,
    screen: screen
  });
  
  // Left column: Commands/Laws (row 0-5) and War Funds (row 6-11)
  const lawsBox = grid.set(0, 0, 6, 3, blessed.list, {
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
  
  const warFundsBox = grid.set(6, 0, 6, 3, blessed.list, {
    label: ' War Funds Allocation (Enter to adjust) ',
    keys: true,
    vi: true,
    style: {
      selected: { bg: 'green', fg: 'white' },
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
  
  // Center: Event box (row 0-4) and Log (row 5-11)
  const eventBox = grid.set(0, 3, 5, 6, blessed.box, {
    label: ' Event ',
    content: '',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    tags: true,
    style: {
      border: { fg: 'white' }
    },
    border: {
      type: 'line'
    }
  });
  
  const logBox = grid.set(5, 3, 7, 6, blessed.log, {
    label: ' Log ',
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
  
  // Right: Stats (row 0-4) and Tables (row 5-11)
  const statsBox = grid.set(0, 9, 4, 3, blessed.box, {
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
  
  const tablesBox = grid.set(4, 9, 8, 3, blessed.box, {
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
  
  return {
    screen,
    lawsBox,
    warFundsBox,
    eventBox,
    logBox,
    statsBox,
    tablesBox
  };
}

export function renderLaws(ui, state) {
  const items = state.laws.map((law, idx) => {
    const cooldown = law.currentCooldown > 0 ? ` [CD: ${law.currentCooldown}]` : '';
    const marker = idx === state.selectedLawIndex ? '> ' : '  ';
    return `${marker}${law.name}${cooldown}`;
  });
  
  ui.lawsBox.setItems(items);
  
  // Update border color based on focus
  if (state.focus === 'laws') {
    ui.lawsBox.style.border.fg = 'yellow';
    ui.lawsBox.focus();
  } else {
    ui.lawsBox.style.border.fg = 'white';
  }
}

export function renderWarFunds(ui, state) {
  const items = state.armies.map((army, idx) => {
    const marker = idx === state.selectedArmyIndex ? '> ' : '  ';
    const share = army.warFundShare.toFixed(1);
    return `${marker}${army.name}: ${share}%`;
  });
  
  ui.warFundsBox.setItems(items);
  
  // Update border color based on focus
  if (state.focus === 'warfunds') {
    ui.warFundsBox.style.border.fg = 'yellow';
    ui.warFundsBox.focus();
  } else {
    ui.warFundsBox.style.border.fg = 'white';
  }
}

export function renderEvent(ui, state) {
  if (!state.activeEvent) {
    ui.eventBox.setContent('No active event.\n\nPress SPACE to advance turn.');
    ui.eventBox.style.border.fg = 'white';
    return;
  }
  
  const event = state.activeEvent;
  let content = `{bold}${event.title}{/bold}\n\n${event.text}\n\n`;
  content += `{bold}Choices:{/bold}\n`;
  event.choices.forEach((choice, idx) => {
    content += `  ${idx + 1}. ${choice.text}\n`;
  });
  content += `\nPress 1/2/3 to choose.`;
  
  ui.eventBox.setContent(content);
  ui.eventBox.style.border.fg = 'white';
}

export function renderStats(ui, state) {
  const tier = getCohesionTier(state.coalitionCohesion);
  const tierName = tier ? tier.name : 'COLLAPSED';
  
  let content = `{bold}Coalition Cohesion:{/bold} ${state.coalitionCohesion.toFixed(1)} (${tierName})\n`;
  content += `{bold}Scourge Cohesion:{/bold} ${state.scourgeCohesion.toFixed(1)}\n`;
  content += `{bold}Scourge Fervor:{/bold} ${state.scourgeFervor.toFixed(1)}\n\n`;
  content += `{bold}Stockpiles:{/bold}\n`;
  content += `  Supplies: ${state.stockpiles.supplies}\n`;
  content += `  Alloys: ${state.stockpiles.alloys}\n`;
  content += `  Fuel: ${state.stockpiles.fuel}\n\n`;
  content += `{bold}Turn:{/bold} ${state.turn}`;
  
  ui.statsBox.setContent(content);
  ui.statsBox.style.border.fg = 'white';
}

export function renderTables(ui, state) {
  let content = `{bold}Empires:{/bold}\n`;
  state.empires.forEach(empire => {
    content += `  ${empire.name}: Approval ${empire.approval >= 0 ? '+' : ''}${empire.approval.toFixed(0)}, Aid ${empire.aidCapacity}\n`;
  });
  
  content += `\n{bold}Armies:{/bold}\n`;
  state.armies.forEach(army => {
    const empire = state.empires.find(e => e.id === army.empireId);
    const empireName = empire ? empire.name : 'Unknown';
    content += `  ${army.name} (${empireName}):\n`;
    content += `    Fervor: ${army.fervor.toFixed(0)}, Org: ${army.organization.toFixed(0)}\n`;
    content += `    Supply Need: ${army.supplyNeed}, Aggravation: ${army.aggravation.toFixed(0)}\n`;
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

export function renderLog(ui, state) {
  // Log is auto-updated via logBox.log()
  // Just ensure it's scrolled to bottom
  ui.logBox.setScrollPerc(100);
}


export function renderAll(ui, state) {
  renderLaws(ui, state);
  renderWarFunds(ui, state);
  renderEvent(ui, state);
  renderStats(ui, state);
  renderTables(ui, state);
  renderLog(ui, state);
  ui.screen.render();
}
