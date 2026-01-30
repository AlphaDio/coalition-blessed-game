import { createGameState, migrateGameState } from '../game/types.js';
import { createSampleContent } from '../game/content.js';
import { advanceTurn } from '../game/turn.js';
import { getSampleLawDefinitions } from '../game/lawDefinitions.js';
import { getAllLawEvents } from '../game/lawEventTemplates.js';
import { createPowerSystemPolicy } from '../game/types.js';
import { initializeLogger } from '../modules/logger.js';
import { initializeMarket, loadEconomyConfig } from '../game/marketEconomy.js';
import { DeterministicRNG } from '../modules/rng.js';
import { initializeImprovementsState } from '../game/improvements/index.js';
import { generateImprovementSuggestions } from '../game/improvements/definitions.js';
import { handleEventChoice } from '../game/events.js';
import { handleLawEventChoice, startLawProcess } from '../game/lawProcessManager.js';
import { acceptImprovementRequest, cancelImprovement } from '../game/improvements/index.js';
import { activateEmergencyLaw } from '../game/emergencyLaws.js';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = initializeLogger({
  level: 0, // INFO
  enableConsole: true,
  enableFile: false,
  enableUI: false
});

/**
 * GameManager: Manages game state and orchestrates game loop for server
 * Provides interface for API endpoints and WebSocket clients
 */
export class GameManager {
  constructor() {
    this.state = null;
    this.gameLoopInterval = null;
    this.stateChangeCallbacks = [];
    this.initializeNewGame();
  }

  ensureHeroRoster(force = false) {
    if (!this.state) return;
    if (force || !Array.isArray(this.state.heroRoster) || this.state.heroRoster.length === 0) {
      const content = createSampleContent(this.state.rngSeed ?? 0);
      this.state.heroRoster = content.heroRoster || [];
    }
  }

  /**
   * Initialize a brand new game
   */
  initializeNewGame(seed = Math.floor(Math.random() * 1000000)) {
    this.state = createGameState(seed);
    const content = createSampleContent(seed);

    this.state.empires = content.empires;
    this.state.armies = content.armies;
    this.state.laws = content.laws;
    this.state.events = content.events;
    this.state.heroRoster = content.heroRoster || [];
    this.state.heroes = content.heroes || [];
    this.state.diplomacy = content.diplomacy || { relations: {} };

    this.ensureDiplomacy();
    this.ensureHeroRoster();
    this.initializeEconomyState();
    this.initializeImprovementsState();
    this.applyLawSystemDefaults(true);

    logger.debug(`Game initialized with seed: ${seed}`);
  }

