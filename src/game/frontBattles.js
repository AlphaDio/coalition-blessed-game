// Front Battles - MP-axis battles with morale badges
import { getLogger } from '../modules/logger.js';
import { clamp } from '../utils/math.js';

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
  // Organization determines how much of the army can participate
  const participation = participationRate(army.organization);
  const participatingMP = army.mp.current * participation;
  
  // If broken, apply penalty to engagement (can't hold the line)
  const brokenPenalty = isBroken ? 0.5 : 1.0;
  
  // Engagement is limited by battlefield size and participating MP
  const maxEngaged = Math.min(
    battlefieldSize,
    participatingMP
  ) * brokenPenalty;
  
  return maxEngaged;
}

/**
 * Calculate kill rate modifier based on army stats
 * @param {Object} army - Army object
 * @returns {number} Modified kill rate
 */
function getEffectiveKillRate(army) {
  // Simple: base killRate with minor fervor modifier
  const fervorBonus = (army.fervor / 100) * 0.05; // Up to +5% at max fervor
  return Math.min(1, army.killRate + fervorBonus);
}

/**
 * Calculate morale regen per tick
 * @param {Object} army - Army object
 * @returns {number} Morale regen amount
 */
function calculateMoraleRegen(army) {
  // Organization boosts regen: 0.5 to 2.0 per tick
  const orgFactor = army.organization / 100;
  return 0.5 + (orgFactor * 1.5);
}

/**
 * Apply morale regen + recovery + reinforcement for a battle tick
 */
function applyBattleSustainment(army, isMoraleBroken) {
  if (!isMoraleBroken) {
    const regen = calculateMoraleRegen(army);
    army.mo.current = clamp(army.mo.current + regen, 0, army.mo.max);
  }

  if (army.mp.current <= 0) {
    return;
  }

  applyRecovery(army, true);
  applyReinforcement(army, true);
}

