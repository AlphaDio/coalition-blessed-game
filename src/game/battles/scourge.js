import { BATTLE_CONSTANTS, SCOURGE_MISSION_CONSTANTS } from '../constants.js';
import {
  clampStat,
  clampApproval,
  applyScaledCoalitionCohesionDelta,
  applyScaledScourgeCohesionDelta
} from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { startBattle } from '../frontBattles.js';
import { collectScourgeModifierEffects, expireScourgeModifiersAfterAttack } from '../scourgeModifiers.js';
import { runHeroBattlePassives } from '../heroes.js';
import { applyPopulationDelta } from '../populationUtils.js';
import { awardArmyBattleExperience } from '../armyExperience.js';
import { calculateArmyPower, calculateBattlefieldSize } from './power.js';
import { createCombinedCoalitionArmy } from './coalition.js';
import { getThreatScalar } from '../scourgeThreat.js';
import { ensureHeroMeters } from '../heroes/utils.js';
import { HERO_STATUS } from '../heroes/constants.js';

function projectBattleResult(originalMP, originalMaxMP, permanentLossRatio, currentRetentionRatio = 1) {
  const clampedLossRatio = Math.max(0, Math.min(1, Number(permanentLossRatio) || 0));
  const clampedRetention = Math.max(0, Number(currentRetentionRatio) || 0);
  const safeOriginalMax = Math.max(1, Number(originalMaxMP) || 1);
  const safeOriginalCurrent = Math.max(0, Math.min(safeOriginalMax, Number(originalMP) || 0));

  const permanentLoss = safeOriginalMax * clampedLossRatio;
  const nextMax = Math.max(0, safeOriginalMax - permanentLoss);
  const retainedCurrent = safeOriginalCurrent * clampedRetention;
  const nextCurrent = Math.max(0, Math.min(nextMax, retainedCurrent));

  return { nextMax, nextCurrent };
}

function applyPermanentLossToArmy(army, originalMP, originalMaxMP, permanentLossRatio, currentRetentionRatio = 1) {
  if (!army?.mp) return { nextMax: 0, nextCurrent: 0 };

  const { nextMax, nextCurrent } = projectBattleResult(
    originalMP,
    originalMaxMP,
    permanentLossRatio,
    currentRetentionRatio
  );

  army.mp.max = nextMax;
  army.mp.current = nextCurrent;
  army.manpower = nextMax;
  return { nextMax, nextCurrent };
}

function applyCompositeBattleResultToArmy(army, armyData, permanentLossRatio, currentRetentionRatio = 1) {
  if (!army?.mp) return { nextMax: 0, nextCurrent: 0 };

  const committedCurrent = Math.max(0, Number(armyData?.originalMP) || 0);
  const committedMax = Math.max(committedCurrent, Number(armyData?.originalMaxMP) || 0);
  const reserveCurrent = Number.isFinite(Number(armyData?.reserveCurrentMP))
    ? Math.max(0, Number(armyData.reserveCurrentMP))
    : Math.max(0, (Number(armyData?.sourceOriginalMP) || committedCurrent) - committedCurrent);
  const reserveMax = Number.isFinite(Number(armyData?.reserveMaxMP))
    ? Math.max(0, Number(armyData.reserveMaxMP))
    : Math.max(0, (Number(armyData?.sourceOriginalMaxMP) || committedMax) - committedMax);
  const committedResult = projectBattleResult(
    committedCurrent,
    committedMax,
    permanentLossRatio,
    currentRetentionRatio
  );

  army.mp.max = reserveMax + committedResult.nextMax;
  army.mp.current = Math.max(
    0,
    Math.min(army.mp.max, reserveCurrent + committedResult.nextCurrent)
  );
  army.manpower = army.mp.max;

  return {
    nextMax: army.mp.max,
    nextCurrent: army.mp.current,
    committedResult
  };
}

