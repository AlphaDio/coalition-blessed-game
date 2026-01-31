import { clampStat } from './cohesion.js';

const MAX_SEVERITY = 5;

const DEFAULT_TEMPLATES = [
  {
    id: 'mod_assault_overwhelm',
    name: 'Overwhelming Assault',
    category: 'assault',
    effects: [
      { target: 'scourge.attack_power', op: 'mul', valuePerSeverity: 0.08, when: 'always' }
    ]
  },
  {
    id: 'mod_recovery_regeneration',
    name: 'Regenerative Swarm',
    category: 'recovery',
    effects: [
      { target: 'scourge.recovery_rate', op: 'mul', valuePerSeverity: 0.10, when: 'always' }
    ]
  },
  {
    id: 'mod_adaptation_doctrine',
    name: 'Adaptive Doctrine',
    category: 'adaptation',
    effects: [
      { target: 'coalition.law_enact_speed', op: 'add', valuePerSeverity: -0.03, when: 'always' }
    ]
  },
  {
    id: 'mod_infiltration_shadow',
    name: 'Shadow Infiltration',
    category: 'infiltration',
    effects: [
      { target: 'coalition.requisition_gen', op: 'mul', valuePerSeverity: -0.05, when: 'always' }
    ]
  }
];

export function getScourgeModifierTemplates() {
  return DEFAULT_TEMPLATES;
}

export function createModifierFromTemplate(template, severity, duration = 'persistent', source = 'other') {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    severity: clampStat(severity, 0, MAX_SEVERITY),
    duration,
    remaining_attacks: duration === 'n_attacks' ? 1 : undefined,
    effects: template.effects || [],
    source
  };
}

export function adjustModifierSeverity(modifier, delta) {
  const nextSeverity = clampStat((modifier?.severity || 0) + delta, 0, MAX_SEVERITY);
  return { ...modifier, severity: nextSeverity };
}

export function applyOrUpdateModifier(state, modifier) {
  if (!state.scourgeModifiers) {
    state.scourgeModifiers = [];
  }

  const existingIndex = state.scourgeModifiers.findIndex(m => m.id === modifier.id);
  if (modifier.severity <= 0) {
    if (existingIndex >= 0) {
      state.scourgeModifiers.splice(existingIndex, 1);
    }
    return;
  }

  if (existingIndex >= 0) {
    state.scourgeModifiers[existingIndex] = { ...state.scourgeModifiers[existingIndex], ...modifier };
  } else {
    state.scourgeModifiers.push(modifier);
  }
}

export function selectMissionModifier(state, rng = Math.random) {
  const existing = state.scourgeModifiers || [];
  const templates = getScourgeModifierTemplates();
  const preferExisting = existing.length > 1 && rng() < 0.6;

  if (preferExisting && existing.length > 0) {
    const pick = existing[Math.floor(rng() * existing.length)];
    return { ...pick, source: 'mission_pre_attack' };
  }

  const template = templates[Math.floor(rng() * templates.length)];
  const severity = Math.max(1, Math.floor(rng() * 3) + 1);
  return createModifierFromTemplate(template, severity, 'persistent', 'mission_pre_attack');
}

function applyEffectToAggregate(effect, severity, aggregate) {
  const valueBase = effect.valuePerSeverity !== undefined ? effect.valuePerSeverity * severity : effect.value;
  const value = Number.isFinite(valueBase) ? valueBase : 0;

  switch (effect.target) {
    case 'scourge.attack_power':
      if (effect.op === 'mul') aggregate.attackPowerMult *= (1 + value);
      else if (effect.op === 'add') aggregate.attackPowerAdd += value;
      break;
    case 'scourge.recovery_rate':
      if (effect.op === 'mul') aggregate.recoveryRateMult *= (1 + value);
      else if (effect.op === 'add') aggregate.recoveryRateAdd += value;
      break;
    case 'coalition.cohesion':
      if (effect.op === 'add') aggregate.coalitionCohesionAdd += value;
      break;
    case 'coalition.requisition':
      if (effect.op === 'add') aggregate.coalitionRequisitionAdd += value;
      break;
    case 'coalition.law_enact_speed':
      if (effect.op === 'add') aggregate.lawProgressSpeedBonus += value;
      else if (effect.op === 'mul') aggregate.lawProgressSpeedBonus += value;
      break;
    case 'coalition.improvement_build_speed':
      if (effect.op === 'mul') aggregate.improvementBuildSpeedMult *= (1 + value);
      else if (effect.op === 'add') aggregate.improvementBuildSpeedMult *= (1 + value);
      break;
    case 'coalition.requisition_gen':
      if (effect.op === 'mul') aggregate.requisitionGenMult *= (1 + value);
      else if (effect.op === 'add') aggregate.requisitionGenMult *= (1 + value);
      break;
    default:
      break;
  }
}

export function collectScourgeModifierEffects(modifiers = [], when = 'always') {
  const aggregate = {
    attackPowerMult: 1.0,
    attackPowerAdd: 0,
    recoveryRateMult: 1.0,
    recoveryRateAdd: 0,
    coalitionCohesionAdd: 0,
    coalitionRequisitionAdd: 0,
    lawProgressSpeedBonus: 0,
    improvementBuildSpeedMult: 1.0,
    requisitionGenMult: 1.0
  };

  modifiers.forEach(mod => {
    const severity = mod.severity || 0;
    (mod.effects || []).forEach(effect => {
      if (effect.when && effect.when !== 'always' && effect.when !== when) {
        return;
      }
      applyEffectToAggregate(effect, severity, aggregate);
    });
  });

  return aggregate;
}

export function expireScourgeModifiersAfterAttack(state) {
  if (!Array.isArray(state.scourgeModifiers)) return;

  state.scourgeModifiers = state.scourgeModifiers.filter(mod => {
    if (mod.duration === 'next_attack') {
      return false;
    }
    if (mod.duration === 'n_attacks') {
      if (mod.remaining_attacks === undefined) {
        mod.remaining_attacks = 1;
      }
      mod.remaining_attacks -= 1;
      return mod.remaining_attacks > 0;
    }
    return true;
  });
}
