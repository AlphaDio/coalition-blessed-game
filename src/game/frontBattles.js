// Front Battles - MP-axis battles with morale badges
import { getLogger } from '../modules/logger.js';
import { clamp } from '../utils/math.js';
import { FRONT_BATTLE_MODIFIERS } from './constants.js';
import { syncUnitsFromArmy } from './armyComposition.js';

/**
 * Calculate MP participation rate based on organization
 * Organization determines how much of the army can participate in the battle
 * @param {number} organization - Army organization (0..100)
 * @returns {number} Participation multiplier (0..1)
 */
function participationRate(organization) {
  // Linear scaling: 0 org = 0%, 100 org = 100%
  return Math.max(0, Math.min(1, organization / 100));
}

/**
 * Calculate engaged units for one side
 * @param {Object} army - Army object
 * @param {number} battlefieldSize - Battle width
 * @param {boolean} isBroken - Whether morale is broken
 * @returns {number} Number of engaged units (MP throughput)
 */
function calculateEngagedUnits(army, battlefieldSize, isBroken) {
  // Guard against undefined or NaN values
  if (!army || !army.mp || typeof army.mp.current !== 'number' || isNaN(army.mp.current)) {
    return 0;
  }
  
  // Organization determines how much of the army can participate
  const org = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
  const participation = participationRate(org);
  const participatingMP = (army.mp.current || 0) * participation;
  
  // If broken, apply penalty to engagement (can't hold the line)
  const brokenPenalty = isBroken ? 0.5 : 1.0;
  
  // Engagement is limited by battlefield size and participating MP
  const maxEngaged = Math.min(
    battlefieldSize || 0,
    participatingMP
  ) * brokenPenalty;
  
  return Math.max(0, maxEngaged);
}

/**
 * Calculate kill rate modifier based on army stats
 * @param {Object} army - Army object
 * @returns {number} Modified kill rate
 */
function getEffectiveKillRate(army) {
  // Simple: base killRate with minor fervor modifier
  const killRate = typeof army.killRate === 'number' && !isNaN(army.killRate) ? army.killRate : 0.1;
  const fervor = typeof army.fervor === 'number' && !isNaN(army.fervor) ? army.fervor : 0;
  const fervorBonus = (fervor / 100) * 0.05; // Up to +5% at max fervor
  const bonus = army.killRateBonus || 0;
  return Math.min(1, killRate + fervorBonus + bonus);
}

/**
 * Calculate morale regen per tick
 * @param {Object} army - Army object
 * @returns {number} Morale regen amount
 */
function calculateMoraleRegen(army) {
  // Organization boosts regen: 0.5 to 2.0 per tick
  const org = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
  const orgFactor = org / 100;
  return 0.5 + (orgFactor * 1.5);
}

/**
 * Apply morale regen + reinforcement for a battle tick.
 * Wounded (temporary damage) stay in woundedPool and are returned to the army only after the battle.
 * @param {Object} army - Army object
 * @param {boolean} isMoraleBroken - Whether morale is broken
 * @param {Object} front - Battle front (for tracking stats)
 * @param {string} side - 'left' or 'right'
 */
function applyBattleSustainment(army, isMoraleBroken, front, side) {
  if (!army || !army.mo || !army.mp) return;

  if (!isMoraleBroken && typeof army.mo.current === 'number' && typeof army.mo.max === 'number') {
    const regen = calculateMoraleRegen(army);
    army.mo.current = clamp(army.mo.current + regen, 0, army.mo.max);
  }

  if (typeof army.mp.current !== 'number' || army.mp.current <= 0) return;

  const reinforced = applyReinforcement(army, true);
  if (front && side && reinforced > 0) {
    if (!front.reinforcedMP) front.reinforcedMP = { left: 0, right: 0 };
    front.reinforcedMP[side] = (front.reinforcedMP[side] || 0) + reinforced;
  }
}

