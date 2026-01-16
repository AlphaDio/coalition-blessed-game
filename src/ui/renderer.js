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
  const eventBox = grid.set(0, 3, 3, 6, blessed.box, {
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
  
  // Active Fronts box (row 3-5, center)
  const activeFrontsBox = grid.set(3, 3, 2, 6, blessed.box, {
    label: ' Active Fronts ',
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
    activeFrontsBox,
    logBox,
    statsBox,
    tablesBox
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
    const pauseHint = state.paused ? 'Press SPACE to resume.' : 'Game running in real-time.';
    ui.eventBox.setContent(`No active event.\n\n${pauseHint}\nPress [ or ] to adjust speed.`);
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
  content += `\n{yellow-fg}Game auto-paused{/yellow-fg}`;
  
  ui.eventBox.setContent(content);
  ui.eventBox.style.border.fg = 'yellow';
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
  
  // Player Influence
  if (state.playerInfluence !== undefined) {
    content += `{bold}Player Influence:{/bold} ${state.playerInfluence}\n`;
    content += `  (${state.influenceProgress || 0}/100 ticks)\n\n`;
  }
  
  // Active Law Processes
  if (state.lawProcesses && state.lawProcesses.length > 0) {
    const activeLaws = state.lawProcesses.filter(lp => lp.phase !== 'ENACTED' && lp.phase !== 'BURIED');
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

export function renderActiveFronts(ui, state) {
  const activeBattles = (state.battleFronts || []).filter(f => f.state === 'ACTIVE');
  
  if (activeBattles.length === 0) {
    ui.activeFrontsBox.setContent('No active battles');
    ui.activeFrontsBox.style.border.fg = 'white';
    return;
  }
  
  let content = '';
  
  activeBattles.forEach(front => {
    const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
    const rightArmy = state.armies.find(a => a.id === front.rightArmyId);
    
    if (!leftArmy || !rightArmy) {
      return;
    }
    
    // Morale badges
    const leftBadge = front.moraleBroken.left ? '{red-fg}B{/red-fg}' : '{green-fg}M{/green-fg}';
    const rightBadge = front.moraleBroken.right ? '{red-fg}B{/red-fg}' : '{green-fg}M{/green-fg}';
    
    // MP values
    const leftMP = `${Math.floor(leftArmy.mp.current)}/${leftArmy.mp.max}`;
    const rightMP = `${Math.floor(rightArmy.mp.current)}/${rightArmy.mp.max}`;
    
    // Calculate bar representation
    const totalMP = leftArmy.mp.current + rightArmy.mp.current;
    const barWidth = 20;
    const leftBarWidth = totalMP > 0 ? Math.floor((leftArmy.mp.current / totalMP) * barWidth) : barWidth / 2;
    const rightBarWidth = barWidth - leftBarWidth;
    
    const leftBar = '█'.repeat(leftBarWidth);
    const rightBar = '█'.repeat(rightBarWidth);
    
    // Build the line
    content += `{bold}${front.id}{/bold}\n`;
    content += `${leftArmy.name} [${leftBadge}] ${leftMP}  `;
    content += `{cyan-fg}${leftBar}{/cyan-fg}{yellow-fg}${rightBar}{/yellow-fg}  `;
    content += `${rightMP} [${rightBadge}] ${rightArmy.name}\n`;
    content += `Field Size: ${front.battlefieldSize}, Turn: ${state.turn - front.startedAtTick}\n\n`;
  });
  
  ui.activeFrontsBox.setContent(content);
  ui.activeFrontsBox.style.border.fg = 'cyan';
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
  renderActiveFronts(ui, state);
  renderStats(ui, state);
  renderTables(ui, state);
  renderLog(ui, state);
  ui.screen.render();
}