function logBattleRound(front, leftArmy, rightArmy, logger) {
  // Compact INFO-level logging for battle rounds
  const leftMPPct = Math.floor((leftArmy.mp.current / leftArmy.mp.max) * 100);
  const rightMPPct = Math.floor((rightArmy.mp.current / rightArmy.mp.max) * 100);
  const leftMOPct = Math.floor((leftArmy.mo.current / leftArmy.mo.max) * 100);
  const rightMOPct = Math.floor((rightArmy.mo.current / rightArmy.mo.max) * 100);

  // Only log at INFO if there's a significant change or morale breaks
  const leftBroken = front.moraleBroken.left;
  const rightBroken = front.moraleBroken.right;

  if (leftBroken || rightBroken) {
    const brokenSide = leftBroken ? leftArmy.name : rightArmy.name;
    logger.info(`Battle ${front.id}: ${brokenSide} morale broken`);
  }

  // Detailed DEBUG logging
  const leftEngaged = calculateEngagedUnits(leftArmy, front.battlefieldSize, leftBroken);
  const rightEngaged = calculateEngagedUnits(rightArmy, front.battlefieldSize, rightBroken);
  logger.debug(`Battle ${front.id} round`, {
    width: front.battlefieldSize,
    leftMP: `${Math.floor(leftArmy.mp.current)}/${Math.floor(leftArmy.mp.max)} (${leftMPPct}%)`,
    rightMP: `${Math.floor(rightArmy.mp.current)}/${Math.floor(rightArmy.mp.max)} (${rightMPPct}%)`,
    leftMO: `${Math.floor(leftArmy.mo.current)}/${Math.floor(leftArmy.mo.max)} (${leftMOPct}%)`,
    rightMO: `${Math.floor(rightArmy.mo.current)}/${Math.floor(rightArmy.mo.max)} (${rightMOPct}%)`,
    leftBroken: front.moraleBroken.left,
    rightBroken: front.moraleBroken.right,
    leftEngaged: leftEngaged.toFixed(0),
    rightEngaged: rightEngaged.toFixed(0)
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
  // Fervor: 0.8x to 1.2x (0 fervor = 0.8x, 100 fervor = 1.2x)
  const fervorMod = 0.8 + (army.fervor / 100) * 0.4;
  // Organization: 0.9x to 1.1x (0 org = 0.9x, 100 org = 1.1x)
  const orgMod = 0.9 + (army.organization / 100) * 0.2;
  
  return baseDamage * fervorMod * orgMod;
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
    endBattle(front, worldState, null);
    return log;
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
    endBattle(front, worldState, winner);
    return log;
  } else if (rightArmy.mp.current <= 0) {
    winner = 'left';
    logger.info(`Battle ${front.id} ended: ${rightArmy.name} shattered! (Width: ${front.battlefieldSize})`);
    log.push(`Battle ${front.id}: ${rightArmy.name} shattered!`);
    endBattle(front, worldState, winner);
    return log;
  }
  
  applyBattleSustainment(leftArmy, front.moraleBroken.left);
  applyBattleSustainment(rightArmy, front.moraleBroken.right);

  
  logBattleRound(front, leftArmy, rightArmy, logger);

  
  return log;
}

/**
 * Process one side attacking the other
 */
function processSideAttack(front, attackingArmy, defendingArmy, attackingSide, defendingSide, worldState, log) {
  // 1. Calculate engaged units
  const isBroken = front.moraleBroken[attackingSide];
  const engagedUnits = calculateEngagedUnits(attackingArmy, front.battlefieldSize, isBroken);
  
  if (engagedUnits <= 0) {
    return; // No engagement possible
  }
  
  // 2. Calculate MP damage (width-scaled)
  const rawMPDmg = engagedUnits * attackingArmy.dmgPerUnitMP;
  const modifiedMPDmg = applyModifiers(rawMPDmg, attackingArmy);
  
  // Apply protection (damage reduction)
  const finalMPDmg = modifiedMPDmg * (1 - defendingArmy.protection);
  
  // Split into permanent and temporary
  const effectiveKillRate = getEffectiveKillRate(attackingArmy);
  const permanentDmg = finalMPDmg * effectiveKillRate;
  const temporaryDmg = finalMPDmg - permanentDmg;
  
  // Apply damage
  const prevMP = defendingArmy.mp.current;
  defendingArmy.mp.current -= finalMPDmg;
  defendingArmy.mp.current = Math.max(0, defendingArmy.mp.current);
  
  // Add temporary damage to recovery pool
  defendingArmy.recoveryPool += temporaryDmg;
  
  // Track permanent losses
  front.permanentLosses[defendingSide] += permanentDmg;
  
  // Debug: Log damage if significant
  const logger = getLogger();
  logger.debug(`Battle ${front.id} attack: ${attackingArmy.name} → ${defendingArmy.name}`, {
    engagedUnits: engagedUnits.toFixed(0),
    rawDamage: rawMPDmg.toFixed(1),
    finalDamage: finalMPDmg.toFixed(1),
    permanent: permanentDmg.toFixed(1),
    temporary: temporaryDmg.toFixed(1),
    mpBefore: prevMP.toFixed(0),
    mpAfter: defendingArmy.mp.current.toFixed(0),
    recoveryPool: defendingArmy.recoveryPool.toFixed(0)
  });
  
  // 3. Calculate morale damage (NOT width-scaled)
  const rawMODmg = attackingArmy.dmgPerTickMO;
  const modifiedMODmg = applyModifiers(rawMODmg, attackingArmy);
  
  // Apply resolve (morale resistance)
  const finalMODmg = modifiedMODmg * (1 - defendingArmy.resolve);
  
  // Apply morale damage
  const previousMO = defendingArmy.mo.current;
  defendingArmy.mo.current -= finalMODmg;
  defendingArmy.mo.current = Math.max(0, defendingArmy.mo.current);
  
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
 */
function applyRecovery(army, inBattle = false) {
  if (army.recoveryPool <= 0) return;
  
  // Base recovery rate from Recovery stat (0-100 -> 0-1000 MP/tick)
  const baseRecoveryRate = (army.recovery || 50) * 10;
  
  // Organization provides a multiplier (0.5x to 1.5x)
  const orgModifier = 0.5 + (army.organization / 100);
  
  // During battles, recovery is much slower (20% of normal rate - can't fully recover while fighting)
  const battleModifier = inBattle ? 0.2 : 1.0;
  
  const recoveryRate = baseRecoveryRate * orgModifier * battleModifier;
  const recovered = Math.min(recoveryRate, army.recoveryPool);
  const spaceAvailable = army.mp.max - army.mp.current;
  const actualRecovered = Math.min(recovered, spaceAvailable);
  
  const prevMP = army.mp.current;
  army.mp.current += actualRecovered;
  army.recoveryPool -= actualRecovered;
  
  // Debug logging
  const logger = getLogger();
  logger.debug(`Recovery${inBattle ? ' (battle)' : ''}: ${army.name}`, {
    recovery: (army.recovery || 50).toFixed(0),
    org: army.organization.toFixed(1),
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
}

/**
 * Apply reinforcement: add new MP from reserves
 * @param {Object} army - Army object
 * @param {boolean} inBattle - If true, reduce reinforcement rate (battles are intense)
 */
function applyReinforcement(army, inBattle = false) {
  const spaceAvailable = army.mp.max - army.mp.current;
  if (spaceAvailable <= 0) return;
  
  // During battles, reinforcement is much slower (10% of normal rate)
  const effectiveRate = inBattle ? army.reinforcementRate * 0.1 : army.reinforcementRate;
  const reinforced = Math.min(effectiveRate, spaceAvailable);
  army.mp.current += reinforced;
  
  // Debug logging
  if (inBattle && reinforced > 0) {
    const logger = getLogger();
    logger.debug(`Reinforcement (battle): ${army.name} +${reinforced.toFixed(0)} MP (reduced rate)`);
  }
}

/**
 * End a battle and clean up
 */
function endBattle(front, worldState, winnerSide) {
  front.state = 'ENDED';
  front.endedAtTick = worldState.turn;
  
  const leftArmy = worldState.armies.find(a => a.id === front.leftArmyId);
  const rightArmy = worldState.armies.find(a => a.id === front.rightArmyId);
  
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
    permanentLosses: { ...front.permanentLosses }
  });
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
  
  const leftMP = Math.floor(leftArmy.mp.current);
  const rightMP = Math.floor(rightArmy.mp.current);
  logger.debug(`Starting battle: ${leftArmy.name} vs ${rightArmy.name}`, {
    battlefieldSize,
    leftMP: leftArmy.mp.current,
    rightMP: rightArmy.mp.current
  });
  
  // Create battle front inline to avoid circular dependency with types.js
  // (types.js imports from other game modules which may import this module)
  const battleId = `battle_${worldState.turn}_${leftArmyId}_${rightArmyId}`;
  const front = {
    id: battleId,
    state: 'ACTIVE',
    battlefieldSize,
    leftArmyId,
    rightArmyId,
    moraleBroken: {
      left: false,
      right: false
    },
    permanentLosses: {
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
