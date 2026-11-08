import { DeterministicRNG } from '../../modules/rng.js';
import { getLogger } from '../../modules/logger.js';
import { applyScaledCoalitionCohesionDelta, clampApproval, scaleCohesionDelta } from '../cohesion.js';
import { applyCoalitionIntel } from '../scourgePrediction.js';
import { TECH_BY_ID } from '../technologyDefinitions.js';
import {
  EXPEDITION_PLAN, DEVELOPMENT_PROGRAMS, DEFAULT_DEVELOPMENT_PROGRAM,
  EMPIRE_TEMPLATES, DISCOVERY_TEMPLATES, EXPEDITION_RULES
} from './catalog.js';
import { ensureExpeditionsState } from './state.js';
import { getExpeditionMaterialReserve, quoteExpeditionCost, spendExpeditionCost } from './costs.js';
import { getAvailableExpeditionArmies, startExpeditionBattle, resolveExpeditionBattle } from './combat.js';
import { cancelMinorOrders } from './economy.js';

export { createExpeditionsState, ensureExpeditionsState } from './state.js';

function remember(state, message, log = []) {
  state.expeditions.history.push({ turn: state.turn, message });
  state.expeditions.history = state.expeditions.history.slice(-40);
  getLogger().info(message);
  log.push(message);
}

function rollExpedition(state) {
  const { empires, discoveries, active, sequence } = state.expeditions;
  const charted = new Set([...empires, ...discoveries].map(entry => entry.id));
  for (const mission of active) charted.add(mission.destinationId);
  const destinations = [
    ...EMPIRE_TEMPLATES.filter(template => !charted.has(template.id))
      .map(({ id }) => ({ id, kind: 'empire' })),
    ...DISCOVERY_TEMPLATES.filter(template => !charted.has(template.id))
      .map(({ id }) => ({ id, kind: 'discovery' }))
  ];
  if (!destinations.length) return null;

  // Previewing the route uses the same independent RNG stream as launching it.
  const rng = new DeterministicRNG((state.rngSeed || 0) + 73129 + sequence * 7919);
  const destination = rng.choice(destinations);
  const { min, max } = EXPEDITION_PLAN.durationRange;
  return { ...destination, baseDuration: rng.randomInt(min, max + 1) };
}

function getExpeditionSpeedBonus(state) {
  // Use unlocked technology IDs so technologies researched in older saves count.
  const techBonus = Math.max(0, ...(state.empires || []).flatMap(empire =>
    (empire.technologies || []).map(id => TECH_BY_ID[id]?.modifiers?.expedition_speed ?? 0)));
  const discoveryBonus = state.expeditions.discoveries.reduce((bonus, discovery) => {
    if (discovery.status !== 'STUDIED') return bonus;
    const definition = DISCOVERY_TEMPLATES.find(entry => entry.id === discovery.id);
    return bonus + (definition?.expeditionSpeedBonus ?? 0);
  }, 0);
  return techBonus + discoveryBonus;
}

function travelTurns(baseTurns, speedBonus) {
  return Math.ceil(baseTurns / (1 + speedBonus));
}

function addOption(state, options, option, reason = null) {
  const cost = quoteExpeditionCost(state, option.cost || {});
  const blocked = state.gameOver ? 'Game is over' : reason || cost.reason;
  options.push({ ...option, cost, disabled: !!blocked, reason: blocked });
}

function peaceful(minor) {
  return !minor.war && minor.status !== 'HOSTILE' && minor.status !== 'CONQUERED';
}

export function getOccupationCost(minor) {
  return { requisition: 1.5 + (minor.developmentLevel || 0) * 0.5,
    materials: { plasma_fuel: 2 + (minor.developmentLevel || 0) } };
}

