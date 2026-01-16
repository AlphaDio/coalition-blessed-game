// Action creators and validation

export function allocateWarFunds(armyId, percentage) {
  return {
    type: 'ALLOCATE_WAR_FUNDS',
    armyId,
    percentage: Math.max(0, Math.min(100, percentage))
  };
}

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

export function validateWarFundsAllocation(state, allocations) {
  const total = Object.values(allocations).reduce((sum, pct) => sum + pct, 0);
  return Math.abs(total - 100) < 0.01; // Allow small floating point errors
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
