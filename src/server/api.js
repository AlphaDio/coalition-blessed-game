import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { getLogger, LogLevel, LogLevelNames } from '../modules/logger.js';
import { GameManager } from './gameManager.js';
import { EMERGENCY_LAW_DEFINITIONS } from '../game/emergencyLaws.js';
import { BANK_THRESHOLD } from '../game/coalitionProcurement.js';
import { getEmergencyPowerDefinitions } from '../game/emergencyPowers.js';
import { 
  apiResponseMiddleware,
  ErrorCodes
} from './apiResponseFormatter.js';

/**
 * Coalition Game API Server
 * Provides REST endpoints and WebSocket for real-time game updates
 */

const logger = getLogger();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cached resources - loaded once at startup
let cachedResources = null;
let resourcesLoadError = null;

/**
 * Load and cache resources.yaml at startup
 * This avoids blocking the event loop on every request
 */
async function loadAndCacheResources() {
  try {
    const resourcesPath = path.join(__dirname, '..', '..', 'modules', 'resources.yaml');
    const content = await fsPromises.readFile(resourcesPath, 'utf8');
    const doc = yaml.load(content);
    cachedResources = {
      commodities: doc.resources?.commodities || [],
      lastLoadedAt: Date.now()
    };
    logger.debug(`Resources cached successfully (${cachedResources.commodities.length} commodities)`);
  } catch (error) {
    resourcesLoadError = error;
    logger.error(`Failed to cache resources at startup: ${error.message}`);
    logger.error(error.stack);
  }
}