export function refreshExpeditionOptions(state) {
  const system = ensureExpeditionsState(state);
  const options = [];
  const plan = EXPEDITION_PLAN;
  const destination = rollExpedition(state);
  const speedBonus = getExpeditionSpeedBonus(state);
  const costMultiplier = 1 + system.sequence * plan.costGrowthPerLaunch;
  const baseMaterials = plan.materialsByDestination[destination?.kind] ?? {};
  const materials = Object.fromEntries(Object.entries(baseMaterials)
    .map(([commodity, amount]) => [commodity, Math.ceil(amount * costMultiplier)]));
  const durationRange = destination ? {
    min: travelTurns(plan.durationRange.min, speedBonus),
    max: travelTurns(plan.durationRange.max, speedBonus)
  } : null;
  addOption(state, options, {
    id: `launch_${plan.id}`, label: 'Launch frontier expedition', description: plan.description, action: 'launch',
    payload: { action: 'launch', planId: plan.id }, targetType: 'plan', targetId: plan.id,
    destinationKind: destination?.kind, durationRange,
    speedBonus, cost: { materials }
  }, system.active.length >= EXPEDITION_RULES.slots ? 'An expedition is already underway' :
    !destination ? 'All known signals have been explored' : null);

  for (const minor of system.empires) {
    const common = { targetType: 'empire', targetId: minor.id };
    const option = (action, label, description, cost, reason, details = {}) => addOption(state, options, {
      ...common, id: `${action}_${minor.id}`, label, description, action, payload: { action, targetId: minor.id, ...details }, cost
    }, reason);
    const unavailable = minor.war ? 'A battle is underway' : null;
    const developmentLevel = minor.developmentLevel || 0;
    if (!minor.interestRevealed) option('envoy', 'Send an envoy', 'Learn what this empire cares about; +3 approval.',
      { requisition: 15 }, unavailable || (minor.status === 'CONQUERED' ? 'Occupied empires cannot receive envoys' : null));
    if (minor.status === 'HOSTILE') {
      option('appease', 'Negotiate a ceasefire', 'Restore independence, stop a raid warning, and raise approval to at least 35. 20-turn truce.',
        { requisition: 35, materials: { [minor.sustain.commodity]: 60 } }, unavailable);
    }
    if (minor.status !== 'CONQUERED') {
      const cooldown = Math.max(0, (minor.nextAidTurn || 0) - state.turn);
      option('aid', 'Offer tailored aid', 'Deliver 50 of their preferred material. +14 approval; welfare-minded contacts gain +20. Six-turn cooldown.',
        { requisition: 20, materials: { [minor.interest.commodity]: 50 } }, unavailable ||
        (!minor.interestRevealed ? 'Send an envoy to learn their priorities first' : cooldown > 0 ? `Aid available in ${cooldown} turns` :
          minor.status === 'HOSTILE' ? 'Negotiate a ceasefire first' : null));
      if (minor.status !== 'ALLIED') option('pact', 'Sign a partnership pact',
        `At 65 approval: +25% exports and ${2 + developmentLevel} requisition per fully supplied turn. Pact ends below 40 approval.`,
        { requisition: 60, materials: { biomass: 40, plasma_fuel: 20 } }, unavailable ||
          (!minor.interestRevealed ? 'Send an envoy first' : minor.approval < EXPEDITION_RULES.pactApproval ? 'Requires 65 approval' :
            !peaceful(minor) ? 'Negotiate a ceasefire first' : null));
    }
    const targetLevel = developmentLevel + 1;
    const program = DEVELOPMENT_PROGRAMS.find(entry => entry.empireId === minor.id) ?? DEFAULT_DEVELOPMENT_PROGRAM;
    const developmentMultiplier = 1 + developmentLevel * EXPEDITION_RULES.developmentCostGrowthPerLevel;
    const developmentMaterials = Object.fromEntries(Object.entries(program.materials)
      .map(([commodity, amount]) => [commodity, Math.ceil(amount * developmentMultiplier)]));
    const upkeepIncrease = minor.status === 'CONQUERED' ? 'Occupation upkeep rises by 0.5 requisition and 1 Plasma Fuel per turn.' : '';
    const benefit = 'Immediately adds 50% of base production and 6 approval, and lowers current sustainment needs by 20%.';
    option('develop', `${program.name} (Lv ${targetLevel})`,
      [program.description, benefit, upkeepIncrease].filter(Boolean).join(' '),
      { materials: developmentMaterials },
      unavailable || (minor.project ? 'A development is already underway' :
        minor.occupationTurns > 0 ? 'Wait for occupation to stabilize' :
          minor.status === 'HOSTILE' ? 'Negotiate a ceasefire first' :
            minor.approval < 40 ? 'Requires 40 approval' : null),
      { targetLevel });
    if (minor.status === 'CONQUERED') {
      option('liberate', 'Restore independence', 'End occupation upkeep. Restore 55 approval and +5 approval with other free contacts.', {}, unavailable);
    } else {
      const availableArmy = getAvailableExpeditionArmies(state)[0];
      option('invade', 'Launch an invasion',
        `Commit ${availableArmy ? `${availableArmy.name} (${Math.floor(availableArmy.mp.current)} MP)` : 'one ready army'} against ${minor.defense} defenders. Costs ${Math.abs(scaleCohesionDelta(-3))} Coalition Cohesion, 3 approval in each member empire and 12–20 approval with other contacts. Victory brings 15 paid turns of occupation, 35% exports, then 70%, and permanent upkeep of ${getOccupationCost(minor).requisition} requisition + ${getOccupationCost(minor).materials.plasma_fuel} fuel per turn. Once stabilized, tribute pays ${3 + developmentLevel} requisition per fully supplied turn. Secession takes ${EXPEDITION_RULES.occupationUnrestLimit} consecutive missed payments.`,
        EXPEDITION_RULES.conquestCost, unavailable ||
          (getAvailableExpeditionArmies(state).length === 0 ? 'No ready army is available (35 organization required)' : null));
    }
  }
  for (const discovery of system.discoveries) {
    const definition = DISCOVERY_TEMPLATES.find(entry => entry.id === discovery.id);
    if (!definition) continue;
    discovery.benefitDescription = definition.benefitDescription;
    addOption(state, options, { id: `study_${discovery.id}`, label: `Study ${discovery.name}`,
      description: discovery.benefitDescription, action: 'study', payload: { action: 'study', targetId: discovery.id },
      targetType: 'discovery', targetId: discovery.id, duration: definition.duration, cost: definition.cost
    }, discovery.status === 'STUDIED' ? 'Already studied' : discovery.project ? 'Study is underway' : null);
  }
  system.options = options;
  const reserveCommodities = new Set(['super_alloys', 'biomass', 'plasma_fuel',
    ...options.flatMap(option => Object.keys(option.cost.materials ?? {}))]);
  system.materialReserves = Object.fromEntries([...reserveCommodities]
    .map(commodity => [commodity, getExpeditionMaterialReserve(state, commodity)]));
  return options;
}

