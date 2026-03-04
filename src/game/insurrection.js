import { INSURRECTION_CONSTANTS } from './constants.js';
import { createInsurrection } from './types.js';
import { getLogger } from '../modules/logger.js';
import { isRegularArmy } from './turn/armyUtils.js';
import { clampApproval } from '../utils/math.js';

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

function applyAggravationApprovalPressure(state, log, logger) {
  const empires = Array.isArray(state.empires) ? state.empires : [];
  if (empires.length === 0 || !Array.isArray(state.armies)) {
    return;
  }

  const empireMap = new Map(empires.map((empire) => [empire.id, empire]));
  const pressuredArmies = state.armies.filter((army) =>
    isRegularArmy(army) &&
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
  const activeInsurrections = (state.insurrections || []).filter(ins => ins?.active);
  // Snapshot approval BEFORE pressure is applied so that a single tick of
  // aggravation-driven pressure cannot immediately enable a rebellion.
  const empireApprovalById = new Map(
    (state.empires || []).map((empire) => [empire.id, Number.isFinite(empire?.approval) ? empire.approval : 50])
  );

  applyAggravationApprovalPressure(state, log, logger);
  
  // Check for armies that should rebel
  const rebelliousArmies = armies.filter(army =>
    isRegularArmy(army) &&
    (army.aggravation || 0) >= INSURRECTION_CONSTANTS.THRESHOLD &&
    (empireApprovalById.get(army.empireId) ?? 50) <= INSURRECTION_CONSTANTS.APPROVAL_THRESHOLD
  );
  
  if (rebelliousArmies.length > 0) {
    logger.debug(`Found ${rebelliousArmies.length} rebellious armies`, {
      armies: rebelliousArmies.map(a => ({
        name: a.name,
        aggravation: a.aggravation,
        approval: empireApprovalById.get(a.empireId) ?? null
      }))
    });
  }
  
  if (rebelliousArmies.length > 0 && activeInsurrections.length === 0) {
    // Enforce cooldown: skip if an insurrection was spawned too recently
    const cooldown = INSURRECTION_CONSTANTS.COOLDOWN_TICKS;
    const lastInsurrectionTurn = state.lastInsurrectionTurn || 0;
    const ticksSinceLast = state.turn - lastInsurrectionTurn;

    if (cooldown > 0 && lastInsurrectionTurn > 0 && ticksSinceLast < cooldown) {
      logger.debug(`Insurrection cooldown active: ${ticksSinceLast}/${cooldown} ticks since last insurrection`);
    } else {
      // Spawn new insurrection
      const avgAggravation = rebelliousArmies.reduce((sum, a) => sum + a.aggravation, 0) / rebelliousArmies.length;
      const sourceEmpireIds = getSourceEmpireIds(rebelliousArmies);
      const insurrection = createInsurrection(
        `insurrection_${state.turn}`,
        rebelliousArmies.map(a => a.id),
        avgAggravation,
        { sourceEmpireIds }
      );
      state.insurrections.push(insurrection);
      state.lastInsurrectionTurn = state.turn;
      // Reset aggravation after rebellion so the same armies don't instantly retrigger.
      rebelliousArmies.forEach(army => {
        army.aggravation = INSURRECTION_CONSTANTS.POST_REBELLION_AGGRAVATION;
      });
      logger.warn(`INSURRECTION! ${rebelliousArmies.length} armies rebel!`, {
        avgAggravation: avgAggravation.toFixed(1),
        armies: rebelliousArmies.map(a => a.name)
      });
      log.push(`INSURRECTION! ${rebelliousArmies.length} armies rebel!`);
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
