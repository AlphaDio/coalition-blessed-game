// Front Battles - MP-axis battles with morale badges

/**
 * Calculate engagement width utilization based on organization
 * Simple monotonic function: better org = better width utilization
 * @param {number} organization - Army organization (0..100)
 * @returns {number} Width utilization multiplier (0..1)
 */
function widthUtilization(organization) {
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
  const baseUtil = widthUtilization(army.organization);
  
  // If broken, apply penalty to width utilization (can't hold the line)
  const brokenPenalty = isBroken ? 0.5 : 1.0;
  const effectiveUtil = baseUtil * brokenPenalty;
  
  // Engagement is limited by battlefield size and current MP
  const maxEngaged = Math.min(
    battlefieldSize * effectiveUtil,
    army.mp.current
  );
  
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
 * Apply simple combat modifiers based on army stats
 * @param {number} baseDamage - Base damage value
 * @param {Object} army - Attacking army
 * @returns {number} Modified damage
 */
function applyModifiers(baseDamage, army) {
  // Fervor: ±20% at extremes
  const fervorMod = 0.8 + (army.fervor / 100) * 0.4;
  // Organization: ±10% at extremes
  const orgMod = 0.9 + (army.organization / 100) * 0.2;
  
  return baseDamage * fervorMod * orgMod;
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Simulate one tick of a battle front
 * @param {Object} front - BattleFront object
 * @param {Object} worldState - Full game state
 * @returns {Array} Log messages from this tick
 */
export function simulateBattleTick(front, worldState) {
  if (front.state !== 'ACTIVE') {
    return [];
  }
  
  const log = [];
  const leftArmy = worldState.armies.find(a => a.id === front.leftArmyId);
  const rightArmy = worldState.armies.find(a => a.id === front.rightArmyId);
  
  if (!leftArmy || !rightArmy) {
    log.push(`Battle ${front.id}: Missing army, ending battle`);
    endBattle(front, worldState, null);
    return log;
  }
  
  // Process both sides attacking each other
  processSideAttack(front, leftArmy, rightArmy, 'left', 'right', log);
  processSideAttack(front, rightArmy, leftArmy, 'right', 'left', log);
  
  // Apply morale regen (only if not broken)
  if (!front.moraleBroken.left) {
    const regen = calculateMoraleRegen(leftArmy);
    leftArmy.mo.current = clamp(leftArmy.mo.current + regen, 0, leftArmy.mo.max);
  }
  
  if (!front.moraleBroken.right) {
    const regen = calculateMoraleRegen(rightArmy);
    rightArmy.mo.current = clamp(rightArmy.mo.current + regen, 0, rightArmy.mo.max);
  }
  
  // Apply recovery (fast - from recoveryPool to mp.current)
  applyRecovery(leftArmy);
  applyRecovery(rightArmy);
  
  // Apply reinforcement (slower - new MP)
  applyReinforcement(leftArmy);
  applyReinforcement(rightArmy);
  
  // Check end conditions
  let winner = null;
  if (leftArmy.mp.current <= 0) {
    winner = 'right';
    log.push(`Battle ${front.id}: ${leftArmy.name} shattered!`);
  } else if (rightArmy.mp.current <= 0) {
    winner = 'left';
    log.push(`Battle ${front.id}: ${rightArmy.name} shattered!`);
  }
  
  if (winner) {
    endBattle(front, worldState, winner);
  }
  
  return log;
}

/**
 * Process one side attacking the other
 */
function processSideAttack(front, attackingArmy, defendingArmy, attackingSide, defendingSide, log) {
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
  defendingArmy.mp.current -= finalMPDmg;
  defendingArmy.mp.current = Math.max(0, defendingArmy.mp.current);
  
  // Add temporary damage to recovery pool
  defendingArmy.recoveryPool += temporaryDmg;
  
  // Track permanent losses
  front.permanentLosses[defendingSide] += permanentDmg;
  
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
    log.push(`Battle ${front.id}: ${defendingArmy.name} morale BROKEN!`);
    
    // Emit event
    emitEvent('morale_broken', {
      frontId: front.id,
      side: defendingSide,
      armyId: defendingArmy.id,
      armyName: defendingArmy.name
    });
  }
}

/**
 * Apply recovery: convert recoveryPool to mp.current
 */
function applyRecovery(army) {
  if (army.recoveryPool <= 0) return;
  
  const recovered = Math.min(army.recoveryRate, army.recoveryPool);
  const spaceAvailable = army.mp.max - army.mp.current;
  const actualRecovered = Math.min(recovered, spaceAvailable);
  
  army.mp.current += actualRecovered;
  army.recoveryPool -= actualRecovered;
}

/**
 * Apply reinforcement: add new MP from reserves
 */
function applyReinforcement(army) {
  const spaceAvailable = army.mp.max - army.mp.current;
  if (spaceAvailable <= 0) return;
  
  const reinforced = Math.min(army.reinforcementRate, spaceAvailable);
  army.mp.current += reinforced;
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
  emitEvent('battle_ended', {
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
  const leftArmy = worldState.armies.find(a => a.id === leftArmyId);
  const rightArmy = worldState.armies.find(a => a.id === rightArmyId);
  
  if (!leftArmy || !rightArmy) {
    throw new Error('Invalid army IDs for battle');
  }
  
  // Use a simple inline factory to avoid circular dependency
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
  emitEvent('battle_started', {
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
function emitEvent(eventType, data) {
  // This is a simple implementation - can be enhanced to integrate with existing event system
  // For now, we'll just store events that can be consumed by other systems
  if (typeof global !== 'undefined' && global.gameState) {
    global.gameState.battleEvents = global.gameState.battleEvents || [];
    global.gameState.battleEvents.push({
      type: eventType,
      data,
      tick: global.gameState.turn
    });
  }
}

/**
 * Get all active battles
 * @param {Object} worldState - Game state
 * @returns {Array} Active battle fronts
 */
export function getActiveBattles(worldState) {
  return (worldState.battleFronts || []).filter(f => f.state === 'ACTIVE');
}
