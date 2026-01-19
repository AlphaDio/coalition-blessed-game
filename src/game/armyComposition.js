import { clamp } from '../utils/math.js';

const DEFAULT_HERO_MODIFIERS = {
  dmgPerUnitMP: 0,
  dmgPerTickMO: 0,
  killRate: 0,
  recovery: 0,
  organization: 0
};

const DEFAULT_COMBAT_STATS = {
  dmgPerUnitMP: 1.0,
  dmgPerTickMO: 2.5,
  protection: 0.2,
  resolve: 0.3,
  killRate: 0.1,
  recovery: 50,
  command: 50,
  reinforcementRate: 100
};

function sumUnitNeeds(units, category) {
  const totals = {};
  units.forEach(unit => {
    const entries = unit.demands?.[category] || {};
    Object.entries(entries).forEach(([commodity, qtyPerManpower]) => {
      totals[commodity] = (totals[commodity] || 0) + (qtyPerManpower || 0);
    });
  });
  return totals;
}

export function aggregateArmyDemands(army, units) {
  const needs = sumUnitNeeds(units, 'needs');
  const wants = sumUnitNeeds(units, 'wants');
  const manpower = units.reduce((sum, unit) => sum + (unit.mp?.max || 0), 0);

  army.demands = { needs, wants };
  army.manpower = manpower;
}

function getHeroModifiers(heroes) {
  return heroes.reduce((mods, hero) => {
    const heroMods = hero.modifiers || {};
    Object.keys(DEFAULT_HERO_MODIFIERS).forEach(key => {
      const value = heroMods[key] || 0;
      mods[key] += value;
    });
    return mods;
  }, { ...DEFAULT_HERO_MODIFIERS });
}

function applyHeroModifiers(army, heroMods) {
  army.dmgPerUnitMP += heroMods.dmgPerUnitMP;
  army.dmgPerTickMO += heroMods.dmgPerTickMO;
  army.killRate = clamp(army.killRate + heroMods.killRate, 0, 1);
  army.recovery = Math.max(0, army.recovery + heroMods.recovery);
  army.organization = Math.max(0, Math.min(100, army.organization + heroMods.organization));
}

function getRelationModifier(state, armyEmpireId, targetEmpireId) {
  if (!targetEmpireId || !state.diplomacy?.relations) {
    return 1;
  }

  const relations = state.diplomacy.relations[armyEmpireId];
  const value = relations?.[targetEmpireId] ?? 0;
  return clamp(1 + (value / 200), 0.5, 1.5);
}

export function aggregateArmyCombatStats(state, army, units) {
  const totalMaxMP = units.reduce((sum, unit) => sum + (unit.mp?.max || 0), 0);
  const totalCurrentMP = units.reduce((sum, unit) => sum + (unit.mp?.current || 0), 0);
  const totalMaxMO = units.reduce((sum, unit) => sum + (unit.mo?.max || 0), 0);
  const totalCurrentMO = units.reduce((sum, unit) => sum + (unit.mo?.current || 0), 0);
  const totalRecoveryPool = units.reduce((sum, unit) => sum + (unit.recoveryPool || 0), 0);

  if (totalMaxMP <= 0 || units.length === 0) {
    army.mp = { current: 0, max: 0 };
    army.mo = { current: 0, max: 0 };
    army.recoveryPool = 0;
    return;
  }

  const weightTotal = totalMaxMP;

  const weighted = units.reduce(
    (acc, unit) => {
      const weight = unit.mp?.max || 0;
      acc.dmgPerUnitMP += (unit.dmgPerUnitMP ?? DEFAULT_COMBAT_STATS.dmgPerUnitMP) * weight;
      acc.dmgPerTickMO += (unit.dmgPerTickMO ?? DEFAULT_COMBAT_STATS.dmgPerTickMO) * weight;
      acc.protection += (unit.protection ?? DEFAULT_COMBAT_STATS.protection) * weight;
      acc.resolve += (unit.resolve ?? DEFAULT_COMBAT_STATS.resolve) * weight;
      acc.killRate += (unit.killRate ?? DEFAULT_COMBAT_STATS.killRate) * weight;
      acc.command += (unit.command ?? DEFAULT_COMBAT_STATS.command) * weight;
      acc.recovery += (unit.recovery ?? DEFAULT_COMBAT_STATS.recovery) * weight;
      acc.reinforcementRate += (unit.reinforcementRate ?? DEFAULT_COMBAT_STATS.reinforcementRate) * weight;
      return acc;
    },
    {
      dmgPerUnitMP: 0,
      dmgPerTickMO: 0,
      protection: 0,
      resolve: 0,
      killRate: 0,
      command: 0,
      recovery: 0,
      reinforcementRate: 0
    }
  );

  army.mp = {
    current: totalCurrentMP,
    max: totalMaxMP
  };
  army.mo = {
    current: totalCurrentMO,
    max: totalMaxMO
  };
  army.recoveryPool = totalRecoveryPool;

  army.dmgPerUnitMP = weighted.dmgPerUnitMP / weightTotal;
  army.dmgPerTickMO = weighted.dmgPerTickMO / weightTotal;
  army.protection = weighted.protection / weightTotal;
  army.resolve = weighted.resolve / weightTotal;
  army.killRate = clamp(weighted.killRate / weightTotal, 0, 1);
  army.command = weighted.command / weightTotal;
  army.recovery = weighted.recovery / weightTotal;
  army.reinforcementRate = weighted.reinforcementRate / weightTotal;

  const empireHeroes = (state.heroes || []).filter(hero => hero.empireId === army.empireId);
  if (empireHeroes.length > 0) {
    const heroMods = getHeroModifiers(empireHeroes);
    applyHeroModifiers(army, heroMods);
  }

  const relationMultiplier = getRelationModifier(state, army.empireId, state.scourgeTargetEmpireId);
  army.performance = {
    base: army.performance?.base ?? 1.0,
    bonusMultiplier: relationMultiplier
  };
}

export function refreshArmyAggregates(state) {
  if (!state.armies || !state.units) {
    return;
  }

  state.armies.forEach(army => {
    const units = state.units.filter(unit => unit.armyId === army.id);
    aggregateArmyDemands(army, units);
    aggregateArmyCombatStats(state, army, units);
  });
}

export function syncUnitsFromArmy(army, units) {
  if (!army.mp || !army.mo || units.length === 0) {
    return;
  }

  const mpRatio = army.mp.max > 0 ? army.mp.current / army.mp.max : 0;
  const moRatio = army.mo.max > 0 ? army.mo.current / army.mo.max : 0;
  const totalMaxMP = units.reduce((sum, unit) => sum + (unit.mp?.max || 0), 0);
  const totalRecoveryPool = army.recoveryPool || 0;

  units.forEach(unit => {
    const unitMaxMP = unit.mp?.max || 0;
    const share = totalMaxMP > 0 ? unitMaxMP / totalMaxMP : 0;
    unit.mp.current = unitMaxMP * mpRatio;
    if (unit.mo?.max !== undefined) {
      unit.mo.current = unit.mo.max * moRatio;
    }
    unit.recoveryPool = totalRecoveryPool * share;
  });
}
