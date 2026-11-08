import { loadResources } from './economyTick/resources.js';
import { DeterministicRNG } from '../modules/rng.js';

const ESSENTIALS = ['super_alloys', 'biomass', 'plasma_fuel'];
const MATERIALS_BY_TIER = { t1: 5, t2: 1, t3: 0.5, t4: 0.25 };
const MAX_LEVEL = 10;
const SUPPLY_BUFFER_TURNS = 20;
const PRICE_ADJUSTMENT_RATE = 0.2;

const PROJECTS = {
  super_alloys: [['Orbital Works', 'construction', 0.02], ['Mobilization Yards', 'organization', 0.02]],
  biomass: [['Public Nutrition', 'population', 0.02], ['Garden Settlements', 'population', 0.015, 0.8]],
  plasma_fuel: [['Deep Range Navigation', 'expedition', 0.025], ['Fleet Logistics', 'organization', 0.025]],
  rare_gases: [['Precision Optics', 'research', 0.02], ['Deep Scan Network', 'expedition', 0.02]],
  genomes: [['Restorative Clinics', 'population', 0.018], ['Medical Corps', 'organization', 0.02]],
  ancient_relics: [['Civil Charters', 'law', 0.018], ['Archive Institutes', 'research', 0.02]],
  psycho_implants: [['Delegation Networks', 'law', 0.02], ['Readiness Programs', 'organization', 0.018]],
  nano_machines: [['Rapid Assembly', 'construction', 0.022], ['Diagnostics Labs', 'research', 0.02]],
  quantum_circuits: [['Research Grid', 'research', 0.025], ['Consensus Network', 'law', 0.02]],
  sentient_cores: [['Civil Planning', 'construction', 0.024], ['Council Aides', 'law', 0.024]],
  wormhole_reactors: [['Survey Gates', 'expedition', 0.025], ['Mobile Shipyards', 'construction', 0.024]],
  dark_matter: [['Long Jump Network', 'expedition', 0.03], ['Frontier Science', 'research', 0.027]],
  anti_grav_modules: [['Lift Infrastructure', 'construction', 0.03], ['Rapid Evacuation', 'organization', 0.025]]
};

const EFFECT_LABELS = { population: 'base population growth in all empires', construction: 'construction speed',
  organization: 'army organization recovery', expedition: 'expedition speed', research: 'research speed', law: 'law progress speed' };

export function createProjectsState(seed) {
  const rng = new DeterministicRNG((seed || 0) + 58121);
  const variants = Object.fromEntries(loadResources().commodities.map(({ key }) =>
    [key, rng.choice(['production', 'conservation'])]));
  return { variants, levels: {}, pending: {}, supply: {}, paused: {}, creditsIssued: 0, priceMultiplier: 1, version: 2 };
}

export function ensureProjectsState(state) {
  const projects = state.projects ??= createProjectsState(state.rngSeed);
  if (projects.version === 2) return projects;
  projects.supply = {};
  projects.paused = {};
  for (const [commodity, level] of Object.entries(projects.levels)) {
    projects.levels[commodity] = Math.min(MAX_LEVEL, level);
    if (level >= MAX_LEVEL) delete projects.pending[commodity];
  }
  for (const pending of Object.values(projects.pending)) pending.progress = 0;
  projects.version = 2;
  return projects;
}

function campaignProjects(state) {
  return loadResources().commodities.filter(({ key }) => Object.hasOwn(state.projects.variants, key))
    .map(({ key, name, tier }) => {
      const [projectName, effect, strength, upkeepScale = 1] = (PROJECTS[key] || PROJECTS.super_alloys)
        [state.projects.variants[key] === 'production' ? 0 : 1];
      return { commodity: key, material: name, name: projectName, effect, strength,
        baseAmount: (MATERIALS_BY_TIER[tier] ?? 1) * upkeepScale };
    });
}

function levelEffect(strength, level) {
  return strength * level * (level + 1) / 2;
}

function getCirculatingCredits(state) {
  return [...(state.empires || []), ...(state.expeditions?.empires || [])]
    .reduce((total, empire) => total + Math.max(0, empire.budget_credits || 0), 0);
}

