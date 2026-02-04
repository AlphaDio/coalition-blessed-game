import { calculateArmyPower } from './power.js';

export function createCombinedCoalitionArmy(state, participatingArmies, idSuffix = '') {
  const combinedId = '_coalition_combined_' + state.turn + idSuffix;

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
  let totalCommand = 0;
  let totalRecovery = 0;
  let totalReinforcementRate = 0;
  let rawOrg = 0;
  let rawFervor = 0;
  let rawDmgPerUnitMP = 0;
  let rawDmgPerTickMO = 0;
  let rawProtection = 0;
  let rawResolve = 0;
  let rawKillRate = 0;
  let rawCommand = 0;
  let rawRecovery = 0;
  let rawReinforcementRate = 0;

  participatingArmies.forEach(army => {
    // Guard against invalid army structures
    if (!army || !army.mp) {
      return;
    }

    const power = calculateArmyPower(army);
    const mpCurrent = typeof army.mp.current === 'number' && !isNaN(army.mp.current) ? army.mp.current : 0;
    const mpMax = typeof army.mp.max === 'number' && !isNaN(army.mp.max) ? army.mp.max : 0;
    const org = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
    const fervor = Math.min(100, (army.fervor || 0) + (army.fervorBonus || 0));
    const dmgPerUnitMP = typeof army.dmgPerUnitMP === 'number' && !isNaN(army.dmgPerUnitMP) ? army.dmgPerUnitMP : 1.0;
    const dmgPerTickMO = typeof army.dmgPerTickMO === 'number' && !isNaN(army.dmgPerTickMO) ? army.dmgPerTickMO : 2.5;
    const protection = typeof army.protection === 'number' && !isNaN(army.protection) ? army.protection : 0;
    const resolve = typeof army.resolve === 'number' && !isNaN(army.resolve) ? army.resolve : 0;
    const killRate = typeof army.killRate === 'number' && !isNaN(army.killRate) ? army.killRate : 0.1;
    const command = typeof army.command === 'number' && !isNaN(army.command) ? army.command : 50;
    const recovery = typeof army.recovery === 'number' && !isNaN(army.recovery) ? army.recovery : 50;
    const reinforcementRate = typeof army.reinforcementRate === 'number' && !isNaN(army.reinforcementRate) ? army.reinforcementRate : 100;

    totalMP += mpCurrent;
    totalMaxMP += mpMax;
    totalOrg += org * power;
    totalFervor += fervor * power;
    totalDmgPerUnitMP += dmgPerUnitMP * power;
    totalDmgPerTickMO += dmgPerTickMO * power;
    totalProtection += protection * power;
    totalResolve += resolve * power;
    totalKillRate += killRate * power;
    totalCommand += command * power;
    totalRecovery += recovery * power;
    totalReinforcementRate += reinforcementRate * power;
    rawOrg += org;
    rawFervor += fervor;
    rawDmgPerUnitMP += dmgPerUnitMP;
    rawDmgPerTickMO += dmgPerTickMO;
    rawProtection += protection;
    rawResolve += resolve;
    rawKillRate += killRate;
    rawCommand += command;
    rawRecovery += recovery;
    rawReinforcementRate += reinforcementRate;
  });

  const totalPower = participatingArmies.reduce((sum, a) => {
    const power = calculateArmyPower(a);
    return sum + (isNaN(power) ? 0 : power);
  }, 0);
  const powerDivisor = totalPower > 0 ? totalPower : Math.max(1, participatingArmies.length);
  const useRawAverages = totalPower <= 0;

  // Ensure totalMaxMP is at least 1 to avoid division issues
  const safeTotalMaxMP = Math.max(1, totalMaxMP || 0);
  const safeTotalMP = Math.max(0, totalMP || 0);

  const combinedArmy = {
    id: combinedId,
    empireId: '_coalition',
    name: `Coalition Forces (${participatingArmies.length} armies)`,
    fervor: useRawAverages ? (rawFervor / powerDivisor) : (totalFervor / powerDivisor),
    organization: useRawAverages ? (rawOrg / powerDivisor) : (totalOrg / powerDivisor),
    supplyNeed: 0,
    aggravation: 0,
    manpower: safeTotalMP,
    empireId: '_coalition',
    performance: { base: 1.0, current: 1.0, bonusMultiplier: 1.0 },
    supply_state: { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} },
    demands: { needs: {}, wants: {} },

    // MP and MO pools - combined
    mp: {
      current: safeTotalMP,
      max: safeTotalMaxMP
    },
    mo: {
      current: 100,
      max: 100
    },

    // Combat stats - weighted average (with NaN guards)
    dmgPerUnitMP: useRawAverages ? (rawDmgPerUnitMP / powerDivisor) : (totalDmgPerUnitMP / powerDivisor),
    dmgPerTickMO: useRawAverages ? (rawDmgPerTickMO / powerDivisor) : (totalDmgPerTickMO / powerDivisor),
    protection: useRawAverages ? (rawProtection / powerDivisor) : (totalProtection / powerDivisor),
    resolve: useRawAverages ? (rawResolve / powerDivisor) : (totalResolve / powerDivisor),
    killRate: useRawAverages ? (rawKillRate / powerDivisor) : (totalKillRate / powerDivisor),

    // Sustain stats: recovery = wounded return after battle; reinforcement = reserves join during battle
    woundedPool: 0,
    command: useRawAverages ? (rawCommand / powerDivisor) : (totalCommand / powerDivisor),
    recovery: useRawAverages ? (rawRecovery / powerDivisor) : (totalRecovery / powerDivisor),
    recoveryRate: useRawAverages ? (rawRecovery / powerDivisor) : (totalRecovery / powerDivisor),
    reinforcementRate: useRawAverages ? (rawReinforcementRate / powerDivisor) : (totalReinforcementRate / powerDivisor),

    // Store reference to original armies for result distribution
    _originalArmies: participatingArmies.map(a => ({
      id: a.id,
      originalMP: (a.mp && typeof a.mp.current === 'number' && !isNaN(a.mp.current)) ? a.mp.current : 0,
      originalMaxMP: (a.mp && typeof a.mp.max === 'number' && !isNaN(a.mp.max)) ? a.mp.max : 1
    })),
    isComposite: true
  };

  Object.defineProperty(combinedArmy, 'isComposite', {
    value: true,
    enumerable: false,
    configurable: true,
    writable: true
  });

  // Sanitize all numeric values to ensure no NaN
  Object.keys(combinedArmy).forEach(key => {
    if (typeof combinedArmy[key] === 'number' && isNaN(combinedArmy[key])) {
      // Set defaults based on key
      if (key === 'fervor' || key === 'organization') {
        combinedArmy[key] = 0;
      } else if (key === 'dmgPerUnitMP' || key === 'dmgPerTickMO') {
        combinedArmy[key] = 1.0;
      } else if (key === 'protection' || key === 'resolve' || key === 'killRate') {
        combinedArmy[key] = 0;
      } else if (key === 'command' || key === 'recovery') {
        combinedArmy[key] = 50;
      } else if (key === 'reinforcementRate') {
        combinedArmy[key] = 100;
      }
    }
  });

  state.armies.push(combinedArmy);
  return combinedArmy;
}