function normalizeParticipant(entry) {
  const army = entry?.army || entry;
  if (!army?.mp) {
    return null;
  }

  const rawRatio = entry?.army ? Number(entry.commitRatio) : 1;
  const commitRatio = Math.max(
    0,
    Math.min(1, Number.isFinite(rawRatio) ? rawRatio : 1)
  );
  if (commitRatio <= 0) {
    return null;
  }

  return {
    army,
    commitRatio,
    isSupport: !!entry?.isSupport,
    supportRelation: Number.isFinite(entry?.supportRelation) ? entry.supportRelation : null
  };
}

function awardTargetEmpireDefensePopularity(state, targetEmpireId, log, logger) {
  if (!targetEmpireId || !Array.isArray(state.heroes) || state.heroes.length === 0) {
    return;
  }

  const candidates = state.heroes.filter((hero) =>
    hero &&
    hero.empireId === targetEmpireId &&
    hero.status !== HERO_STATUS.EXILED
  );

  if (candidates.length === 0) {
    return;
  }

  // Favor active leaders first, then highest current popularity.
  candidates.sort((left, right) => {
    const leftActive = left.status === HERO_STATUS.ACTIVE ? 1 : 0;
    const rightActive = right.status === HERO_STATUS.ACTIVE ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }
    return Number(right?.meters?.popularity || 0) - Number(left?.meters?.popularity || 0);
  });

  const hero = candidates[0];
  ensureHeroMeters(hero);

  const gain = Number(BATTLE_CONSTANTS.SCOURGE_DEFENSE_HERO_POPULARITY_GAIN || 0);
  if (!Number.isFinite(gain) || gain <= 0) {
    return;
  }

  const previousPopularity = Number(hero.meters.popularity || 0);
  hero.meters.popularity = clampStat(previousPopularity + gain, 0, 100);
  const appliedGain = hero.meters.popularity - previousPopularity;
  if (appliedGain <= 0) {
    return;
  }

  const message = `${hero.name} gains +${appliedGain.toFixed(1)} popularity (Scourge defense)`;
  log.push(message);
  logger.info(message);
}

function removeScourgeForces(state) {
  if (state.armies) {
    state.armies = state.armies.filter(army => !(army.empireId === '_scourge' && army.id.startsWith('_scourge_army')));
  }
}