  /**
   * Initialize economy system
   */
  initializeEconomyState() {
    try {
      loadEconomyConfig();
      const resourcesPath = path.join(__dirname, '..', '..', 'modules', 'resources.yaml');
      const resourcesContent = fs.readFileSync(resourcesPath, 'utf8');
      const resourcesDoc = yaml.load(resourcesContent);
      const commodities = resourcesDoc.resources?.commodities || [];

      const marketRng = new DeterministicRNG(this.state.rngSeed);
      this.state.market = initializeMarket(commodities, marketRng.random.bind(marketRng));
      // Coalition economy now generates requisition from empire consumption
      // and credits from the allowance pool
      this.state.coalitionEconomy = {
        requisition: 500,
        treasury_credits: 10000,
        allowance_credits: 1000
      };

      logger.debug(`Economy initialized: ${commodities.length} commodities`);
    } catch (error) {
      logger.warn(`Economy initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize improvements system
   */
  initializeImprovementsState() {
    try {
      this.state.improvements = initializeImprovementsState();
      const improvementRng = new DeterministicRNG(this.state.rngSeed + 1000);
      this.state.improvements.requests = generateImprovementSuggestions(
        this.state,
        improvementRng.random.bind(improvementRng)
      );
      logger.debug(`Improvements system initialized: ${this.state.improvements.requests.length} requests`);
    } catch (error) {
      logger.warn(`Improvements initialization failed: ${error.message}`);
    }
  }

  /**
   * Apply law system defaults
   */
  applyLawSystemDefaults(force = false) {
    if (force || !this.state.lawDefinitions || this.state.lawDefinitions.length === 0) {
      this.state.lawDefinitions = getSampleLawDefinitions();
    }

    if (!this.state.events) {
      this.state.events = [];
    }

    const lawEvents = getAllLawEvents();
    const hasLawEvents = this.state.events.some(event => event.scope === 'LAW');
    if (force || !hasLawEvents) {
      this.state.events = [...this.state.events, ...lawEvents];
    }

    if (force || !this.state.powerSystemPolicy) {
      this.state.powerSystemPolicy = createPowerSystemPolicy(
        'equal_council',
        'Equal Council Votes',
        'equal_council',
        {
          base_votes_per_empire: 1,
          quorum_threshold: 0.5,
          pass_threshold: 0.5
        }
      );
    }

    if (force || typeof this.state.playerInfluence !== 'number') {
      this.state.playerInfluence = 100;
    }
    if (force || typeof this.state.influenceProgress !== 'number') {
      this.state.influenceProgress = 0;
    }
    if (force || !Array.isArray(this.state.lawProcesses)) {
      this.state.lawProcesses = [];
    }
    if (force || !Array.isArray(this.state.heroes)) {
      this.state.heroes = [];
    }
    this.ensureHeroRoster(force);
    if (force || !this.state.heroRecruitmentState || typeof this.state.heroRecruitmentState !== 'object') {
      this.state.heroRecruitmentState = {};
    }
    if (force || !this.state.enactedLawsByCategory || typeof this.state.enactedLawsByCategory !== 'object') {
      this.state.enactedLawsByCategory = {};
    }
    if (force || !Array.isArray(this.state.enactedLawsHistory)) {
      this.state.enactedLawsHistory = Array.isArray(this.state.enactedLaws) ? [...this.state.enactedLaws] : [];
    }
    if (force || !this.state.lawTierUnlocks || typeof this.state.lawTierUnlocks !== 'object') {
      this.state.lawTierUnlocks = { 1: true, 2: false, 3: false };
    }
    if (this.state.scourgeTargetEmpireId === undefined) {
      this.state.scourgeTargetEmpireId = null;
    }
    if (force || !this.state.scourgePrediction) {
      this.state.scourgePrediction = {
        targetEmpireId: null,
        estimatedTurnsToNextBattle: null,
        confidenceModifier: 1.0,
        confidenceLevel: 'low',
        uncertaintyRange: { min: null, max: null }
      };
    }
  }

  /**
   * Ensure diplomacy object exists
   */
  ensureDiplomacy() {
    this.state.diplomacy = this.state.diplomacy || { relations: {} };
    if (!this.state.empires || this.state.empires.length === 0) {
      return;
    }
    if (Object.keys(this.state.diplomacy.relations || {}).length === 0) {
      this.state.diplomacy.relations = {};
      this.state.empires.forEach(empire => {
        this.state.diplomacy.relations[empire.id] = {};
        this.state.empires.forEach(other => {
          if (empire.id === other.id) return;
          this.state.diplomacy.relations[empire.id][other.id] = 0;
        });
      });
    }
  }

  /**
   * Get current game state
   */
  getGameState() {
    return this.state;
  }

  /**
   * Create a new game
   */
  newGame(seed) {
    this.initializeNewGame(seed);
    this.notifyStateChange();
    return this.state;
  }

  /**
   * Set paused state
   */
  setPaused(paused) {
    this.state.paused = paused;
    this.notifyStateChange();
  }

  /**
   * Set game speed
   */
  setGameSpeed(speed) {
    this.state.gameSpeed = speed;
    // Restart game loop with new interval if it's running
    if (this.gameLoopInterval) {
      this.stopGameLoop();
      this.startGameLoop();
    }
    this.notifyStateChange();
  }

  /**
   * Enact a law
   */
  enactLaw(lawId) {
    try {
      const result = startLawProcess(this.state, lawId);
      if (result.success) {
        this.notifyStateChange();
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle event choice
   */
  handleEventChoice(eventId, choiceIndex) {
    try {
      let result;

      if (this.state.activeEvent?.isLawEvent) {
        result = handleLawEventChoice(
          this.state,
          this.state.activeEvent.lawProcessId,
          eventId,
          choiceIndex
        );
      } else {
        result = handleEventChoice(this.state, eventId, choiceIndex);
      }
      if (result.success || !result.error) {
        this.notifyStateChange();
      }
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle improvement action (accept or cancel)
   */
  handleImprovementAction(action, requestId, empireId) {
    try {
      let result;
      if (action === 'accept') {
        result = acceptImprovementRequest(this.state, requestId, empireId);
      } else if (action === 'cancel') {
        result = cancelImprovement(this.state, requestId);
      } else {
        throw new Error(`Unknown improvement action: ${action}`);
      }
      this.notifyStateChange();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Activate emergency law
   */
  activateEmergencyLaw(lawId) {
    try {
      const result = activateEmergencyLaw(lawId, this.state);
      if (result.success) {
        this.notifyStateChange();
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Manually advance one turn
   */
  advanceTurnManually() {
    try {
      if (this.state.gameOver) {
        return { success: false, error: 'Game is over' };
      }
      const result = advanceTurn(this.state);
      this.notifyStateChange();
      return { success: true, data: { turn: this.state.turn, log: result.log } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Start automatic game loop (advances turns at regular intervals)
   */
  startGameLoop(onStateChange) {
    if (this.gameLoopInterval) {
      return;
    }

    const tick = () => {
      try {
        if (this.state.paused) {
          return; // Game is paused, skip this tick
        }
        if (this.state.gameOver) {
          logger.info(`Game ended: ${this.state.gameOverReason || 'Unknown reason'}`);
          this.stopGameLoop();
          return;
        }
        if (this.state.activeEvent) {
          return; // Waiting for event choice, skip this tick
        }
        
        const result = advanceTurn(this.state);
        if (result) {
          logger.debug(`Turn ${this.state.turn}: ${result.log.length} log entries`);
        }
        this.notifyStateChange();

        if (this.state.gameOver) {
          logger.info(`Game ended: ${this.state.gameOverReason || 'Unknown reason'}`);
          this.stopGameLoop();
        }
      } catch (error) {
        logger.error(`Error in game loop tick: ${error.message}`);
        logger.error(error.stack);
        // Don't stop the loop, but log the error
      }
    };

    const gameSpeed = this.state.gameSpeed || 1;
    const interval = Math.max(100, Math.min(10000, (2000) / gameSpeed)); // Min 100ms, max 10s
    this.gameLoopInterval = setInterval(tick, interval);
    logger.debug(`Game loop started with interval ${interval}ms (speed: ${gameSpeed}x)`);
  }

  /**
   * Stop automatic game loop
   */
  stopGameLoop() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
      logger.debug('Game loop stopped');
    }
  }

  /**
   * Get save state (for serialization)
   */
  getSaveState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Load save state
   */
  loadSaveState(saveData) {
    // Migrate save data to current schema to handle missing fields
    this.state = migrateGameState(saveData);
    this.ensureHeroRoster();
    if (!this.state.heroRecruitmentState || typeof this.state.heroRecruitmentState !== 'object') {
      this.state.heroRecruitmentState = {};
    }
    this.notifyStateChange();
    logger.debug(`Game loaded: turn ${this.state.turn}`);
    return this.state;
  }

  /**
   * Register callback for state changes
   */
  onStateChange(callback) {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Notify all listeners of state change
   */
  notifyStateChange() {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        logger.error(`Error in state change callback: ${error.message}`);
      }
    });
  }
}
