# Logging System

A centralized logging system for the Coalition Blessed Game that supports multiple log levels, output destinations, and UI integration.

## Features

- **Multiple Log Levels**: DEBUG, INFO, WARN, ERROR
- **Multiple Output Destinations**: Console, File, UI (logBox)
- **Configurable**: Enable/disable outputs, set log levels
- **UI Integration**: Automatically formats logs for the in-game UI
- **File Logging**: Optional file logging with automatic log directory creation

## Usage

### Basic Usage

```javascript
import { getLogger, info, warn, error, debug } from './src/modules/logger.js';

// Using convenience functions
info('Game started');
warn('Low supplies detected');
error('Failed to load module');

// Using logger instance
const logger = getLogger();
logger.debug('Detailed debug information');
```

### Initialization

The logger is initialized in `index.js` with UI integration:

```javascript
import { initializeLogger, LogLevel } from './src/modules/logger.js';

const logger = initializeLogger({
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.ENABLE_FILE_LOGGING === 'true',
  enableUI: true,
  uiLogBox: ui.logBox
});
```

### Configuration Options

- `level`: Minimum log level (LogLevel.DEBUG, INFO, WARN, ERROR)
- `enableConsole`: Output to console (default: true)
- `enableFile`: Output to file (default: false)
- `enableUI`: Output to UI logBox (default: false)
- `uiLogBox`: Blessed logBox widget for UI output
- `filePath`: Custom file path (default: auto-generated in `logs/` directory)

### Log Levels

- **DEBUG**: Detailed debugging information (only shown at DEBUG level)
- **INFO**: General informational messages (default level)
- **WARN**: Warning messages for potential issues
- **ERROR**: Error messages for failures

### File Logging

Enable file logging by setting the environment variable:
```bash
ENABLE_FILE_LOGGING=true node index.js
```

Logs are automatically saved to `logs/game-{timestamp}.log`.

### Creating Custom Logger Instances

```javascript
import { createLogger, LogLevel } from './src/modules/logger.js';

const customLogger = createLogger({
  level: LogLevel.DEBUG,
  enableConsole: false,
  enableFile: true,
  filePath: './custom.log'
});
```

## Integration

The logger has been integrated into:
- `index.js`: Main entry point with UI integration
- `src/modules/loader.js`: Module loading warnings

Replace `console.log`, `console.warn`, and `console.error` with the appropriate logger methods throughout the codebase.