export function handleExpeditionAction(state, payload = {}) {
  if (!state || state.gameOver) return { success: false, error: state ? 'Game is over' : 'Game is not initialized' };
  if (!payload || typeof payload !== 'object') return { success: false, error: 'Invalid expedition action' };
  if (payload.action === 'develop' && payload.projectId !== undefined) {
    return { success: false, error: 'Development now uses levels. Refresh expedition options.' };
  }
  const system = ensureExpeditionsState(state);
  const options = refreshExpeditionOptions(state);
  const option = options.find(entry => entry.action === payload.action &&
    (payload.action === 'launch' ? entry.payload.planId === payload.planId : entry.targetId === payload.targetId));
  if (!option) return { success: false, error: 'Unknown expedition action or target' };
  if (payload.action === 'develop' && payload.targetLevel !== undefined && payload.targetLevel !== option.payload.targetLevel) {
    return { success: false, error: 'Development level changed. Refresh expedition options.' };
  }
  if (option.disabled) return { success: false, error: option.reason };
  const minor = system.empires.find(entry => entry.id === payload.targetId);
  const log = [];
  // All validation precedes payment. Battle creation can fail if explicitly
  // requested armies are busy, so create it before committing economic costs.
  let battle;
  if (payload.action === 'invade') {
    battle = startExpeditionBattle(state, minor, { kind: 'conquest', armyIds: payload.armyIds });
    if (!battle.front) return { success: false, error: battle.error || 'No army can invade' };
  }
  spendExpeditionCost(state, option.cost);

  switch (payload.action) {
    case 'launch': {
      const plan = EXPEDITION_PLAN;
      const destination = rollExpedition(state);
      const duration = travelTurns(destination.baseDuration, option.speedBonus);
      system.active.push({ id: `expedition_${++system.sequence}`, planId: plan.id, name: plan.name,
        kind: destination.kind, destinationId: destination.id, duration, remainingTurns: duration, startedTurn: state.turn });
      remember(state, `${plan.name} launched; returns in ${duration} turns.`, log);
      break;
    }
    case 'envoy':
      minor.interestRevealed = true;
      minor.approval = clampApproval(minor.approval + 3);
      remember(state, `${minor.name} values ${minor.interest.name.toLowerCase()}: ${minor.interest.description}`, log);
      break;
    case 'aid':
      minor.approval = clampApproval(minor.approval + (minor.interest.id === 'welfare' ? 20 : 14));
      minor.nextAidTurn = state.turn + EXPEDITION_RULES.aidCooldown;
      remember(state, `Tailored aid delivered to ${minor.name}; approval is ${minor.approval.toFixed(0)}.`, log);
      break;
    case 'appease':
      minor.status = 'INDEPENDENT';
      minor.approval = Math.max(35, minor.approval);
      minor.raidWarningTurns = null;
      minor.nextRaidTurn = state.turn + EXPEDITION_RULES.raidCooldown;
      remember(state, `${minor.name} accepts a ceasefire.`, log);
      break;
    case 'pact':
      minor.status = 'ALLIED';
      minor.approval = clampApproval(minor.approval + (minor.interest.id === 'sovereignty' ? 10 : 3));
      minor.exportMultiplier = 1.25;
      remember(state, `Partnership signed with ${minor.name}; supplied trade now generates requisition.`, log);
      break;
    case 'develop': {
      const template = EMPIRE_TEMPLATES.find(entry => entry.id === minor.id);
      minor.baseProduction ??= template?.production.amount ?? minor.production.amount;
      minor.developmentLevel = option.payload.targetLevel;
      minor.production.amount += minor.baseProduction * 0.5;
      minor.sustain.amount *= 0.8;
      minor.approval = clampApproval(minor.approval + 6);
      if (minor.status === 'CONQUERED') minor.upkeep = getOccupationCost(minor);
      remember(state, `${minor.name} reaches development level ${minor.developmentLevel}.`, log);
      break;
    }
    case 'invade':
      minor.war = { frontId: battle.front.id, kind: 'conquest' };
      minor.status = 'HOSTILE';
      minor.approval = Math.max(0, minor.approval - 35);
      minor.exportMultiplier = 0;
      cancelMinorOrders(state, minor.id);
      applyScaledCoalitionCohesionDelta(state, -3);
      for (const member of state.empires || []) member.approval = clampApproval(member.approval - 3);
      for (const other of system.empires) {
        if (other.id === minor.id || other.status === 'CONQUERED') continue;
        other.approval = clampApproval(other.approval - (other.interest.id === 'sovereignty' ? 20 : 12));
      }
      log.push(...battle.log);
      remember(state, `The Coalition invades ${minor.name}. Other independent powers condemn the attack.`, log);
      break;
    case 'liberate':
      minor.status = 'INDEPENDENT';
      minor.approval = 55;
      minor.occupationTurns = 0;
      minor.occupationUnrest = 0;
      minor.upkeepPaid = null;
      minor.upkeepFailure = null;
      minor.exportMultiplier = 1;
      minor.raidWarningTurns = null;
      minor.nextRaidTurn = state.turn + EXPEDITION_RULES.raidCooldown;
      for (const other of system.empires) {
        if (other.id !== minor.id && other.status !== 'CONQUERED') other.approval = clampApproval(other.approval + 5);
      }
      remember(state, `${minor.name} regains independence; occupation upkeep ends.`, log);
      break;
    case 'study': {
      const discovery = system.discoveries.find(entry => entry.id === payload.targetId);
      discovery.status = 'STUDYING';
      discovery.project = { name: `Study ${discovery.name}`, duration: option.duration, remainingTurns: option.duration };
      remember(state, `Study of ${discovery.name} begins (${option.duration} turns).`, log);
      break;
    }
  }
  refreshExpeditionOptions(state);
  return { success: true, log };
}

