import { BATTLE_CONSTANTS } from './constants.js';
import { clampStat, clampCohesion, clampApproval } from './cohesion.js';
import { getLogger } from '../modules/logger.js';
import { startBattle } from './frontBattles.js';

export function calculateArmyPower(army) {
  return (
    BATTLE_CONSTANTS.ARMY_POWER_ORG_WEIGHT * army.organization +
    BATTLE_CONSTANTS.ARMY_POWER_FERVOR_WEIGHT * army.fervor
  );
}

export function calculateCoalitionPower(armies) {
  // Sum all army power, but apply diminishing returns for large numbers of armies
  // This prevents 4 armies from being 4x as powerful
  const totalPower = armies.reduce((sum, army) => sum + calculateArmyPower(army), 0);
  
  // Apply scaling: 1 army = 100%, 2 armies = 180%, 3 armies = 250%, 4+ armies = 300% of single army average
  // This makes battles more balanced
  if (armies.length === 1) {
    return totalPower;
  } else if (armies.length === 2) {
    return totalPower * 0.9; // 2 armies = 90% of sum (180% of single)
  } else if (armies.length === 3) {
    return totalPower * 0.83; // 3 armies = 83% of sum (250% of single)
  } else {
    // 4+ armies: cap at 3x the average single army power
    const avgArmyPower = totalPower / armies.length;
    return Math.min(totalPower * 0.75, avgArmyPower * 3);
  }
}

export function calculateScourgePower(scourgeFervor, rng = Math.random) {
  const base = BATTLE_CONSTANTS.SCOURGE_BASE_POWER;
  const fervorBonus = scourgeFervor * BATTLE_CONSTANTS.SCOURGE_FERVOR_MULTIPLIER;
  const noise = (rng() - 0.5) * BATTLE_CONSTANTS.SCOURGE_RNG_RANGE;
  return base + fervorBonus + noise;
}

export function calculateInsurrectionPower(armies, rng = Math.random) {
  const basePower = calculateCoalitionPower(armies);
  const noise = (rng() - 0.5) * BATTLE_CONSTANTS.INSURRECTION_RNG_RANGE;
  return basePower + noise;
}

/**
 * Create or get the Scourge army entity
 * @param {Object} state - Game state
 * @returns {Object} Scourge army
 */
function getOrCreateScourgeArmy(state) {
  const scourgeId = '_scourge_army';
  let scourgeArmy = state.armies.find(a => a.id === scourgeId);
  
  if (!scourgeArmy) {
    // Create Scourge army based on current fervor
    // Higher fervor = stronger Scourge
    const baseMP = 12000;
    const fervorMPBonus = state.scourgeFervor * 50; // +50 MP per fervor point
    const totalMP = baseMP + fervorMPBonus;
    
    scourgeArmy = {
      id: scourgeId,
      empireId: '_scourge',
      name: 'The Scourge',
      fervor: state.scourgeFervor,
      organization: Math.min(100, 50 + state.scourgeFervor * 0.5), // 50-100 org based on fervor
      supplyNeed: 0,
      aggravation: 0,
      manpower: totalMP,
      owner_empire_id: '_scourge',
      performance: { base: 1.0, current: 1.0 },
      supply_state: { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} },
      demands: { needs: {}, wants: {} },
      
      // MP and MO pools
      mp: {
        current: totalMP,
        max: totalMP
      },
      mo: {
        current: 100,
        max: 100
      },
      
      // Combat stats - Scourge is aggressive but less protected
      dmgPerUnitMP: 1.2,        // Higher damage output
      dmgPerTickMO: 3.0,        // Higher morale pressure
      protection: 0.15,         // Less protection
      resolve: 0.25,            // Less resolve
      killRate: 0.15,          // Higher kill rate
      
      // Sustain stats
      recoveryPool: 0,
      command: 40,              // Lower Command stat than coalition armies
      recovery: 40,             // Lower Recovery stat than coalition armies
      reinforcementRate: 80     // Slower reinforcement
    };
    
    state.armies.push(scourgeArmy);
  } else {
    // Update Scourge army stats based on current fervor
    const baseMP = 12000;
    const fervorMPBonus = state.scourgeFervor * 50;
    const totalMP = baseMP + fervorMPBonus;
    
    // Scale MP proportionally
    const mpRatio = scourgeArmy.mp.current / scourgeArmy.mp.max;
    scourgeArmy.mp.max = totalMP;
    scourgeArmy.mp.current = totalMP * mpRatio;
    
    scourgeArmy.fervor = state.scourgeFervor;
    scourgeArmy.organization = Math.min(100, 50 + state.scourgeFervor * 0.5);
  }
  
  return scourgeArmy;
}