function logBattleRound(front, leftArmy, rightArmy, logger) {
  // Initialize round counter if not present
  if (typeof front.roundNumber !== 'number') {
    front.roundNumber = 0;
  }
  front.roundNumber += 1;

  // Track battle statistics for final summary (moved to DEBUG level to reduce verbosity)
  if (!front.battleStats) {
    front.battleStats = {
      rounds: 0,
      maxRounds: front.roundNumber,
      leftMoraleBreaks: 0,
      rightMoraleBreaks: 0,
      totalDamageLeft: 0,
      totalDamageRight: 0,
      peakEngagementLeft: 0,
      peakEngagementRight: 0
    };
  }

  front.battleStats.rounds = front.roundNumber;
  front.battleStats.maxRounds = Math.max(front.battleStats.maxRounds, front.roundNumber);

  // Track morale breaks
  if (front.moraleBroken.left && !front.leftMoraleBrokenLogged) {
    front.battleStats.leftMoraleBreaks += 1;
    front.leftMoraleBrokenLogged = true;
    logger.debug(`Battle ${front.id}: ${leftArmy.name} morale broken at round ${front.roundNumber}`);
  }
  if (front.moraleBroken.right && !front.rightMoraleBrokenLogged) {
    front.battleStats.rightMoraleBreaks += 1;
    front.rightMoraleBrokenLogged = true;
    logger.debug(`Battle ${front.id}: ${rightArmy.name} morale broken at round ${front.roundNumber}`);
  }

  // Track damage and engagement
  const roundDamage = front.roundDamage || { left: 0, right: 0 };
  front.battleStats.totalDamageLeft += roundDamage.left || 0;
  front.battleStats.totalDamageRight += roundDamage.right || 0;

  const leftEngaged = calculateEngagedUnits(leftArmy, front.battlefieldSize, front.moraleBroken.left);
  const rightEngaged = calculateEngagedUnits(rightArmy, front.battlefieldSize, front.moraleBroken.right);
  front.battleStats.peakEngagementLeft = Math.max(front.battleStats.peakEngagementLeft, leftEngaged);
  front.battleStats.peakEngagementRight = Math.max(front.battleStats.peakEngagementRight, rightEngaged);

  // Reduced logging - only log key events at DEBUG level
  logger.debug(`Battle ${front.id} Round ${front.roundNumber}: ${leftArmy.name} vs ${rightArmy.name}`, {
    round: front.roundNumber,
    leftMP: `${Math.floor(leftArmy.mp?.current || 0)}/${Math.floor(leftArmy.mp?.max || 1)}`,
    rightMP: `${Math.floor(rightArmy.mp?.current || 0)}/${Math.floor(rightArmy.mp?.max || 1)}`,
    damageThisRound: {
      left: `${(roundDamage.left || 0).toFixed(1)} MP`,
      right: `${(roundDamage.right || 0).toFixed(1)} MP`
    }
  });
}


/**
 * Apply simple combat modifiers based on army stats
 * @param {number} baseDamage - Base damage value
 * @param {Object} army - Attacking army
 * @returns {number} Modified damage
 * 
 * Modifier ranges:
 * - Fervor: 0.8x to 1.2x (±20% at extremes, representing morale and fighting spirit)
 * - Organization: 0.9x to 1.1x (±10% at extremes, representing coordination and tactics)
 * These ranges are balanced to make fervor more impactful than organization
 * 
 * Note: Expects army.fervor and army.organization to be in 0-100 range
 */
function applyModifiers(baseDamage, army) {
  // Guard against NaN values
  if (typeof baseDamage !== 'number' || isNaN(baseDamage)) {
    return 0;
  }
  
   const fervor = Math.min(100, (army.fervor || 0) + (army.fervorBonus || 0));
   const organization = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
  
  // Fervor modifier: FERVOR_MIN to (FERVOR_MIN + FERVOR_RANGE)
  const fervorMod = FRONT_BATTLE_MODIFIERS.FERVOR_MIN + (fervor / 100) * FRONT_BATTLE_MODIFIERS.FERVOR_RANGE;
  // Organization modifier: ORG_MIN to (ORG_MIN + ORG_RANGE)
  const orgMod = FRONT_BATTLE_MODIFIERS.ORG_MIN + (organization / 100) * FRONT_BATTLE_MODIFIERS.ORG_RANGE;
  
  const result = baseDamage * fervorMod * orgMod;
  return isNaN(result) ? baseDamage : result;
}

/**
 * Simulate one tick of a battle front
 * @param {Object} front - BattleFront object
 * @param {Object} worldState - Full game state
 * @returns {Array} Log messages from this tick
 */
