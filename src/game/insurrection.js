import { INSURRECTION_CONSTANTS } from './constants.js';
import { createInsurrection } from './types.js';
import { getLogger } from '../modules/logger.js';
import { isRegularArmy } from './turn/armyUtils.js';
import { clampApproval } from './cohesion.js';

function getSourceEmpireIds(armies) {
  return [...new Set((armies || []).map(army => army?.empireId).filter(Boolean))];
}

function getHostilityWeight(state, sourceEmpireIds, targetEmpireId) {
  if (!targetEmpireId) {
    return 0;
  }

  return sourceEmpireIds.reduce((sum, sourceEmpireId) => {
    const relation = Number(state.diplomacy?.relations?.[sourceEmpireId]?.[targetEmpireId] ?? 0);
    return sum + Math.max(1, 101 - relation);
  }, 0);
}

function groupArmiesByEmpire(armies) {
  const grouped = new Map();

  (armies || []).forEach((army) => {
    if (!army?.empireId) return;
    if (!grouped.has(army.empireId)) {
      grouped.set(army.empireId, []);
    }
    grouped.get(army.empireId).push(army);
  });

  return grouped;
}

function getActiveBattleArmyIds(state) {
  const activeArmyIds = new Set();
  (state.battleFronts || [])
    .filter(front => front?.state === 'ACTIVE')
    .forEach((front) => {
      if (front.leftArmyId) activeArmyIds.add(front.leftArmyId);
      if (front.rightArmyId) activeArmyIds.add(front.rightArmyId);
      (front.participatingArmyIds || []).forEach(id => activeArmyIds.add(id));
      (front.rebelliousArmyIds || []).forEach(id => activeArmyIds.add(id));
      (front.loyalArmyIds || []).forEach(id => activeArmyIds.add(id));
    });
  return activeArmyIds;
}

function ensureInsurrectionTracking(state) {
  if (!Number.isFinite(state.lastInsurrectionTurn) || state.lastInsurrectionTurn < 0) {
    state.lastInsurrectionTurn = 0;
  } else {
    state.lastInsurrectionTurn = Math.floor(state.lastInsurrectionTurn);
  }

  if (!state.insurrectionEmpireCooldowns || typeof state.insurrectionEmpireCooldowns !== 'object' || Array.isArray(state.insurrectionEmpireCooldowns)) {
    state.insurrectionEmpireCooldowns = {};
  }

  if (!Array.isArray(state.armies)) {
    return;
  }

  state.armies.forEach((army) => {
    if (!army || typeof army !== 'object') return;
    if (!Number.isFinite(army.insurrectionTriggerStreak) || army.insurrectionTriggerStreak < 0) {
      army.insurrectionTriggerStreak = 0;
    } else {
      army.insurrectionTriggerStreak = Math.floor(army.insurrectionTriggerStreak);
    }
    if (!Number.isFinite(army.lastInsurrectionTurn) || army.lastInsurrectionTurn < 0) {
      army.lastInsurrectionTurn = 0;
    } else {
      army.lastInsurrectionTurn = Math.floor(army.lastInsurrectionTurn);
    }
  });
}

function applyAggravationApprovalPressure(state, activeBattleArmyIds, log, logger) {
  const empires = Array.isArray(state.empires) ? state.empires : [];
  if (empires.length === 0 || !Array.isArray(state.armies)) {
    return;
  }

  const empireMap = new Map(empires.map((empire) => [empire.id, empire]));
  const blockedArmyIds = activeBattleArmyIds instanceof Set ? activeBattleArmyIds : new Set();
  const pressuredArmies = state.armies.filter((army) =>
    isRegularArmy(army) &&
    !blockedArmyIds.has(army.id) &&
    (army.aggravation || 0) >= INSURRECTION_CONSTANTS.APPROVAL_PRESSURE_THRESHOLD
  );

  const armiesByEmpire = groupArmiesByEmpire(pressuredArmies);
  armiesByEmpire.forEach((armies, empireId) => {
    const empire = empireMap.get(empireId);
    if (!empire) return;

    const approvalLoss = armies.reduce((sum, army) => {
      const aggravation = Number(army?.aggravation || 0);
      const excess = Math.max(0, aggravation - INSURRECTION_CONSTANTS.APPROVAL_PRESSURE_THRESHOLD);
      return sum
        + INSURRECTION_CONSTANTS.APPROVAL_PRESSURE_LOSS_PER_ARMY
        + Math.floor(excess / INSURRECTION_CONSTANTS.APPROVAL_PRESSURE_EXCESS_DIVISOR);
    }, 0);

    if (approvalLoss <= 0) {
      return;
    }

    const previousApproval = Number.isFinite(empire.approval) ? empire.approval : 50;
    empire.approval = clampApproval(previousApproval - approvalLoss);
    const appliedLoss = previousApproval - empire.approval;
    if (appliedLoss <= 0) {
      return;
    }

    const msg = `${empire.name} unrest pressure: ${armies.length} high-aggravation arm${armies.length === 1 ? 'y' : 'ies'}, approval ${previousApproval.toFixed(1)} -> ${empire.approval.toFixed(1)} (-${appliedLoss.toFixed(1)})`;
    log.push(msg);
    logger.info(msg);
  });
}

