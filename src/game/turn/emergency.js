import { resetDynamicCoalitionModifiers } from '../scourgeThreat.js';
import { getActiveEmergencyPowerModifiers } from '../emergencyPowers.js';
import { applyCoalitionIntel } from '../scourgePrediction.js';

export function applyEmergencyPowerDynamicModifiers(state) {
  const modifiers = getActiveEmergencyPowerModifiers(state);
  if (!state.coalitionModifiers?.dynamic) {
    resetDynamicCoalitionModifiers(state);
  }
  state.coalitionModifiers.dynamic.requisition_gen_mult *= modifiers.requisitionGenMult;
  state.coalitionModifiers.dynamic.improvement_build_speed_mult *= modifiers.improvementBuildSpeedMult;
  state.coalitionModifiers.dynamic.law_progress_speed_bonus += modifiers.lawProgressSpeedBonus;
  if (modifiers.intelGainPerTurn > 0) {
    applyCoalitionIntel(state, modifiers.intelGainPerTurn);
  }
}

