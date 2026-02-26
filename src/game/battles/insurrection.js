import { BATTLE_CONSTANTS, INSURRECTION_CONSTANTS } from '../constants.js';
import { clampStat, clampCohesion, clampApproval } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { startBattle } from '../frontBattles.js';
import { calculateBattlefieldSize } from './power.js';
import { createCombinedCoalitionArmy } from './coalition.js';

function applyPermanentLossToArmy(army, originalMP, originalMaxMP, lossRatio) {
  if (!army?.mp) return;

  const clampedLossRatio = Math.max(0, Math.min(1, Number(lossRatio) || 0));
  const safeOriginalMax = Math.max(1, Number(originalMaxMP) || 1);
  const safeOriginalCurrent = Math.max(0, Number(originalMP) || 0);

  const permanentLoss = safeOriginalMax * clampedLossRatio;
  const nextMax = Math.max(1, safeOriginalMax - permanentLoss);
  const nextCurrent = Math.max(0, Math.min(nextMax, safeOriginalCurrent - permanentLoss));

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

  logger.info(`Insurrection battle: ${rebelliousArmies.length} rebellious vs ${opposingArmies.length} loyal armies`);
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
  loyalArmy.empireId = '_coalition';

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

  const loyalMP = Math.floor(loyalArmy.mp.current);
  const rebelliousMP = Math.floor(rebelliousArmy.mp.current);
  logger.info(`Insurrection battle: Loyal ${loyalMP} MP vs Rebellious ${rebelliousMP} MP (Field: ${battlefieldSize})`);
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

  // Calculate MP loss ratios
  const loyalMPLoss = loyalArmy.mp.max - loyalArmy.mp.current;
  const loyalMPLossRatio = loyalArmy.mp.max > 0 ? loyalMPLoss / loyalArmy.mp.max : 0;
  const rebelliousMPLoss = rebelliousArmy.mp.max - rebelliousArmy.mp.current;
  const rebelliousMPLossRatio = rebelliousArmy.mp.max > 0 ? rebelliousMPLoss / rebelliousArmy.mp.max : 0;

  // Distribute results to loyal armies
  loyalArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;
    applyPermanentLossToArmy(army, armyData.originalMP, armyData.originalMaxMP, loyalMPLossRatio);
  });

  // Distribute results to rebellious armies
  rebelliousArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;
    applyPermanentLossToArmy(army, armyData.originalMP, armyData.originalMaxMP, rebelliousMPLossRatio);

    if (loyalWon) {
      // Insurrection quelled
      army.fervor = clampStat(army.fervor - INSURRECTION_CONSTANTS.RESOLVED_FERVOR_DROP);
    }
    // Rebellion pressure is tracked by aggravation and is reset after an insurrection resolves.
    army.aggravation = INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION;
  });

  // Mark insurrection as resolved regardless of winner.
  const insurrection = state.insurrections.find(ins => ins.id === front.insurrectionId);
  if (insurrection) {
    insurrection.active = false;
  }

  // Apply cohesion and approval changes
  if (loyalWon) {
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_WIN_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);

    logger.info(`Insurrection battle: Quelled! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss})`);
  } else {
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_LOSS_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);

    const approvalShock = INSURRECTION_CONSTANTS.RESOLVED_APPROVAL_SHOCK;
    rebelliousArmyData.forEach(armyData => {
      const army = state.armies.find(a => a.id === armyData.id);
      if (army) {
        const empire = state.empires.find(e => e.id === army.empireId);
        if (empire) {
          empire.approval = clampApproval(empire.approval - approvalShock);
        }
      }
    });

    logger.info(`Insurrection battle: Spreads! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), Approval -${approvalShock}`);
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
