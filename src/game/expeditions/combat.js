import { startBattle } from '../frontBattles.js';
import { createCombinedCoalitionArmy } from '../battles/coalition.js';
import { collectArmiesInBattle, isRegularArmy } from '../turn/armyUtils.js';
import { collectRebelliousArmyIds } from '../turn/battleUtils.js';
import { clearArmyBattlePrep } from '../armyBattlePrep.js';
import { awardArmyBattleExperience } from '../armyExperience.js';

const READY_ORGANIZATION = 35;

/** Ready Coalition armies, excluding troops already committed to any front. */
export function getAvailableExpeditionArmies(state) {
  const empireIds = new Set((state.empires || []).map(empire => empire.id));
  const unavailable = collectArmiesInBattle(
    (state.battleFronts || []).filter(front => front.state === 'ACTIVE' || (
      front.isExpeditionBattle && front.state === 'ENDED' && !front.expeditionResolved
    ))
  );
  (state.pendingScourgeAttack?.participatingArmyIds || []).forEach(id => unavailable.add(id));
  (state.pendingScourgeAttack?.participantPlans || []).forEach(plan => unavailable.add(plan.armyId));
  collectRebelliousArmyIds(state.insurrections).forEach(id => unavailable.add(id));

  return (state.armies || []).filter(army =>
    army?.id &&
    isRegularArmy(army) &&
    !army.isComposite &&
    !army.isExpeditionForce &&
    empireIds.has(army.empireId) &&
    !unavailable.has(army.id) &&
    Number(army.mp?.current) > 0 &&
    Number(army.organization) >= READY_ORGANIZATION
  ).sort((left, right) => (
    Number(right.mp.current) - Number(left.mp.current) || String(left.id).localeCompare(String(right.id))
  ));
}

function createMinorForce(state, minor, kind, battleKey) {
  const defense = Math.max(1, Number.isFinite(Number(minor.defense)) ? Number(minor.defense) : 6000);
  const manpower = defense * (kind === 'raid' ? 0.65 : 1);
  const army = {
    id: `_expedition_minor_${battleKey}`,
    empireId: `_expedition_${minor.id}`,
    name: `${minor.name} ${kind === 'raid' ? 'Raiders' : 'Defenders'}`,
    isExpeditionForce: true,
    manpower,
    mp: { current: manpower, max: manpower },
    mo: { current: 100, max: 100 },
    organization: 65,
    fervor: kind === 'raid' ? 65 : 55,
    aggravation: 0,
    command: 45,
    recovery: 40,
    recoveryRate: 40,
    reinforcementRate: 0,
    woundedPool: 0,
    dmgPerUnitMP: kind === 'raid' ? 0.9 : 1,
    dmgPerTickMO: 2.3,
    protection: kind === 'raid' ? 0.12 : 0.22,
    resolve: 0.3,
    killRate: 0.15,
    supplyNeed: 0,
    demands: { needs: {}, wants: {} },
    performance: { base: 1, current: 1, bonusMultiplier: 1 },
    supply_state: { needs_fulfillment: {}, wants_fulfillment: {}, shortages: {}, received: {} }
  };
  state.armies.push(army);
  return army;
}

/**
 * Start a normal, round-based front. Political and economic costs belong to
 * the expedition engine; this adapter only commits troops and handles losses.
 */