/**
 * Create a combined coalition army from multiple participating armies
 * @param {Object} state - Game state
 * @param {Array} participatingArmies - Array of army objects
 * @returns {Object} Combined coalition army
 */
function createCombinedCoalitionArmy(state, participatingArmies) {
  const combinedId = '_coalition_combined_' + state.turn;
  
  // Calculate combined stats (weighted average)
  let totalMP = 0;
  let totalMaxMP = 0;
  let totalOrg = 0;
  let totalFervor = 0;
  let totalDmgPerUnitMP = 0;
  let totalDmgPerTickMO = 0;
  let totalProtection = 0;
  let totalResolve = 0;
  let totalKillRate = 0;
  let totalRecovery = 0;
  let totalReinforcementRate = 0;
  
  participatingArmies.forEach(army => {
    const power = calculateArmyPower(army);
    totalMP += army.mp.current;
    totalMaxMP += army.mp.max;
    totalOrg += army.organization * power;
    totalFervor += army.fervor * power;
    totalDmgPerUnitMP += army.dmgPerUnitMP * power;
    totalDmgPerTickMO += army.dmgPerTickMO * power;
    totalProtection += army.protection * power;
    totalResolve += army.resolve * power;
    totalKillRate += army.killRate * power;
    totalRecovery += (army.command || 50) * power;
    totalReinforcementRate += army.reinforcementRate * power;
  });
  
  const totalPower = participatingArmies.reduce((sum, a) => sum + calculateArmyPower(a), 0);
  
  const combinedArmy = {
    id: combinedId,
    empireId: '_coalition',
    name: `Coalition Forces (${participatingArmies.length} armies)`,
    fervor: totalFervor / totalPower,
    organization: totalOrg / totalPower,
    supplyNeed: 0,
    aggravation: 0,
    manpower: totalMP,
    owner_empire_id: '_coalition',
    performance: { base: 1.0, current: 1.0 },
    supply_state: { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} },
    demands: { needs: {}, wants: {} },
    
    // MP and MO pools - combined
    mp: {
      current: totalMP,
      max: totalMaxMP
    },
    mo: {
      current: 100,
      max: 100
    },
    
    // Combat stats - weighted average
    dmgPerUnitMP: totalDmgPerUnitMP / totalPower,
    dmgPerTickMO: totalDmgPerTickMO / totalPower,
    protection: totalProtection / totalPower,
    resolve: totalResolve / totalPower,
    killRate: totalKillRate / totalPower,
    
    // Sustain stats
    recoveryPool: 0,
    command: totalCommand / totalPower,
    recovery: totalRecovery / totalPower,
    reinforcementRate: totalReinforcementRate / totalPower,
    
    // Store reference to original armies for result distribution
    _originalArmies: participatingArmies.map(a => ({
      id: a.id,
      originalMP: a.mp.current,
      originalMaxMP: a.mp.max
    }))
  };
  
  state.armies.push(combinedArmy);
  return combinedArmy;
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
  
  const armyDetails = participatingArmies.map(a => ({
    name: a.name,
    power: calculateArmyPower(a).toFixed(2),
    org: a.organization,
    fervor: a.fervor
  }));
  
  logger.info(`Scourge battle: ${participatingArmies.length} armies vs Scourge`);
  logger.debug(`Scourge battle starting: ${participatingArmies.length} armies participating`);
  logger.debug(`Participating armies: ${participatingArmies.map(a => `${a.name} (Power: ${calculateArmyPower(a).toFixed(2)}, Org: ${a.organization.toFixed(1)}, Fervor: ${a.fervor.toFixed(1)})`).join(', ')}`);
  
  // Create/get Scourge army
  const scourgeArmy = getOrCreateScourgeArmy(state);
  
  // Create combined coalition army
  const coalitionArmy = createCombinedCoalitionArmy(state, participatingArmies);
  
  // Calculate battlefield size based on total forces
  const totalForces = coalitionArmy.mp.current + scourgeArmy.mp.current;
  const battlefieldSize = Math.max(800, Math.min(2000, totalForces / 10));
  
  // Start the battle front (coalition on left, Scourge on right)
  const front = startBattle(state, coalitionArmy.id, scourgeArmy.id, battlefieldSize);
  
  // Mark as Scourge battle
  front.isScourgeBattle = true;
  front.participatingArmyIds = participatingArmies.map(a => a.id);
  
  const coalitionMP = Math.floor(coalitionArmy.mp.current);
  const scourgeMP = Math.floor(scourgeArmy.mp.current);
  logger.info(`Scourge battle: Coalition ${coalitionMP} MP vs Scourge ${scourgeMP} MP (Field: ${battlefieldSize})`);
  logger.debug(`Scourge battle front created: ${front.id}`, {
    battlefieldSize,
    coalitionMP: coalitionArmy.mp.current,
    scourgeMP: scourgeArmy.mp.current
  });
  
  return { front, log: [`Scourge battle engaged! ${participatingArmies.length} armies vs The Scourge`] };
}

