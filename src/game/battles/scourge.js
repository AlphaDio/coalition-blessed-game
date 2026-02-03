import { BATTLE_CONSTANTS, SCOURGE_MISSION_CONSTANTS } from '../constants.js';
import { clampStat, clampCohesion, clampApproval } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { startBattle } from '../frontBattles.js';
import { collectScourgeModifierEffects, expireScourgeModifiersAfterAttack } from '../scourgeModifiers.js';
import { runHeroBattlePassives } from '../heroes.js';
import { calculateArmyPower, calculateBattlefieldSize } from './power.js';
import { createCombinedCoalitionArmy } from './coalition.js';

function removeScourgeForces(state) {
  if (state.armies) {
    state.armies = state.armies.filter(army => !(army.empireId === '_scourge' && army.id.startsWith('_scourge_army')));
  }
}

function createScourgeArmy(state, idSuffix) {
  const scourgeId = `_scourge_army_${idSuffix}`;
  const turnsElapsed = Math.max(0, (state.turn || 1) - 1);
  const powerScale = 1 + (turnsElapsed * BATTLE_CONSTANTS.SCOURGE_TURN_POWER_GROWTH);
  const baseMP = 12000 + (turnsElapsed * BATTLE_CONSTANTS.SCOURGE_TURN_MP_GROWTH);
  const fervorMPBonus = state.scourgeFervor * 50;
  // Manpower increases exponentially as cohesion drops
  const cohesionMultiplier = Math.exp((100 - state.scourgeCohesion) / 25);
  const manpowerPct = Math.max(0, Math.min(100, state.scourgeManpower ?? 100)) / 100;
  const missionDamagePct = Math.max(0, Math.min(1, state.scourgeNextAttackManpowerDamagePct || 0));
  const totalMP = (baseMP + fervorMPBonus) * cohesionMultiplier * manpowerPct * (1 - missionDamagePct);
  state.scourgeNextAttackManpowerDamagePct = 0;

  const alwaysEffects = collectScourgeModifierEffects(state.scourgeModifiers || [], 'always');
  const nextAttackEffects = collectScourgeModifierEffects(state.scourgeModifiers || [], 'next_attack_only');
  const attackPowerScale = Math.max(
    0.1,
    powerScale * (alwaysEffects.attackPowerMult * nextAttackEffects.attackPowerMult) +
      (alwaysEffects.attackPowerAdd + nextAttackEffects.attackPowerAdd)
  );

  const scourgeArmy = {
    id: scourgeId,
    empireId: '_scourge',
    name: 'The Scourge',
    fervor: state.scourgeFervor,
    organization: Math.min(100, 50 + state.scourgeFervor * 0.5),
    supplyNeed: 0,
    aggravation: 0,
    manpower: totalMP,
    empireId: '_scourge',
    performance: { base: 1.0, current: 1.0, bonusMultiplier: 1.0 },
    supply_state: { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} },
    demands: { needs: {}, wants: {} },

    mp: {
      current: totalMP,
      max: totalMP
    },
    mo: {
      current: 100,
      max: 100
    },

    dmgPerUnitMP: 0.95 * attackPowerScale,
    dmgPerTickMO: 2.2 * attackPowerScale,
    protection: 0.15,
    resolve: 0.25,
    killRate: 0.09 * attackPowerScale,

    recoveryPool: 0,
    command: 40,
    recovery: 40,
    reinforcementRate: 80
  };

  state.armies.push(scourgeArmy);

  return scourgeArmy;
}

/**
 * Start a round-based Scourge battle
 * @param {Object} state - Game state
 * @param {Array} participatingArmies - Array of army objects
 * @param {Function} rng - Random number generator
 * @returns {Object} Battle front and log messages
 */
