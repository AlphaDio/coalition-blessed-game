import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Log levels in order of severity
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LogLevelNames = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR'
};

/**
 * Logger class for managing application logs
 */
class Logger {
  constructor(config = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.fileLevel = config.fileLevel ?? LogLevel.DEBUG; // File always logs DEBUG by default
    this.enableConsole = config.enableConsole ?? true;
    this.enableFile = config.enableFile ?? false;
    this.enableUI = config.enableUI ?? false;
    this.uiLogBox = config.uiLogBox ?? null;
    this.filePath = config.filePath ?? null;
    this.fileStream = null;
    this.logHistory = []; // Store log entries for UI display
    this.maxHistorySize = 1000; // Maximum number of log entries to keep in memory
    
    // Create logs directory if file logging is enabled
    if (this.enableFile && !this.filePath) {
      const logsDir = path.join(__dirname, '..', '..', 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.filePath = path.join(logsDir, `game-${timestamp}.log`);
    }
    
    // Open file stream if file logging is enabled
    if (this.enableFile && this.filePath) {
      this.fileStream = fs.createWriteStream(this.filePath, { flags: 'a' });
      this.fileStream.write(`\n=== Log session started at ${new Date().toISOString()} ===\n`);
      // Only log to console if console logging is enabled
      if (this.enableConsole) {
        console.log(`[Logger] File logging enabled: ${this.filePath}`);
      }
    }
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const levelName = LogLevelNames[level];
    let formatted = `[${timestamp}] [${levelName}] ${message}`;
    
    if (data !== null && data !== undefined) {
      formatted += ` ${typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)}`;
    }
    
    return formatted;
  }

  /**
   * Write log to console
   */
  writeToConsole(level, formattedMessage) {
    if (!this.enableConsole) return;
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  /**
   * Write log to file
   */
  writeToFile(formattedMessage) {
    if (!this.enableFile || !this.fileStream) return;
    
    this.fileStream.write(formattedMessage + '\n');
  }

  /**
   * Write log to UI logBox
   */
  writeToUI(message, level) {
    if (!this.enableUI || !this.uiLogBox) return;
    
    // Format for UI (simpler, no timestamp)
    let uiMessage = message;
    
    // Add color tags based on level
    // Note: blessed tags use {color-fg} format, but we need to ensure they're properly parsed
    switch (level) {
      case LogLevel.DEBUG:
        uiMessage = `{gray-fg}[DEBUG]{/gray-fg} ${message}`;
        break;
      case LogLevel.INFO:
        // No special formatting for info
        break;
      case LogLevel.WARN:
        uiMessage = `{yellow-fg}[WARN]{/yellow-fg} ${message}`;
        break;
      case LogLevel.ERROR:
        uiMessage = `{red-fg}[ERROR]{/red-fg} ${message}`;
        break;
    }
    
    // Use add() method which properly handles tags, or log() if add() doesn't exist
    if (typeof this.uiLogBox.add === 'function') {
      this.uiLogBox.add(uiMessage);
    } else {
      this.uiLogBox.log(uiMessage);
    }
  }

  /**
   * Core log method
   */
  log(level, message, data = null) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Store in history for logs window (only if above console level)
    if (level >= this.level) {
      this.logHistory.push({
        level,
        message,
        formattedMessage,
        timestamp: new Date().toISOString(),
        data
      });
      
      // Keep history size manageable
      if (this.logHistory.length > this.maxHistorySize) {
        this.logHistory = this.logHistory.slice(-this.maxHistorySize);
      }
    }
    
    // Console and UI respect the console log level
    if (level >= this.level) {
      this.writeToConsole(level, formattedMessage);
      this.writeToUI(message, level);
    }
    
    // File always writes if above file level (defaults to DEBUG)
    if (level >= this.fileLevel) {
      this.writeToFile(formattedMessage);
    }
  }
  
  /**
   * Get log history for display
   */
  getHistory(limit = null) {
    if (limit) {
      return this.logHistory.slice(-limit);
    }
    return this.logHistory;
  }
  
  /**
   * Clear log history
   */
  clearHistory() {
    this.logHistory = [];
  }

  /**
   * Log at DEBUG level
   */
  debug(message, data = null) {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log at INFO level
   */
  info(message, data = null) {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log at WARN level
   */
  warn(message, data = null) {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log at ERROR level
   */
  error(message, data = null) {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Set the log level
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * Enable/disable console output
   */
  setConsoleOutput(enabled) {
    this.enableConsole = enabled;
  }

  /**
   * Enable/disable file output
   */
  setFileOutput(enabled, filePath = null) {
    this.enableFile = enabled;
    
    if (enabled && filePath) {
      this.filePath = filePath;
      if (this.fileStream) {
        this.fileStream.end();
      }
      this.fileStream = fs.createWriteStream(this.filePath, { flags: 'a' });
    } else if (!enabled && this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  /**
   * Enable/disable UI output
   */
  setUIOutput(enabled, uiLogBox = null) {
    this.enableUI = enabled;
    this.uiLogBox = uiLogBox;
  }

  /**
   * Close file stream and cleanup
   */
  close() {
    if (this.fileStream) {
      this.fileStream.write(`\n=== Log session ended at ${new Date().toISOString()} ===\n`);
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

// Default logger instance
let defaultLogger = null;

/**
 * Initialize the default logger with configuration
 */
export function initializeLogger(config = {}) {
  defaultLogger = new Logger(config);
  return defaultLogger;
}

/**
 * Get the default logger instance
 */
export function getLogger() {
  if (!defaultLogger) {
    // Initialize with defaults if not already initialized
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

/**
 * Convenience functions that use the default logger
 */
export function debug(message, data = null) {
  getLogger().debug(message, data);
}

export function info(message, data = null) {
  getLogger().info(message, data);
}

export function warn(message, data = null) {
  getLogger().warn(message, data);
}

export function error(message, data = null) {
  getLogger().error(message, data);
}

/**
 * Create a new logger instance with custom configuration
 */
export function createLogger(config = {}) {
  return new Logger(config);
}
