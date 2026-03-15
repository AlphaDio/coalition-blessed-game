function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const ARMY_BATTLE_PREP_STATS = Object.freeze(['fervor', 'protection', 'resolve']);

function getPrepClampRange(stat) {
  if (stat === 'fervor') {
    return { min: -100, max: 100 };
  }
  if (stat === 'protection' || stat === 'resolve') {
    return { min: -1, max: 1 };
  }
  return { min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER };
}

export function createArmyBattlePrep() {
  return {
    fervor: 0,
    protection: 0,
    resolve: 0
  };
}

export function ensureArmyBattlePrep(army) {
  if (!army || typeof army !== 'object') {
    return createArmyBattlePrep();
  }
  if (!army.battlePrep || typeof army.battlePrep !== 'object' || Array.isArray(army.battlePrep)) {
    army.battlePrep = createArmyBattlePrep();
  }
  ARMY_BATTLE_PREP_STATS.forEach((stat) => {
    const raw = Number(army.battlePrep[stat] || 0);
    const { min, max } = getPrepClampRange(stat);
    army.battlePrep[stat] = Number.isFinite(raw) ? clamp(raw, min, max) : 0;
  });
  return army.battlePrep;
}

export function getArmyBattlePrep(army, stat) {
  const prep = ensureArmyBattlePrep(army);
  return Number(prep?.[stat] || 0);
}

export function addArmyBattlePrep(army, stat, amount) {
  if (!army || !ARMY_BATTLE_PREP_STATS.includes(stat)) return 0;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    return getArmyBattlePrep(army, stat);
  }
  const prep = ensureArmyBattlePrep(army);
  const { min, max } = getPrepClampRange(stat);
  prep[stat] = clamp((Number(prep[stat]) || 0) + numericAmount, min, max);
  return prep[stat];
}

export function addEmpireBattlePrep(state, empireId, stat, amount) {
  const armies = Array.isArray(state?.armies) ? state.armies.filter(army => army.empireId === empireId) : [];
  armies.forEach((army) => addArmyBattlePrep(army, stat, amount));
  return armies.length;
}

export function clearArmyBattlePrep(army) {
  const prep = ensureArmyBattlePrep(army);
  ARMY_BATTLE_PREP_STATS.forEach((stat) => {
    prep[stat] = 0;
  });
}

export function getEffectiveArmyFervor(army) {
  const base = Number(army?.fervor || 0);
  const prep = getArmyBattlePrep(army, 'fervor');
  return clamp(base + prep, 0, 100);
}

export function getEffectiveArmyProtection(army, surgeBonus = 0) {
  const base = Number(army?.protection || 0);
  const prep = getArmyBattlePrep(army, 'protection');
  const surge = Math.max(0, Number(surgeBonus) || 0);
  return clamp(base + prep + surge, 0, 1);
}

export function getEffectiveArmyResolve(army, surgeBonus = 0) {
  const base = Number(army?.resolve || 0);
  const prep = getArmyBattlePrep(army, 'resolve');
  const surge = Math.max(0, Number(surgeBonus) || 0);
  return clamp(base + prep + surge, 0, 1);
}