function discover(state, mission, log) {
  if (mission.kind === 'empire') {
    const definition = EMPIRE_TEMPLATES.find(entry => entry.id === mission.destinationId);
    if (!definition || state.expeditions.empires.some(entry => entry.id === definition.id)) return;
    state.expeditions.empires.push({ ...structuredClone(definition), budget_credits: 1000,
      interestRevealed: false, developmentLevel: 0,
      project: null, status: 'INDEPENDENT', war: null, supplyState: { fulfillment: 1 }, exportMultiplier: 1,
      occupationTurns: 0, occupationUnrest: 0, raidWarningTurns: null, nextRaidTurn: state.turn + 8,
      discoveredTurn: state.turn });
    remember(state, `Expedition returned: discovered ${definition.name}. Send an envoy to learn their priorities.`, log);
  } else {
    const definition = DISCOVERY_TEMPLATES.find(entry => entry.id === mission.destinationId);
    if (!definition || state.expeditions.discoveries.some(entry => entry.id === definition.id)) return;
    state.expeditions.discoveries.push({ id: definition.id, name: definition.name, description: definition.description,
      benefitDescription: definition.benefitDescription, status: 'UNSTUDIED', project: null, discoveredTurn: state.turn });
    remember(state, `Expedition returned: discovered ${definition.name}. ${definition.benefitDescription}`, log);
  }
}

