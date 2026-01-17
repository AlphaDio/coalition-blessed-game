// Action creators and validation
import { clamp } from './utils/math.js';

export function enactLaw(lawId) {
  return {
    type: 'ENACT_LAW',
    lawId
  };
}

export function chooseEventChoice(choiceIndex) {
  return {
    type: 'CHOOSE_EVENT_CHOICE',
    choiceIndex
  };
}

export function advanceTurn() {
  return {
    type: 'ADVANCE_TURN'
  };
}

export function getAvailableLaws(state) {
  return state.laws.filter(law => {
    // Check if already enacted
    if (state.enactedLaws.some(el => el.id === law.id)) return false;
    // Check cooldown (simple: if law has cooldown, check if enough turns passed)
    // For now, simple implementation
    return true;
  });
}
