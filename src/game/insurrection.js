import { INSURRECTION_CONSTANTS } from './constants.js';
import { createInsurrection } from './types.js';
import { getLogger } from '../modules/logger.js';
import { isRegularArmy } from './turn/armyUtils.js';

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
  const activeInsurrections = (state.insurrections || []).filter(ins => ins?.active);
  
  // Check for armies that should rebel
  const rebelliousArmies = state.armies.filter(army =>
    isRegularArmy(army) &&
    army.aggravation >= INSURRECTION_CONSTANTS.THRESHOLD
  );
  
  if (rebelliousArmies.length > 0) {
    logger.debug(`Found ${rebelliousArmies.length} rebellious armies`, {
      armies: rebelliousArmies.map(a => ({ name: a.name, aggravation: a.aggravation }))
    });
  }
  
  if (rebelliousArmies.length > 0 && activeInsurrections.length === 0) {
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
  
  // Remove resolved insurrections
  const beforeCount = state.insurrections.length;
  state.insurrections = state.insurrections.filter(ins => ins.active);
  if (state.insurrections.length < beforeCount) {
    logger.info(`Resolved ${beforeCount - state.insurrections.length} insurrection(s)`);
  }
  
  return { log };
}