function raidDefeat(state, minor, log) {
  const stolen = Math.min(80, Math.max(0, state.coalitionEconomy?.requisition || 0));
  if (state.coalitionEconomy) state.coalitionEconomy.requisition -= stolen;
  const cohesionLoss = Math.abs(applyScaledCoalitionCohesionDelta(state, -1));
  minor.approval = Math.max(25, minor.approval);
  remember(state, `${minor.name} raids Coalition supply lines: ${stolen.toFixed(0)} requisition lost and Coalition Cohesion -${cohesionLoss}.`, log);
}

export function resolveExpeditionBattles(state, log = []) {
  const system = ensureExpeditionsState(state);
  for (const front of state.battleFronts || []) {
    if (!front.isExpeditionBattle || front.state !== 'ENDED' || front.expeditionResolved) continue;
    const outcome = resolveExpeditionBattle(state, front, front.winnerSide || 'right');
    if (!outcome) continue;
    log.push(...(outcome.log || []));
    const minor = system.empires.find(entry => entry.id === outcome.minorEmpireId);
    if (!minor) continue;
    minor.war = null;
    minor.raidWarningTurns = null;
    minor.nextRaidTurn = state.turn + EXPEDITION_RULES.raidCooldown;
    if (outcome.kind === 'conquest') {
      if (outcome.coalitionWon) {
        minor.status = 'CONQUERED';
        minor.approval = 20;
        minor.occupationTurns = EXPEDITION_RULES.occupationDuration;
        minor.occupationUnrest = 0;
        minor.exportMultiplier = 0.35;
        minor.upkeep = getOccupationCost(minor);
        minor.upkeepPaid = null;
        minor.upkeepFailure = null;
        minor.partnershipIncome = 0;
        minor.tributeIncome = 0;
        remember(state, `${minor.name} conquered: 15 turns of occupation and permanent requisition/fuel upkeep begin.`, log);
      } else {
        minor.status = 'HOSTILE';
        minor.approval = Math.max(10, minor.approval);
        remember(state, `The invasion of ${minor.name} fails. Expedition costs are lost; surviving troops return.`, log);
      }
    } else if (outcome.coalitionWon) {
      minor.approval = Math.max(30, minor.approval + 10);
      minor.status = 'INDEPENDENT';
      remember(state, `${minor.name}'s raid is repelled; a 20-turn truce begins.`, log);
    } else {
      raidDefeat(state, minor, log);
    }
  }
  return log;
}

