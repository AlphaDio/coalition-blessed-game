import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../types.js';
import { ECONOMY_BALANCE_CONSTANTS } from '../../constants.js';

function resolveProductionBankThreshold(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return ECONOMY_BALANCE_CONSTANTS.IMPROVEMENT_PRODUCTION_BANK_THRESHOLD_DEFAULT;
}

/**
 * Create an improvement request (available to accept)
 */
export function createImprovementRequest(id, name, description, {
  suppliesCost = 0,
  build = 0,
  capacity = 1,
  sustainmentCost = {}, // { commodity_key: qty_per_tick }
  productionOutputs = {}, // { commodity_key: qty_per_tick }
  unityOutput = 0, // unity generated per tick for the owning empire
  modifiers = {}, // { stat_key: value }
  tags = [],
  suggestedBy = null,
  requiredLawId = null,
  requiredLaws = null,
  armyGrant = null,        // { manpower: number } - creates army or adds to existing
  manpowerGrant = null,    // number - adds manpower to empire's army
  requiresNoArmy = false,  // If true, improvement only available to empires without an army
  requisitionUpkeep = 0,   // requisition cost per tick
  productionBankThreshold = ECONOMY_BALANCE_CONSTANTS.IMPROVEMENT_PRODUCTION_BANK_THRESHOLD_DEFAULT, // multiplier of total production output per tick

  tier = 1,
  branch = 'general'
} = {}) {
  return {
    id,
    name,
    description,
    suppliesCost,
    build,
    capacity,
    sustainmentCost,
    productionOutputs,
    unityOutput,
    modifiers,
    tags,
    suggestedBy,
    requiredLawId,
    requiredLaws,
    armyGrant,
    manpowerGrant,
    requiresNoArmy,
    requisitionUpkeep,
    productionBankThreshold: resolveProductionBankThreshold(productionBankThreshold),
    tier,
    branch,
    requestedAt: null
  };
}

/**
 * Create an improvement instance (in queue or completed)
 */
export function createImprovement(requestId, empireId, startedAtTick, request) {
  const populationMultiplier = request.sustainmentCost ? Object.values(request.sustainmentCost).reduce((a, b) => a + b, 0) : 0;
  const definitionId = request.definitionId || request.requestId || requestId;
  const instanceId = request.id || `${definitionId}_${empireId}_${startedAtTick}`;
  return {
    id: instanceId,
    requestId: definitionId,
    definitionId,
    empireId,
    name: request.name,
    description: request.description,
    suggestedBy: request.suggestedBy || empireId || null,

    // Tier and branch (for tier unlock tracking)
    tier: request.tier || 1,
    branch: request.branch || 'general',

    // Build phase
    buildProgress: 0,
    build: request.build,
    startedAtTick,

    // Runtime state
    state: 'BUILDING', // BUILDING | ACTIVE | DEGRADED
    capacity: request.capacity,

    // Costs and outputs
    sustainmentCost: { ...request.sustainmentCost },
    productionOutputs: { ...request.productionOutputs },
    unityOutput: Number.isFinite(Number(request.unityOutput)) ? Number(request.unityOutput) : 0,
    modifiers: { ...request.modifiers },
    requisitionUpkeep: request.requisitionUpkeep || 0,
    requiredLawId: request.requiredLawId || null,
    requiredLaws: request.requiredLaws || null,
    armyGrant: request.armyGrant || null,
    manpowerGrant: request.manpowerGrant || null,

    // Legacy field retained for save compatibility; no longer used as empire stockpile.
    stockpile: {},
    // Legacy per-improvement sustainment buffer retained for save compatibility.
    // Active sustainment now uses pooled empire-level market receipts.
    sustainmentBuffer: {},
    maxStockpile: populationMultiplier > 0 ? populationMultiplier * IMPROVEMENT_SUSTAINMENT_TICKS : 0,

    // Production bank (accumulates before releasing to market)
    productionBank: {},
    productionBankThreshold: resolveProductionBankThreshold(request.productionBankThreshold), // multiplier for release threshold

    // Degradation tracking
    degradedSince: null,
    ticksSinceSustained: 0,
    completedAtTick: null, // Grace period before sustainment kicks in

    tags: [...request.tags]
  };
}
