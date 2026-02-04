/**
 * Coalition Game API Server - Entry Point
 * 
 * Runs the game in API mode with WebSocket support for web frontend
 * Usage: node server.js
 * 
 * Environment variables:
 * - PORT: API server port (default: 3001)
 * - CORS_ORIGIN: CORS origin for web frontend (default: http://localhost:3000)
 * - SEED: Game seed (default: random)
 */

import { createApiServer } from './src/server/api.js';
import { getLogger } from './src/modules/logger.js';

const logger = getLogger();

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : undefined;

// Start the server
async function main() {
  try {
    logger.info('Starting Coalition Game API Server...');
    logger.info(`Port: ${PORT}`);
    logger.info(`CORS Origin: ${CORS_ORIGIN}`);
    
    const gameSeed = SEED !== undefined ? SEED : Math.floor(Math.random() * 1000000);
    const result = await createApiServer(PORT, CORS_ORIGIN, gameSeed);
    const httpServer = result.httpServer;
    const gameManager = result.gameManager;

    // Start the game loop (will respect paused state)
    gameManager.startGameLoop();

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Shutting down gracefully...');
      gameManager.stopGameLoop();
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      logger.info('Shutting down gracefully...');
      gameManager.stopGameLoop();
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

main();