function completeStudy(state, discovery, log) {
  const definition = DISCOVERY_TEMPLATES.find(entry => entry.id === discovery.id);
  discovery.project = null;
  discovery.status = 'STUDIED';
  discovery.studiedTurn = state.turn;
  if (definition?.reward.type === 'cache') {
    state.stockpiles ||= {};
    for (const [key, amount] of Object.entries(definition.reward.materials)) state.stockpiles[key] = (state.stockpiles[key] || 0) + amount;
  }
  for (const minor of state.expeditions.empires) {
    if (minor.interest.id === 'knowledge' && peaceful(minor)) minor.approval = clampApproval(minor.approval + 5);
  }
  remember(state, `Study completed: ${discovery.name}. ${discovery.benefitDescription}`, log);
}

function tickMinor(state, minor, log) {
  minor.partnershipIncome = 0;
  minor.tributeIncome = 0;
  if (minor.war) { minor.exportMultiplier = 0; return; }
  if (minor.status === 'ALLIED' && minor.approval < EXPEDITION_RULES.pactBreakApproval) {
    minor.status = 'INDEPENDENT';
    remember(state, `${minor.name} suspends its partnership: approval fell below 40.`, log);
  }
  if (minor.status === 'CONQUERED') {
    minor.upkeep = getOccupationCost(minor);
    const { success: paid, error } = spendExpeditionCost(state, minor.upkeep);
    minor.upkeepPaid = paid;
    minor.upkeepFailure = error ?? null;
    minor.exportMultiplier = paid ? (minor.occupationTurns > 0 ? 0.35 : 0.7) : 0;
    if (paid && minor.occupationTurns <= 0) {
      minor.tributeIncome = (3 + minor.developmentLevel) * Math.max(0, Math.min(1, minor.supplyState?.fulfillment ?? 1));
      state.coalitionEconomy.requisition += minor.tributeIncome;
    }
    minor.approval = clampApproval(minor.approval + (paid ? 0.3 : -2));
    minor.occupationUnrest = paid ? 0 : (minor.occupationUnrest || 0) + 1;
    if (minor.occupationTurns > 0 && paid) minor.occupationTurns--;
    const turnsBeforeSecession = EXPEDITION_RULES.occupationUnrestLimit - minor.occupationUnrest;
    if (turnsBeforeSecession <= 0) {
      minor.status = 'HOSTILE';
      minor.approval = 10;
      minor.occupationTurns = 0;
      minor.exportMultiplier = 0;
      cancelMinorOrders(state, minor.id);
      remember(state, `${minor.name} breaks free after ${EXPEDITION_RULES.occupationUnrestLimit} consecutive missed upkeep payments.`, log);
    } else if (minor.occupationUnrest === 1 || turnsBeforeSecession === 5) {
      remember(state, `${minor.name} missed occupation upkeep. ${error}. It will break free after ${turnsBeforeSecession} more missed payments in a row.`, log);
    }
  } else {
    if (minor.approval <= 20 && minor.status !== 'HOSTILE') {
      minor.status = 'HOSTILE';
      remember(state, `${minor.name} closes its markets in hostility.`, log);
    } else if (minor.status === 'HOSTILE' && minor.approval >= 30) {
      minor.status = 'INDEPENDENT';
      minor.raidWarningTurns = null;
    }
    minor.exportMultiplier = minor.status === 'HOSTILE' ? 0 : minor.status === 'ALLIED' ? 1.25 : 1;
    if (minor.status === 'HOSTILE') cancelMinorOrders(state, minor.id);
  }
  // Finish projects already paid for in older saves under their original rules.
  if (minor.project && minor.status !== 'HOSTILE' && !(minor.occupationTurns > 0)) {
    minor.project.remainingTurns--;
    if (minor.project.remainingTurns <= 0) {
      const projectId = minor.project.id;
      minor.developments[projectId] = (minor.developments[projectId] || 0) + 1;
      minor.developmentLevel++;
      minor.production.amount = minor.baseProduction * (1 + 0.5 * minor.developments.industry);
      minor.sustain.amount = minor.baseSustain * (1 - 0.2 * minor.developments.infrastructure);
      const favored = minor.interest.id === 'industry' && projectId === 'industry' || minor.interest.id === 'welfare' && projectId === 'infrastructure';
      minor.approval = clampApproval(minor.approval + (favored ? 12 : 6));
      remember(state, `${minor.project.name} completed in ${minor.name}; development level ${minor.developmentLevel}.`, log);
      minor.project = null;
    }
  }
  if (minor.status === 'ALLIED') {
    const income = (2 + minor.developmentLevel) * Math.max(0, Math.min(1, minor.supplyState?.fulfillment ?? 1));
    if (state.coalitionEconomy) state.coalitionEconomy.requisition += income;
    minor.partnershipIncome = income;
  } else minor.partnershipIncome = 0;

  if (minor.status !== 'HOSTILE' || state.turn < (minor.nextRaidTurn || 0)) return;
  if (minor.raidWarningTurns == null) {
    minor.raidWarningTurns = EXPEDITION_RULES.raidWarning;
    remember(state, `${minor.name} is preparing a raid in ${EXPEDITION_RULES.raidWarning} turns. A ceasefire can prevent it.`, log);
    return;
  }
  minor.raidWarningTurns--;
  if (minor.raidWarningTurns > 0) return;
  const battle = startExpeditionBattle(state, minor, { kind: 'raid' });
  minor.raidWarningTurns = null;
  minor.nextRaidTurn = state.turn + EXPEDITION_RULES.raidCooldown;
  if (battle.front) {
    minor.war = { frontId: battle.front.id, kind: 'raid' };
    log.push(...battle.log);
    remember(state, `${minor.name} attacks the Coalition's supply lines!`, log);
  } else raidDefeat(state, minor, log);
}