export function simulateBattleTick(front, worldState) {
  const logger = getLogger();
  if (front.state !== 'ACTIVE') {
    return [];
  }
  
  // Initialize and reset round damage tracking for this round
  front.roundDamage = { left: 0, right: 0 };
  
  const log = [];
  const leftArmy = worldState.armies.find(a => a.id === front.leftArmyId);
  const rightArmy = worldState.armies.find(a => a.id === front.rightArmyId);
  
  if (!leftArmy || !rightArmy) {
    logger.warn(`Battle ${front.id}: Missing army, ending battle`, {
      leftArmyId: front.leftArmyId,
      rightArmyId: front.rightArmyId,
      leftFound: !!leftArmy,
      rightFound: !!rightArmy
    });
    log.push(`Battle ${front.id}: Missing army, ending battle`);
    const endLog = endBattle(front, worldState, null);
    log.push(...endLog);
    return log;
  }
  
  // Validate army structures have required properties
  if (!leftArmy.mp || !rightArmy.mp || !leftArmy.mo || !rightArmy.mo) {
    logger.error(`Battle ${front.id}: Invalid army structure (missing mp/mo)`, {
      leftArmy: { hasMP: !!leftArmy.mp, hasMO: !!leftArmy.mo },
      rightArmy: { hasMP: !!rightArmy.mp, hasMO: !!rightArmy.mo }
    });
    log.push(`Battle ${front.id}: Invalid army structure, ending battle`);
    const endLog = endBattle(front, worldState, null);
    log.push(...endLog);
    return log;
  }
  
  // Ensure mp/mo values are valid numbers
  if (typeof leftArmy.mp.current !== 'number' || isNaN(leftArmy.mp.current)) {
    leftArmy.mp.current = 0;
  }
  if (typeof leftArmy.mp.max !== 'number' || isNaN(leftArmy.mp.max) || leftArmy.mp.max <= 0) {
    leftArmy.mp.max = Math.max(1, leftArmy.mp.current || 1);
  }
  if (typeof rightArmy.mp.current !== 'number' || isNaN(rightArmy.mp.current)) {
    rightArmy.mp.current = 0;
  }
  if (typeof rightArmy.mp.max !== 'number' || isNaN(rightArmy.mp.max) || rightArmy.mp.max <= 0) {
    rightArmy.mp.max = Math.max(1, rightArmy.mp.current || 1);
  }
  if (typeof leftArmy.mo.current !== 'number' || isNaN(leftArmy.mo.current)) {
    leftArmy.mo.current = 0;
  }
  if (typeof leftArmy.mo.max !== 'number' || isNaN(leftArmy.mo.max) || leftArmy.mo.max <= 0) {
    leftArmy.mo.max = 100;
  }
  if (typeof rightArmy.mo.current !== 'number' || isNaN(rightArmy.mo.current)) {
    rightArmy.mo.current = 0;
  }
  if (typeof rightArmy.mo.max !== 'number' || isNaN(rightArmy.mo.max) || rightArmy.mo.max <= 0) {
    rightArmy.mo.max = 100;
  }

  const leftUnits = worldState.units
    ? worldState.units.filter(unit => unit && unit.armyId === leftArmy.id)
    : [];
  const rightUnits = worldState.units
    ? worldState.units.filter(unit => unit && unit.armyId === rightArmy.id)
    : [];

  if (leftUnits.length > 0) {
    syncUnitsFromArmy(leftArmy, leftUnits);
  }
  if (rightUnits.length > 0) {
    syncUnitsFromArmy(rightArmy, rightUnits);
  }
  
  // Process both sides attacking each other
  processSideAttack(front, leftArmy, rightArmy, 'left', 'right', worldState, log);
  processSideAttack(front, rightArmy, leftArmy, 'right', 'left', worldState, log);
  
  // Check end conditions IMMEDIATELY after damage (before recovery/reinforcement)
  // If an army is shattered (MP = 0), it cannot recover or reinforce
  let winner = null;
  if (leftArmy.mp.current <= 0) {
    winner = 'right';
    logger.info(`Battle ${front.id} ended: ${leftArmy.name} shattered! (Width: ${front.battlefieldSize})`);
    log.push(`Battle ${front.id}: ${leftArmy.name} shattered!`);
    const endLog = endBattle(front, worldState, winner);
    log.push(...endLog);
    return log;
  } else if (rightArmy.mp.current <= 0) {
    winner = 'left';
    logger.info(`Battle ${front.id} ended: ${rightArmy.name} shattered! (Width: ${front.battlefieldSize})`);
    log.push(`Battle ${front.id}: ${rightArmy.name} shattered!`);
    const endLog = endBattle(front, worldState, winner);
    log.push(...endLog);
    return log;
  }
  
  applyBattleSustainment(leftArmy, front.moraleBroken.left, front, 'left');
  applyBattleSustainment(rightArmy, front.moraleBroken.right, front, 'right');

  if (leftUnits.length > 0) {
    syncUnitsFromArmy(leftArmy, leftUnits);
  }
  if (rightUnits.length > 0) {
    syncUnitsFromArmy(rightArmy, rightUnits);
  }

  logBattleRound(front, leftArmy, rightArmy, logger);

  
  return log;
}