export function startScourgeBattle(state, participatingArmies, rng = Math.random) {
  const logger = getLogger();
  const log = [];
  const participatingEmpireIds = [...new Set(participatingArmies.map(army => army.empireId))];
  runHeroBattlePassives(state, {
    phase: 'BATTLE',
    type: 'SCOURGE',
    participatingEmpireIds
  }, 'OnStart', log);

  logger.info(`Scourge battle: ${participatingArmies.length} armies vs Scourge`);
  logger.debug(`Scourge battle starting: ${participatingArmies.length} armies participating`);
  logger.debug(`Participating armies: ${participatingArmies.map(a => `${a.name} (Power: ${calculateArmyPower(a).toFixed(2)}, Org: ${a.organization.toFixed(1)}, Fervor: ${a.fervor.toFixed(1)})`).join(', ')}`);

  removeScourgeForces(state);
  const scourgeArmy = createScourgeArmy(state, state.turn);

  // Create combined coalition army
  const coalitionArmy = createCombinedCoalitionArmy(state, participatingArmies);

  // Calculate battlefield size based on total forces
  const totalForces = coalitionArmy.mp.current + scourgeArmy.mp.current;
  const battlefieldSize = calculateBattlefieldSize(totalForces, rng);

  // Start the battle front (coalition on left, Scourge on right)
  const front = startBattle(state, coalitionArmy.id, scourgeArmy.id, battlefieldSize);

  // Mark as Scourge battle
  front.isScourgeBattle = true;
  front.participatingArmyIds = participatingArmies.map(a => a.id);
  front.targetEmpireId = state.scourgeTargetEmpireId || null;

  const coalitionMP = Math.floor(coalitionArmy.mp.current);
  const scourgeMP = Math.floor(scourgeArmy.mp.current);
  logger.info(`Scourge battle: Coalition ${coalitionMP} MP vs Scourge ${scourgeMP} MP (Field: ${battlefieldSize})`);
  logger.debug(`Scourge battle front created: ${front.id}`, {
    battlefieldSize,
    coalitionMP: coalitionArmy.mp.current,
    scourgeMP: scourgeArmy.mp.current
  });

  log.push(`Scourge battle engaged! ${participatingArmies.length} armies vs The Scourge`);
  return { front, log };
}

/**
 * Handle Scourge battle end and apply results
 * @param {Object} state - Game state
 * @param {Object} front - Battle front
 * @param {string} winnerSide - 'left' (coalition) or 'right' (scourge)
 * @returns {Object} Result with log messages
 */