function quoteProject(state, { commodity, amount }) {
  const price = state.market?.[commodity]?.price;
  return Number.isFinite(price) && price > 0 ? Math.ceil(price * amount * 100) / 100 : null;
}

export function refreshProjects(state) {
  const projects = ensureProjectsState(state);
  projects.circulatingCredits = getCirculatingCredits(state);
  projects.options = campaignProjects(state).map(project => {
    const level = projects.levels[project.commodity] || 0;
    const pending = projects.pending[project.commodity];
    const paused = Boolean(projects.paused[project.commodity]);
    const targetLevel = Math.min(MAX_LEVEL, level + 1);
    const amount = project.baseAmount * targetLevel;
    const credits = quoteProject(state, { ...project, amount });
    return { ...project, level, targetLevel, amount, credits, paused, pending: Boolean(pending),
      progress: pending?.progress ?? 0, workRequired: 2 * targetLevel,
      fulfillment: paused ? 0 : projects.supply[project.commodity] || 0,
      currentEffect: levelEffect(project.strength, level), nextEffect: levelEffect(project.strength, targetLevel),
      effectLabel: EFFECT_LABELS[project.effect], upkeep: project.baseAmount * level,
      reason: state.gameOver ? 'Game is over' : level >= MAX_LEVEL ? 'Maximum level' : pending ? 'Upgrade underway' :
        paused ? 'Project paused' : credits === null ? 'Market unavailable' : null };
  });
}

export function fundProject(state, payload) {
  if (!state || state.gameOver) return { error: state ? 'Game is over' : 'Game is not initialized' };
  const projects = ensureProjectsState(state);
  const project = campaignProjects(state).find(entry => entry.commodity === payload?.commodity);
  if (!project) return { error: 'Unknown Project' };
  const level = projects.levels[project.commodity] || 0;
  if (payload.action === 'pause' || payload.action === 'resume') {
    if (!level && !projects.pending[project.commodity]) return { error: 'Project is inactive' };
    projects.paused[project.commodity] = payload.action === 'pause';
    return { log: `${project.name} ${projects.paused[project.commodity] ? 'paused' : 'resumed'}.` };
  }
  if (projects.pending[project.commodity]) return { error: 'Project upgrade already underway' };
  if (projects.paused[project.commodity]) return { error: 'Project is paused' };
  if (level >= MAX_LEVEL) return { error: 'Maximum Project level reached' };
  if (payload.targetLevel !== level + 1) return { error: 'Project level changed. Review the current offer.' };
  const amount = project.baseAmount * payload.targetLevel;
  const credits = quoteProject(state, { ...project, amount });
  if (credits === null) return { error: 'Market unavailable' };
  if (!Number.isFinite(payload.maxCredits) || credits > payload.maxCredits + 1e-9) {
    return { error: 'Project price changed. Review the current offer.' };
  }

  projects.pending[project.commodity] = { targetLevel: level + 1, progress: 0 };
  return { log: `${project.name} started its level ${level + 1} upgrade. Orders ${amount} ${project.material} each turn.` };
}

export function createProjectOrders(state) {
  const projects = ensureProjectsState(state);
  return campaignProjects(state).flatMap(project => {
    const { commodity, baseAmount } = project;
    const level = projects.levels[commodity] || 0;
    const targetLevel = projects.pending[commodity]?.targetLevel ?? level;
    const price = state.market?.[commodity]?.price;
    if (!targetLevel || projects.paused[commodity] || !(price > 0)) return [];
    const amount = baseAmount * targetLevel;
    return [{ id: `project_${commodity}_${state.turn}`, owner_type: 'project', owner_id: commodity,
      commodity, qty: amount, filled_qty: 0, max_price: price, priority: 1.5,
      turn_added_qty: amount, turn_added_turn: state.turn, baseAmount, targetLevel, projectName: project.name }];
  });
}

