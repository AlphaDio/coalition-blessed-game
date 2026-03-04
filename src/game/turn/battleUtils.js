import { isRegularArmy } from './armyUtils.js';

export function getBattleWinner(leftArmy, rightArmy) {
  if (!leftArmy || !rightArmy) return null;

  if (leftArmy.mp?.current <= 0) {
    return 'right';
  }

  if (rightArmy.mp?.current <= 0) {
    return 'left';
  }

  return null;
}

export function collectRebelliousArmyIds(insurrections) {
  if (!insurrections || !Array.isArray(insurrections)) {
    return new Set();
  }

  const rebelliousArmyIds = new Set();
  insurrections.forEach(insurrection => {
    if (insurrection && insurrection.active && insurrection.armies) {
      insurrection.armies.forEach(armyId => rebelliousArmyIds.add(armyId));
    }
  });

  return rebelliousArmyIds;
}

export function getBattleChance(cohesionTierName, turn = 0) {
  if (turn >= 2000) {
    if (cohesionTierName === 'Strained') return 0.05;
    if (cohesionTierName === 'Desperate') return 0.075;
    return 0.025;
  }

  if (turn >= 1000) {
    if (cohesionTierName === 'Strained') return 0.04;
    if (cohesionTierName === 'Desperate') return 0.06;
    return 0.02;
  }

  if (cohesionTierName === 'Strained') return 0.02;
  if (cohesionTierName === 'Desperate') return 0.03;
  return 0.01;
}

export function partitionInsurrectionArmies(armies, rebelliousArmyIds) {
  const rebelliousArmies = [];
  const opposingArmies = [];

  armies.forEach(army => {
    if (rebelliousArmyIds.has(army.id)) {
      rebelliousArmies.push(army);
      return;
    }

    if (army.organization > 30 && isRegularArmy(army)) {
      opposingArmies.push(army);
    }
  });

  return { rebelliousArmies, opposingArmies };
}

