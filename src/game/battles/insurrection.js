import { BATTLE_CONSTANTS, INSURRECTION_CONSTANTS } from '../constants.js';
import {
  clampStat,
  clampApproval,
  applyScaledCoalitionCohesionDelta
} from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { startBattle } from '../frontBattles.js';
import { calculateBattlefieldSize } from './power.js';
import { createCombinedCoalitionArmy } from './coalition.js';
import { awardArmyBattleExperience } from '../armyExperience.js';

function deriveTargetEmpireId(insurrection, opposingArmies) {
  if (insurrection?.targetEmpireId) {
    return insurrection.targetEmpireId;
  }

  const empireIds = [...new Set((opposingArmies || []).map(army => army?.empireId).filter(Boolean))];
  return empireIds.length === 1 ? empireIds[0] : null;
}

function applyPermanentLossToArmy(army, originalMP, originalMaxMP, permanentLossRatio, currentRetentionRatio = 1) {
  if (!army?.mp) return;

  const clampedLossRatio = Math.max(0, Math.min(1, Number(permanentLossRatio) || 0));
  const clampedRetention = Math.max(0, Number(currentRetentionRatio) || 0);
  const safeOriginalMax = Math.max(1, Number(originalMaxMP) || 1);
  const safeOriginalCurrent = Math.max(0, Math.min(safeOriginalMax, Number(originalMP) || 0));

  const permanentLoss = safeOriginalMax * clampedLossRatio;
  const nextMax = Math.max(1, safeOriginalMax - permanentLoss);
  const retainedCurrent = safeOriginalCurrent * clampedRetention;
  const nextCurrent = Math.max(0, Math.min(nextMax, retainedCurrent));

  army.mp.max = nextMax;
  army.mp.current = nextCurrent;
  army.manpower = nextMax;
}

/**
 * Start a round-based insurrection battle
 * @param {Object} state - Game state
 * @param {Object} insurrection - Insurrection object
 * @param {Array} opposingArmies - Array of army objects opposing the insurrection
 * @param {Function} rng - Random number generator
 * @returns {Object} Battle front and log messages
 */
export function startInsurrectionBattle(state, insurrection, opposingArmies, rng = Math.random) {
  const logger = getLogger();
  const targetEmpireId = deriveTargetEmpireId(insurrection, opposingArmies);
  const targetEmpire = state.empires.find(empire => empire.id === targetEmpireId) || null;

  // Get rebellious armies
  const rebelliousArmyIds = new Set(insurrection.armies || []);
  const rebelliousArmies = state.armies.filter(army =>
    rebelliousArmyIds.has(army.id)
  );

  if (rebelliousArmies.length === 0 || opposingArmies.length === 0) {
    logger.warn('Insurrection battle: missing armies', {
      rebelliousCount: rebelliousArmies.length,
      opposingCount: opposingArmies.length
    });
    return { front: null, log: [] };
  }

  const targetLabel = targetEmpire ? ` targeting ${targetEmpire.name}` : '';
  logger.info(`Insurrection battle: ${rebelliousArmies.length} rebellious vs ${opposingArmies.length} loyal armies${targetLabel}`);
  logger.debug(`Insurrection battle starting: ${rebelliousArmies.length} rebellious armies vs ${opposingArmies.length} loyal armies`);
  logger.debug(`Rebellious armies: ${rebelliousArmies.map(a => `${a.name} (Aggravation: ${a.aggravation.toFixed(1)})`).join(', ')}`);
  logger.debug(`Loyal armies: ${opposingArmies.map(a => `${a.name} (Org: ${a.organization.toFixed(1)})`).join(', ')}`);

  // Create combined rebellious army
  const rebelliousArmy = createCombinedCoalitionArmy(state, rebelliousArmies, '_rebel');
  rebelliousArmy.name = `Rebellious Forces (${rebelliousArmies.length} armies)`;
  rebelliousArmy.empireId = '_insurrection';

  // Create combined loyal army
  const loyalArmy = createCombinedCoalitionArmy(state, opposingArmies, '_loyal');
  loyalArmy.name = `Loyal Forces (${opposingArmies.length} armies)`;
  loyalArmy.empireId = targetEmpireId || '_coalition';

  // Calculate battlefield size based on total forces
  const totalForces = rebelliousArmy.mp.current + loyalArmy.mp.current;
  const battlefieldSize = calculateBattlefieldSize(totalForces, rng);

  // Start the battle front (loyal on left, rebellious on right)
  const front = startBattle(state, loyalArmy.id, rebelliousArmy.id, battlefieldSize);

  // Mark as insurrection battle
  front.isInsurrectionBattle = true;
  front.insurrectionId = insurrection.id;
  front.rebelliousArmyIds = rebelliousArmies.map(a => a.id);
  front.loyalArmyIds = opposingArmies.map(a => a.id);
  front.targetEmpireId = targetEmpireId;

  const loyalMP = Math.floor(loyalArmy.mp.current);
  const rebelliousMP = Math.floor(rebelliousArmy.mp.current);
  logger.info(`Insurrection battle: Loyal ${loyalMP} MP vs Rebellious ${rebelliousMP} MP (Field: ${battlefieldSize})${targetLabel}`);
  logger.debug(`Insurrection battle front created: ${front.id}`, {
    battlefieldSize,
    loyalMP: loyalArmy.mp.current,
    rebelliousMP: rebelliousArmy.mp.current
  });

  return { front, log: [`Insurrection battle engaged! ${rebelliousArmies.length} rebellious vs ${opposingArmies.length} loyal armies`] };
}