/**
 * Handle Scourge battle end and apply results
 * @param {Object} state - Game state
 * @param {Object} front - Battle front
 * @param {string} winnerSide - 'left' (coalition) or 'right' (scourge)
 */
export function handleScourgeBattleEnd(state, front, winnerSide) {
  const logger = getLogger();
  const coalitionArmy = state.armies.find(a => a.id === front.leftArmyId);
  const scourgeArmy = state.armies.find(a => a.id === front.rightArmyId);
  
  if (!coalitionArmy || !scourgeArmy) {
    logger.error('Scourge battle end: missing armies', { frontId: front.id });
    return;
  }
  
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
    
    // Distribute MP loss proportionally based on original MP
    const armyMPLoss = armyData.originalMaxMP * coalitionMPLossRatio;
    army.mp.current = Math.max(0, armyData.originalMP - armyMPLoss);
    
    // Distribute organization and fervor changes
    if (coalitionWon) {
      army.organization = clampStat(army.organization - BATTLE_CONSTANTS.WIN_ORG_LOSS);
      army.fervor = clampStat(army.fervor + BATTLE_CONSTANTS.WIN_FERVOR_GAIN);
    } else {
      army.organization = clampStat(army.organization - BATTLE_CONSTANTS.LOSS_ORG_LOSS);
      army.fervor = clampStat(army.fervor - BATTLE_CONSTANTS.LOSS_FERVOR_LOSS);
    }
  });
  
  // Apply cohesion and approval changes
  if (coalitionWon) {
    const margin = (coalitionArmy.mp.current / coalitionArmy.mp.max) - 0.5; // How decisively won
    const cohesionLoss = Math.max(1, Math.floor(BATTLE_CONSTANTS.SCOURGE_WIN_COHESION_LOSS * (1 - margin)));
    const prevScourgeCohesion = state.scourgeCohesion;
    state.scourgeCohesion = clampStat(state.scourgeCohesion - cohesionLoss, 0, 100);
    logger.info(`Scourge battle: Victory! Scourge Cohesion ${prevScourgeCohesion.toFixed(1)} -> ${state.scourgeCohesion.toFixed(1)} (-${cohesionLoss})`);
  } else {
    const cohesionLoss = BATTLE_CONSTANTS.SCOURGE_LOSS_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);
    
    const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
    state.empires.forEach(empire => {
      empire.approval = clampApproval(empire.approval - approvalLoss);
    });
    logger.info(`Scourge battle: Defeat! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss}), All Empires Approval -${approvalLoss}`);
  }
  
  // Clean up temporary armies
  const combinedIndex = state.armies.findIndex(a => a.id === coalitionArmy.id);
  if (combinedIndex >= 0) {
    state.armies.splice(combinedIndex, 1);
  }
  
  // Keep Scourge army for future battles, but reset its MP if needed
  if (scourgeArmy.mp.current <= 0) {
    // Scourge was defeated, reset for next battle
    const baseMP = 12000;
    const fervorMPBonus = state.scourgeFervor * 50;
    scourgeArmy.mp.max = baseMP + fervorMPBonus;
    scourgeArmy.mp.current = scourgeArmy.mp.max * 0.5; // Start at 50% for next battle
  }
}

