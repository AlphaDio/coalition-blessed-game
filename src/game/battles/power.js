import { BATTLE_CONSTANTS } from '../constants.js';
import { getEffectiveArmyFervor } from '../armyBattlePrep.js';

export function calculateArmyPower(army) {
  if (!army) {
    return 0;
  }
  const org = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
  const fervor = getEffectiveArmyFervor(army);
  const power = (
    BATTLE_CONSTANTS.ARMY_POWER_ORG_WEIGHT * org +
    BATTLE_CONSTANTS.ARMY_POWER_FERVOR_WEIGHT * fervor
  );
  return isNaN(power) ? 0 : power;
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

export function calculateBattlefieldSize(totalForces, rng = Math.random) {
  const baseSize = Math.max(800, Math.min(2000, totalForces / 10));
  const variance = 0.5 + (rng() * 1.0);
  return Math.floor(baseSize * variance);
}
