import { SCOURGE_MISSION_CONSTANTS } from './constants.js';
import { getThreatScalar } from './scourgeThreat.js';
import { getCommodityReserveQty, consumeCommodityReserve } from './marketOrderReserves.js';

const POWER_DEFINITIONS = [
  {
    id: 'EP_REQUISITION_CACHE',
    name: 'Requisition Cache Release',
    cost_credits: SCOURGE_MISSION_CONSTANTS.EP_CREDIT_COST_LOW,
    resource_costs: { wormhole_reactors: 5 },
    duration_ticks: 0,
    consumes_active_slot: false,
    effects: [
      { target: 'coalition.requisition', op: 'add', value: SCOURGE_MISSION_CONSTANTS.EP_REQUISITION_CACHE_AMOUNT }
    ]
  },
  {
    id: 'EP_CREDIT_LINE',
    name: 'Imperial Credit Line',
    cost_credits: SCOURGE_MISSION_CONSTANTS.EP_CREDIT_COST_MEDIUM,
    resource_costs: { wormhole_reactors: 3, dark_matter: 1 },
    duration_ticks: 0,
    consumes_active_slot: false,
    effects: [
      { target: 'empire.budget_credits', op: 'add', value: SCOURGE_MISSION_CONSTANTS.EP_EMPIRE_CREDIT_GRANT }
    ]
  },
  {
    id: 'EP_MOBILIZATION',
    name: 'Mobilization Surge',
    cost_credits: SCOURGE_MISSION_CONSTANTS.EP_CREDIT_COST_MEDIUM,
    resource_costs: { wormhole_reactors: 8, dark_matter: 2 },
    duration_ticks: SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION,
    effects: [
      { target: 'coalition.requisition_gen', op: 'mul', value: 0.55 },
      { target: 'coalition.law_enact_speed', op: 'mul', value: 0.12 }
    ]
  },
  {
    id: 'EP_WAR_INDUSTRY',
    name: 'War Industry Overdrive',
    cost_credits: SCOURGE_MISSION_CONSTANTS.EP_CREDIT_COST_HIGH,
    resource_costs: { wormhole_reactors: 10, dark_matter: 3 },
    duration_ticks: Math.round(SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION * 1.1),
    effects: [
      { target: 'coalition.improvement_build_speed', op: 'mul', value: 0.7 },
      { target: 'coalition.requisition_gen', op: 'mul', value: 0.2 }
    ]
  },
  {
    id: 'EP_MANDATE',
    name: 'Emergency Mandate',
    cost_credits: SCOURGE_MISSION_CONSTANTS.EP_CREDIT_COST_HIGH,
    resource_costs: { dark_matter: 4, wormhole_reactors: 12 },
    duration_ticks: Math.round(SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION * 0.9),
    effects: [
      { target: 'coalition.law_enact_speed', op: 'mul', value: 0.5 },
      { target: 'coalition.requisition_gen', op: 'mul', value: 0.25 }
    ]
  },
  {
    id: 'EP_SIGNAL_NET',
    name: 'Signal Supremacy Net',
    cost_credits: SCOURGE_MISSION_CONSTANTS.EP_CREDIT_COST_EXTREME,
    resource_costs: { dark_matter: 5, wormhole_reactors: 15 },
    duration_ticks: Math.round(SCOURGE_MISSION_CONSTANTS.EP_BASE_DURATION * 0.8),
    effects: [
      { target: 'coalition.intel_gain_per_turn', op: 'add', value: 1.5 },
      { target: 'coalition.law_enact_speed', op: 'mul', value: 0.18 },
      { target: 'coalition.requisition_gen', op: 'mul', value: 0.15 }
    ]
  }
];

export function getEmergencyPowerDefinitions() {
  return POWER_DEFINITIONS;
}

function scaleByThreat(value, state) {
  const threat = getThreatScalar(state?.coalitionThreat || 0);
  const climateSlots = state?.threatClimate?.activeSlots || 0;
  const threatBonus = Math.min(0.35, threat / 350);
  const climateBonus = Math.min(0.2, climateSlots * 0.08);
  const multiplier = 1 + threatBonus + climateBonus;
  return value * multiplier;
}

function getPowerCreditCost(def, state) {
  if (!def) return 0;
  const baseCost = Number(def.cost_credits ?? 0);
  if (!Number.isFinite(baseCost) || baseCost <= 0) return 0;
  const useCount = (state?.emergencyPowerUseCount || {})[def.id] || 0;
  const escalation = SCOURGE_MISSION_CONSTANTS.EP_COST_ESCALATION_RATE;
  return Math.round(baseCost * Math.pow(1 + escalation, useCount));
}

function usesActiveSlot(def) {
  if (!def) return false;
  if (def.consumes_active_slot === false) return false;
  const duration = Number(def.duration_ticks);
  return Number.isFinite(duration) && duration > 0;
}

function ensureCoalitionEconomy(state) {
  if (!state.coalitionEconomy || typeof state.coalitionEconomy !== 'object') {
    state.coalitionEconomy = {
      requisition: 0,
      treasury_credits: 0,
      allowance_credits: 0,
      consumption_requisition_pool: 0,
      consumption_requisition_pool_turns: 0
    };
  }
  if (!Number.isFinite(state.coalitionEconomy.requisition)) {
    state.coalitionEconomy.requisition = 0;
  }
}

