import { applyWarFundAllocation } from '../game/economy.js';
import { enactLaw } from '../game/laws.js';
import { handleEventChoice } from '../game/events.js';
import { advanceTurn } from '../game/turn.js';
import { renderAll, renderLaws, renderWarFunds } from './renderer.js';

export function setupInputHandlers(ui, state) {
  // Global keybinds
  ui.screen.key(['q', 'C-c'], () => {
    return process.exit(0);
  });
  
  ui.screen.key(['space'], () => {
    if (state.gameOver) return;
    if (state.activeEvent) {
      // Can't advance turn with active event
      return;
    }
    
    const result = advanceTurn(state);
    result.log.forEach(line => ui.logBox.log(line));
    renderAll(ui, state);
  });
  
  ui.screen.key(['tab'], () => {
    const focuses = ['main', 'laws', 'warfunds'];
    const currentIdx = focuses.indexOf(state.focus);
    state.focus = focuses[(currentIdx + 1) % focuses.length];
    renderAll(ui, state);
  });
  
  // Event choice keys
  ui.screen.key(['1'], () => {
    if (state.activeEvent) {
      const result = handleEventChoice(state, state.activeEvent.id, 0);
      if (result.success) {
        result.log.forEach(line => ui.logBox.log(line));
        renderAll(ui, state);
      }
    }
  });
  
  ui.screen.key(['2'], () => {
    if (state.activeEvent) {
      const result = handleEventChoice(state, state.activeEvent.id, 1);
      if (result.success) {
        result.log.forEach(line => ui.logBox.log(line));
        renderAll(ui, state);
      }
    }
  });
  
  ui.screen.key(['3'], () => {
    if (state.activeEvent) {
      const result = handleEventChoice(state, state.activeEvent.id, 2);
      if (result.success) {
        result.log.forEach(line => ui.logBox.log(line));
        renderAll(ui, state);
      }
    }
  });
  
  // Laws box
  ui.lawsBox.key(['up'], () => {
    if (state.selectedLawIndex > 0) {
      state.selectedLawIndex--;
      renderLaws(ui, state);
    }
  });
  
  ui.lawsBox.key(['down'], () => {
    if (state.selectedLawIndex < state.laws.length - 1) {
      state.selectedLawIndex++;
      renderLaws(ui, state);
    }
  });
  
  ui.lawsBox.key(['enter'], () => {
    const law = state.laws[state.selectedLawIndex];
    if (law) {
      const result = enactLaw(state, law.id);
      if (result.success) {
        result.log.forEach(line => ui.logBox.log(line));
        renderAll(ui, state);
      } else if (result.error) {
        ui.logBox.log(`Error: ${result.error}`);
        renderAll(ui, state);
      }
    }
  });
  
  // War Funds box
  ui.warFundsBox.key(['up'], () => {
    if (state.selectedArmyIndex > 0) {
      state.selectedArmyIndex--;
      renderWarFunds(ui, state);
    }
  });
  
  ui.warFundsBox.key(['down'], () => {
    if (state.selectedArmyIndex < state.armies.length - 1) {
      state.selectedArmyIndex++;
      renderWarFunds(ui, state);
    }
  });
  
  ui.warFundsBox.key(['enter'], () => {
    // Toggle war fund allocation mode
    // For simplicity, we'll use +/- keys to adjust
    ui.logBox.log('Use +/- to adjust allocation, Enter to confirm');
    renderAll(ui, state);
  });
  
  ui.warFundsBox.key(['+', '='], () => {
    if (state.armies[state.selectedArmyIndex]) {
      const army = state.armies[state.selectedArmyIndex];
      const currentTotal = state.armies.reduce((sum, a) => sum + a.warFundShare, 0);
      const available = 100 - (currentTotal - army.warFundShare);
      if (available > 0) {
        army.warFundShare = Math.min(100, army.warFundShare + 5);
        renderWarFunds(ui, state);
      }
    }
  });
  
  ui.warFundsBox.key(['-', '_'], () => {
    if (state.armies[state.selectedArmyIndex]) {
      const army = state.armies[state.selectedArmyIndex];
      army.warFundShare = Math.max(0, army.warFundShare - 5);
      renderWarFunds(ui, state);
    }
  });
  
  // Confirm war fund allocation
  ui.screen.key(['c'], () => {
    if (state.focus === 'warfunds') {
      const allocations = {};
      state.armies.forEach(army => {
        allocations[army.id] = army.warFundShare;
      });
      
      const result = applyWarFundAllocation(state, allocations);
      if (result.success) {
        ui.logBox.log('War funds allocated!');
        renderAll(ui, state);
      } else if (result.error) {
        ui.logBox.log(`Error: ${result.error}`);
        renderAll(ui, state);
      }
    }
  });
}