export function selectInsurrectionTargetEmpire(state, insurrection, rng = Math.random) {
  if (!insurrection) {
    return null;
  }

  if (insurrection.targetEmpireId) {
    const existing = state.empires?.find(empire => empire.id === insurrection.targetEmpireId);
    if (existing) {
      return existing.id;
    }
  }

  const rebelliousArmyIds = new Set(insurrection.armies || []);
  const rebelliousArmies = (state.armies || []).filter(army => rebelliousArmyIds.has(army.id));
  const sourceEmpireIds = insurrection.sourceEmpireIds?.length > 0
    ? insurrection.sourceEmpireIds
    : getSourceEmpireIds(rebelliousArmies);
  const candidateEmpires = (state.empires || []).filter(empire => !sourceEmpireIds.includes(empire.id));

  if (candidateEmpires.length === 0) {
    return null;
  }

  const weightedCandidates = candidateEmpires.map(empire => ({
    empireId: empire.id,
    weight: getHostilityWeight(state, sourceEmpireIds, empire.id)
  }));

  const totalWeight = weightedCandidates.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    const fallback = weightedCandidates[0]?.empireId || null;
    insurrection.targetEmpireId = fallback;
    if (!insurrection.sourceEmpireIds?.length) {
      insurrection.sourceEmpireIds = [...sourceEmpireIds];
    }
    return fallback;
  }

  let roll = rng() * totalWeight;
  for (const candidate of weightedCandidates) {
    roll -= candidate.weight;
    if (roll <= 0) {
      insurrection.targetEmpireId = candidate.empireId;
      if (!insurrection.sourceEmpireIds?.length) {
        insurrection.sourceEmpireIds = [...sourceEmpireIds];
      }
      return candidate.empireId;
    }
  }

  const fallback = weightedCandidates[weightedCandidates.length - 1]?.empireId || null;
  insurrection.targetEmpireId = fallback;
  if (!insurrection.sourceEmpireIds?.length) {
    insurrection.sourceEmpireIds = [...sourceEmpireIds];
  }
  return fallback;
}