export function createApiServer(port = 3001, corsOrigin = 'http://localhost:3000') {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // Middleware
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());
  app.use(apiResponseMiddleware);

  // Game manager instance
  const gameManager = new GameManager();

  // Register state change callback to broadcast updates to all clients
  gameManager.onStateChange((state) => {
    broadcastGameState(state);
  });

  // Track connected clients
  const connectedClients = new Set();

  /**
   * Safely send message to a WebSocket client, removing it if send fails
   */
  function safelySendToClient(ws, message) {
    try {
      ws.send(message);
    } catch (error) {
      logger.warn(`Failed to send message to WebSocket client: ${error.message}`);
      // Remove from connected clients and close the socket
      connectedClients.delete(ws);
      try {
        ws.close(1011, 'Send error');
      } catch (closeError) {
        // Socket may already be closed, ignore
      }
    }
  }

  // Broadcast game state to all connected clients
  function broadcastGameState(state) {
    const message = JSON.stringify({
      type: 'state_update',
      payload: state,
      timestamp: Date.now()
    });

    connectedClients.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        safelySendToClient(ws, message);
      }
    });
  }

  // Broadcast notification to all clients
  function broadcastNotification(type, data) {
    const message = JSON.stringify({
      type,
      payload: data,
      timestamp: Date.now()
    });

    connectedClients.forEach(ws => {
      if (ws.readyState === 1) {
        safelySendToClient(ws, message);
      }
    });
  }

  function broadcastLogEntry(entry) {
    const message = JSON.stringify({
      type: 'log_event',
      payload: {
        level: entry.level,
        levelName: LogLevelNames[entry.level] || 'UNKNOWN',
        message: entry.message,
        timestamp: entry.timestamp,
        data: entry.data
      }
    });

    connectedClients.forEach(ws => {
      if (ws.readyState === 1) {
        safelySendToClient(ws, message);
      }
    });
  }

  const logUnsubscribe = logger.onLog((entry) => {
    broadcastLogEntry(entry);
  });

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    try {
      logger.debug('WebSocket client connected');
      connectedClients.add(ws);

      // Send current game state to new client
      try {
        const state = gameManager.getGameState();
        ws.send(JSON.stringify({
          type: 'initial_state',
          payload: state,
          timestamp: Date.now()
        }));
      } catch (stateError) {
        logger.error(`Error getting game state for initial message: ${stateError.message}`);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Failed to get initial game state' },
          timestamp: Date.now()
        }));
      }

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          logger.debug(`WebSocket message received: ${message.type}`);

          switch (message.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
            default:
              logger.warn(`Unknown WebSocket message type: ${message.type}`);
          }
        } catch (error) {
          logger.error(`WebSocket message error: ${error.message}`);
        }
      });

      ws.on('close', () => {
        logger.debug('WebSocket client disconnected');
        connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error: ${error.message}`);
      });
    } catch (error) {
      logger.error(`WebSocket connection handler error: ${error.message}`);
      logger.error(error.stack);
      
      // Send error message to client before closing
      try {
        ws.send(JSON.stringify({
          type: 'connection_error',
          payload: {
            message: 'Connection initialization failed',
            details: error.message
          },
          timestamp: Date.now()
        }));
      } catch (sendError) {
        logger.error(`Failed to send error message to client: ${sendError.message}`);
      }
      
      ws.close(1011, 'Server error during connection initialization');
    }
  });

  // REST API Endpoints

  // Get current game state
  app.get('/api/game/state', (req, res) => {
    try {
      const state = gameManager.getGameState();
      res.sendSuccess(state);
    } catch (error) {
      logger.error(`Error getting game state: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve game state',
        { originalError: error.message }
      );
    }
  });

  // Create new game
  app.post('/api/game/new', (req, res) => {
    try {
      const seed = req.body.seed || Math.floor(Math.random() * 1000000);
      const state = gameManager.newGame(seed);
      broadcastNotification('game_new', { seed, turn: state.turn });
      res.sendSuccess(state, {
        notification: {
          type: 'game_new',
          details: { seed, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error creating new game: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to create new game',
        { originalError: error.message }
      );
    }
  });

  // Pause/Unpause game
  app.post('/api/game/actions/pause', (req, res) => {
    try {
      const paused = req.body.paused;
      
      if (typeof paused !== 'boolean') {
        return res.sendError(
          ErrorCodes.INVALID_PARAMETER,
          'paused must be a boolean value'
        );
      }
      
      gameManager.setPaused(paused);
      const state = gameManager.getGameState();
      broadcastNotification('game_pause', { paused, turn: state.turn });
      
      res.sendSuccess({ paused }, {
        notification: {
          type: 'game_pause',
          details: { paused, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error pausing game: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to toggle pause state',
        { originalError: error.message }
      );
    }
  });

  // Set game speed
  app.post('/api/game/actions/speed', (req, res) => {
    try {
      const speed = req.body.speed;
      
      if (speed === undefined || speed === null) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter: speed'
        );
      }
      
      if (typeof speed !== 'number' || speed < 0.5 || speed > 3.0) {
        return res.sendError(
          ErrorCodes.INVALID_PARAMETER,
          'Game speed must be a number between 0.5 and 3.0',
          { min: 0.5, max: 3.0, provided: speed }
        );
      }
      
      gameManager.setGameSpeed(speed);
      const state = gameManager.getGameState();
      broadcastNotification('game_speed', { speed, turn: state.turn });
      
      res.sendSuccess({ speed }, {
        notification: {
          type: 'game_speed',
          details: { speed, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error setting game speed: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to set game speed',
        { originalError: error.message }
      );
    }
  });

  // Enact a law
  app.post('/api/game/actions/enact-law', (req, res) => {
    try {
      const lawId = req.body.lawId;
      
      if (!lawId) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter: lawId'
        );
      }
      
      const result = gameManager.enactLaw(lawId);
      
      if (!result.success) {
        // Map game manager errors to specific error codes
        let errorCode = ErrorCodes.INVALID_ACTION;
        let statusCode = 400;
        
        if (result.error?.includes('not found')) {
          errorCode = ErrorCodes.LAW_NOT_FOUND;
        } else if (result.error?.includes('already enacted')) {
          errorCode = ErrorCodes.LAW_ALREADY_ENACTED;
        } else if (result.error?.includes('cooldown')) {
          errorCode = ErrorCodes.LAW_ON_COOLDOWN;
        } else if (result.error?.includes('insufficient')) {
          errorCode = ErrorCodes.INSUFFICIENT_RESOURCES;
        }
        
        return res.sendError(errorCode, result.error, {}, statusCode);
      }
      
      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('law_started', { lawId, turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'law_started',
          details: { lawId, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error enacting law: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to enact law',
        { originalError: error.message }
      );
    }
  });

  // Handle event choice
  app.post('/api/game/actions/event-choice', (req, res) => {
    try {
      const eventId = req.body.eventId;
      const choiceIndex = req.body.choiceIndex;
      
      if (!eventId || choiceIndex === undefined) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameters: eventId, choiceIndex'
        );
      }
      
      if (typeof choiceIndex !== 'number' || choiceIndex < 0) {
        return res.sendError(
          ErrorCodes.INVALID_PARAMETER,
          'choiceIndex must be a non-negative number'
        );
      }
      
      const result = gameManager.handleEventChoice(eventId, choiceIndex);
      
      if (!result.success) {
        let errorCode = ErrorCodes.INVALID_ACTION;
        
        if (result.error?.includes('not found')) {
          errorCode = ErrorCodes.EVENT_NOT_FOUND;
        } else if (result.error?.includes('invalid') || result.error?.includes('Invalid')) {
          errorCode = ErrorCodes.INVALID_PARAMETER;
        }
        
        return res.sendError(errorCode, result.error || 'Failed to process event choice');
      }
      
      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('event_choice', { eventId, choiceIndex, turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'event_choice',
          details: { eventId, choiceIndex, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error handling event choice: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to process event choice',
        { originalError: error.message }
      );
    }
  });

  // Accept improvement request
  app.post('/api/game/actions/improvement', (req, res) => {
    try {
      const requestId = req.body.requestId;
      const action = req.body.action || 'accept'; // 'accept' or 'cancel'
      const empireId = req.body.empireId;
      
      if (!requestId) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter: requestId'
        );
      }
      
      if (action === 'accept' && !empireId) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter for accept action: empireId'
        );
      }
      
      if (action !== 'accept' && action !== 'cancel') {
        return res.sendError(
          ErrorCodes.INVALID_PARAMETER,
          'action must be either "accept" or "cancel"'
        );
      }
      
      const result = gameManager.handleImprovementAction(action, requestId, empireId);
      
      if (!result.success) {
        let errorCode = ErrorCodes.INVALID_ACTION;
        
        if (result.error?.includes('not found')) {
          errorCode = ErrorCodes.IMPROVEMENT_NOT_FOUND;
        } else if (result.error?.includes('insufficient')) {
          errorCode = ErrorCodes.INSUFFICIENT_RESOURCES;
        } else if (result.error?.includes('no empire')) {
          errorCode = ErrorCodes.EMPIRE_NOT_FOUND;
        }
        
        return res.sendError(errorCode, result.error || 'Failed to process improvement action');
      }
      
      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('improvement_action', { action, requestId, turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'improvement_action',
          details: { action, requestId, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error handling improvement action: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to process improvement action',
        { originalError: error.message }
      );
    }
  });

  // Activate emergency law
  app.post('/api/game/actions/emergency-law', (req, res) => {
    try {
      const lawId = req.body.lawId;
      
      if (!lawId) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter: lawId'
        );
      }
      
      const result = gameManager.activateEmergencyLaw(lawId);
      
      if (!result.success) {
        let errorCode = ErrorCodes.INVALID_ACTION;
        
        if (result.error?.includes('not found')) {
          errorCode = ErrorCodes.LAW_NOT_FOUND;
        } else if (result.error?.includes('insufficient')) {
          errorCode = ErrorCodes.INSUFFICIENT_RESOURCES;
        } else if (result.error?.includes('cooldown')) {
          errorCode = ErrorCodes.LAW_ON_COOLDOWN;
        }
        
        return res.sendError(errorCode, result.error || 'Failed to activate emergency law');
      }
      
      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('emergency_law_activated', { lawId, turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'emergency_law_activated',
          details: { lawId, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error activating emergency law: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to activate emergency law',
        { originalError: error.message }
      );
    }
  });

  // Activate emergency power
  app.post('/api/game/actions/emergency-power', (req, res) => {
    try {
      const powerId = req.body.powerId;
      if (!powerId) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter: powerId'
        );
      }

      const result = gameManager.activateEmergencyPower(powerId);
      if (!result.success) {
        return res.sendError(
          ErrorCodes.INVALID_ACTION,
          result.error || 'Failed to activate emergency power'
        );
      }

      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('emergency_power_activated', { powerId, turn: state.turn });
      res.sendSuccess(state, {
        notification: {
          type: 'emergency_power_activated',
          details: { powerId, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error activating emergency power: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to activate emergency power',
        { originalError: error.message }
      );
    }
  });

  // Set mission slider
  app.post('/api/game/actions/mission-slider', (req, res) => {
    try {
      const value = req.body.value;
      if (value === undefined || value === null) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Missing required parameter: value'
        );
      }

      const result = gameManager.setMissionSlider(value);
      if (!result.success) {
        return res.sendError(
          ErrorCodes.INVALID_PARAMETER,
          result.error || 'Invalid mission slider value'
        );
      }

      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('mission_slider_set', { value, turn: state.turn });
      res.sendSuccess(state, {
        notification: {
          type: 'mission_slider_set',
          details: { value, turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error setting mission slider: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to set mission slider',
        { originalError: error.message }
      );
    }
  });

  // Manually advance one turn (when paused)
  app.post('/api/game/actions/advance-turn', (req, res) => {
    try {
      const result = gameManager.advanceTurnManually();
      
      if (!result.success) {
        let errorCode = ErrorCodes.INVALID_ACTION;
        
        if (result.error?.includes('game over') || result.error?.includes('Game is over')) {
          errorCode = ErrorCodes.GAME_OVER;
        }
        
        return res.sendError(errorCode, result.error || 'Failed to advance turn');
      }
      
      const state = gameManager.getGameState();
      broadcastGameState(state);
      broadcastNotification('turn_advanced', { turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'turn_advanced',
          details: { turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error advancing turn: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to advance turn',
        { originalError: error.message }
      );
    }
  });

  // Get save state
  app.get('/api/game/save', (req, res) => {
    try {
      const saveData = gameManager.getSaveState();
      res.sendSuccess(saveData);
    } catch (error) {
      logger.error(`Error getting save state: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve save state',
        { originalError: error.message }
      );
    }
  });

  // Load save state
  app.post('/api/game/load', (req, res) => {
    try {
      const saveData = req.body;
      
      if (!saveData) {
        return res.sendError(
          ErrorCodes.MISSING_PARAMETER,
          'Save data is required in request body'
        );
      }
      
      const state = gameManager.loadSaveState(saveData);
      broadcastGameState(state);
      broadcastNotification('game_loaded', { turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'game_loaded',
          details: { turn: state.turn }
        }
      });
    } catch (error) {
      logger.error(`Error loading save state: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to load save state',
        { originalError: error.message }
      );
    }
  });

  // Get technology definitions
  app.get('/api/game/definitions/technologies', async (req, res) => {
    try {
      logger.debug('Technologies endpoint called');
      const techModule = await import('../game/technologyDefinitions.js');
      logger.debug('Technology module imported, keys:', Object.keys(techModule));
      
      const TECH_BY_ID = techModule.TECH_BY_ID;
      if (!TECH_BY_ID || typeof TECH_BY_ID !== 'object') {
        logger.error('TECH_BY_ID is not available or invalid:', typeof TECH_BY_ID);
        throw new Error('TECH_BY_ID is not available or invalid');
      }
      
      logger.debug('TECH_BY_ID has', Object.keys(TECH_BY_ID).length, 'entries');
      const technologies = Object.entries(TECH_BY_ID).map(([id, tech]) => ({
        id,
        name: tech.name || id,
        description: tech.description || '',
        category: tech.category || 'general'
      }));
      res.sendSuccess({ technologies });
    } catch (error) {
      logger.error('Failed to fetch technology definitions:', error);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch technology definitions',
        { originalError: error.message }
      );
    }
  });

  // Get law definitions
  app.get('/api/game/definitions/laws', async (req, res) => {
    try {
      const { TIERED_LAW_DEFINITIONS } = await import('../game/lawDefinitions.js');
      const laws = TIERED_LAW_DEFINITIONS.map((law) => ({
        id: law.id,
        name: law.name,
        description: law.description,
        tier: law.tier,
        branch: law.branch,
        tags: law.tags
      }));
      res.sendSuccess({ laws });
    } catch (error) {
      logger.error('Failed to fetch law definitions:', error);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch law definitions',
        { originalError: error.message }
      );
    }
  });

  // Get improvement definitions
  app.get('/api/game/definitions/improvements', async (req, res) => {
    try {
      const { getTieredImprovementRequests } = await import('../game/improvements/definitions.js');
      const improvementRequests = getTieredImprovementRequests();
      const improvements = improvementRequests.map((imp) => ({
        id: imp.id,
        name: imp.name,
        description: imp.description,
        tier: imp.tier,
        branch: imp.branch,
        supplyUpkeep: imp.supplyUpkeep,
        modifiers: imp.modifiers
      }));
      res.sendSuccess({ improvements });
    } catch (error) {
      logger.error('Failed to fetch improvement definitions:', error);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch improvement definitions',
        { originalError: error.message }
      );
    }
  });

  // Get recent logs
  app.get('/api/game/logs', (req, res) => {
    try {
      const MAX_LOG_LIMIT = 1000; // Match logger's maxHistorySize
      const MIN_LOG_LIMIT = 1;
      const DEFAULT_LOG_LIMIT = 500;
      const LOG_LEVEL_BY_NAME = {
        debug: LogLevel.DEBUG,
        info: LogLevel.INFO,
        warn: LogLevel.WARN,
        warning: LogLevel.WARN,
        error: LogLevel.ERROR
      };

      // Parse and validate limit parameter
      let limit = DEFAULT_LOG_LIMIT;
      if (req.query.limit) {
        const parsed = parseInt(req.query.limit, 10);
        // Clamp to valid range: must be a positive integer
        if (!isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, MAX_LOG_LIMIT);
        }
      }

      let minLevel = null;
      if (req.query.minLevel || req.query.level) {
        const rawLevel = String(req.query.minLevel || req.query.level).trim().toLowerCase();
        const numericLevel = parseInt(rawLevel, 10);
        if (!isNaN(numericLevel)) {
          minLevel = numericLevel;
        } else if (rawLevel in LOG_LEVEL_BY_NAME) {
          minLevel = LOG_LEVEL_BY_NAME[rawLevel];
        }
      }

      const logs = logger.getHistory(limit, minLevel);
      res.sendSuccess({ logs });
    } catch (error) {
      logger.error(`Error getting logs: ${error.message}`);
      logger.error(error.stack);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve logs',
        { originalError: error.message }
      );
    }
  });

  // Get emergency law definitions
  app.get('/api/game/definitions/emergency-laws', (req, res) => {
    try {
      const emergencyLaws = EMERGENCY_LAW_DEFINITIONS.map((law) => ({
        id: law.id,
        name: law.name,
        description: law.description,
        duration: law.duration,
        cooldown: law.cooldown,
        costs_per_tick: law.costs_per_tick,
        modifiers: law.modifiers,
        axis_vector: law.axis_vector
      }));
      res.sendSuccess({ emergencyLaws });
    } catch (error) {
      logger.error('Failed to fetch emergency law definitions:', error);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch emergency law definitions',
        { originalError: error.message }
      );
    }
  });

  // Get emergency power definitions
  app.get('/api/game/definitions/emergency-powers', (req, res) => {
    try {
      const emergencyPowers = getEmergencyPowerDefinitions().map((power) => ({
        id: power.id,
        name: power.name,
        cost_glory: power.cost_glory,
        duration_ticks: power.duration_ticks,
        effects: power.effects
      }));
      res.sendSuccess({ emergencyPowers });
    } catch (error) {
      logger.error('Failed to fetch emergency power definitions:', error);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch emergency power definitions',
        { originalError: error.message }
      );
    }
  });

  // Get commodity definitions
  app.get('/api/game/definitions/resources', (req, res) => {
    try {
      // Check if resources failed to load at startup
      if (resourcesLoadError && !cachedResources) {
        logger.error('Resources not available - failed to load at startup');
        return res.sendError(
          ErrorCodes.INTERNAL_SERVER_ERROR,
          'Failed to fetch resource definitions',
          { originalError: resourcesLoadError.message }
        );
      }

      // Serve from cache (non-blocking)
      res.sendSuccess({ commodities: cachedResources?.commodities || [] });
    } catch (error) {
      logger.error('Failed to fetch resource definitions:', error);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch resource definitions',
        { originalError: error.message }
      );
    }
  });

  // Get procurement constants
  app.get('/api/game/definitions/procurement', (req, res) => {
    try {
      res.sendSuccess({ bankThreshold: BANK_THRESHOLD });
    } catch (error) {
      logger.error('Failed to fetch procurement definitions:', error);
      res.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to fetch procurement definitions',
        { originalError: error.message }
      );
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.sendSuccess({ status: 'ok' });
  });

  // Start the server
  return new Promise(async (resolve) => {
    // Load resources at startup before accepting requests
    await loadAndCacheResources();

    httpServer.listen(port, () => {
      logger.debug(`API server listening on port ${port}`);
      logger.debug(`CORS enabled for origin: ${corsOrigin}`);

      // Setup cleanup handlers for graceful shutdown
      const cleanup = () => {
        logger.debug('API server shutting down, cleaning up resources...');
        
        // Unsubscribe logger listener
        try {
          logUnsubscribe();
          logger.debug('Logger subscription cleaned up');
        } catch (error) {
          console.error('Error unsubscribing from logger:', error.message);
        }
        
        // Close all WebSocket connections
        try {
          wss.clients.forEach((client) => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.close(1001, 'Server shutting down');
            }
          });
          logger.debug('WebSocket clients closed');
        } catch (error) {
          console.error('Error closing WebSocket clients:', error.message);
        }
        
        // Clear connected clients set
        connectedClients.clear();
        
        // Close the WebSocket server
        try {
          wss.close(() => {
            logger.debug('WebSocket server closed');
          });
        } catch (error) {
          console.error('Error closing WebSocket server:', error.message);
        }
      };

      // Wire cleanup to HTTP server close event
      httpServer.on('close', cleanup);
      
      // Also handle process signals for graceful shutdown
      process.once('SIGTERM', () => {
        logger.debug('SIGTERM received, closing HTTP server');
        httpServer.close();
      });
      
      process.once('SIGINT', () => {
        logger.debug('SIGINT received, closing HTTP server');
        httpServer.close();
      });

      resolve({ httpServer, app, wss, gameManager, broadcastGameState, broadcastNotification, broadcastLogEntry, logUnsubscribe });
    });
  });
}
