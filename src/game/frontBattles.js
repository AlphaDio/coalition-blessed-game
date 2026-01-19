// Front Battles - MP-axis battles with morale badges
import { getLogger } from '../modules/logger.js';
import { clamp } from '../utils/math.js';
import { FRONT_BATTLE_MODIFIERS } from './constants.js';

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
  return Math.min(1, killRate + fervorBonus);
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
 * Apply morale regen + recovery + reinforcement for a battle tick
 * @param {Object} army - Army object
 * @param {boolean} isMoraleBroken - Whether morale is broken
 * @param {Object} front - Battle front (for tracking stats)
 * @param {string} side - 'left' or 'right'
 */
function applyBattleSustainment(army, isMoraleBroken, front, side) {
  // Guard against undefined or invalid army structure
  if (!army || !army.mo || !army.mp) {
    return;
  }
  
  if (!isMoraleBroken && typeof army.mo.current === 'number' && typeof army.mo.max === 'number') {
    const regen = calculateMoraleRegen(army);
    army.mo.current = clamp(army.mo.current + regen, 0, army.mo.max);
  }

  if (typeof army.mp.current !== 'number' || army.mp.current <= 0) {
    return;
  }

  const recovered = applyRecovery(army, true);
  if (front && side && recovered > 0) {
    if (!front.recoveredMP) {
      front.recoveredMP = { left: 0, right: 0 };
    }
    front.recoveredMP[side] = (front.recoveredMP[side] || 0) + recovered;
  }
  applyReinforcement(army, true);
}