export function checkInsurrections(state) {
  const logger = getLogger();
  const log = [];
  const armies = Array.isArray(state.armies) ? state.armies : [];
  if (!Array.isArray(state.insurrections)) {
    state.insurrections = [];
  }
  ensureInsurrectionTracking(state);

  const activeInsurrections = (state.insurrections || []).filter(ins => ins?.active);
  const activeBattleArmyIds = getActiveBattleArmyIds(state);
  // Snapshot approval BEFORE pressure is applied so that a single tick of
  // aggravation-driven pressure cannot immediately enable a rebellion.
  const empireApprovalById = new Map(
    (state.empires || []).map((empire) => [empire.id, Number.isFinite(empire?.approval) ? empire.approval : 50])
  );

  applyAggravationApprovalPressure(state, activeBattleArmyIds, log, logger);

  const turn = Number.isFinite(Number(state.turn)) ? Number(state.turn) : 0;

  const rebelliousArmies = armies.filter((army) => {
    if (!isRegularArmy(army)) {
      return false;
    }

    const empireApproval = empireApprovalById.get(army.empireId) ?? 50;
    const aggravation = Number(army.aggravation || 0);
    const armyLastTurn = Number(army.lastInsurrectionTurn) || 0;
    const armyCooldownReady = armyLastTurn <= 0
      || (turn - armyLastTurn >= INSURRECTION_CONSTANTS.ARMY_COOLDOWN_TICKS);
    const empireLastTurn = Number(state.insurrectionEmpireCooldowns?.[army.empireId] || 0);
    const empireCooldownReady = empireLastTurn <= 0
      || (turn - empireLastTurn >= INSURRECTION_CONSTANTS.EMPIRE_COOLDOWN_TICKS);
    const isEligibleNow =
      aggravation >= INSURRECTION_CONSTANTS.THRESHOLD &&
      empireApproval <= INSURRECTION_CONSTANTS.APPROVAL_THRESHOLD &&
      !activeBattleArmyIds.has(army.id) &&
      armyCooldownReady &&
      empireCooldownReady;

    if (isEligibleNow) {
      army.insurrectionTriggerStreak = (Number(army.insurrectionTriggerStreak) || 0) + 1;
    } else {
      army.insurrectionTriggerStreak = 0;
    }

    return army.insurrectionTriggerStreak >= INSURRECTION_CONSTANTS.TRIGGER_CONFIRMATION_TICKS;
  });
  if (rebelliousArmies.length > 0) {
    logger.debug(`Found ${rebelliousArmies.length} rebellious armies`, {
      armies: rebelliousArmies.map(a => ({
        name: a.name,
        aggravation: a.aggravation,
        approval: empireApprovalById.get(a.empireId) ?? null,
        triggerStreak: a.insurrectionTriggerStreak
      }))
    });
  }

  if (rebelliousArmies.length > 0 && activeInsurrections.length === 0) {
    // Enforce global cooldown: if ready, all eligible source empires can spawn this turn.
    const cooldown = INSURRECTION_CONSTANTS.COOLDOWN_TICKS;
    const lastInsurrectionTurn = state.lastInsurrectionTurn || 0;
    const ticksSinceLast = turn - lastInsurrectionTurn;

    if (cooldown > 0 && lastInsurrectionTurn > 0 && ticksSinceLast < cooldown) {
      logger.debug(`Insurrection cooldown active: ${ticksSinceLast}/${cooldown} ticks since last insurrection`);
    } else {
      const rebelliousArmiesByEmpire = groupArmiesByEmpire(rebelliousArmies);
      let spawnedInsurrectionCount = 0;

      rebelliousArmiesByEmpire.forEach((empireArmies, sourceEmpireId) => {
        if (!sourceEmpireId || !Array.isArray(empireArmies) || empireArmies.length === 0) {
          return;
        }

        const avgAggravation = empireArmies.reduce((sum, army) => sum + Number(army.aggravation || 0), 0) / empireArmies.length;
        spawnedInsurrectionCount += 1;
        const insurrectionId = `insurrection_${turn}_${sourceEmpireId}_${spawnedInsurrectionCount}`;
        const insurrection = createInsurrection(
          insurrectionId,
          empireArmies.map(army => army.id),
          avgAggravation,
          { sourceEmpireIds: [sourceEmpireId], createdAtTurn: turn }
        );
        state.insurrections.push(insurrection);

        empireArmies.forEach((army) => {
          army.aggravation = INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION;
          army.insurrectionTriggerStreak = 0;
          army.lastInsurrectionTurn = turn;
        });
        state.insurrectionEmpireCooldowns[sourceEmpireId] = turn;

        const sourceEmpireName = state.empires?.find(empire => empire.id === sourceEmpireId)?.name || sourceEmpireId;
        logger.warn(`INSURRECTION! ${empireArmies.length} armies from ${sourceEmpireName} rebel!`, {
          sourceEmpireId,
          avgAggravation: avgAggravation.toFixed(1),
          armies: empireArmies.map(army => army.name)
        });
        log.push(`INSURRECTION! ${empireArmies.length} armies from ${sourceEmpireName} rebel!`);
      });

      if (spawnedInsurrectionCount > 0) {
        state.lastInsurrectionTurn = turn;
      }
    }
  }

  // Remove resolved insurrections
  const beforeCount = state.insurrections.length;
  state.insurrections = state.insurrections.filter(ins => ins.active);
  if (state.insurrections.length < beforeCount) {
    logger.info(`Resolved ${beforeCount - state.insurrections.length} insurrection(s)`);
  }

  return { log };
}