function applyDiscoveryBenefits(state) {
  for (const discovery of state.expeditions.discoveries) {
    if (discovery.status !== 'STUDIED') continue;
    const reward = DISCOVERY_TEMPLATES.find(entry => entry.id === discovery.id)?.reward;
    if (!reward) continue;
    if (reward.type === 'intel') applyCoalitionIntel(state, reward.amount);
    if (reward.type === 'research') {
      for (const empire of state.empires || []) empire.techPoints = (empire.techPoints || 0) + reward.amount;
    }
    if (reward.type === 'approval') {
      for (const empire of state.empires || []) empire.approval = clampApproval(empire.approval + reward.amount);
    }
    if (reward.type === 'construction' || reward.type === 'requisition') {
      state.coalitionModifiers ||= {};
      state.coalitionModifiers.dynamic ||= {};
      const key = reward.type === 'construction' ? 'improvement_build_speed_mult' : 'requisition_gen_mult';
      state.coalitionModifiers.dynamic[key] = (state.coalitionModifiers.dynamic[key] ?? 1) * (1 + reward.amount);
    }
  }
}

// Runs once per simulation turn, after dynamic modifiers reset and before the
// economy/improvements. All timers are saved numbers, never wall-clock time.
export function processExpeditionsTick(state) {
  const system = ensureExpeditionsState(state);
  const log = [];
  if (system.lastProcessedTurn === state.turn) return { log };
  system.lastProcessedTurn = state.turn;
  resolveExpeditionBattles(state, log);
  for (const mission of system.active) {
    mission.remainingTurns--;
    if (mission.remainingTurns <= 0) discover(state, mission, log);
  }
  system.active = system.active.filter(mission => mission.remainingTurns > 0);
  for (const discovery of system.discoveries) {
    if (!discovery.project) continue;
    discovery.project.remainingTurns--;
    if (discovery.project.remainingTurns <= 0) completeStudy(state, discovery, log);
  }
  for (const minor of system.empires) tickMinor(state, minor, log);
  applyDiscoveryBenefits(state);
  refreshExpeditionOptions(state);
  return { log };
}
