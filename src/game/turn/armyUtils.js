function isTemporaryArmy(army) {
  return (
    army.id.startsWith('_scourge') ||
    army.id.startsWith('_coalition_combined') ||
    army.id.startsWith('_insurrection')
  );
}

export function isRegularArmy(army) {
  return !isTemporaryArmy(army);
}

export function collectArmiesInBattle(activeBattles) {
  const armiesInBattle = new Set();

  activeBattles.forEach(front => {
    addBattleArmyId(armiesInBattle, front.leftArmyId);
    addBattleArmyId(armiesInBattle, front.rightArmyId);

    addBattleArmyIds(armiesInBattle, front.participatingArmyIds);
    addBattleArmyIds(armiesInBattle, front.rebelliousArmyIds);
    addBattleArmyIds(armiesInBattle, front.loyalArmyIds);
  });

  return armiesInBattle;
}

function addBattleArmyId(armiesInBattle, armyId) {
  if (armyId) armiesInBattle.add(armyId);
}

function addBattleArmyIds(armiesInBattle, armyIds) {
  if (!armyIds) return;
  armyIds.forEach(id => addBattleArmyId(armiesInBattle, id));
}

