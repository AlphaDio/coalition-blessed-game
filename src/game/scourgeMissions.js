import { clampStat } from './cohesion.js';
import { SCOURGE_MISSION_CONSTANTS } from './constants.js';
import { applyOrUpdateModifier, adjustModifierSeverity, selectMissionModifier, createModifierFromTemplate } from './scourgeModifiers.js';
import { getScourgeModifierTemplates } from './scourgeModifiers.js';

const MISSION_SLIDER_VALUES = [-10, 0, 10, 25, 50];

const PRE_ATTACK_EFFECTS = {
  disrupt: { threatDelta: -3, severityDelta: -1, cost: 60 },
  safe: { threatDelta: 2, severityDelta: 1, cost: 90 },
  escalate: { threatDelta: 6, severityDelta: 2, cost: 0 }
};

const DEEP_MISSION_NAMES = [
  'Silent Dagger',
  'Red Horizon',
  'Ghost Relay',
  'Crimson Veil'
];

function clampMeter(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function applyTimedModifier(state, key, value, duration) {
  if (!state.timedModifiers) state.timedModifiers = [];
  if (!state.coalitionModifiers) state.coalitionModifiers = {};

  if (state.coalitionModifiers[key] === undefined) {
    state.coalitionModifiers[key] = 0;
  }

  state.coalitionModifiers[key] += value;
  state.timedModifiers.push({
    key,
    value,
    expiresAt: state.turn + duration
  });
}

export function applyMissionSliderEffects(state, log = []) {
  const slider = MISSION_SLIDER_VALUES.includes(state.missionSlider) ? state.missionSlider : 0;
  if (!state.coalitionEconomy) return;

  if (slider > 0) {
    const requisition = state.coalitionEconomy.requisition || 0;
    const diverted = requisition * (slider / 100);
    state.coalitionEconomy.requisition = Math.max(0, requisition - diverted);
    const meterGain = diverted * SCOURGE_MISSION_CONSTANTS.MISSION_METER_PER_REQUISITION;
    const prevMeter = state.missionMeter || 0;
    state.missionMeter = clampMeter(prevMeter + meterGain);
    if (meterGain > 0.001) {
      log.push(`Mission budget +${meterGain.toFixed(2)} (diverted ${diverted.toFixed(2)} req)`);
    }
  } else if (slider === -10) {
    const requisition = state.coalitionEconomy.requisition || 0;
    const bonus = requisition * 0.1;
    state.coalitionEconomy.requisition = requisition + bonus;
    state.coalitionThreat = clampMeter((state.coalitionThreat || 0) + SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_THREAT_INCREASE);
    const taxValue = SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_GLORY_GAIN_MUL - 1.0;
    applyTimedModifier(
      state,
      'glory_gain_multiplier',
      taxValue,
      SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_GLORY_TAX_DURATION
    );
    log.push(`Mission budget emergency: +${bonus.toFixed(2)} req, Threat +${SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_THREAT_INCREASE}`);
  }
}

export function buildPreAttackMissionEvent(state, rng = Math.random) {
  const modifier = selectMissionModifier(state, rng);
  const title = `MISSION: ${modifier.name}`;
  const text = 'A pre-attack operation opportunity tied to a Scourge modifier.';
  return {
    id: 'EVT_MISSION_PRE_ATTACK',
    scope: 'SCOURGE_MISSION',
    kind: 'PRE_ATTACK',
    title,
    text,
    missionModifier: modifier,
    choices: [
      { id: 'disrupt', text: 'Disrupt' },
      { id: 'safe', text: 'Safe Route' },
      { id: 'escalate', text: 'Escalate' }
    ]
  };
}

export function buildDeepMissionEvent(state, rng = Math.random) {
  const name = DEEP_MISSION_NAMES[Math.floor(rng() * DEEP_MISSION_NAMES.length)];
  return {
    id: 'EVT_DEEP_MISSION',
    scope: 'SCOURGE_MISSION',
    kind: 'DEEP',
    title: `DEEP MISSION: ${name}`,
    text: 'A special operation opportunity. A smaller alternate source of Glory.',
    choices: [
      { id: 'strike', text: 'Strike' },
      { id: 'sabotage', text: 'Sabotage' },
      { id: 'harvest', text: 'Harvest' }
    ]
  };
}

export function maybeSpawnDeepMission(state, rng = Math.random) {
  if (state.activeEvent) return null;
  if ((state.missionMeter || 0) < 100) return null;
  state.missionMeter = 0;
  return buildDeepMissionEvent(state, rng);
}

function applyRequisitionCost(state, amount, log) {
  if (!state.coalitionEconomy) return;
  const available = state.coalitionEconomy.requisition || 0;
  state.coalitionEconomy.requisition = available - amount;
  log.push(`Requisition spent: ${amount}`);
}

function addGlory(state, amount, log, reason = 'Glory') {
  const multiplier = state.coalitionModifiers?.glory_gain_multiplier ?? 1.0;
  const gained = Math.max(0, amount * multiplier);
  state.coalitionGlory = (state.coalitionGlory || 0) + gained;
  state.coalitionPrestige = (state.coalitionPrestige || 0) + Math.round(gained * 0.25);
  if (log) log.push(`${reason}: +${Math.round(gained)}`);
}

function addIntel(state, amount, log) {
  state.coalitionIntel = (state.coalitionIntel || 0) + amount;
  if (log) log.push(`Intel: +${amount}`);
}

export function handleMissionEventChoice(state, event, choiceIndex, rng = Math.random) {
  const log = [];
  const choice = event?.choices?.[choiceIndex];
  if (!choice) {
    return { success: false, error: 'Invalid mission choice', log };
  }

  if (event.kind === 'PRE_ATTACK') {
    const effect = PRE_ATTACK_EFFECTS[choice.id];
    if (!effect) {
      return { success: false, error: 'Unknown mission effect', log };
    }

    const modifier = event.missionModifier || selectMissionModifier(state, rng);
    const adjusted = adjustModifierSeverity(modifier, effect.severityDelta);
    applyOrUpdateModifier(state, adjusted);

    state.coalitionThreat = clampMeter((state.coalitionThreat || 0) + effect.threatDelta);

    if (effect.cost > 0) {
      applyRequisitionCost(state, effect.cost, log);
    }

    if (choice.id === 'escalate') {
      state.coalitionEconomy.requisition = (state.coalitionEconomy?.requisition || 0) + 60;
      addIntel(state, 1, log);
      addGlory(state, 10, log, 'Escalation Glory');
    }

    if (state.pendingScourgeAttack) {
      state.pendingScourgeAttack.ready = true;
    }

    log.push(`Mission ${choice.id}: Threat ${effect.threatDelta >= 0 ? '+' : ''}${effect.threatDelta}`);
    return { success: true, log };
  }

  if (event.kind === 'DEEP') {
    if (choice.id === 'strike') {
      state.scourgeNextAttackManpowerDamagePct = SCOURGE_MISSION_CONSTANTS.DEEP_STRIKE_MP_PCT;
      addGlory(state, SCOURGE_MISSION_CONSTANTS.DEEP_GLORY_SMALL, log, 'Deep Mission Glory');
    } else if (choice.id === 'sabotage') {
      const modifiers = state.scourgeModifiers || [];
      if (modifiers.length > 0) {
        const target = modifiers[Math.floor(rng() * modifiers.length)];
        const adjusted = adjustModifierSeverity(target, -SCOURGE_MISSION_CONSTANTS.DEEP_SABOTAGE_SEVERITY);
        applyOrUpdateModifier(state, adjusted);
      } else {
        const template = getScourgeModifierTemplates()[0];
        const sabotage = createModifierFromTemplate(template, 1, 'n_attacks', 'deep_mission');
        sabotage.effects = [{ target: 'scourge.attack_power', op: 'mul', valuePerSeverity: -0.08, when: 'next_attack_only' }];
        applyOrUpdateModifier(state, sabotage);
      }
      addGlory(state, SCOURGE_MISSION_CONSTANTS.DEEP_GLORY_SMALL, log, 'Deep Mission Glory');
    } else if (choice.id === 'harvest') {
      addGlory(state, SCOURGE_MISSION_CONSTANTS.DEEP_GLORY_MEDIUM, log, 'Deep Mission Glory');
      state.coalitionEconomy.requisition = (state.coalitionEconomy?.requisition || 0) + SCOURGE_MISSION_CONSTANTS.DEEP_REQUISITION_SMALL;
      addIntel(state, SCOURGE_MISSION_CONSTANTS.DEEP_INTEL_SMALL, log);
      state.coalitionThreat = clampMeter((state.coalitionThreat || 0) + SCOURGE_MISSION_CONSTANTS.DEEP_HARVEST_THREAT_SMALL_POSITIVE);
    }

    return { success: true, log };
  }

  return { success: false, error: 'Unknown mission event', log };
}
