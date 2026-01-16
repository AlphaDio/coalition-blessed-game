import { BATTLE_CONSTANTS } from './constants.js';
import { clampStat, clampCohesion, clampApproval } from './cohesion.js';
import { getLogger } from '../modules/logger.js';

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

export function resolveScourgeBattle(state, participatingArmies, rng = Math.random) {
  const logger = getLogger();
  const coalitionPower = calculateCoalitionPower(participatingArmies);
  const scourgePower = calculateScourgePower(state.scourgeFervor, rng);
  
  logger.debug('Scourge battle calculation', {
    coalitionPower: coalitionPower.toFixed(2),
    scourgePower: scourgePower.toFixed(2),
    scourgeFervor: state.scourgeFervor,
    scourgeCohesion: state.scourgeCohesion,
    participatingArmies: participatingArmies.length,
    armyPowers: participatingArmies.map(a => ({
      name: a.name,
      power: calculateArmyPower(a).toFixed(2),
      org: a.organization,
      fervor: a.fervor
    }))
  });
  
  const won = coalitionPower > scourgePower;
  const margin = Math.abs(coalitionPower - scourgePower);
  
  const log = [];
  
  if (won) {
    // Coalition wins
    const cohesionLoss = Math.max(1, Math.floor(BATTLE_CONSTANTS.SCOURGE_WIN_COHESION_LOSS * (1 - margin / coalitionPower)));
    state.scourgeCohesion = clampStat(state.scourgeCohesion - cohesionLoss, 0, 100);
    
    participatingArmies.forEach(army => {
      army.organization = clampStat(army.organization - BATTLE_CONSTANTS.WIN_ORG_LOSS);
      army.fervor = clampStat(army.fervor + BATTLE_CONSTANTS.WIN_FERVOR_GAIN);
    });
    
    log.push(`Victory! Scourge Cohesion -${cohesionLoss}`);
  } else {
    // Coalition loses
    const cohesionLoss = BATTLE_CONSTANTS.SCOURGE_LOSS_COHESION_LOSS;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);
    
    const approvalLoss = BATTLE_CONSTANTS.SCOURGE_WIN_APPROVAL_LOSS;
    state.empires.forEach(empire => {
      empire.approval = clampApproval(empire.approval - approvalLoss);
    });
    
    participatingArmies.forEach(army => {
      army.organization = clampStat(army.organization - BATTLE_CONSTANTS.LOSS_ORG_LOSS);
      army.fervor = clampStat(army.fervor - BATTLE_CONSTANTS.LOSS_FERVOR_LOSS);
    });
    
    log.push(`Defeat! Coalition Cohesion -${cohesionLoss}, All Empires Approval -${approvalLoss}`);
  }
  
  return { won, log };
}

export function resolveInsurrectionBattle(state, insurrection, opposingArmies, rng = Math.random) {
  const logger = getLogger();
  const insurrectionPower = calculateInsurrectionPower(insurrection.armies, rng);
  const coalitionPower = calculateCoalitionPower(opposingArmies);
  
  logger.debug('Insurrection battle calculation', {
    insurrectionPower: insurrectionPower.toFixed(2),
    coalitionPower: coalitionPower.toFixed(2),
    rebelliousArmies: insurrection.armies.length,
    opposingArmies: opposingArmies.length
  });
  
  const won = coalitionPower > insurrectionPower;
  const log = [];
  
  if (won) {
    // Coalition wins
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_WIN_COHESION_LOSS;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);
    
    insurrection.armies.forEach(army => {
      army.fervor = clampStat(army.fervor - BATTLE_CONSTANTS.RESOLVED_FERVOR_DROP);
      army.aggravation = clampStat(army.aggravation - 30); // Reduce aggravation
    });
    
    insurrection.active = false;
    log.push(`Insurrection quelled! Coalition Cohesion -${cohesionLoss}`);
  } else {
    // Coalition loses
    const cohesionLoss = BATTLE_CONSTANTS.INSURRECTION_LOSS_COHESION_LOSS;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion - cohesionLoss);
    
    const approvalShock = BATTLE_CONSTANTS.RESOLVED_APPROVAL_SHOCK;
    insurrection.armies.forEach(army => {
      const empire = state.empires.find(e => e.id === army.empireId);
      if (empire) {
        empire.approval = clampApproval(empire.approval - approvalShock);
      }
    });
    
    log.push(`Insurrection spreads! Coalition Cohesion -${cohesionLoss}`);
  }
  
  return { won, log };
}