/**
 * Process one side attacking the other
 */
function processSideAttack(front, attackingArmy, defendingArmy, attackingSide, defendingSide, worldState, log) {
  // Guard against invalid army structures
  if (!attackingArmy || !defendingArmy || !attackingArmy.mp || !defendingArmy.mp) {
    return;
  }
  
  // 1. Calculate engaged units
  const isBroken = front.moraleBroken[attackingSide];
  const engagedUnits = calculateEngagedUnits(attackingArmy, front.battlefieldSize, isBroken);
  
  if (engagedUnits <= 0 || isNaN(engagedUnits)) {
    return; // No engagement possible
  }
  
  // 2. Calculate MP damage (width-scaled)
  const baseDmgPerUnitMP = typeof attackingArmy.dmgPerUnitMP === 'number' && !isNaN(attackingArmy.dmgPerUnitMP)
    ? attackingArmy.dmgPerUnitMP
    : 1.0;
  // Per-empire damage modifiers: from empireModifiers (single empire) or aggregated on combined army (_coalition)
  const damageAdd = Number.isFinite(attackingArmy._empireDamageAdd)
    ? attackingArmy._empireDamageAdd
    : (Number.isFinite(worldState.improvements?.empireModifiers?.[attackingArmy.empireId]?.army_damage_add)
      ? worldState.improvements.empireModifiers[attackingArmy.empireId].army_damage_add
      : 0);
  const damageMult = Number.isFinite(attackingArmy._empireDamageMult)
    ? attackingArmy._empireDamageMult
    : (Number.isFinite(worldState.improvements?.empireModifiers?.[attackingArmy.empireId]?.army_damage_mult)
      ? worldState.improvements.empireModifiers[attackingArmy.empireId].army_damage_mult
      : 0);
  const dmgPerUnitMP = (baseDmgPerUnitMP + damageAdd) * (1 + damageMult);
  const rawMPDmg = engagedUnits * dmgPerUnitMP;
  const modifiedMPDmg = applyModifiers(rawMPDmg, attackingArmy);
  
  // Apply protection (damage reduction)
  const baseProtection = typeof defendingArmy.protection === 'number' && !isNaN(defendingArmy.protection)
    ? defendingArmy.protection
    : 0;
  const effectiveProtection = Math.min(1, baseProtection + (defendingArmy.protectionBonus || 0));
  const finalMPDmg = modifiedMPDmg * (1 - effectiveProtection);
  
  // Split into permanent and temporary: attacker's kill rate determines how much of the defender's
  // losses are destroyed (permanent) vs wounded (temporary). Higher kill rate = more destroyed, less wounded.
  const effectiveKillRate = getEffectiveKillRate(attackingArmy);
  const permanentDmg = finalMPDmg * effectiveKillRate;
  const temporaryDmg = finalMPDmg - permanentDmg;
  
  // Apply damage
  const prevMP = defendingArmy.mp.current || 0;
  defendingArmy.mp.current = Math.max(0, prevMP - finalMPDmg);
  
  // Add temporary damage to wounded pool (retired from battle; returned to army after battle)
  if (typeof defendingArmy.woundedPool !== 'number' || isNaN(defendingArmy.woundedPool)) {
    defendingArmy.woundedPool = 0;
  }
  defendingArmy.woundedPool += temporaryDmg;
  
  // Track permanent losses
  if (!front.permanentLosses) {
    front.permanentLosses = { left: 0, right: 0 };
  }
  front.permanentLosses[defendingSide] = (front.permanentLosses[defendingSide] || 0) + permanentDmg;
  
  // Track damage dealt this round for round summary
  if (!front.roundDamage) {
    front.roundDamage = { left: 0, right: 0 };
  }
  front.roundDamage[attackingSide] = (front.roundDamage[attackingSide] || 0) + finalMPDmg;
  
   // Log damage at DEBUG level to reduce verbosity
   const logger = getLogger();
   logger.debug(`Battle ${front.id} damage: ${attackingArmy.name} → ${defendingArmy.name}`, {
     damage: `${finalMPDmg.toFixed(1)} MP (${permanentDmg.toFixed(1)} permanent, ${temporaryDmg.toFixed(1)} temporary)`,
     engagedUnits: engagedUnits.toFixed(0),
     mpBefore: prevMP.toFixed(0),
     mpAfter: defendingArmy.mp.current.toFixed(0)
   });
  
  // Detailed DEBUG logging for additional context
  logger.debug(`Battle ${front.id} attack details: ${attackingArmy.name} → ${defendingArmy.name}`, {
    rawDamage: rawMPDmg.toFixed(1),
    modifiedDamage: modifiedMPDmg.toFixed(1),
    protection: `${(effectiveProtection * 100).toFixed(1)}%`,
    woundedPool: defendingArmy.woundedPool.toFixed(0)
  });
  
  // 3. Calculate morale damage (NOT width-scaled)
  // Guard against invalid structures
  if (!defendingArmy.mo) {
    defendingArmy.mo = { current: 0, max: 100 };
  }
  
  const baseDmgPerTickMO = typeof attackingArmy.dmgPerTickMO === 'number' && !isNaN(attackingArmy.dmgPerTickMO)
    ? attackingArmy.dmgPerTickMO
    : 2.5;
  const dmgPerTickMO = (baseDmgPerTickMO + damageAdd) * (1 + damageMult);
  const rawMODmg = dmgPerTickMO;
  const modifiedMODmg = applyModifiers(rawMODmg, attackingArmy);
  
  // Apply resolve (morale resistance)
  const baseResolve = typeof defendingArmy.resolve === 'number' && !isNaN(defendingArmy.resolve)
    ? defendingArmy.resolve
    : 0;
  const effectiveResolve = Math.min(1, baseResolve + (defendingArmy.resolveBonus || 0));
  const finalMODmg = modifiedMODmg * (1 - effectiveResolve);
  
  // Apply morale damage
  const previousMO = defendingArmy.mo.current || 0;
  defendingArmy.mo.current = Math.max(0, previousMO - finalMODmg);

  // Log morale damage at DEBUG level (compressed battle logging)
  if (finalMODmg > 0) {
    const logger = getLogger();
    logger.debug(`Battle ${front.id} morale damage: ${attackingArmy.name} → ${defendingArmy.name}`, {
      moraleDamage: `${finalMODmg.toFixed(1)} MO`,
      moraleBefore: previousMO.toFixed(0),
      moraleAfter: defendingArmy.mo.current.toFixed(0)
    });
  }

  // Check if morale just broke
  if (previousMO > 0 && defendingArmy.mo.current <= 0 && !front.moraleBroken[defendingSide]) {
    front.moraleBroken[defendingSide] = true;
    const logger = getLogger();
    logger.warn(`Battle ${front.id}: ${defendingArmy.name} morale BROKEN!`);
    log.push(`Battle ${front.id}: ${defendingArmy.name} morale BROKEN!`);
    
    // Emit event
    emitEvent(worldState, 'morale_broken', {
      frontId: front.id,
      side: defendingSide,
      armyId: defendingArmy.id,
      armyName: defendingArmy.name
    });
  }
}

