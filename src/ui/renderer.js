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
  // Left column: Available Laws (row 3-7) and War Funds (row 7-11)
  const lawsBox = grid.set(3, 0, 4, 3, blessed.list, {
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
  
  const warFundsBox = grid.set(7, 0, 5, 3, blessed.list, {
    label: ' War Funds Allocation ',
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
  
  // Center: Event box (row 3-5) and Log (row 5-12)
  const eventBox = grid.set(3, 3, 2, 6, blessed.box, {
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
  
  // Right: Stats (row 3-6) and Tables (row 6-12)
  const statsBox = grid.set(3, 9, 3, 3, blessed.box, {
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
  
  const tablesBox = grid.set(6, 9, 6, 3, blessed.box, {
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
    activeLawsBox,
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
      
      // Meter bars
      const momentum = lp.meters.momentum || 0;
      const rejectPressure = lp.meters.reject_pressure || 0;
      
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


export function renderAll(ui, state) {
  renderActiveFronts(ui, state);
  renderActiveLaws(ui, state);
  renderLaws(ui, state);
  renderWarFunds(ui, state);
  renderEvent(ui, state);
  renderStats(ui, state);
  renderTables(ui, state);
  renderLog(ui, state);
  ui.screen.render();
}
