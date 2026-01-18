// Command parser for input box
// Parses user text commands and executes corresponding actions

import { handleReqCommand, handleImpCommand, getImprovementsHelpText } from './improvementsCommands.js';

const COMMAND_ALIASES = new Map([
  ['help', 'help'],
  ['h', 'help'],
  ['?', 'help'],
  ['law', 'law'],
  ['enact', 'law'],
  ['event', 'event'],
  ['choice', 'event'],
  ['pause', 'pause'],
  ['resume', 'resume'],
  ['unpause', 'resume'],
  ['speed', 'speed'],
  ['quit', 'quit'],
  ['exit', 'quit'],
  ['next', 'next'],
  ['advance', 'next'],
  ['logs', 'logs'],
  ['log', 'logs'],
  ['req', 'req'],
  ['request', 'req'],
  ['imp', 'imp'],
  ['improvement', 'imp']
]);

export function parseCommand(commandText, state, ui, gameLoopCallbacks) {
  const trimmed = commandText.trim().toLowerCase();

  if (!trimmed) {
    return { success: false, message: 'Empty command' };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);
  const commandKey = COMMAND_ALIASES.get(command);

  if (!commandKey) {
    return {
      success: false,
      message: `Unknown command: '${command}'. Type 'help' for available commands.`
    };
  }

  return COMMAND_HANDLERS[commandKey](args, state, ui, gameLoopCallbacks);
}

const COMMAND_HANDLERS = {
  help: showHelp,
  law: (args, state) => handleLawCommand(args, state),
  event: (args, state) => handleEventCommand(args, state),
  pause: (_args, state) => handlePauseCommand(state),
  resume: (_args, state) => handleResumeCommand(state),
  speed: (args, state) => handleSpeedCommand(args, state),
  quit: () => ({
    success: true,
    action: 'QUIT_GAME',
    message: 'Quitting game...'
  }),
  next: (_args, state) => handleNextTurnCommand(state),
  logs: (_args, _state, ui) => handleLogsCommand(ui),
  req: (args, state) => handleReqCommand(args, state),
  imp: (args, state) => handleImpCommand(args, state)
};


function showHelp() {
  const improvementsHelp = getImprovementsHelpText();
  const helpText = [
    '{bold}Available Commands:{/bold}',
    '',
    '{cyan-fg}Game Control:{/cyan-fg}',
    '  pause                - Pause the game',
    '  resume, unpause      - Resume the game',
    '  speed <value>        - Set game speed (0.5-3.0)',
    '  next, advance        - Advance one turn (when paused)',
    '  quit, exit           - Exit the game',
    '',
    '{cyan-fg}Laws:{/cyan-fg}',
    '  law <number>         - Enact law by number (1-based)',
    '  enact <number>       - Same as law',
    '',
    '{cyan-fg}Events:{/cyan-fg}',
    '  event <number>       - Choose event option (1-3)',
    '  choice <number>      - Same as event',
    '',
    ...improvementsHelp,
    '',
    '{cyan-fg}Interface:{/cyan-fg}',
    '  logs, log            - Toggle full logs window',
    '  help, h, ?           - Show this help',
    '',
    '{yellow-fg}Keyboard shortcuts still work!{/yellow-fg}',
    'Press TAB to switch to keyboard mode, ESC to return to input.'
  ].join('\n');
  
  return {
    success: true,
    message: helpText
  };
}

function handleLawCommand(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: law <number>. Example: law 1'
    };
  }
  
  const lawIndex = parseInt(args[0], 10) - 1; // Convert to 0-based index
  
  if (isNaN(lawIndex)) {
    return {
      success: false,
      message: `Invalid law number: '${args[0]}'. Must be a number.`
    };
  }
  
  const lawDefs = state.lawDefinitions || state.laws || [];
  
  if (lawIndex < 0 || lawIndex >= lawDefs.length) {
    return {
      success: false,
      message: `Law number out of range. Available laws: 1-${lawDefs.length}`
    };
  }
  
  // Set the selected index so the Enter key handler can process it
  state.selectedLawIndex = lawIndex;
  
  return {
    success: true,
    action: 'ENACT_LAW',
    lawIndex
  };
}

function handleEventCommand(args, state) {
  if (!state.activeEvent) {
    return {
      success: false,
      message: 'No active event to respond to.'
    };
  }
  
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: event <number>. Example: event 1'
    };
  }
  
  const choiceIndex = parseInt(args[0], 10) - 1; // Convert to 0-based index
  
  if (isNaN(choiceIndex)) {
    return {
      success: false,
      message: `Invalid choice number: '${args[0]}'. Must be a number.`
    };
  }
  
  if (choiceIndex < 0 || choiceIndex >= (state.activeEvent.choices?.length || 0)) {
    return {
      success: false,
      message: `Choice out of range. Available choices: 1-${state.activeEvent.choices?.length || 0}`
    };
  }
  
  return {
    success: true,
    action: 'CHOOSE_EVENT',
    choiceIndex
  };
}

function handlePauseCommand(state) {
  if (state.gameOver) {
    return {
      success: false,
      message: 'Game is over.'
    };
  }
  
  if (state.paused) {
    return {
      success: false,
      message: 'Game is already paused.'
    };
  }
  
  state.paused = true;
  return {
    success: true,
    message: 'Game PAUSED'
  };
}

function handleResumeCommand(state) {
  if (state.gameOver) {
    return {
      success: false,
      message: 'Game is over.'
    };
  }
  
  if (!state.paused) {
    return {
      success: false,
      message: 'Game is already running.'
    };
  }
  
  state.paused = false;
  return {
    success: true,
    message: 'Game RESUMED'
  };
}

function handleSpeedCommand(args, state) {
  if (args.length === 0) {
    return {
      success: true,
      message: `Current game speed: ${state.gameSpeed}x`
    };
  }
  
  const speed = parseFloat(args[0]);
  
  if (isNaN(speed)) {
    return {
      success: false,
      message: `Invalid speed: '${args[0]}'. Must be a number between 0.5 and 3.0`
    };
  }
  
  if (speed < 0.5 || speed > 3.0) {
    return {
      success: false,
      message: `Speed out of range: ${speed}. Must be between 0.5 and 3.0`
    };
  }
  
  state.gameSpeed = speed;
  
  return {
    success: true,
    action: 'UPDATE_SPEED',
    message: `Game speed set to ${speed}x`
  };
}

function handleNextTurnCommand(state) {
  if (state.gameOver) {
    return {
      success: false,
      message: 'Game is over.'
    };
  }
  
  if (!state.paused) {
    return {
      success: false,
      message: 'Can only advance turn when paused. Use "pause" first.'
    };
  }
  
  if (state.activeEvent) {
    return {
      success: false,
      message: 'Cannot advance turn with active event. Respond to event first.'
    };
  }
  
  return {
    success: true,
    action: 'ADVANCE_TURN'
  };
}

function handleLogsCommand(ui) {
  if (!ui.logsWindow) {
    return {
      success: false,
      message: 'Logs window not available.'
    };
  }
  
  return {
    success: true,
    action: 'TOGGLE_LOGS'
  };
}