/**
 * Apply reinforcement: add MP from reserves (reinforcementRate) to the line during battle.
 * @returns {number} MP added
 */
function applyReinforcement(army, inBattle = false) {
  if (!army || !army.mp || typeof army.mp.current !== 'number' || typeof army.mp.max !== 'number') {
    return 0;
  }
  const spaceAvailable = Math.max(0, army.mp.max - army.mp.current);
  if (spaceAvailable <= 0) return 0;
  const reinforcementRate = typeof army.reinforcementRate === 'number' && !isNaN(army.reinforcementRate)
    ? army.reinforcementRate
    : 100;
  const effectiveRate = inBattle ? reinforcementRate * 0.1 : reinforcementRate;
  const reinforced = Math.min(effectiveRate, spaceAvailable);
  army.mp.current = Math.max(0, Math.min(army.mp.max, army.mp.current + reinforced));
  if (inBattle && reinforced > 0) {
    const logger = getLogger();
    logger.debug(`Reinforcement (battle): ${army.name} +${reinforced.toFixed(0)} MP (reduced rate)`);
  }
  return reinforced;
}

/**
 * End a battle and clean up
 * @returns {Array} Log messages summarizing battle outcome
 */
function endBattle(front, worldState, winnerSide) {
  const logger = getLogger();
  const log = [];

  front.state = 'ENDED';
  front.endedAtTick = worldState.turn;

  const leftArmy = worldState.armies.find(a => a.id === front.leftArmyId);
  const rightArmy = worldState.armies.find(a => a.id === front.rightArmyId);

  // Return wounded to each army: recoveryRate (0-100) is the fraction of wounded that successfully return; rest are lost.
  const returnWounded = (army) => {
    if (!army || !army.mp) return 0;
    const pool = Math.max(0, army.woundedPool ?? 0);
    const space = Math.max(0, (army.mp.max ?? 0) - (army.mp.current ?? 0));
    const rate = (army.recoveryRate ?? army.recovery ?? 50) / 100;
    const returnable = pool * Math.max(0, Math.min(1, rate));
    const returned = Math.min(returnable, space);
    army.mp.current = (army.mp.current ?? 0) + returned;
    army.woundedPool = 0;
    return returned;
  };
  const leftWoundedReturned = leftArmy ? returnWounded(leftArmy) : 0;
  const rightWoundedReturned = rightArmy ? returnWounded(rightArmy) : 0;

  if (!front.woundedReturned) front.woundedReturned = { left: 0, right: 0 };
  front.woundedReturned.left = leftWoundedReturned;
  front.woundedReturned.right = rightWoundedReturned;

  // Generate comprehensive battle summary
  if (leftArmy && rightArmy) {
    const battleStats = front.battleStats || {
      rounds: front.roundNumber || 1,
      leftMoraleBreaks: 0,
      rightMoraleBreaks: 0,
      totalDamageLeft: front.permanentLosses?.left || 0,
      totalDamageRight: front.permanentLosses?.right || 0,
      peakEngagementLeft: 0,
      peakEngagementRight: 0
    };

    const leftDestroyed = Math.floor(front.permanentLosses?.left || 0);
    const rightDestroyed = Math.floor(front.permanentLosses?.right || 0);
    const leftReinforced = Math.floor(front.reinforcedMP?.left || 0);
    const rightReinforced = Math.floor(front.reinforcedMP?.right || 0);
    const leftRemaining = Math.floor(leftArmy.mp.current);
    const rightRemaining = Math.floor(rightArmy.mp.current);

    const winnerName = winnerSide === 'left' ? leftArmy.name : (winnerSide === 'right' ? rightArmy.name : 'Draw');
    const duration = `${battleStats.rounds} rounds, ${front.battlefieldSize} width battlefield`;

    logger.info(`Battle ${front.id} COMPLETED: ${leftArmy.name} vs ${rightArmy.name} - Winner: ${winnerName}`, {
      duration: duration,
      casualties: {
        leftDestroyed,
        rightDestroyed,
        leftWoundedReturned,
        rightWoundedReturned,
        leftReinforced,
        rightReinforced,
        leftRemaining,
        rightRemaining
      },
      battleStats: {
        rounds: battleStats.rounds,
        leftMoraleBreaks: battleStats.leftMoraleBreaks,
        rightMoraleBreaks: battleStats.rightMoraleBreaks,
        totalDamageDealt: {
          left: battleStats.totalDamageLeft.toFixed(1),
          right: battleStats.totalDamageRight.toFixed(1)
        },
        peakEngagement: {
          left: battleStats.peakEngagementLeft.toFixed(0),
          right: battleStats.peakEngagementRight.toFixed(0)
        }
      },
      finalState: {
        leftMP: `${leftRemaining}/${Math.floor(leftArmy.mp.max)}`,
        rightMP: `${rightRemaining}/${Math.floor(rightArmy.mp.max)}`
      }
    });

    const leftSummary = `${leftArmy.name}: ${leftDestroyed} destroyed, ${leftWoundedReturned} recovered (wounded), ${leftReinforced} reinforced, ${leftRemaining} remaining`;
    const rightSummary = `${rightArmy.name}: ${rightDestroyed} destroyed, ${rightWoundedReturned} recovered (wounded), ${rightReinforced} reinforced, ${rightRemaining} remaining`;
    log.push(`Battle concluded in ${battleStats.rounds} rounds - Winner: ${winnerName}`);
    log.push(leftSummary);
    log.push(rightSummary);
  }

  if (leftArmy) leftArmy.mo.current = leftArmy.mo.max;
  if (rightArmy) rightArmy.mo.current = rightArmy.mo.max;
  front.moraleBroken.left = false;
  front.moraleBroken.right = false;

  emitEvent(worldState, 'battle_ended', {
    frontId: front.id,
    winnerSide: winnerSide,
    leftArmyId: front.leftArmyId,
    rightArmyId: front.rightArmyId,
    permanentLosses: { ...front.permanentLosses },
    woundedReturned: { ...(front.woundedReturned || { left: 0, right: 0 }) },
    reinforcedMP: { ...(front.reinforcedMP || { left: 0, right: 0 }) }
  });

  return log;
}

