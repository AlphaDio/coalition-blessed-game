import { loadResources } from './economyTick/resources.js';
import { DeterministicRNG } from '../modules/rng.js';

const ESSENTIALS = ['super_alloys', 'biomass', 'plasma_fuel'];
const MATERIALS_BY_TIER = { t1: 5, t2: 1, t3: 0.5, t4: 0.25 };
const EFFECT_PER_LEVEL = 0.05;
const SUPPLY_BUFFER_TURNS = 20;
const PRICE_ADJUSTMENT_RATE = 0.2;

export function createProjectsState(seed) {
  const rng = new DeterministicRNG((seed || 0) + 58121);
  const variants = Object.fromEntries(loadResources().commodities.map(({ key }) =>
    [key, rng.choice(['production', 'conservation'])]));
  return { variants, levels: {}, pending: {}, creditsIssued: 0, priceMultiplier: 1 };
}

function campaignProjects(state) {
  return loadResources().commodities.filter(({ key }) => Object.hasOwn(state.projects.variants, key))
    .map(({ key, name, tier }) => {
      const variant = state.projects.variants[key];
      return { commodity: key, material: name, variant,
        name: `${name} ${variant === 'production' ? 'Expansion' : 'Conservation'}`,
        amount: MATERIALS_BY_TIER[tier] ?? 1 };
    });
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
  state.projects ??= createProjectsState(state.rngSeed);
  const projects = state.projects;
  projects.circulatingCredits = getCirculatingCredits(state);
  projects.options = campaignProjects(state).map(project => {
    const level = projects.levels[project.commodity] || 0;
    const pending = projects.pending[project.commodity];
    const credits = pending?.maxCredits ?? quoteProject(state, project);
    return { ...project, level, pending: Boolean(pending), effectPerLevel: EFFECT_PER_LEVEL, credits,
      reason: state.gameOver ? 'Game is over' : pending ? 'Awaiting market clearing' : credits === null ? 'Market unavailable' : null };
  });
}

export function fundProject(state, payload) {
  if (!state || state.gameOver) return { error: state ? 'Game is over' : 'Game is not initialized' };
  const projects = state.projects ??= createProjectsState(state.rngSeed);
  const project = campaignProjects(state).find(entry => entry.commodity === payload?.commodity);
  if (!project) return { error: 'Unknown Project' };
  if (projects.pending[project.commodity]) return { error: 'Project order already awaiting market clearing' };
  const level = projects.levels[project.commodity] || 0;
  if (payload.targetLevel !== level + 1) return { error: 'Project level changed. Review the current offer.' };
  const credits = quoteProject(state, project);
  if (credits === null) return { error: 'Market unavailable' };
  if (!Number.isFinite(payload.maxCredits) || credits > payload.maxCredits + 1e-9) {
    return { error: 'Project price changed. Review the current offer.' };
  }

  projects.pending[project.commodity] = { maxCredits: credits, targetLevel: level + 1 };
  return { log: `${project.name} ordered ${project.amount} ${project.material} for up to ${credits.toFixed(2)} Credits.` };
}

export function createProjectOrders(state) {
  const projects = state.projects;
  if (!projects || !Object.keys(projects.pending).length) return [];
  return campaignProjects(state).filter(project => projects.pending[project.commodity]).map(project => {
    const { maxCredits, targetLevel } = projects.pending[project.commodity];
    return {
      id: `project_${project.commodity}_${targetLevel}`, owner_type: 'project', owner_id: project.commodity,
      commodity: project.commodity, qty: project.amount, filled_qty: 0,
      max_price: maxCredits / project.amount, priority: 1.5, all_or_nothing: true,
      turn_added_qty: project.amount, turn_added_turn: state.turn,
      targetLevel, projectName: project.name
    };
  });
}

export function settleProjectOrders(state, orders, trades) {
  if (!orders.length) return [];
  const projects = state.projects;
  const issuedByOrder = new Map(orders.map(order => [order.id, 0]));
  for (const trade of trades) {
    if (!issuedByOrder.has(trade.buy_order_id)) continue;
    issuedByOrder.set(trade.buy_order_id, issuedByOrder.get(trade.buy_order_id) + trade.qty * trade.price);
  }
  const log = [];
  for (const order of orders) {
    delete projects.pending[order.commodity];
    if (order.filled_qty + 1e-9 < order.qty) {
      log.push(`${order.projectName} could not buy the full amount within its price limit.`);
      continue;
    }
    // Market settlement already credits the sellers. A Project order has no buyer account to debit.
    const issued = issuedByOrder.get(order.id);
    projects.levels[order.commodity] = order.targetLevel;
    projects.creditsIssued += issued;
    log.push(`${order.projectName} reached level ${order.targetLevel}. Issued ${issued.toFixed(2)} Credits.`);
  }
  return log;
}

export function getProjectOutputMultiplier(state, commodity) {
  if (state?.projects?.variants[commodity] !== 'production') return 1;
  return 1 + (state.projects.levels[commodity] || 0) * EFFECT_PER_LEVEL;
}

export function getProjectDemandMultiplier(state, commodity) {
  if (state?.projects?.variants[commodity] !== 'conservation') return 1;
  return 1 / (1 + (state.projects.levels[commodity] || 0) * EFFECT_PER_LEVEL);
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
