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
  reinforcementRate: 100,
  replenishmentMultiplier: 1.0,
  replenishmentBonus: 0
};

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

/**
 * Refresh army stats - now a simplified version since units were removed
 * Armies manage their own MP/MO directly
 */
export function refreshArmyAggregates(state) {
  if (!state.armies) {
    return;
  }

  state.armies.forEach(army => {
    if (army.isComposite) {
      return;
    }

    // Ensure manpower and MP are in sync
    if (army.manpower && (!army.mp || army.mp.max !== army.manpower)) {
      army.mp = {
        current: army.mp?.current ?? army.manpower,
        max: army.manpower
      };
    }

    // Ensure MO has defaults
    if (!army.mo || !army.mo.max) {
      army.mo = { current: 100, max: 100 };
    }

    // Apply hero modifiers
    const empireHeroes = (state.heroes || []).filter(hero =>
      hero.empireId === army.empireId || hero.empire_id === army.empireId
    );
    if (empireHeroes.length > 0) {
      const heroMods = getHeroModifiers(empireHeroes);
      applyHeroModifiers(army, heroMods);
    }

    // Apply relation modifiers
    const relationMultiplier = getRelationModifier(state, army.empireId, state.scourgeTargetEmpireId);
    army.performance = {
      base: army.performance?.base ?? 1.0,
      bonusMultiplier: relationMultiplier
    };
  });
}

// Deprecated functions kept for backwards compatibility
export function aggregateArmyDemands(army, units) {
  // No-op - units have been removed
}

export function aggregateArmyCombatStats(state, army, units) {
  // No-op - units have been removed
}

export function syncUnitsFromArmy(army, units) {
  // No-op - units have been removed
}