/**
 * Handle insurrection battle end and apply results
 * @param {Object} state - Game state
 * @param {Object} front - Battle front
 * @param {string} winnerSide - 'left' (loyal) or 'right' (rebellious)
 * @returns {Object} Result with log messages
 */
export function handleInsurrectionBattleEnd(state, front, winnerSide) {
  const logger = getLogger();
  const log = [];
  const loyalArmy = state.armies.find(a => a.id === front.leftArmyId);
  const rebelliousArmy = state.armies.find(a => a.id === front.rightArmyId);

  if (!loyalArmy || !rebelliousArmy) {
    logger.error('Insurrection battle end: missing armies', { frontId: front.id });
    return { log };
  }

  // Calculate battle stats for summary
  const loyalDestroyed = Math.floor(front.permanentLosses?.left || 0);
  const rebelliousDestroyed = Math.floor(front.permanentLosses?.right || 0);
  const loyalWoundedReturned = Math.floor(front.woundedReturned?.left || 0);
  const rebelliousWoundedReturned = Math.floor(front.woundedReturned?.right || 0);
  const loyalRemaining = Math.floor(loyalArmy.mp.current);
  const rebelliousRemaining = Math.floor(rebelliousArmy.mp.current);

  // Get original army data
  const loyalArmyData = loyalArmy._originalArmies || [];
  const rebelliousArmyData = rebelliousArmy._originalArmies || [];

  const loyalWon = winnerSide === 'left';
  const targetEmpireId = front.targetEmpireId || null;
  const targetedEmpire = state.empires.find(empire => empire.id === targetEmpireId) || null;

  // Use permanent losses (kill-rate driven) for lasting capacity damage.
  // Use current retention (post-battle remaining manpower ratio) for current MP.
  const loyalPermanentLoss = Math.max(0, Number(front.permanentLosses?.left || 0));
  const rebelliousPermanentLoss = Math.max(0, Number(front.permanentLosses?.right || 0));
  const loyalOriginalCurrent = Math.max(
    1,
    loyalArmyData.reduce((sum, armyData) => sum + Math.max(0, Number(armyData.originalMP) || 0), 0)
  );
  const rebelliousOriginalCurrent = Math.max(
    1,
    rebelliousArmyData.reduce((sum, armyData) => sum + Math.max(0, Number(armyData.originalMP) || 0), 0)
  );
  const loyalCurrentRetentionRatio = Math.max(0, (loyalArmy.mp.current || 0) / loyalOriginalCurrent);
  const rebelliousCurrentRetentionRatio = Math.max(0, (rebelliousArmy.mp.current || 0) / rebelliousOriginalCurrent);
  const loyalMPLossRatio = loyalArmy.mp.max > 0 ? loyalPermanentLoss / loyalArmy.mp.max : 0;
  const rebelliousMPLossRatio = rebelliousArmy.mp.max > 0 ? rebelliousPermanentLoss / rebelliousArmy.mp.max : 0;
  const loyalIntensity = 1 + Math.min(
    1.5,
    (loyalMPLossRatio + (1 - loyalCurrentRetentionRatio)) * 0.9
  );
  const rebelliousIntensity = 1 + Math.min(
    1.5,
    (rebelliousMPLossRatio + (1 - rebelliousCurrentRetentionRatio)) * 0.9
  );

  // Distribute results to loyal armies
  loyalArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;
    const prevMax = Number(army.mp?.max || 0);
    const prevCurrent = Number(army.mp?.current || 0);
    applyPermanentLossToArmy(
      army,
      armyData.originalMP,
      armyData.originalMaxMP,
      loyalMPLossRatio,
      loyalCurrentRetentionRatio
    );
    const maxLoss = Math.max(0, prevMax - Number(army.mp?.max || 0));
    const currentLoss = Math.max(0, prevCurrent - Number(army.mp?.current || 0));
    if (maxLoss > 0.01 || currentLoss > 0.01) {
      log.push(`${army.name}: permanent battle losses -> MP ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)} (-${Math.floor(maxLoss)} cap, -${Math.floor(currentLoss)} current)`);
    }

    const experienceResult = awardArmyBattleExperience(army, {
      won: loyalWon,
      participation: Number.isFinite(Number(armyData?.commitRatio)) ? Number(armyData.commitRatio) : 1,
      intensity: loyalIntensity
    });
    if (experienceResult.levelsGained > 0) {
      const surgePct = Math.round((experienceResult.surge?.damageMult || 0) * 100);
      const message = `${army.name} reaches Veteran ${experienceResult.level} (+${surgePct}% next battle round surge)`;
      log.push(message);
      logger.info(message);
    }
  });

  // Distribute results to rebellious armies
  rebelliousArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;
    const prevMax = Number(army.mp?.max || 0);
    const prevCurrent = Number(army.mp?.current || 0);
    applyPermanentLossToArmy(
      army,
      armyData.originalMP,
      armyData.originalMaxMP,
      rebelliousMPLossRatio,
      rebelliousCurrentRetentionRatio
    );
    const maxLoss = Math.max(0, prevMax - Number(army.mp?.max || 0));
    const currentLoss = Math.max(0, prevCurrent - Number(army.mp?.current || 0));
    if (maxLoss > 0.01 || currentLoss > 0.01) {
      log.push(`${army.name}: permanent battle losses -> MP ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)} (-${Math.floor(maxLoss)} cap, -${Math.floor(currentLoss)} current)`);
    }

    if (loyalWon) {
      // Insurrection quelled
      army.fervor = clampStat(army.fervor - INSURRECTION_CONSTANTS.RESOLVED_FERVOR_DROP);
    }
    // Rebellion pressure is tracked by aggravation and is reset after an insurrection resolves.
    army.aggravation = INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION;

    const experienceResult = awardArmyBattleExperience(army, {
      won: !loyalWon,
      participation: Number.isFinite(Number(armyData?.commitRatio)) ? Number(armyData.commitRatio) : 1,
      intensity: rebelliousIntensity
    });
    if (experienceResult.levelsGained > 0) {
      const surgePct = Math.round((experienceResult.surge?.damageMult || 0) * 100);
      const message = `${army.name} reaches Veteran ${experienceResult.level} (+${surgePct}% next battle round surge)`;
      log.push(message);
      logger.info(message);
    }
  });

  // Mark insurrection as resolved regardless of winner.
  const insurrection = state.insurrections.find(ins => ins.id === front.insurrectionId);
  if (insurrection) {
    insurrection.active = false;
    insurrection.resolvedAtTurn = state.turn;
  }

  // Apply cohesion and approval changes
  if (loyalWon) {
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_WIN_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    const appliedCohesionDelta = applyScaledCoalitionCohesionDelta(state, -cohesionLoss);
    const appliedCohesionLoss = Math.abs(appliedCohesionDelta);

    logger.info(`Insurrection battle: Quelled! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCohesionLoss.toFixed(2)})`);
  } else {
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_LOSS_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    const appliedCohesionDelta = applyScaledCoalitionCohesionDelta(state, -cohesionLoss);
    const appliedCohesionLoss = Math.abs(appliedCohesionDelta);

    const approvalShock = INSURRECTION_CONSTANTS.RESOLVED_APPROVAL_SHOCK;
    if (targetedEmpire) {
      targetedEmpire.approval = clampApproval(targetedEmpire.approval - approvalShock);
    }

    logger.info(
      `Insurrection battle: Spreads! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCohesionLoss.toFixed(2)}), ` +
      `${targetedEmpire ? `${targetedEmpire.name} approval` : 'Target approval'} -${approvalShock}`
    );
  }

  // Emit battle summary
  const loyalSummary = `Loyal Forces: ${loyalDestroyed} destroyed, ${loyalWoundedReturned} recovered (wounded), ${loyalRemaining} remaining`;
  const rebelliousSummary = `Rebellious Forces: ${rebelliousDestroyed} destroyed, ${rebelliousWoundedReturned} recovered (wounded), ${rebelliousRemaining} remaining`;
  logger.info(`Insurrection battle summary - ${loyalSummary}`);
  logger.info(`Insurrection battle summary - ${rebelliousSummary}`);
  log.push(loyalSummary);
  log.push(rebelliousSummary);

  // Clean up temporary armies
  const loyalIndex = state.armies.findIndex(a => a.id === loyalArmy.id);
  if (loyalIndex >= 0) {
    state.armies.splice(loyalIndex, 1);
  }
  const rebelliousIndex = state.armies.findIndex(a => a.id === rebelliousArmy.id);
  if (rebelliousIndex >= 0) {
    state.armies.splice(rebelliousIndex, 1);
  }

  return { log };
}

// Legacy function for backwards compatibility (now creates a battle front)
export function resolveInsurrectionBattle(state, insurrection, opposingArmies, rng = Math.random) {
  return startInsurrectionBattle(state, insurrection, opposingArmies, rng);
}
