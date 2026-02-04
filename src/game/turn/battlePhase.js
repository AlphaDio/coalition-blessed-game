import { BATTLE_CONSTANTS } from '../constants.js';
import { clampCohesion, clampApproval } from '../cohesion.js';
import { getCohesionTier } from '../cohesion.js';
import { getActiveBattles, simulateBattleTick } from '../frontBattles.js';
import {
  handleInsurrectionBattleEnd,
  handleScourgeBattleEnd,
  startInsurrectionBattle,
  startScourgeBattle
} from '../battles.js';
import { buildPreAttackMissionEvent } from '../scourgeMissions.js';
import { collectArmiesInBattle, isRegularArmy } from './armyUtils.js';
import {
  collectRebelliousArmyIds,
  getBattleChance,
  getBattleWinner,
  partitionInsurrectionArmies
} from './battleUtils.js';

export function handleBattlePhase(state, rng, log, logger) {
  const tier = getCohesionTier(state.coalitionCohesion);
  const battleChance = getBattleChance(tier?.name);

  logger.debug(`Battle check: tier=${tier?.name}, chance=${battleChance}`);

  // Simulate active front battles
  const activeBattles = getActiveBattles(state);
  if (activeBattles.length > 0) {
    logger.debug(`Processing ${activeBattles.length} active front battle(s)`);
  }

  // Process active battles (including Scourge battles)
  // Store battles that end during this tick
  const battlesEndedThisTick = [];
  activeBattles.forEach(front => {
    const wasActive = front.state === 'ACTIVE';
    const battleLog = simulateBattleTick(front, state);
    log.push(...battleLog);

    // Check if battle just ended
    if (wasActive && front.state === 'ENDED') {
      battlesEndedThisTick.push(front);
    }
  });

  // Handle battles that ended this turn
  battlesEndedThisTick.forEach(front => {
    // Determine winner from battle state
    const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
    const rightArmy = state.armies.find(a => a.id === front.rightArmyId);
    const winnerSide = getBattleWinner(leftArmy, rightArmy);

    if (winnerSide) {
      if (front.isScourgeBattle) {
        const result = handleScourgeBattleEnd(state, front, winnerSide);
        log.push(`Scourge battle ended: ${winnerSide === 'left' ? 'Coalition Victory' : 'Scourge Victory'}`);
        if (result.log) log.push(...result.log);
      } else if (front.isInsurrectionBattle) {
        const result = handleInsurrectionBattleEnd(state, front, winnerSide);
        log.push(`Insurrection battle ended: ${winnerSide === 'left' ? 'Loyal Victory' : 'Rebellion Victory'}`);
        if (result.log) log.push(...result.log);
      }
    }
  });

  triggerScourgeBattle(state, rng, battleChance, activeBattles, log, logger);
  triggerInsurrectionBattles(state, rng, activeBattles, log, logger);

  return activeBattles;
}

