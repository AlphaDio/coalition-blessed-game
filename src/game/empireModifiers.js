function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function getEmpireById(state, empireId) {
  if (!empireId || !Array.isArray(state?.empires)) {
    return null;
  }
  return state.empires.find(empire => empire.id === empireId) || null;
}

export function getEmpireTechModifier(empire, key) {
  return toFiniteNumber(empire?.techModifiers?.[key], 0);
}

export function getEmpireImprovementModifier(state, empireId, key) {
  return toFiniteNumber(state?.improvements?.empireModifiers?.[empireId]?.[key], 0);
}

export function getEmpireModifierValue(state, empireOrId, key) {
  const empire = typeof empireOrId === 'string' ? getEmpireById(state, empireOrId) : (empireOrId || null);
  const empireId = typeof empireOrId === 'string' ? empireOrId : empire?.id;
  return getEmpireImprovementModifier(state, empireId, key) + getEmpireTechModifier(empire, key);
}

export function getEmpireMilitaryModifierSet(state, empireOrId) {
  const rawConsumptionMpGainMult = getEmpireModifierValue(state, empireOrId, 'army_consumption_mp_gain_mult');
  const rawReplenishmentMult = getEmpireModifierValue(state, empireOrId, 'army_replenishment_mult');

  return {
    army_damage_add: getEmpireModifierValue(state, empireOrId, 'army_damage_add'),
    army_damage_mult: getEmpireModifierValue(state, empireOrId, 'army_damage_mult'),
    army_organization: getEmpireModifierValue(state, empireOrId, 'army_organization'),
    army_fervor: getEmpireModifierValue(state, empireOrId, 'army_fervor'),
    army_consumption_mp_gain_mult: Math.max(0, 1 + rawConsumptionMpGainMult),
    army_replenishment_mult: Math.max(0, 1 + rawReplenishmentMult)
  };
}