function logBattleRound(front, leftArmy, rightArmy, logger) {
  // Initialize round counter if not present
  if (typeof front.roundNumber !== 'number') {
    front.roundNumber = 0;
  }
  front.roundNumber += 1;

  // Guard against division by zero or undefined
  const leftMPMax = leftArmy.mp?.max || 1;
  const rightMPMax = rightArmy.mp?.max || 1;
  const leftMOMax = leftArmy.mo?.max || 1;
  const rightMOMax = rightArmy.mo?.max || 1;
  const leftMPPct = Math.floor(((leftArmy.mp?.current || 0) / leftMPMax) * 100);
  const rightMPPct = Math.floor(((rightArmy.mp?.current || 0) / rightMPMax) * 100);
  const leftMOPct = Math.floor(((leftArmy.mo?.current || 0) / leftMOMax) * 100);
  const rightMOPct = Math.floor(((rightArmy.mo?.current || 0) / rightMOMax) * 100);

  const leftBroken = front.moraleBroken.left;
  const rightBroken = front.moraleBroken.right;

  // Get damage dealt this round
  const roundDamage = front.roundDamage || { left: 0, right: 0 };
  const leftDamageDealt = roundDamage.left || 0;
  const rightDamageDealt = roundDamage.right || 0;

  // Log round at INFO level so it appears in file logs
  logger.info(`Battle ${front.id} Round ${front.roundNumber}: ${leftArmy.name} vs ${rightArmy.name}`, {
    round: front.roundNumber,
    leftMP: `${Math.floor(leftArmy.mp?.current || 0)}/${Math.floor(leftMPMax)} (${leftMPPct}%)`,
    rightMP: `${Math.floor(rightArmy.mp?.current || 0)}/${Math.floor(rightMPMax)} (${rightMPPct}%)`,
    leftMO: `${Math.floor(leftArmy.mo?.current || 0)}/${Math.floor(leftMOMax)} (${leftMOPct}%)`,
    rightMO: `${Math.floor(rightArmy.mo?.current || 0)}/${Math.floor(rightMOMax)} (${rightMOPct}%)`,
    damageDealt: {
      left: `${leftDamageDealt.toFixed(1)} MP`,
      right: `${rightDamageDealt.toFixed(1)} MP`
    },
    leftBroken: leftBroken,
    rightBroken: rightBroken
  });

  // Log morale breaks separately
  if (leftBroken || rightBroken) {
    const brokenSide = leftBroken ? leftArmy.name : rightArmy.name;
    logger.info(`Battle ${front.id}: ${brokenSide} morale broken`);
  }

  // Detailed DEBUG logging for additional context
  const leftEngaged = calculateEngagedUnits(leftArmy, front.battlefieldSize, leftBroken);
  const rightEngaged = calculateEngagedUnits(rightArmy, front.battlefieldSize, rightBroken);
  logger.debug(`Battle ${front.id} round ${front.roundNumber} details`, {
    width: front.battlefieldSize,
    leftEngaged: isNaN(leftEngaged) ? '0' : leftEngaged.toFixed(0),
    rightEngaged: isNaN(rightEngaged) ? '0' : rightEngaged.toFixed(0)
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
  
  const fervor = typeof army.fervor === 'number' && !isNaN(army.fervor) ? army.fervor : 0;
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
  const dmgPerUnitMP = typeof attackingArmy.dmgPerUnitMP === 'number' && !isNaN(attackingArmy.dmgPerUnitMP) 
    ? attackingArmy.dmgPerUnitMP 
    : 1.0;
  const rawMPDmg = engagedUnits * dmgPerUnitMP;
  const modifiedMPDmg = applyModifiers(rawMPDmg, attackingArmy);
  
  // Apply protection (damage reduction)
  const protection = typeof defendingArmy.protection === 'number' && !isNaN(defendingArmy.protection) 
    ? defendingArmy.protection 
    : 0;
  const finalMPDmg = modifiedMPDmg * (1 - protection);
  
  // Split into permanent and temporary
  const effectiveKillRate = getEffectiveKillRate(attackingArmy);
  const permanentDmg = finalMPDmg * effectiveKillRate;
  const temporaryDmg = finalMPDmg - permanentDmg;
  
  // Apply damage
  const prevMP = defendingArmy.mp.current || 0;
  defendingArmy.mp.current = Math.max(0, prevMP - finalMPDmg);
  
  // Add temporary damage to recovery pool
  if (typeof defendingArmy.recoveryPool !== 'number' || isNaN(defendingArmy.recoveryPool)) {
    defendingArmy.recoveryPool = 0;
  }
  defendingArmy.recoveryPool += temporaryDmg;
  
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
  
  // Log damage at INFO level so it appears in file logs
  const logger = getLogger();
  logger.info(`Battle ${front.id} damage: ${attackingArmy.name} → ${defendingArmy.name}`, {
    damage: `${finalMPDmg.toFixed(1)} MP (${permanentDmg.toFixed(1)} permanent, ${temporaryDmg.toFixed(1)} temporary)`,
    engagedUnits: engagedUnits.toFixed(0),
    mpBefore: prevMP.toFixed(0),
    mpAfter: defendingArmy.mp.current.toFixed(0)
  });
  
  // Detailed DEBUG logging for additional context
  logger.debug(`Battle ${front.id} attack details: ${attackingArmy.name} → ${defendingArmy.name}`, {
    rawDamage: rawMPDmg.toFixed(1),
    modifiedDamage: modifiedMPDmg.toFixed(1),
    protection: `${(protection * 100).toFixed(1)}%`,
    recoveryPool: defendingArmy.recoveryPool.toFixed(0)
  });
  
  // 3. Calculate morale damage (NOT width-scaled)
  // Guard against invalid structures
  if (!defendingArmy.mo) {
    defendingArmy.mo = { current: 0, max: 100 };
  }
  
  const dmgPerTickMO = typeof attackingArmy.dmgPerTickMO === 'number' && !isNaN(attackingArmy.dmgPerTickMO) 
    ? attackingArmy.dmgPerTickMO 
    : 2.5;
  const rawMODmg = dmgPerTickMO;
  const modifiedMODmg = applyModifiers(rawMODmg, attackingArmy);
  
  // Apply resolve (morale resistance)
  const resolve = typeof defendingArmy.resolve === 'number' && !isNaN(defendingArmy.resolve) 
    ? defendingArmy.resolve 
    : 0;
  const finalMODmg = modifiedMODmg * (1 - resolve);
  
  // Apply morale damage
  const previousMO = defendingArmy.mo.current || 0;
  defendingArmy.mo.current = Math.max(0, previousMO - finalMODmg);

  // Log morale damage at INFO level
  if (finalMODmg > 0) {
    const logger = getLogger();
    logger.info(`Battle ${front.id} morale damage: ${attackingArmy.name} → ${defendingArmy.name}`, {
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
 * Apply recovery: convert recoveryPool to mp.current
 * Recovery rate is based on the army's Recovery stat, modified by organization
 * During battles, recovery is significantly reduced (can't fully recover while fighting)
 * @returns {number} Amount of MP recovered
 */
function applyRecovery(army, inBattle = false) {
  // Guard against undefined or invalid army structure
  if (!army || !army.mp || typeof army.recoveryPool !== 'number' || army.recoveryPool <= 0) {
    return 0;
  }
  
  // Ensure mp structure exists
  if (typeof army.mp.current !== 'number' || typeof army.mp.max !== 'number') {
    return 0;
  }
  
  // Base recovery rate from Recovery stat (0-100 -> 0-1000 MP/tick)
  const recovery = typeof army.recovery === 'number' && !isNaN(army.recovery) ? army.recovery : 50;
  const baseRecoveryRate = recovery * 10;
  
  // Organization provides a multiplier (0.5x to 1.5x)
  const org = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
  const orgModifier = 0.5 + (org / 100);
  
  // During battles, recovery is much slower (20% of normal rate - can't fully recover while fighting)
  const battleModifier = inBattle ? 0.2 : 1.0;
  
  const recoveryRate = baseRecoveryRate * orgModifier * battleModifier;
  const recovered = Math.min(recoveryRate, army.recoveryPool);
  const spaceAvailable = Math.max(0, army.mp.max - army.mp.current);
  const actualRecovered = Math.min(recovered, spaceAvailable);
  
  const prevMP = army.mp.current;
  army.mp.current = Math.max(0, Math.min(army.mp.max, army.mp.current + actualRecovered));
  army.recoveryPool = Math.max(0, army.recoveryPool - actualRecovered);
  
  // Debug logging
  const logger = getLogger();
  logger.debug(`Recovery${inBattle ? ' (battle)' : ''}: ${army.name || 'Unknown'}`, {
    recovery: recovery.toFixed(0),
    org: org.toFixed(1),
    baseRate: baseRecoveryRate.toFixed(0),
    orgMod: orgModifier.toFixed(2),
    battleMod: battleModifier.toFixed(2),
    recoveryRate: recoveryRate.toFixed(0),
    poolBefore: (army.recoveryPool + actualRecovered).toFixed(0),
    poolAfter: army.recoveryPool.toFixed(0),
    recovered: actualRecovered.toFixed(0),
    mpBefore: prevMP.toFixed(0),
    mpAfter: army.mp.current.toFixed(0)
  });
  
  return actualRecovered;
}

/**
 * Apply reinforcement: add new MP from reserves
 * @param {Object} army - Army object
 * @param {boolean} inBattle - If true, reduce reinforcement rate (battles are intense)
 */
function applyReinforcement(army, inBattle = false) {
  // Guard against undefined or invalid army structure
  if (!army || !army.mp || typeof army.mp.current !== 'number' || typeof army.mp.max !== 'number') {
    return;
  }
  
  const spaceAvailable = Math.max(0, army.mp.max - army.mp.current);
  if (spaceAvailable <= 0) return;
  
  // During battles, reinforcement is much slower (10% of normal rate)
  const reinforcementRate = typeof army.reinforcementRate === 'number' && !isNaN(army.reinforcementRate) 
    ? army.reinforcementRate 
    : 100;
  const effectiveRate = inBattle ? reinforcementRate * 0.1 : reinforcementRate;
  const reinforced = Math.min(effectiveRate, spaceAvailable);
  army.mp.current = Math.max(0, Math.min(army.mp.max, army.mp.current + reinforced));
  
  // Debug logging
  if (inBattle && reinforced > 0) {
    const logger = getLogger();
    logger.debug(`Reinforcement (battle): ${army.name} +${reinforced.toFixed(0)} MP (reduced rate)`);
  }
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
  
  // Generate battle summary
  if (leftArmy && rightArmy) {
    const leftDestroyed = Math.floor(front.permanentLosses.left);
    const rightDestroyed = Math.floor(front.permanentLosses.right);
    const leftRecovered = Math.floor(front.recoveredMP?.left || 0);
    const rightRecovered = Math.floor(front.recoveredMP?.right || 0);
    const leftRemaining = Math.floor(leftArmy.mp.current);
    const rightRemaining = Math.floor(rightArmy.mp.current);
    
    const leftSummary = `${leftArmy.name}: ${leftDestroyed} destroyed, ${leftRecovered} recovered, ${leftRemaining} remaining`;
    const rightSummary = `${rightArmy.name}: ${rightDestroyed} destroyed, ${rightRecovered} recovered, ${rightRemaining} remaining`;
    
    logger.info(`Battle ${front.id} summary - ${leftSummary}`);
    logger.info(`Battle ${front.id} summary - ${rightSummary}`);
    log.push(`${leftSummary}`);
    log.push(`${rightSummary}`);
  }
  
  // Refill morale to max
  if (leftArmy) {
    leftArmy.mo.current = leftArmy.mo.max;
  }
  if (rightArmy) {
    rightArmy.mo.current = rightArmy.mo.max;
  }
  
  // Reset broken flags
  front.moraleBroken.left = false;
  front.moraleBroken.right = false;
  
  // Emit battle_ended event
  emitEvent(worldState, 'battle_ended', {
    frontId: front.id,
    winnerSide: winnerSide,
    leftArmyId: front.leftArmyId,
    rightArmyId: front.rightArmyId,
    permanentLosses: { ...front.permanentLosses },
    recoveredMP: { ...(front.recoveredMP || { left: 0, right: 0 }) }
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
    recoveredMP: {
      left: 0,
      right: 0
    },
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