function applyImmediateEmergencyEffects(state, effects = []) {
  const appliedEffects = [];

  effects.forEach((effect) => {
    if (effect?.op !== 'add') {
      return;
    }

    const scaledValue = Number(effect.value);
    if (!Number.isFinite(scaledValue) || scaledValue === 0) {
      return;
    }

    const roundedValue = Math.round(scaledValue);
    if (roundedValue === 0) {
      return;
    }

    if (effect.target === 'coalition.requisition') {
      ensureCoalitionEconomy(state);
      state.coalitionEconomy.requisition += roundedValue;
      appliedEffects.push({
        target: effect.target,
        value: roundedValue
      });
      return;
    }

    if (effect.target === 'empire.budget_credits') {
      const empires = Array.isArray(state.empires) ? state.empires : [];
      empires.forEach((empire) => {
        const currentBudget = Number.isFinite(Number(empire?.budget_credits))
          ? Number(empire.budget_credits)
          : 0;
        empire.budget_credits = currentBudget + roundedValue;
      });
      appliedEffects.push({
        target: effect.target,
        value: roundedValue,
        empireCount: empires.length
      });
    }
  });

  return appliedEffects;
}

export function canActivateEmergencyPower(state, powerId) {
  const def = POWER_DEFINITIONS.find(p => p.id === powerId);
  if (!def) return { canActivate: false, reason: 'Unknown emergency power' };

  const activeCount = (state.activeEmergencyPowers || []).length;
  if (usesActiveSlot(def) && activeCount >= SCOURGE_MISSION_CONSTANTS.EP_MAX_ACTIVE) {
    return { canActivate: false, reason: 'Max active emergency powers reached' };
  }

  const creditCost = getPowerCreditCost(def, state);
  const availableCredits = Number(state.coalitionEconomy?.treasury_credits || 0);
  if (availableCredits < creditCost) {
    return { canActivate: false, reason: `Insufficient credits (need ${creditCost}, have ${Math.floor(availableCredits)})` };
  }

  const resourceCosts = def.resource_costs || {};
  for (const [commodity, qty] of Object.entries(resourceCosts)) {
    const available = getCommodityReserveQty(state, commodity);
    if (available < qty) {
      return { canActivate: false, reason: `Insufficient ${commodity} reserves (need ${qty}, have ${available.toFixed(1)})` };
    }
  }

  return { canActivate: true, reason: '' };
}

export function activateEmergencyPower(state, powerId) {
  const def = POWER_DEFINITIONS.find(p => p.id === powerId);
  if (!def) {
    return { success: false, error: 'Emergency power not found' };
  }

  const check = canActivateEmergencyPower(state, powerId);
  if (!check.canActivate) {
    return { success: false, error: check.reason };
  }

  const scaledEffects = (def.effects || []).map(effect => ({
    ...effect,
    value: scaleByThreat(effect.value, state)
  }));

  const creditCost = getPowerCreditCost(def, state);
  ensureCoalitionEconomy(state);
  state.coalitionEconomy.treasury_credits = Math.max(0, (state.coalitionEconomy.treasury_credits || 0) - creditCost);

  const resourceCosts = def.resource_costs || {};
  for (const [commodity, qty] of Object.entries(resourceCosts)) {
    consumeCommodityReserve(state, commodity, qty);
  }

  if (!state.emergencyPowerUseCount) {
    state.emergencyPowerUseCount = {};
  }
  state.emergencyPowerUseCount[def.id] = (state.emergencyPowerUseCount[def.id] || 0) + 1;

  if (!usesActiveSlot(def)) {
    const appliedEffects = applyImmediateEmergencyEffects(state, scaledEffects);
    return { success: true, activePower: def, appliedEffects, creditCost };
  }

  const scaledDuration = Math.round(scaleByThreat(def.duration_ticks, state));

  if (!Array.isArray(state.activeEmergencyPowers)) {
    state.activeEmergencyPowers = [];
  }

  state.activeEmergencyPowers.push({
    id: def.id,
    name: def.name,
    costCredits: creditCost,
    remainingDuration: scaledDuration,
    totalDuration: scaledDuration,
    effects: scaledEffects
  });

  return { success: true, activePower: def, creditCost };
}

export function tickEmergencyPowers(state) {
  if (!Array.isArray(state.activeEmergencyPowers)) {
    state.activeEmergencyPowers = [];
  }

  const expired = [];
  state.activeEmergencyPowers.forEach(power => {
    power.remainingDuration -= 1;
    if (power.remainingDuration <= 0) {
      expired.push(power.id);
    }
  });

  state.activeEmergencyPowers = state.activeEmergencyPowers.filter(p => p.remainingDuration > 0);
  return expired;
}

export function getActiveEmergencyPowerModifiers(state) {
  const aggregate = {
    requisitionGenMult: 1.0,
    improvementBuildSpeedMult: 1.0,
    lawProgressSpeedBonus: 0,
    intelGainPerTurn: 0
  };

  (state.activeEmergencyPowers || []).forEach(power => {
    (power.effects || []).forEach(effect => {
      if (effect.target === 'coalition.requisition_gen' && effect.op === 'mul') {
        aggregate.requisitionGenMult *= (1 + effect.value);
      }
      if (effect.target === 'coalition.improvement_build_speed' && effect.op === 'mul') {
        aggregate.improvementBuildSpeedMult *= (1 + effect.value);
      }
      if (effect.target === 'coalition.law_enact_speed' && effect.op === 'mul') {
        aggregate.lawProgressSpeedBonus += effect.value;
      }
      if (effect.target === 'coalition.intel_gain_per_turn' && effect.op === 'add') {
        aggregate.intelGainPerTurn += effect.value;
      }
    });
  });

  return aggregate;
}