export function settleProjectOrders(state, orders, trades) {
  const projects = state.projects;
  projects.supply = {};
  projects.marketLastTick = {};
  projects.creditsSpentLastTick = 0;
  projects.creditsIssuedLastTick = 0;
  if (!orders.length) return [];

  const projectOrderIds = new Set(orders.map(order => order.id));
  let spend = 0;
  for (const trade of trades) {
    if (projectOrderIds.has(trade.buy_order_id)) spend += trade.qty * trade.price;
  }
  const treasury = state.coalitionEconomy;
  // New issuance is spent immediately and leaves any existing Treasury deficit intact.
  const treasuryPayment = Math.min(spend, Math.max(0, treasury.treasury_credits));
  treasury.treasury_credits -= treasuryPayment;
  projects.creditsSpentLastTick = spend;
  projects.creditsIssuedLastTick = spend - treasuryPayment;
  projects.creditsIssued += projects.creditsIssuedLastTick;

  const log = [];
  for (const order of orders) {
    const { commodity, baseAmount, qty: requested, filled_qty: filled, targetLevel } = order;
    projects.marketLastTick[commodity] = { requested, filled };
    let level = projects.levels[commodity] || 0;
    const pending = projects.pending[commodity];
    if (pending) {
      pending.progress += Math.min(1, Math.max(0, filled / baseAmount - level));
      if (pending.progress + 1e-9 >= 2 * targetLevel) {
        level = projects.levels[commodity] = targetLevel;
        delete projects.pending[commodity];
        log.push(`${order.projectName} reached level ${level}.`);
      }
    }
    if (level > 0) projects.supply[commodity] = Math.min(1, filled / (baseAmount * level));
  }
  return log;
}

export function getProjectBonus(state, effect) {
  if (!state?.projects?.supply) return 0;
  return campaignProjects(state).reduce((sum, project) => {
    const { commodity, strength } = project;
    if (project.effect !== effect || state.projects.paused[commodity]) return sum;
    return sum + levelEffect(strength, state.projects.levels[commodity] || 0) * (state.projects.supply[commodity] || 0);
  }, 0);
}

export function updateProjectPrices(state) {
  const projects = state.projects;
  if (!projects?.creditsIssued) return;

  const circulation = getCirculatingCredits(state);
  const newIssue = projects.creditsIssued - (projects.pricedCreditsIssued || 0);
  const priorCirculation = projects.priorCirculation ?? Math.max(0, circulation - newIssue);
  const otherNetDrain = Math.max(0, priorCirculation + newIssue - circulation);
  const retiredShare = Math.min(1, otherNetDrain / Math.max(1, priorCirculation + newIssue));
  // Currency is fungible. Attribute net drains proportionally to existing and
  // newly issued balances to estimate how many Project credits still circulate.
  projects.activeProjectCredits = Math.min(circulation,
    ((projects.activeProjectCredits || 0) + newIssue) * (1 - retiredShare));
  projects.priorCirculation = circulation;
  projects.pricedCreditsIssued = projects.creditsIssued;

  let essentialsSupply = 0;
  let essentialsTraded = 0;
  for (const commodity of ESSENTIALS) {
    const market = state.market[commodity];
    if (!market) continue;
    const reference = market.reference_price ?? market.price;
    essentialsSupply += (market.flow_supply_qty_turn || 0) * reference;
    essentialsTraded += (market.flow_traded_qty_turn || 0) * reference;
  }
  if (essentialsSupply <= 0) return;

  // The same extra credits put less pressure on prices when more essentials
  // are on offer or a smaller share of that supply is purchased.
  const utilization = Math.min(1, essentialsTraded / essentialsSupply);
  const target = 1 + Math.min(1, projects.activeProjectCredits * utilization / (essentialsSupply * SUPPLY_BUFFER_TURNS));
  projects.priceMultiplier += (target - projects.priceMultiplier) * PRICE_ADJUSTMENT_RATE;

  const market = state.market;
  market.price_by_commodity ??= {};
  market.last_price_by_commodity ??= {};
  for (const entry of Object.values(market)) {
    if (!entry?.commodity || !Number.isFinite(entry.price)) continue;
    entry.reference_price ??= entry.price;
    entry.last_price = entry.price;
    entry.price = entry.reference_price * projects.priceMultiplier;
    market.last_price_by_commodity[entry.commodity] = entry.last_price;
    market.price_by_commodity[entry.commodity] = entry.price;
  }
}
