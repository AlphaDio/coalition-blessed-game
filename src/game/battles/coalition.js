import { calculateArmyPower } from './power.js';
import { getEmpireMilitaryModifierSet } from '../empireModifiers.js';
import {
  getEffectiveArmyFervor,
  getEffectiveArmyProtection,
  getEffectiveArmyResolve
} from '../armyBattlePrep.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeParticipant(entry) {
  const army = entry?.army || entry;
  if (!army?.mp) {
    return null;
  }

  const commitRatio = clamp(
    entry?.army && Number.isFinite(Number(entry.commitRatio)) ? Number(entry.commitRatio) : 1,
    0,
    1
  );
  if (commitRatio <= 0) {
    return null;
  }

  const originalArmyCurrentMP = Math.max(0, Number(army.mp.current) || 0);
  const originalArmyMaxMP = Math.max(1, Number(army.mp.max) || 1);
  const committedCurrentMP = originalArmyCurrentMP * commitRatio;
  const committedMaxMP = originalArmyMaxMP * commitRatio;

  return {
    army,
    commitRatio,
    committedCurrentMP,
    committedMaxMP,
    reserveCurrentMP: Math.max(0, originalArmyCurrentMP - committedCurrentMP),
    reserveMaxMP: Math.max(0, originalArmyMaxMP - committedMaxMP),
    originalArmyCurrentMP,
    originalArmyMaxMP,
    combatWeight: commitRatio,
    isSupport: !!entry?.isSupport,
    supportRelation: Number.isFinite(entry?.supportRelation) ? entry.supportRelation : null
  };
}

export function createCombinedCoalitionArmy(state, participatingArmies, idSuffix = '') {
  const normalizedParticipants = (participatingArmies || [])
    .map(normalizeParticipant)
    .filter(Boolean);
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
  let totalConsumptionDamageAdd = 0;
  let rawConsumptionDamageAdd = 0;

  normalizedParticipants.forEach(participant => {
    const { army, committedCurrentMP, committedMaxMP, combatWeight } = participant;
    const power = calculateArmyPower(army) * combatWeight;
    const org = typeof army.organization === 'number' && !isNaN(army.organization) ? army.organization : 0;
    const fervor = getEffectiveArmyFervor(army);
    const dmgPerUnitMP = typeof army.dmgPerUnitMP === 'number' && !isNaN(army.dmgPerUnitMP) ? army.dmgPerUnitMP : 1.0;
    const dmgPerTickMO = typeof army.dmgPerTickMO === 'number' && !isNaN(army.dmgPerTickMO) ? army.dmgPerTickMO : 2.5;
    const protection = getEffectiveArmyProtection(army);
    const resolve = getEffectiveArmyResolve(army);
    const killRate = typeof army.killRate === 'number' && !isNaN(army.killRate) ? army.killRate : 0.1;
    const command = typeof army.command === 'number' && !isNaN(army.command) ? army.command : 50;
    const recovery = typeof army.recovery === 'number' && !isNaN(army.recovery) ? army.recovery : 50;
    const reinforcementRate = typeof army.reinforcementRate === 'number' && !isNaN(army.reinforcementRate) ? army.reinforcementRate : 100;

    totalMP += committedCurrentMP;
    totalMaxMP += committedMaxMP;
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
    const consumptionDamageAdd = Number(army.consumptionDamageAdd) || 0;
    totalConsumptionDamageAdd += consumptionDamageAdd * power;
    rawConsumptionDamageAdd += consumptionDamageAdd;
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

  const totalPower = normalizedParticipants.reduce((sum, participant) => {
    const power = calculateArmyPower(participant.army) * participant.combatWeight;
    return sum + (isNaN(power) ? 0 : power);
  }, 0);
  const powerDivisor = totalPower > 0 ? totalPower : Math.max(1, normalizedParticipants.length);
  const useRawAverages = totalPower <= 0;

  // Aggregate empire damage modifiers (from improvements and tech) from participating empires.
  const participatingEmpireIds = [...new Set(normalizedParticipants.map(p => p.army.empireId).filter(Boolean))];
  let coalitionDamageAdd = 0;
  let coalitionDamageMultSum = 0;
  let coalitionDamageMultCount = 0;
  participatingEmpireIds.forEach(empireId => {
    const mods = getEmpireMilitaryModifierSet(state, empireId);
    if (Number.isFinite(mods.army_damage_add)) {
      coalitionDamageAdd += mods.army_damage_add;
    }
    if (Number.isFinite(mods.army_damage_mult)) {
      coalitionDamageMultSum += mods.army_damage_mult;
      coalitionDamageMultCount += 1;
    }
  });
  const coalitionDamageMult = coalitionDamageMultCount > 0 ? coalitionDamageMultSum / coalitionDamageMultCount : 0;

  // Ensure totalMaxMP is at least 1 to avoid division issues
  const safeTotalMaxMP = Math.max(1, totalMaxMP || 0);
  const safeTotalMP = Math.max(0, totalMP || 0);

  const combinedArmy = {
    id: combinedId,
    empireId: '_coalition',
    name: `Coalition Forces (${normalizedParticipants.length} armies)`,
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

    // Empire damage modifiers (aggregated from participating empires; applied in frontBattles)
    _empireDamageAdd: coalitionDamageAdd,
    _empireDamageMult: coalitionDamageMult,
    _consumptionDamageAdd: useRawAverages
      ? (rawConsumptionDamageAdd / Math.max(1, normalizedParticipants.length))
      : (totalConsumptionDamageAdd / powerDivisor),

    // Store reference to original armies for result distribution
    _originalArmies: normalizedParticipants.map(participant => ({
      id: participant.army.id,
      originalMP: participant.committedCurrentMP,
      originalMaxMP: participant.committedMaxMP,
      sourceOriginalMP: participant.originalArmyCurrentMP,
      sourceOriginalMaxMP: participant.originalArmyMaxMP,
      reserveCurrentMP: participant.reserveCurrentMP,
      reserveMaxMP: participant.reserveMaxMP,
      commitRatio: participant.commitRatio,
      isSupport: participant.isSupport,
      supportRelation: participant.supportRelation
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
