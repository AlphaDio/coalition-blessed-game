import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { getLogger } from '../modules/logger.js';
import { GameManager } from './gameManager.js';
import { EMERGENCY_LAW_DEFINITIONS } from '../game/emergencyLaws.js';
import { BANK_THRESHOLD } from '../game/coalitionProcurement.js';
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

  // Broadcast game state to all connected clients
  function broadcastGameState(state) {
    const message = JSON.stringify({
      type: 'state_update',
      payload: state,
      timestamp: Date.now()
    });

    connectedClients.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
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
        ws.send(message);
      }
    });
  }

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    try {
      logger.info('WebSocket client connected');
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
        logger.info('WebSocket client disconnected');
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
      broadcastNotification('law_enacted', { lawId, turn: state.turn });
      
      res.sendSuccess(state, {
        notification: {
          type: 'law_enacted',
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

  // Get commodity definitions
  app.get('/api/game/definitions/resources', (req, res) => {
    try {
      const resourcesPath = path.join(__dirname, '..', '..', 'modules', 'resources.yaml');
      const content = fs.readFileSync(resourcesPath, 'utf8');
      const doc = yaml.load(content);
      const commodities = doc.resources?.commodities || [];
      res.sendSuccess({ commodities });
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
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
      logger.info(`CORS enabled for origin: ${corsOrigin}`);
      resolve({ httpServer, app, wss, gameManager, broadcastGameState, broadcastNotification });
    });
  });
}