export function triggerScourgeBattle(state, rng, battleChance, activeBattles, log, logger) {
  const activeScourgeBattles = activeBattles.filter(f => f.isScourgeBattle);
  if (activeScourgeBattles.length > 0) {
    logger.debug('Scourge battle already active, skipping new battle trigger');
    return;
  }
  if (state.activeEvent) {
    return;
  }

  const battleRoll = rng();
  if (battleRoll >= battleChance || state.armies.length === 0) {
    return;
  }

  if (state.empires.length > 0) {
    const targetIndex = Math.floor(rng() * state.empires.length);
    const targetEmpire = state.empires[targetIndex];
    if (targetEmpire) {
      state.scourgeTargetEmpireId = targetEmpire.id;
      log.push(`Scourge targeting ${targetEmpire.name}`);
      logger.info(`Scourge targeting ${targetEmpire.name}`);

      const rebelliousArmyIds = collectRebelliousArmyIds(state.insurrections);
      let participatingArmies = [];

      // First, collect all target empire armies that meet basic criteria
      const targetEmpireArmies = state.armies.filter(army =>
        army.empireId === targetEmpire.id &&
        isRegularArmy(army) &&
        !rebelliousArmyIds.has(army.id) &&
        army.organization > 30
      );
      participatingArmies.push(...targetEmpireArmies);

      // For each other empire with positive relations, select a percentage of armies
      const otherEmpires = state.empires.filter(empire => empire.id !== targetEmpire.id);
      for (const otherEmpire of otherEmpires) {
        const relations = state.diplomacy?.relations?.[otherEmpire.id]?.[targetEmpire.id] ?? 0;
        if (relations <= 0) continue; // Skip hostile or neutral empires

        // Calculate participation percentage based on relations (0-100 range)
        const participationPercentage = Math.min(100, Math.max(0, relations));

        // Get all eligible armies from this empire (not rebellious, regular army)
        const empireArmies = state.armies.filter(army =>
          army.empireId === otherEmpire.id &&
          isRegularArmy(army) &&
          !rebelliousArmyIds.has(army.id)
        );

        if (empireArmies.length === 0) continue;

        // Select a random subset based on participation percentage
        const numToSelect = Math.ceil((empireArmies.length * participationPercentage) / 100);
        const shuffledArmies = [...empireArmies].sort(() => rng() - 0.5); // Random shuffle
        const selectedArmies = shuffledArmies.slice(0, numToSelect);

        // Apply organization filter to selected armies
        // Use a base threshold that gets lower with better relations
        const baseOrgThreshold = Math.max(20, 60 - (relations / 4));
        const filteredArmies = selectedArmies.filter(army => army.organization >= baseOrgThreshold);

        participatingArmies.push(...filteredArmies);
      }

      logger.info(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance.toFixed(3)}, ${participatingArmies.length} armies participating)`);
      logger.debug(`Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance}), ${participatingArmies.length} armies participating`);
      if (participatingArmies.length > 0) {
        if (!state.activeEvent && !state.pendingScourgeAttack) {
          state.pendingScourgeAttack = {
            targetEmpireId: targetEmpire.id,
            participatingArmyIds: participatingArmies.map(army => army.id),
            ready: false,
            createdAt: state.turn
          };
          const missionEvent = buildPreAttackMissionEvent(state, rng);
          state.activeEvent = missionEvent;
          log.push(`Event: ${missionEvent.title}`);
          logger.info(`Pre-attack mission triggered: ${missionEvent.title}`);
          return;
        }

        const battleResult = startScourgeBattle(state, participatingArmies, rng);
        log.push(...battleResult.log);
        // Reset fervor, protection, resolve, and kill rate bonuses after scourge battle
        for (const army of state.armies) {
          army.fervorBonus = 0;
          army.protectionBonus = 0;
          army.resolveBonus = 0;
          army.killRateBonus = 0;
          army.timedFervorBonuses = []; // Clear event-based fervor bonuses
        }
        for (const empire of state.empires) {
          empire.stats.approvalBonus = 0;
        }
        return;
      }
    }
  }

  // No armies can fight - Scourge wins by default
  logger.warn('Scourge battle: No armies available! Scourge victory by default');
  const cohesionLoss = BATTLE_CONSTANTS.SCOURGE_LOSS_COHESION_LOSS;
  const prevCoalitionCohesion = state.coalitionCohesion;
  state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);

  const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
  state.empires.forEach(empire => {
    empire.approval = clampApproval(empire.approval - approvalLoss);
  });

  log.push(`Scourge victory (no armies available)! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), All Empires Approval -${approvalLoss}`);
  logger.info(`Scourge battle: Defeat (no armies)! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), All Empires Approval -${approvalLoss}`);
  // Reset fervor, protection, resolve, and kill rate bonuses after scourge battle
  for (const army of state.armies) {
    army.fervorBonus = 0;
    army.protectionBonus = 0;
    army.resolveBonus = 0;
    army.killRateBonus = 0;
    army.timedFervorBonuses = []; // Clear event-based fervor bonuses
  }
  for (const empire of state.empires) {
    empire.stats.approvalBonus = 0;
  }
}

export function triggerInsurrectionBattles(state, rng, activeBattles, log, logger) {
  if (!state.insurrections || !Array.isArray(state.insurrections)) {
    return;
  }

  state.insurrections.forEach(insurrection => {
    if (!insurrection || !insurrection.active) {
      return;
    }

    const activeInsurrectionBattles = activeBattles.filter(f =>
      f.isInsurrectionBattle && f.insurrectionId === insurrection.id
    );

    if (activeInsurrectionBattles.length > 0) {
      logger.debug(`Insurrection battle already active for ${insurrection.id}, skipping new battle trigger`);
      return;
    }

    const rebelliousArmyIds = new Set(insurrection.armies || []);
    const { rebelliousArmies, opposingArmies } = partitionInsurrectionArmies(
      state.armies,
      rebelliousArmyIds
    );

    if (opposingArmies.length === 0 || rebelliousArmies.length === 0) {
      return;
    }

    const battleResult = startInsurrectionBattle(state, insurrection, opposingArmies, rng);
    if (battleResult && battleResult.log && battleResult.front) {
      log.push(...battleResult.log);
    }
  });
}

