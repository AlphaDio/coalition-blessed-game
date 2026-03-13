import { BATTLE_CONSTANTS, INSURRECTION_CONSTANTS } from '../constants.js';
import {
  clampApproval,
  applyScaledCoalitionCohesionDelta
} from '../cohesion.js';
import { getCohesionTier } from '../cohesion.js';
import { getActiveBattles, simulateBattleTick } from '../frontBattles.js';
import { selectInsurrectionTargetEmpire } from '../insurrection.js';
import { selectScourgeTargetEmpire } from '../scourgePrediction.js';
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
  getBattleWinner
} from './battleUtils.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getMutualSupportRelation(state, sourceEmpireId, targetEmpireId) {
  const outgoing = Number(state.diplomacy?.relations?.[sourceEmpireId]?.[targetEmpireId] ?? 0);
  const incoming = Number(state.diplomacy?.relations?.[targetEmpireId]?.[sourceEmpireId] ?? 0);
  return Math.min(outgoing, incoming);
}

export function buildScourgeDefensePlan(state, targetEmpireId) {
  const targetEmpire = state.empires.find(empire => empire.id === targetEmpireId) || null;
  if (!targetEmpire) {
    return { targetEmpire: null, participantPlans: [] };
  }

  const rebelliousArmyIds = collectRebelliousArmyIds(state.insurrections);
  const participantPlans = [];
  const addPlan = (army, commitRatio, isSupport, supportRelation = null) => {
    if (!army?.id || rebelliousArmyIds.has(army.id) || !isRegularArmy(army)) {
      return;
    }
    if ((army.mp?.current || 0) <= 0) {
      return;
    }
    const normalizedRatio = clamp(Number(commitRatio) || 0, 0, 1);
    if (normalizedRatio <= 0) {
      return;
    }
    participantPlans.push({
      armyId: army.id,
      commitRatio: normalizedRatio,
      isSupport,
      supportRelation
    });
  };

  const targetEmpireArmies = state.armies.filter(army =>
    army.empireId === targetEmpire.id &&
    isRegularArmy(army) &&
    !rebelliousArmyIds.has(army.id) &&
    (army.mp?.current || 0) > 0 &&
    army.organization >= BATTLE_CONSTANTS.SCOURGE_TARGET_ARMY_ORG_MIN
  );

  targetEmpireArmies.forEach(army => addPlan(army, 1.0, false));

  state.empires
    .filter(empire => empire.id !== targetEmpire.id)
    .forEach(empire => {
      const mutualRelation = getMutualSupportRelation(state, empire.id, targetEmpire.id);
      if (mutualRelation < BATTLE_CONSTANTS.SCOURGE_ASSIST_MIN_RELATIONS) {
        return;
      }

      const assistRatio = clamp(
        mutualRelation / 200,
        0.1,
        BATTLE_CONSTANTS.SCOURGE_ASSIST_MAX_RATIO
      );
      const minSupportOrg = Math.max(30, 55 - (mutualRelation / 4));
      const supportArmies = state.armies.filter(army =>
        army.empireId === empire.id &&
        isRegularArmy(army) &&
        !rebelliousArmyIds.has(army.id) &&
        (army.mp?.current || 0) > 0 &&
        army.organization >= minSupportOrg
      );

      supportArmies.forEach(army => addPlan(army, assistRatio, true, mutualRelation));
    });

  return { targetEmpire, participantPlans };
}

export function resolveScourgeParticipantPlans(state, participantPlans = []) {
  return participantPlans
    .map(plan => {
      const army = state.armies.find(candidate => candidate.id === plan.armyId);
      if (!army || !isRegularArmy(army) || (army.mp?.current || 0) <= 0) {
        return null;
      }

      return {
        army,
        commitRatio: clamp(Number(plan.commitRatio) || 0, 0, 1),
        isSupport: !!plan.isSupport,
        supportRelation: Number.isFinite(plan.supportRelation) ? plan.supportRelation : null
      };
    })
    .filter(participant => participant && participant.commitRatio > 0);
}