// Legacy function for backwards compatibility (now creates a battle front)
export function resolveScourgeBattle(state, participatingArmies, rng = Math.random) {
  return startScourgeBattle(state, participatingArmies, rng);
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
  const rebelliousArmy = createCombinedCoalitionArmy(state, rebelliousArmies);
  rebelliousArmy.name = `Rebellious Forces (${rebelliousArmies.length} armies)`;
  rebelliousArmy.empireId = '_insurrection';
  
  // Create combined loyal army
  const loyalArmy = createCombinedCoalitionArmy(state, opposingArmies);
  loyalArmy.name = `Loyal Forces (${opposingArmies.length} armies)`;
  loyalArmy.empireId = '_coalition';
  
  // Calculate battlefield size based on total forces
  const totalForces = rebelliousArmy.mp.current + loyalArmy.mp.current;
  const battlefieldSize = Math.max(800, Math.min(2000, totalForces / 10));
  
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
 */
export function handleInsurrectionBattleEnd(state, front, winnerSide) {
  const logger = getLogger();
  const loyalArmy = state.armies.find(a => a.id === front.leftArmyId);
  const rebelliousArmy = state.armies.find(a => a.id === front.rightArmyId);
  
  if (!loyalArmy || !rebelliousArmy) {
    logger.error('Insurrection battle end: missing armies', { frontId: front.id });
    return;
  }
  
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
    
    const armyMPLoss = armyData.originalMaxMP * loyalMPLossRatio;
    army.mp.current = Math.max(0, armyData.originalMP - armyMPLoss);
  });
  
  // Distribute results to rebellious armies
  rebelliousArmyData.forEach(armyData => {
    const army = state.armies.find(a => a.id === armyData.id);
    if (!army) return;
    
    const armyMPLoss = armyData.originalMaxMP * rebelliousMPLossRatio;
    army.mp.current = Math.max(0, armyData.originalMP - armyMPLoss);
    
    if (loyalWon) {
      // Insurrection quelled
      army.fervor = clampStat(army.fervor - BATTLE_CONSTANTS.RESOLVED_FERVOR_DROP);
      army.aggravation = clampStat(army.aggravation - 30);
    } else {
      // Insurrection spreads - no changes to rebellious armies, but approval shock
    }
  });
  
  // Apply cohesion and approval changes
  if (loyalWon) {
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_WIN_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);
    
    // Mark insurrection as resolved
    const insurrection = state.insurrections.find(ins => ins.id === front.insurrectionId);
    if (insurrection) {
      insurrection.active = false;
    }
    
    logger.info(`Insurrection battle: Quelled! Coalition Cohesion ${prevCoalitionCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)} (-${cohesionLoss})`);
  } else {
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_LOSS_COHESION_LOSS;
    const prevCoalitionCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);
    
    const approvalShock = BATTLE_CONSTANTS.RESOLVED_APPROVAL_SHOCK;
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
  
  // Clean up temporary armies
  const loyalIndex = state.armies.findIndex(a => a.id === loyalArmy.id);
  if (loyalIndex >= 0) {
    state.armies.splice(loyalIndex, 1);
  }
  const rebelliousIndex = state.armies.findIndex(a => a.id === rebelliousArmy.id);
  if (rebelliousIndex >= 0) {
    state.armies.splice(rebelliousIndex, 1);
  }
}

// Legacy function for backwards compatibility (now creates a battle front)
export function resolveInsurrectionBattle(state, insurrection, opposingArmies, rng = Math.random) {
  return startInsurrectionBattle(state, insurrection, opposingArmies, rng);
}
