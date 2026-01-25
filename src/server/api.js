import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { getLogger } from '../modules/logger.js';
import { GameManager } from './gameManager.js';

/**
 * Coalition Game API Server
 * Provides REST endpoints and WebSocket for real-time game updates
 */

const logger = getLogger();

export function createApiServer(port = 3001, corsOrigin = 'http://localhost:3000') {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // Middleware
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  // Game manager instance
  const gameManager = new GameManager();

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
      ws.close();
    }
  });

  // REST API Endpoints

  // Get current game state
  app.get('/api/game/state', (req, res) => {
    try {
      const state = gameManager.getGameState();
      res.json({ success: true, data: state });
    } catch (error) {
      logger.error(`Error getting game state: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create new game
  app.post('/api/game/new', (req, res) => {
    try {
      const seed = req.body.seed || Math.floor(Math.random() * 1000000);
      const state = gameManager.newGame(seed);
      broadcastNotification('game_new', { seed, turn: state.turn });
      res.json({ success: true, data: state });
    } catch (error) {
      logger.error(`Error creating new game: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Pause/Unpause game
  app.post('/api/game/actions/pause', (req, res) => {
    try {
      const paused = req.body.paused;
      gameManager.setPaused(paused);
      const state = gameManager.getGameState();
      broadcastNotification('game_pause', { paused, turn: state.turn });
      res.json({ success: true, data: { paused } });
    } catch (error) {
      logger.error(`Error pausing game: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Set game speed
  app.post('/api/game/actions/speed', (req, res) => {
    try {
      const speed = req.body.speed;
      if (speed < 0.5 || speed > 3.0) {
        throw new Error('Game speed must be between 0.5 and 3.0');
      }
      gameManager.setGameSpeed(speed);
      const state = gameManager.getGameState();
      broadcastNotification('game_speed', { speed });
      res.json({ success: true, data: { speed } });
    } catch (error) {
      logger.error(`Error setting game speed: ${error.message}`);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Enact a law
  app.post('/api/game/actions/enact-law', (req, res) => {
    try {
      const lawId = req.body.lawId;
      const result = gameManager.enactLaw(lawId);
      if (result.success) {
        const state = gameManager.getGameState();
        broadcastGameState(state);
        broadcastNotification('law_enacted', { lawId, turn: state.turn });
      }
      res.json(result);
    } catch (error) {
      logger.error(`Error enacting law: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Handle event choice
  app.post('/api/game/actions/event-choice', (req, res) => {
    try {
      const eventId = req.body.eventId;
      const choiceIndex = req.body.choiceIndex;
      const result = gameManager.handleEventChoice(eventId, choiceIndex);
      if (result.success) {
        const state = gameManager.getGameState();
        broadcastGameState(state);
        broadcastNotification('event_choice', { eventId, choiceIndex, turn: state.turn });
      }
      res.json(result);
    } catch (error) {
      logger.error(`Error handling event choice: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Accept improvement request
  app.post('/api/game/actions/improvement', (req, res) => {
    try {
      const requestId = req.body.requestId;
      const action = req.body.action || 'accept'; // 'accept' or 'cancel'
      const empireId = req.body.empireId;
      const result = gameManager.handleImprovementAction(action, requestId, empireId);
      if (result.success) {
        const state = gameManager.getGameState();
        broadcastGameState(state);
        broadcastNotification('improvement_action', { action, requestId, turn: state.turn });
      }
      res.json(result);
    } catch (error) {
      logger.error(`Error handling improvement action: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Activate emergency law
  app.post('/api/game/actions/emergency-law', (req, res) => {
    try {
      const lawId = req.body.lawId;
      const result = gameManager.activateEmergencyLaw(lawId);
      if (result.success) {
        const state = gameManager.getGameState();
        broadcastGameState(state);
        broadcastNotification('emergency_law_activated', { lawId, turn: state.turn });
      }
      res.json(result);
    } catch (error) {
      logger.error(`Error activating emergency law: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Manually advance one turn (when paused)
  app.post('/api/game/actions/advance-turn', (req, res) => {
    try {
      const result = gameManager.advanceTurnManually();
      if (result.success) {
        const state = gameManager.getGameState();
        broadcastGameState(state);
        broadcastNotification('turn_advanced', { turn: state.turn });
      }
      res.json(result);
    } catch (error) {
      logger.error(`Error advancing turn: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get save state
  app.get('/api/game/save', (req, res) => {
    try {
      const saveData = gameManager.getSaveState();
      res.json({ success: true, data: saveData });
    } catch (error) {
      logger.error(`Error getting save state: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Load save state
  app.post('/api/game/load', (req, res) => {
    try {
      const saveData = req.body;
      const state = gameManager.loadSaveState(saveData);
      broadcastGameState(state);
      broadcastNotification('game_loaded', { turn: state.turn });
      res.json({ success: true, data: state });
    } catch (error) {
      logger.error(`Error loading save state: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
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