function createScourgeArmy(state, idSuffix) {
  const scourgeId = `_scourge_army_${idSuffix}`;
  const turnsElapsed = Math.max(0, (state.turn || 1) - 1);
  const turnGrowthFactor = Math.pow(
    turnsElapsed,
    BATTLE_CONSTANTS.SCOURGE_TURN_GROWTH_CURVE_EXPONENT
  );
  const powerScale = 1 + (turnGrowthFactor * BATTLE_CONSTANTS.SCOURGE_TURN_POWER_GROWTH);
  const baseMP = BATTLE_CONSTANTS.SCOURGE_BASE_MP + (turnGrowthFactor * BATTLE_CONSTANTS.SCOURGE_TURN_MP_GROWTH);
  const fervorMPBonus = state.scourgeFervor * 50;
  // Manpower increases exponentially as cohesion drops
  const cohesionMultiplier = Math.exp(
    (100 - state.scourgeCohesion) / BATTLE_CONSTANTS.SCOURGE_COHESION_MP_EXP_DIVISOR
  );
  const manpowerPct = Math.max(0, Math.min(100, state.scourgeManpower ?? 100)) / 100;
  const scaledTotalMP = (baseMP + fervorMPBonus) * cohesionMultiplier * manpowerPct;
  const missionDamagePct = Math.max(0, Math.min(1, state.scourgeNextAttackManpowerDamagePct || 0));
  const totalMP = Math.max(1, scaledTotalMP * (1 - missionDamagePct));
  state.scourgeNextAttackManpowerDamagePct = 0;

  const alwaysEffects = collectScourgeModifierEffects(state.scourgeModifiers || [], 'always');
  const nextAttackEffects = collectScourgeModifierEffects(state.scourgeModifiers || [], 'next_attack_only');

  const attackPowerScale = Math.max(
    0.1,
    powerScale * (alwaysEffects.attackPowerMult * nextAttackEffects.attackPowerMult) +
      (alwaysEffects.attackPowerAdd + nextAttackEffects.attackPowerAdd)
  );

  const baseRecoveryRate = 40;
  const baseReinforcementRate = 80;
  const recoveryRateMult = alwaysEffects.recoveryRateMult * (nextAttackEffects.recoveryRateMult ?? 1);
  const recoveryRateAdd = (alwaysEffects.recoveryRateAdd ?? 0) + (nextAttackEffects.recoveryRateAdd ?? 0);
  const reinforcementRateMult = alwaysEffects.reinforcementRateMult * (nextAttackEffects.reinforcementRateMult ?? 1);
  const reinforcementRateAdd = (alwaysEffects.reinforcementRateAdd ?? 0) + (nextAttackEffects.reinforcementRateAdd ?? 0);
  const killRateMult = alwaysEffects.killRateMult * (nextAttackEffects.killRateMult ?? 1);
  const killRateAdd = (alwaysEffects.killRateAdd ?? 0) + (nextAttackEffects.killRateAdd ?? 0);
  const moDamageMult = alwaysEffects.moDamageMult * (nextAttackEffects.moDamageMult ?? 1);
  const moDamageAdd = (alwaysEffects.moDamageAdd ?? 0) + (nextAttackEffects.moDamageAdd ?? 0);

  const recoveryRate = Math.max(0, Math.min(100, baseRecoveryRate * recoveryRateMult + recoveryRateAdd));
  const reinforcementRate = Math.max(0, baseReinforcementRate * reinforcementRateMult + reinforcementRateAdd);
  const baseKillRate = 0.09 * attackPowerScale;
  const killRate = Math.max(0.01, Math.min(1, (baseKillRate + killRateAdd) * killRateMult));
  const baseDmgPerTickMO = 2.2 * attackPowerScale;
  const dmgPerTickMO = Math.max(0.1, baseDmgPerTickMO * moDamageMult + moDamageAdd);

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
    dmgPerTickMO,
    protection: 0.15,
    resolve: 0.25,
    killRate,

    woundedPool: 0,
    command: 40,
    recovery: recoveryRate,
    recoveryRate,
    reinforcementRate
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
  const normalizedParticipants = (participatingArmies || [])
    .map(normalizeParticipant)
    .filter(Boolean);
  const participatingEmpireIds = [
    ...new Set(normalizedParticipants.map(participant => participant.army.empireId))
  ];
  runHeroBattlePassives(state, {
    phase: 'BATTLE',
    type: 'SCOURGE',
    participatingEmpireIds
  }, 'OnStart', log);

  logger.info(`Scourge battle: ${normalizedParticipants.length} armies vs Scourge`);
  logger.debug(`Scourge battle starting: ${normalizedParticipants.length} armies participating`);
  logger.debug(
    `Participating armies: ${normalizedParticipants.map(participant => {
      const army = participant.army;
      const committedMP = (army.mp?.current || 0) * participant.commitRatio;
      const supportTag = participant.isSupport ? `, Assist ${(participant.commitRatio * 100).toFixed(0)}%` : '';
      return `${army.name} (Power: ${calculateArmyPower(army).toFixed(2)}, Org: ${army.organization.toFixed(1)}, Fervor: ${army.fervor.toFixed(1)}, Commit: ${committedMP.toFixed(0)} MP${supportTag})`;
    }).join(', ')}`
  );

  removeScourgeForces(state);
  // Create combined coalition army
  const coalitionArmy = createCombinedCoalitionArmy(state, normalizedParticipants);
  const scourgeArmy = createScourgeArmy(state, state.turn);

  // Calculate battlefield size based on total forces
  const totalForces = coalitionArmy.mp.current + scourgeArmy.mp.current;
  const battlefieldSize = calculateBattlefieldSize(totalForces, rng);

  // Start the battle front (coalition on left, Scourge on right)
  const front = startBattle(state, coalitionArmy.id, scourgeArmy.id, battlefieldSize);

  // Mark as Scourge battle
  front.isScourgeBattle = true;
  front.participatingArmyIds = normalizedParticipants.map(participant => participant.army.id);
  front.targetEmpireId = state.scourgeTargetEmpireId || null;

  const coalitionMP = Math.floor(coalitionArmy.mp.current);
  const scourgeMP = Math.floor(scourgeArmy.mp.current);
  logger.info(`Scourge battle: Coalition ${coalitionMP} MP vs Scourge ${scourgeMP} MP (Field: ${battlefieldSize})`);
  logger.debug(`Scourge battle front created: ${front.id}`, {
    battlefieldSize,
    coalitionMP: coalitionArmy.mp.current,
    scourgeMP: scourgeArmy.mp.current
  });

  log.push(`Scourge battle engaged! ${normalizedParticipants.length} armies vs The Scourge`);
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
  const targetEmpireId = front.targetEmpireId || state.scourgeTargetEmpireId || null;
  const targetEmpire = state.empires.find(e => e.id === targetEmpireId) || null;

  if (!coalitionArmy || !scourgeArmy) {
    logger.error('Scourge battle end: missing armies', { frontId: front.id });
    return { log };
  }

  // Calculate battle stats for summary
  const coalitionDestroyed = Math.floor(front.permanentLosses?.left || 0);
  const scourgeDestroyed = Math.floor(front.permanentLosses?.right || 0);
  const coalitionWoundedReturned = Math.floor(front.woundedReturned?.left || 0);
  const scourgeWoundedReturned = Math.floor(front.woundedReturned?.right || 0);
  const coalitionRemaining = Math.floor(coalitionArmy.mp.current);
  const scourgeRemaining = Math.floor(scourgeArmy.mp.current);

  // Get original army data from the combined army
  const originalArmyData = coalitionArmy._originalArmies || [];
  const coalitionWon = winnerSide === 'left';

  // Use permanent losses (kill-rate driven) for lasting army capacity damage.
  // Use current retention (post-battle remaining manpower ratio) for current MP.
  const coalitionPermanentLoss = Math.max(0, Number(front.permanentLosses?.left || 0));
  const coalitionOriginalCurrent = Math.max(
    1,
    originalArmyData.reduce((sum, armyData) => sum + Math.max(0, Number(armyData.originalMP) || 0), 0)
  );
  const coalitionCurrentRetentionRatio = Math.max(0, (coalitionArmy.mp.current || 0) / coalitionOriginalCurrent);
  const coalitionMPLossRatio = coalitionArmy.mp.max > 0 ? coalitionPermanentLoss / coalitionArmy.mp.max : 0;
  const coalitionBattleIntensity = 1 + Math.min(
    1.5,
    (coalitionMPLossRatio + (1 - coalitionCurrentRetentionRatio)) * 0.9
  );

  // Distribute results to original armies
  // Army maximums are never reduced by Scourge battles — only current MP is affected.
  originalArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;
    const prevMax = Number(army.mp?.max || 0);
    const prevCurrent = Number(army.mp?.current || 0);
    applyCompositeBattleResultToArmy(
      army,
      armyData,
      0,
      coalitionCurrentRetentionRatio
    );
    const maxLoss = Math.max(0, prevMax - Number(army.mp?.max || 0));
    const currentLoss = Math.max(0, prevCurrent - Number(army.mp?.current || 0));
    if (maxLoss > 0.01 || currentLoss > 0.01) {
      log.push(`${army.name}: permanent battle losses -> MP ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)} (-${Math.floor(maxLoss)} cap, -${Math.floor(currentLoss)} current)`);
    }

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

    const experienceResult = awardArmyBattleExperience(army, {
      won: coalitionWon,
      participation: Number.isFinite(Number(armyData?.commitRatio)) ? Number(armyData.commitRatio) : 1,
      intensity: coalitionBattleIntensity
    });
    if (experienceResult.levelsGained > 0) {
      const surgePct = Math.round((experienceResult.surge?.damageMult || 0) * 100);
      const message = `${army.name} reaches Veteran ${experienceResult.level} (+${surgePct}% next battle round surge)`;
      log.push(message);
      logger.info(message);
    }
  });

  // Apply cohesion and approval changes
  if (coalitionWon) {
    const margin = (coalitionArmy.mp.current / coalitionArmy.mp.max) - 0.5; // How decisively won
    const cohesionLoss = Math.max(1, Math.floor(BATTLE_CONSTANTS.SCOURGE_WIN_COHESION_LOSS * (1 - margin)));
    const prevScourgeCohesion = state.scourgeCohesion;
    const appliedScourgeCohesionDelta = applyScaledScourgeCohesionDelta(state, -cohesionLoss);
    const appliedScourgeCohesionLoss = Math.abs(appliedScourgeCohesionDelta);

    // Grant requisition from destroyed Scourge forces when Coalition wins.
    const requisitionGainMultiplier = (state.coalitionModifiers?.requisition_gain_multiplier ?? 1.0) *
      (state.coalitionModifiers?.dynamic?.requisition_gen_mult ?? 1.0);
    const requisitionGain = scourgeDestroyed * 0.001 * requisitionGainMultiplier;
    if (!state.coalitionEconomy || typeof state.coalitionEconomy !== 'object') {
      state.coalitionEconomy = { requisition: 0 };
    }
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + requisitionGain;

    const threat = getThreatScalar(state.coalitionThreat || 0);
    const totalSeverity = (state.scourgeModifiers || []).reduce((sum, mod) => sum + (mod.severity || 0), 0);
    const threatFactor = 1 + Math.pow(threat / 100, 1.2);
    const modifierFactor = 1 + totalSeverity * 0.05;
    const basePayout = SCOURGE_MISSION_CONSTANTS.GLORY_BASE_PER_SCOURGE_WIN;
    const gloryMultiplier = state.coalitionModifiers?.glory_gain_multiplier ?? 1.0;
    const payout = basePayout * threatFactor * modifierFactor * gloryMultiplier;
    state.coalitionGlory = (state.coalitionGlory || 0) + payout;
    state.coalitionPrestige = (state.coalitionPrestige || 0) + Math.round(payout * 0.25);
    awardTargetEmpireDefensePopularity(state, targetEmpireId, log, logger);
    log.push(`Glory gained: +${Math.round(payout)}`);
    log.push(`Requisition gained: +${requisitionGain.toFixed(3)} (Scourge casualties)`);
    logger.info(
      `Scourge battle: Victory! Scourge Cohesion ${prevScourgeCohesion.toFixed(1)} -> ${state.scourgeCohesion.toFixed(1)} (-${appliedScourgeCohesionLoss.toFixed(2)}), ` +
      `${scourgeDestroyed} Scourge destroyed (+${requisitionGain.toFixed(3)} req)`
    );
  } else {
    const lossRatio = Math.max(0, Math.min(1, coalitionMPLossRatio));
    const cohesionLoss = Math.max(1, Math.round(BATTLE_CONSTANTS.SCOURGE_WIN_COHESION_LOSS * lossRatio));
    const prevCoalitionCohesion = state.coalitionCohesion;
    const appliedCoalitionCohesionDelta = applyScaledCoalitionCohesionDelta(state, -cohesionLoss);
    const appliedCoalitionCohesionLoss = Math.abs(appliedCoalitionCohesionDelta);

    const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
    if (targetEmpire) {
      targetEmpire.approval = clampApproval(targetEmpire.approval - approvalLoss);
    }

    // Apply population reduction to target empire
    if (targetEmpire) {
      const prevPop = targetEmpire.stats.population;
      const popLoss = Math.max(
        0,
        -applyPopulationDelta(targetEmpire, -Math.ceil(prevPop * 0.1), { scalePositiveByHeadroom: false })
      );
      logger.debug(`Scourge battle: ${targetEmpire.name} population ${prevPop} -> ${targetEmpire.stats.population} (-${popLoss})`);
    }
    logger.info(
      `Scourge battle: Defeat! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${appliedCoalitionCohesionLoss.toFixed(2)}), ` +
      `${targetEmpire ? `${targetEmpire.name} approval` : 'Target empire approval'} -${approvalLoss}`
    );
  }

  // Emit battle summary
  const coalitionSummary = `Coalition: ${coalitionDestroyed} destroyed, ${coalitionWoundedReturned} recovered (wounded), ${coalitionRemaining} remaining`;
  const scourgeSummary = `Scourge: ${scourgeDestroyed} destroyed, ${scourgeWoundedReturned} recovered (wounded), ${scourgeRemaining} remaining`;
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
