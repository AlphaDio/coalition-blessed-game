# Logging System

A centralized logging system for the Coalition Blessed Game that supports multiple log levels, output destinations, and UI integration.

## Features

- **Multiple Log Levels**: DEBUG, INFO, WARN, ERROR
- **Multiple Output Destinations**: Console, File, UI (logBox)
- **Configurable**: Enable/disable outputs, set log levels
- **UI Integration**: Automatically formats logs for the in-game UI
- **File Logging**: File logging enabled by default with automatic log directory creation

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
  enableConsole: process.env.ENABLE_CONSOLE_LOGGING === 'true', // Disabled by default
  enableFile: process.env.DISABLE_FILE_LOGGING !== 'true', // Enabled by default
  enableUI: true,
  uiLogBox: ui.logBox
});
```

### Configuration Options

- `level`: Minimum log level (LogLevel.DEBUG, INFO, WARN, ERROR)
- `enableConsole`: Output to console (default: false, to avoid terminal pollution)
- `enableFile`: Output to file (default: true)
- `enableUI`: Output to UI logBox (default: false)
- `uiLogBox`: Blessed logBox widget for UI output
- `filePath`: Custom file path (default: auto-generated in `logs/` directory)

### Log Levels

- **DEBUG**: Detailed debugging information (only shown at DEBUG level)
- **INFO**: General informational messages (default level)
- **WARN**: Warning messages for potential issues
- **ERROR**: Error messages for failures

### File Logging

File logging is **enabled by default**. Logs are automatically saved to `logs/game-{timestamp}.log` in the project root directory. The `logs/` directory is created automatically if it doesn't exist.

To disable file logging, set the environment variable:
```bash
DISABLE_FILE_LOGGING=true node index.js
```

Each game session creates a new log file with a timestamp, so you can track multiple sessions separately.

### Console Logging

Console logging is **disabled by default** to avoid polluting the terminal UI. All logs are still written to files and displayed in the in-game logs window (press `L` to view).

To enable console output for debugging, set the environment variable:
```bash
ENABLE_CONSOLE_LOGGING=true node index.js
```

### Debug Logging

For more verbose debugging output, set the log level to DEBUG:
```bash
LOG_LEVEL=DEBUG node index.js
```

This will show detailed information about:
- Turn progression and state changes
- Battle calculations and power values
- Event checks and selections
- Supply consumption
- Law process resolution
- And more detailed game mechanics

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