export function startExpeditionBattle(state, minor, { kind = 'conquest', armyIds, targetEmpireId } = {}) {
  const fail = error => ({ front: null, log: [], error });
  if (!minor?.id || !['conquest', 'raid'].includes(kind)) {
    return fail('Invalid expedition battle.');
  }
  if ((state.battleFronts || []).some(front =>
    front.isExpeditionBattle && front.minorEmpireId === minor.id &&
    (front.state === 'ACTIVE' || front.state === 'ENDED' && !front.expeditionResolved)
  )) {
    return fail('This empire already has an active battle.');
  }

  const available = getAvailableExpeditionArmies(state);
  let participants;
  if (armyIds !== undefined) {
    if (!Array.isArray(armyIds) || armyIds.length === 0 || new Set(armyIds).size !== armyIds.length) {
      return fail('Choose one or more distinct, ready Coalition armies.');
    }
    participants = armyIds.map(id => available.find(army => army.id === id));
    if (participants.some(army => !army)) {
      return fail('A selected army is unavailable, rebellious, or not ready.');
    }
  } else {
    participants = available.slice(0, 1);
  }
  if (participants.length === 0) {
    return fail('No ready Coalition army is available (35 organization required).');
  }

  const battleKey = `${minor.id}_${state.turn}_${(state.battleFronts || []).length}`;
  const coalition = createCombinedCoalitionArmy(state, participants, `_expedition_${battleKey}`);
  // Unlike the legacy composite default, retain this marker in JSON saves.
  Object.defineProperty(coalition, 'isComposite', { value: true, enumerable: true, writable: true, configurable: true });
  coalition.name = `${kind === 'conquest' ? 'Invasion' : 'Defense'} Force: ${minor.name}`;
  // Finite expedition forces have no supply of reinforcements on this front.
  coalition.reinforcementRate = 0;
  const enemy = createMinorForce(state, minor, kind, battleKey);
  const width = Math.floor(Math.max(600, Math.min(1600, (coalition.mp.current + enemy.mp.current) / 10)));
  const front = startBattle(state, coalition.id, enemy.id, width);
  front.isExpeditionBattle = true;
  front.minorEmpireId = minor.id;
  front.expeditionKind = kind;
  front.participatingArmyIds = participants.map(army => army.id);
  front.targetEmpireId = targetEmpireId || participants[0].empireId;
  front.expeditionResolved = false;

  return {
    front,
    log: [`${kind === 'conquest' ? 'Invasion of' : 'Defending against'} ${minor.name}: ${participants.map(army => army.name).join(', ')} committed (${Math.floor(coalition.mp.current)} MP vs ${Math.floor(enemy.mp.current)} MP).`]
  };
}

/** Apply real army casualties once, without changing either side's diplomacy. */
export function resolveExpeditionBattle(state, front, winnerSide = front?.winnerSide) {
  const result = {
    log: [],
    minorEmpireId: front?.minorEmpireId,
    kind: front?.expeditionKind,
    coalitionWon: winnerSide === 'left'
  };
  if (!front?.isExpeditionBattle || front.state !== 'ENDED' || front.expeditionResolved) {
    return { ...result, alreadyResolved: !!front?.expeditionResolved };
  }

  const coalition = (state.armies || []).find(army => army.id === front.leftArmyId);
  const originals = coalition?._originalArmies || [];
  const originalCurrent = originals.reduce((sum, original) => sum + Math.max(0, Number(original.originalMP) || 0), 0);
  const originalMax = originals.reduce((sum, original) => sum + Math.max(0, Number(original.originalMaxMP) || 0), 0);
  const retention = originalCurrent > 0 ? Math.min(1, Math.max(0, Number(coalition?.mp?.current) || 0) / originalCurrent) : 0;
  const permanentRatio = originalMax > 0 ? Math.min(1, Math.max(0, Number(front.permanentLosses?.left) || 0) / originalMax) : 0;

  originals.forEach(original => {
    const army = state.armies.find(candidate => candidate.id === original.id);
    if (!army?.mp) return;
    const reserveCurrent = Math.max(0, Number(original.reserveCurrentMP) || 0);
    const permanentLoss = Math.max(0, Number(original.originalMaxMP) || 0) * permanentRatio;
    army.mp.max = Math.max(1, (Number(army.mp.max) || Number(original.sourceOriginalMaxMP) || 1) - permanentLoss);
    army.mp.current = Math.max(0, Math.min(army.mp.max, reserveCurrent + (Math.max(0, Number(original.originalMP) || 0) * retention)));
    army.manpower = army.mp.max;
    army.organization = Math.max(0, (Number(army.organization) || 0) - (result.coalitionWon ? 8 : 15));
    army.fervor = Math.max(0, Math.min(100, (Number(army.fervor) || 0) + (result.coalitionWon ? 3 : -5)));
    clearArmyBattlePrep(army);
    delete army.killRateBonus;
    const xp = awardArmyBattleExperience(army, {
      won: result.coalitionWon,
      draw: !winnerSide,
      participation: original.commitRatio ?? 1,
      intensity: 1 + permanentRatio
    });
    result.log.push(`${army.name}: ${Math.floor(army.mp.current)}/${Math.floor(army.mp.max)} MP after expedition battle (${Math.floor(permanentLoss)} permanent capacity lost).`);
    if (xp.levelsGained > 0) result.log.push(`${army.name} reaches Veteran ${xp.level}.`);
  });

  const temporaryIds = new Set([front.leftArmyId, front.rightArmyId]);
  state.armies = (state.armies || []).filter(army => !temporaryIds.has(army.id));
  front.expeditionResolved = true;
  front.expeditionCoalitionWon = result.coalitionWon;
  result.log.push(`Expedition ${result.kind === 'conquest' ? 'invasion' : 'defense'} ended: ${result.coalitionWon ? 'Coalition victory' : winnerSide ? 'Coalition defeat' : 'inconclusive'}.`);
  return result;
}