export function handleBattlePhase(state, rng, log, logger) {
  const tier = getCohesionTier(state.coalitionCohesion);
  const battleChance = getBattleChance(tier?.name, state.turn || 0);

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

  // Handle battles that ended this turn — always apply MP/permanent losses to original armies
  battlesEndedThisTick.forEach(front => {
    const leftArmy = state.armies.find(a => a.id === front.leftArmyId);
    const rightArmy = state.armies.find(a => a.id === front.rightArmyId);
    // Use the winner stored by endBattle first (wounded recovery can restore MP
    // after a shattered army is defeated, making MP-based checks unreliable).
    let winnerSide = front.winnerSide || getBattleWinner(leftArmy, rightArmy);
    // Last-resort fallback: if neither the stored winner nor getBattleWinner
    // could determine a side, try raw MP comparison.
    if (!winnerSide && leftArmy && rightArmy) {
      if ((leftArmy.mp?.current ?? 0) <= 0) winnerSide = 'right';
      else if ((rightArmy.mp?.current ?? 0) <= 0) winnerSide = 'left';
    }

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
    const targetSelection = selectScourgeTargetEmpire(state, rng);
    const targetEmpire = targetSelection?.empire;
    if (targetEmpire) {
      state.scourgeTargetEmpireId = targetEmpire.id;
      if (targetSelection.source === 'directed') {
        state.scourgeDirectedTargetEmpireId = null;
      }

      const targetingReason =
        targetSelection.source === 'directed'
          ? ' (intel-directed)'
          : targetSelection.source === 'pending'
            ? ' (locked)'
            : '';
      log.push(`Scourge targeting ${targetEmpire.name}${targetingReason}`);
      logger.info(`Scourge targeting ${targetEmpire.name}${targetingReason}`);

      const { participantPlans } = buildScourgeDefensePlan(state, targetEmpire.id);
      const supportPlans = participantPlans.filter(plan => plan.isSupport);

      logger.info(
        `Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance.toFixed(3)}, ` +
        `${participantPlans.length} armies responding, ${supportPlans.length} allied detachments)`
      );
      logger.debug(
        `Scourge battle triggered (roll=${battleRoll.toFixed(3)} < ${battleChance}), ` +
        `${participantPlans.length} armies responding`
      );

      if (participantPlans.length > 0) {
        if (!state.activeEvent && !state.pendingScourgeAttack) {
          state.pendingScourgeAttack = {
            targetEmpireId: targetEmpire.id,
            participatingArmyIds: participantPlans.map(plan => plan.armyId),
            participantPlans,
            ready: false,
            createdAt: state.turn
          };
          const missionEvent = buildPreAttackMissionEvent(state, rng);
          state.activeEvent = missionEvent;
          log.push(`Event: ${missionEvent.title}`);
          logger.info(`Pre-attack mission triggered: ${missionEvent.title}`);
          return;
        }

        const battleParticipants = resolveScourgeParticipantPlans(state, participantPlans);
        const battleResult = startScourgeBattle(state, battleParticipants, rng);
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
  const appliedCohesionDelta = applyScaledCoalitionCohesionDelta(state, -cohesionLoss);
  const appliedCohesionLoss = Math.abs(appliedCohesionDelta);

  const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
  state.empires.forEach(empire => {
    empire.approval = clampApproval(empire.approval - approvalLoss);
  });

  log.push(`Scourge victory (no armies available)! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCohesionLoss.toFixed(2)}), All Empires Approval -${approvalLoss}`);
  logger.info(`Scourge battle: Defeat (no armies)! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCohesionLoss.toFixed(2)}), All Empires Approval -${approvalLoss}`);
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
    const rebelliousArmies = state.armies.filter(army => rebelliousArmyIds.has(army.id));
    const targetEmpireId = selectInsurrectionTargetEmpire(state, insurrection, rng);
    const opposingArmies = state.armies.filter(army =>
      !rebelliousArmyIds.has(army.id) &&
      army.empireId === targetEmpireId &&
      army.organization > 30 &&
      isRegularArmy(army)
    );

    if (!targetEmpireId || rebelliousArmies.length === 0) {
      if (!targetEmpireId) {
        logger.warn(`Insurrection ${insurrection.id} has no valid target empire, resolving without battle`);
      }
      if (rebelliousArmies.length === 0) {
        logger.warn(`Insurrection ${insurrection.id} has no remaining rebellious armies, resolving`);
      }
      insurrection.active = false;
      insurrection.resolvedAtTurn = state.turn;
      return;
    }

    if (opposingArmies.length === 0) {
      const targetEmpire = state.empires.find(empire => empire.id === targetEmpireId) || null;
      const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_LOSS_COHESION_LOSS;
      const prevCoalitionCohesion = state.coalitionCohesion;
      const appliedCohesionDelta = applyScaledCoalitionCohesionDelta(state, -cohesionLoss);
      const appliedCohesionLoss = Math.abs(appliedCohesionDelta);

      if (targetEmpire) {
        targetEmpire.approval = clampApproval(targetEmpire.approval - INSURRECTION_CONSTANTS.RESOLVED_APPROVAL_SHOCK);
      }

      insurrection.active = false;
      insurrection.resolvedAtTurn = state.turn;
      const targetLabel = targetEmpire ? targetEmpire.name : targetEmpireId;
      const message =
        `Insurrection spreads into ${targetLabel} unopposed! ` +
        `Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCohesionLoss.toFixed(2)}), ` +
        `Approval -${INSURRECTION_CONSTANTS.RESOLVED_APPROVAL_SHOCK}`;
      log.push(message);
      logger.warn(message);
      return;
    }

    const battleResult = startInsurrectionBattle(state, insurrection, opposingArmies, rng);
    if (battleResult && battleResult.log && battleResult.front) {
      log.push(...battleResult.log);
    }
  });
}