export function handleScourgeBattleEnd(state, front, winnerSide) {
  const logger = getLogger();
  const log = [];
  const coalitionArmy = state.armies.find(a => a.id === front.leftArmyId);
  const scourgeArmy = state.armies.find(a => a.id === front.rightArmyId);

  if (!coalitionArmy || !scourgeArmy) {
    logger.error('Scourge battle end: missing armies', { frontId: front.id });
    return { log };
  }

  // Calculate battle stats for summary
  const coalitionDestroyed = Math.floor(front.permanentLosses?.left || 0);
  const scourgeDestroyed = Math.floor(front.permanentLosses?.right || 0);
  const coalitionRecovered = Math.floor(front.recoveredMP?.left || 0);
  const scourgeRecovered = Math.floor(front.recoveredMP?.right || 0);
  const coalitionRemaining = Math.floor(coalitionArmy.mp.current);
  const scourgeRemaining = Math.floor(scourgeArmy.mp.current);

  // Get original army data from the combined army
  const originalArmyData = coalitionArmy._originalArmies || [];
  const coalitionWon = winnerSide === 'left';

  // Calculate MP loss ratio for distributing damage
  const coalitionMPLoss = coalitionArmy.mp.max - coalitionArmy.mp.current;
  const coalitionMPLossRatio = coalitionArmy.mp.max > 0 ? coalitionMPLoss / coalitionArmy.mp.max : 0;

  // Distribute results to original armies
  originalArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;

    const armyMPLoss = armyData.originalMaxMP * coalitionMPLossRatio;
    army.mp.current = Math.max(0, armyData.originalMP - armyMPLoss);

    // Distribute organization and fervor changes
    if (coalitionWon) {
      army.organization = clampStat(army.organization - BATTLE_CONSTANTS.WIN_ORG_LOSS);
      army.fervor = clampStat(army.fervor + BATTLE_CONSTANTS.WIN_FERVOR_GAIN);
    } else {
      // On defeat: only apply fervor loss to armies from the scourge target empire
      const isTargetEmpireArmy = army.empireId === state.scourgeTargetEmpireId;
      army.organization = clampStat(army.organization - BATTLE_CONSTANTS.LOSS_ORG_LOSS);
      if (isTargetEmpireArmy) {
        army.fervor = clampStat(army.fervor - BATTLE_CONSTANTS.LOSS_FERVOR_LOSS);
      }
    }
  });

  // Apply cohesion and approval changes
  if (coalitionWon) {
    const margin = (coalitionArmy.mp.current / coalitionArmy.mp.max) - 0.5; // How decisively won
    const cohesionLoss = Math.max(1, Math.floor(BATTLE_CONSTANTS.SCOURGE_WIN_COHESION_LOSS * (1 - margin)));
    const prevScourgeCohesion = state.scourgeCohesion;
    state.scourgeCohesion = clampStat(state.scourgeCohesion - cohesionLoss, 0, 100);
    logger.info(`Scourge battle: Victory! Scourge Cohesion ${prevScourgeCohesion.toFixed(1)} -> ${state.scourgeCohesion.toFixed(1)} (-${cohesionLoss})`);

    const threat = state.coalitionThreat || 0;
    const totalSeverity = (state.scourgeModifiers || []).reduce((sum, mod) => sum + (mod.severity || 0), 0);
    const threatFactor = 1 + Math.pow(threat / 100, 1.2);
    const modifierFactor = 1 + totalSeverity * 0.05;
    const basePayout = SCOURGE_MISSION_CONSTANTS.GLORY_BASE_PER_SCOURGE_WIN;
    const gloryMultiplier = state.coalitionModifiers?.glory_gain_multiplier ?? 1.0;
    const payout = basePayout * threatFactor * modifierFactor * gloryMultiplier;
    state.coalitionGlory = (state.coalitionGlory || 0) + payout;
    state.coalitionPrestige = (state.coalitionPrestige || 0) + Math.round(payout * 0.25);
    log.push(`Glory gained: +${Math.round(payout)}`);
  } else {
    const cohesionLoss = BATTLE_CONSTANTS.SCOURGE_LOSS_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);

    const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
    state.empires.forEach(empire => {
      empire.approval = clampApproval(empire.approval - approvalLoss);
    });

    // Apply population reduction to target empire
    const targetEmpire = state.empires.find(e => e.id === state.scourgeTargetEmpireId);
    if (targetEmpire) {
      const prevPop = targetEmpire.stats.population;
      // Ensure population never goes below 1 to prevent division by zero and game breaks
      targetEmpire.stats.population = Math.max(1, Math.floor(targetEmpire.stats.population * 0.9));
      const popLoss = prevPop - targetEmpire.stats.population;
      logger.debug(`Scourge battle: ${targetEmpire.name} population ${prevPop} -> ${targetEmpire.stats.population} (-${popLoss})`);
    }

    // Grant requisition based on Scourge destroyed
    const requisitionGain = scourgeDestroyed * 0.001;
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + requisitionGain;

    logger.info(`Scourge battle: Defeat! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), All Empires Approval -${approvalLoss}, ${scourgeDestroyed} Scourge destroyed (+${requisitionGain.toFixed(3)} req)`);
  }

  // Emit battle summary
  const coalitionSummary = `Coalition: ${coalitionDestroyed} destroyed, ${coalitionRecovered} recovered, ${coalitionRemaining} remaining`;
  const scourgeSummary = `Scourge: ${scourgeDestroyed} destroyed, ${scourgeRecovered} recovered, ${scourgeRemaining} remaining`;
  logger.info(`Scourge battle summary - ${coalitionSummary}`);
  logger.info(`Scourge battle summary - ${scourgeSummary}`);
  log.push(coalitionSummary);
  log.push(scourgeSummary);

  if (scourgeArmy.mp?.max) {
    const manpowerPct = (scourgeRemaining / scourgeArmy.mp.max) * 100;
    state.scourgeManpower = clampStat(manpowerPct, 0, 100);
  }

  // Clean up temporary armies
  const combinedIndex = state.armies.findIndex(a => a.id === coalitionArmy.id);
  if (combinedIndex >= 0) {
    state.armies.splice(combinedIndex, 1);
  }

  removeScourgeForces(state);
  expireScourgeModifiersAfterAttack(state);

  // Clear the Scourge target now that the battle has ended
  state.scourgeTargetEmpireId = null;

  return { log };
}

// Legacy function for backwards compatibility (now creates a battle front)
export function resolveScourgeBattle(state, participatingArmies, rng = Math.random) {
  return startScourgeBattle(state, participatingArmies, rng);
}