/**
 * Start a new battle front
 * @param {Object} worldState - Game state
 * @param {string} leftArmyId - Left army ID
 * @param {string} rightArmyId - Right army ID
 * @param {number} battlefieldSize - Battle width
 * @returns {Object} Created battle front
 */
export function startBattle(worldState, leftArmyId, rightArmyId, battlefieldSize = 1000) {
  const logger = getLogger();
  const leftArmy = worldState.armies.find(a => a.id === leftArmyId);
  const rightArmy = worldState.armies.find(a => a.id === rightArmyId);
  
  if (!leftArmy || !rightArmy) {
    logger.error('Invalid army IDs for battle', { leftArmyId, rightArmyId });
    throw new Error('Invalid army IDs for battle');
  }
  
  // Create battle front inline to avoid circular dependency with types.js
  // (types.js imports from other game modules which may import this module)
  const battleId = `battle_${worldState.turn}_${leftArmyId}_${rightArmyId}`;
  const leftMP = Math.floor(leftArmy.mp.current);
  const rightMP = Math.floor(rightArmy.mp.current);
  logger.info(`Battle started: ${leftArmy.name} vs ${rightArmy.name}`, {
    battleId,
    battlefieldSize,
    leftMP: leftArmy.mp.current,
    rightMP: rightArmy.mp.current,
    leftMO: leftArmy.mo?.current || 0,
    rightMO: rightArmy.mo?.current || 0
  });
  const front = {
    id: battleId,
    state: 'ACTIVE',
    battlefieldSize,
    leftArmyId,
    rightArmyId,
    roundNumber: 0,
    roundDamage: {
      left: 0,
      right: 0
    },
    moraleBroken: {
      left: false,
      right: false
    },
    permanentLosses: {
      left: 0,
      right: 0
    },
    reinforcedMP: { left: 0, right: 0 },
    woundedReturned: { left: 0, right: 0 },
    startedAtTick: worldState.turn,
    endedAtTick: null
  };
  
  worldState.battleFronts = worldState.battleFronts || [];
  worldState.battleFronts.push(front);
  
  // Emit battle_started event
  emitEvent(worldState, 'battle_started', {
    frontId: front.id,
    leftArmyId,
    rightArmyId,
    leftArmyName: leftArmy.name,
    rightArmyName: rightArmy.name
  });
  
  return front;
}

/**
 * Simple event emission (stores in worldState.battleEvents for now)
 */
function emitEvent(worldState, eventType, data) {
  // This is a simple implementation - can be enhanced to integrate with existing event system
  // Store events in worldState so other systems can consume them
  worldState.battleEvents = worldState.battleEvents || [];
  worldState.battleEvents.push({
    type: eventType,
    data,
    tick: worldState.turn
  });
}

/**
 * Get all active battles
 * @param {Object} worldState - Game state
 * @returns {Array} Active battle fronts
 */
export function getActiveBattles(worldState) {
  return (worldState.battleFronts || []).filter(f => f.state === 'ACTIVE');
}
