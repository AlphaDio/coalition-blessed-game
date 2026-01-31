import { SCOURGE_MISSION_CONSTANTS } from './constants.js';
import { clampStat } from './cohesion.js';

const POWER_DEFINITIONS = [
  {
    id: 'EP_MOBILIZATION',
    name: 'Mobilization Surge',
    cost_glory: SCOURGE_MISSION_CONSTANTS.EP_COST_MEDIUM,
    duration_ticks: SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION,
    effects: [
      { target: 'coalition.requisition_gen', op: 'mul', value: 0.25 }
    ]
  },
  {
    id: 'EP_WAR_INDUSTRY',
    name: 'War Industry Overdrive',
    cost_glory: SCOURGE_MISSION_CONSTANTS.EP_COST_MEDIUM_HIGH,
    duration_ticks: SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION,
    effects: [
      { target: 'coalition.improvement_build_speed', op: 'mul', value: 0.25 }
    ]
  },
  {
    id: 'EP_MANDATE',
    name: 'Emergency Mandate',
    cost_glory: SCOURGE_MISSION_CONSTANTS.EP_COST_HIGH,
    duration_ticks: SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION,
    effects: [
      { target: 'coalition.law_enact_speed', op: 'mul', value: 0.25 }
    ]
  }
];

export function getEmergencyPowerDefinitions() {
  return POWER_DEFINITIONS;
}

function scaleByThreat(value, threat) {
  const multiplier = 1 + (clampStat(threat || 0, 0, 100) / 200);
  return value * multiplier;
}

export function canActivateEmergencyPower(state, powerId) {
  const def = POWER_DEFINITIONS.find(p => p.id === powerId);
  if (!def) return { canActivate: false, reason: 'Unknown emergency power' };

  const activeCount = (state.activeEmergencyPowers || []).length;
  if (activeCount >= SCOURGE_MISSION_CONSTANTS.EP_MAX_ACTIVE) {
    return { canActivate: false, reason: 'Max active emergency powers reached' };
  }

  const availableGlory = state.coalitionGlory || 0;
  if (availableGlory < def.cost_glory) {
    return { canActivate: false, reason: 'Insufficient Glory' };
  }

  return { canActivate: true, reason: '' };
}

export function activateEmergencyPower(state, powerId) {
  const def = POWER_DEFINITIONS.find(p => p.id === powerId);
  if (!def) {
    return { success: false, error: 'Emergency power not found' };
  }

  const check = canActivateEmergencyPower(state, powerId);
  if (!check.canActivate) {
    return { success: false, error: check.reason };
  }

  const threat = state.coalitionThreat || 0;
  const scaledDuration = Math.round(scaleByThreat(def.duration_ticks, threat));
  const scaledEffects = (def.effects || []).map(effect => ({
    ...effect,
    value: scaleByThreat(effect.value, threat)
  }));

  state.coalitionGlory = Math.max(0, (state.coalitionGlory || 0) - def.cost_glory);
  state.coalitionPrestige = (state.coalitionPrestige || 0) + Math.round(def.cost_glory * 0.25);

  if (!Array.isArray(state.activeEmergencyPowers)) {
    state.activeEmergencyPowers = [];
  }

  state.activeEmergencyPowers.push({
    id: def.id,
    name: def.name,
    remainingDuration: scaledDuration,
    totalDuration: scaledDuration,
    effects: scaledEffects
  });

  return { success: true, activePower: def };
}

export function tickEmergencyPowers(state) {
  if (!Array.isArray(state.activeEmergencyPowers)) {
    state.activeEmergencyPowers = [];
  }

  const expired = [];
  state.activeEmergencyPowers.forEach(power => {
    power.remainingDuration -= 1;
    if (power.remainingDuration <= 0) {
      expired.push(power.id);
    }
  });

  state.activeEmergencyPowers = state.activeEmergencyPowers.filter(p => p.remainingDuration > 0);
  return expired;
}

export function getActiveEmergencyPowerModifiers(state) {
  const aggregate = {
    requisitionGenMult: 1.0,
    improvementBuildSpeedMult: 1.0,
    lawProgressSpeedBonus: 0
  };

  (state.activeEmergencyPowers || []).forEach(power => {
    (power.effects || []).forEach(effect => {
      if (effect.target === 'coalition.requisition_gen' && effect.op === 'mul') {
        aggregate.requisitionGenMult *= (1 + effect.value);
      }
      if (effect.target === 'coalition.improvement_build_speed' && effect.op === 'mul') {
        aggregate.improvementBuildSpeedMult *= (1 + effect.value);
      }
      if (effect.target === 'coalition.law_enact_speed' && effect.op === 'mul') {
        aggregate.lawProgressSpeedBonus += effect.value;
      }
    });
  });

  return aggregate;
}
