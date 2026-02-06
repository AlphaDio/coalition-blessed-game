import { getCohesionTier } from './cohesion.js';
import { SCOURGE_MISSION_CONSTANTS } from './constants.js';

export function resetDynamicCoalitionModifiers(state) {
  if (!state.coalitionModifiers) state.coalitionModifiers = {};
  if (!state.coalitionModifiers.dynamic || typeof state.coalitionModifiers.dynamic !== 'object') {
    state.coalitionModifiers.dynamic = {};
  }

  state.coalitionModifiers.dynamic.law_progress_speed_bonus = 0;
  state.coalitionModifiers.dynamic.improvement_build_speed_mult = 1.0;
  state.coalitionModifiers.dynamic.requisition_gen_mult = 1.0;
}

export function getThreatScalar(threatValue) {
  const threat = Math.max(0, threatValue || 0);
  if (threat <= 0) return 0;
  const normalized = Math.log1p(threat / 100);
  return (normalized / Math.log(2)) * 100;
}

export function applyThreatClimateBonuses(state) {
  const tier = getCohesionTier(state.coalitionCohesion);
  const threat = getThreatScalar(state.coalitionThreat || 0);
  const strengths = SCOURGE_MISSION_CONSTANTS.THREAT_CLIMATE_STRENGTHS;
  let activeSlots = 0;

  if (tier?.name === 'Desperate' && threat >= SCOURGE_MISSION_CONSTANTS.THREAT_THRESHOLD_3) {
    activeSlots = 3;
  } else if (tier?.name === 'Desperate' && threat >= SCOURGE_MISSION_CONSTANTS.THREAT_THRESHOLD_2) {
    activeSlots = 2;
  } else if (tier?.name === 'Strained' && threat >= SCOURGE_MISSION_CONSTANTS.THREAT_THRESHOLD_1) {
    activeSlots = 1;
  }

  const bonusList = [];
  const slots = [
    { id: 'bonus_improvement_build_speed', key: 'improvement_build_speed_mult' },
    { id: 'bonus_law_enact_speed', key: 'law_progress_speed_bonus' },
    { id: 'bonus_requisition_generation', key: 'requisition_gen_mult' }
  ];

  for (let i = 0; i < activeSlots; i += 1) {
    const strength = strengths[i] || strengths[strengths.length - 1] || 0;
    const slot = slots[i];
    bonusList.push({ id: slot.id, strength });

    if (slot.key === 'law_progress_speed_bonus') {
      state.coalitionModifiers.dynamic.law_progress_speed_bonus += strength;
    } else if (slot.key === 'improvement_build_speed_mult') {
      state.coalitionModifiers.dynamic.improvement_build_speed_mult *= (1 + strength);
    } else if (slot.key === 'requisition_gen_mult') {
      state.coalitionModifiers.dynamic.requisition_gen_mult *= (1 + strength);
    }
  }

  state.threatClimate = {
    activeSlots,
    activeBonusList: bonusList
  };
}
