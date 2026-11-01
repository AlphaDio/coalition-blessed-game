import { loadResources } from './resources.js';

export const PERSISTENCE_POLICIES = Object.freeze({
  PERISHABLE: 'perishable',
  DEFERRED: 'deferred',
  PERSISTENT: 'persistent'
});

const DEFAULT_BACKLOG_AGES = Object.freeze({
  [PERSISTENCE_POLICIES.PERISHABLE]: 1,
  [PERSISTENCE_POLICIES.DEFERRED]: 3,
  [PERSISTENCE_POLICIES.PERSISTENT]: null
});

const FALLBACK_RESOURCE_POLICIES = Object.freeze({
  biomass: PERSISTENCE_POLICIES.PERISHABLE,
  plasma_fuel: PERSISTENCE_POLICIES.DEFERRED,
  super_alloys: PERSISTENCE_POLICIES.PERSISTENT,
  rare_gases: PERSISTENCE_POLICIES.DEFERRED,
  genomes: PERSISTENCE_POLICIES.PERSISTENT,
  ancient_relics: PERSISTENCE_POLICIES.PERSISTENT,
  psycho_implants: PERSISTENCE_POLICIES.DEFERRED,
  nano_machines: PERSISTENCE_POLICIES.DEFERRED,
  quantum_circuits: PERSISTENCE_POLICIES.DEFERRED,
  sentient_cores: PERSISTENCE_POLICIES.PERSISTENT,
  wormhole_reactors: PERSISTENCE_POLICIES.PERSISTENT,
  dark_matter: PERSISTENCE_POLICIES.PERSISTENT,
  anti_grav_modules: PERSISTENCE_POLICIES.PERSISTENT
});

function asPositiveNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizePolicy(value, fallback = PERSISTENCE_POLICIES.DEFERRED) {
  return Object.values(PERSISTENCE_POLICIES).includes(value) ? value : fallback;
}

function getCommodityDefinition(commodity) {
  return (loadResources().commodities || []).find(resource => resource.key === commodity) || null;
}

export function getPersistencePolicy(commodity, order = null) {
  const definition = getCommodityDefinition(commodity);
  const requested = order?.persistence_policy ?? order?.persistencePolicy;
  return normalizePolicy(
    requested,
    normalizePolicy(
      definition?.persistence_policy,
      FALLBACK_RESOURCE_POLICIES[commodity] || PERSISTENCE_POLICIES.DEFERRED
    )
  );
}

export function getMaxBacklogAge(commodity, policy, order = null) {
  if (policy === PERSISTENCE_POLICIES.PERSISTENT) return null;

  const definition = getCommodityDefinition(commodity);
  const configured = order?.max_backlog_age ?? order?.maxBacklogAge ??
    definition?.max_backlog_age;
  const fallback = DEFAULT_BACKLOG_AGES[policy];
  return Math.max(1, Math.floor(asPositiveNumber(configured, fallback)));
}

export function getPressureConfig(commodity) {
  const definition = getCommodityDefinition(commodity);
  const configured = definition?.pressure;

  if (typeof configured === 'string') {
    return { key: configured, weight: 1 };
  }

  if (configured && typeof configured === 'object') {
    return {
      key: configured.key || `${commodity}_pressure`,
      weight: asPositiveNumber(configured.weight, 1)
    };
  }

  return { key: `${commodity}_pressure`, weight: 1 };
}

function getOrderSource(order) {
  if (order?.source !== undefined && order.source !== null) return order.source;

  const tags = order?.tags || {};
  if (tags.army_id) {
    return {
      type: 'army_demand',
      id: tags.army_id,
      category: order.category || 'needs'
    };
  }

  if (tags.purpose === 'improvement_sustainment_pool') {
    return {
      type: 'improvement_sustainment',
      id: tags.improvement_id || order.owner_id,
      category: order.category || 'needs'
    };
  }

  return {
    type: `${order?.owner_type || 'unknown'}_demand`,
    id: order?.owner_id || null,
    category: order?.category || 'needs'
  };
}

function getRemainingQty(order) {
  if (Number.isFinite(Number(order?.qty))) {
    return Math.max(0, Number(order.qty) - (Number(order?.filled_qty) || 0));
  }
  const explicit = Number(order?.quantity_remaining ?? order?.qty_remaining);
  return Number.isFinite(explicit) ? Math.max(0, explicit) : 0;
}

function getEntityById(state, sourceType, id) {
  if (!id) return null;
  if (sourceType.includes('army')) {
    return (state.armies || []).find(army => army.id === id) || null;
  }
  if (sourceType.includes('improvement')) {
    return (state.improvements?.queue || []).find(improvement => improvement.id === id) || null;
  }
  return (state.empires || []).find(empire => empire.id === id) || null;
}

function hasActiveDemand(state, order, source) {
  const category = order.category === 'wants' ? 'wants' : 'needs';
  const commodity = order.commodity;

  if (source.type === 'army_demand') {
    const army = getEntityById(state, 'army', source.id);
    if (!army) return false;
    const demandMap = army.supply_state?.[category === 'wants' ? 'wants_demand' : 'needs_demand'];
    if (demandMap && Object.prototype.hasOwnProperty.call(demandMap, commodity)) {
      return asPositiveNumber(demandMap[commodity]) > 0;
    }
    return Object.prototype.hasOwnProperty.call(army.demands?.[category] || {}, commodity);
  }

  if (source.type === 'improvement_sustainment') {
    const improvements = state.improvements?.queue || [];
    return improvements.some(improvement =>
      (improvement.id === source.id || improvement.empireId === source.id) &&
      (improvement.state === 'ACTIVE' || improvement.state === 'DEGRADED') &&
      asPositiveNumber(improvement.sustainmentCost?.[commodity]) > 0
    );
  }

  if (source.type === 'empire_demand') {
    const empire = getEntityById(state, 'empire', source.id);
    if (!empire) return false;
    const demandMap = empire.supply_state?.[category === 'wants' ? 'wants_demand' : 'needs_demand'];
    if (demandMap && Object.prototype.hasOwnProperty.call(demandMap, commodity)) {
      return asPositiveNumber(demandMap[commodity]) > 0;
    }
    return Object.prototype.hasOwnProperty.call(empire[category]?.per_pop || {}, commodity);
  }

  return true;
}

export function isBacklogSourceValid(order, state) {
  if (order?.source_valid === false) return false;
  if (!order?.conditional) return true;

  const source = order.source || getOrderSource(order);
  if (!source || typeof source !== 'object') return true;
  if (source.type === 'coalition_demand') return true;
  if (source.type === 'army_demand' || source.type === 'empire_demand' || source.type === 'improvement_sustainment') {
    return hasActiveDemand(state, order, source);
  }

  // Unknown source types are externally-managed commitments. They remain
  // valid unless the producer explicitly marks them invalid.
  return order.source_valid !== false;
}

export function markDemandBacklogOrder(order, source = null, options = {}) {
  order.backlog_managed = true;
  order.conditional = options.conditional !== false;
  order.source = source || getOrderSource(order);
  order.source_check = options.source_check || 'demand';
  order.source_valid_locked = Boolean(options.source_valid_locked);
  order.age = Number.isFinite(Number(order.age)) ? Math.max(0, Math.floor(Number(order.age))) : 0;
  order.backlog_age = order.age;
  order.qty_remaining = getRemainingQty(order);
  order.quantity_remaining = order.qty_remaining;
  return order;
}

export function isDemandBacklogOrder(order) {
  return Boolean(order?.backlog_managed || order?.persistence_policy || order?.backlog_age !== undefined);
}

export function normalizeBacklogOrder(order, state) {
  if (!isDemandBacklogOrder(order)) return order;

  const policy = getPersistencePolicy(order.commodity, order);
  const maxAge = getMaxBacklogAge(order.commodity, policy, order);
  const currentAge = Number.isFinite(Number(order.age))
    ? Number(order.age)
    : (Number.isFinite(Number(order.backlog_age)) ? Number(order.backlog_age) : 0);

  order.backlog_managed = true;
  order.persistence_policy = policy;
  order.max_backlog_age = maxAge;
  order.max_duration = maxAge;
  order.source = order.source || getOrderSource(order);
  order.source_valid = isBacklogSourceValid(order, state);
  order.age = Math.max(0, Math.floor(currentAge));
  order.backlog_age = order.age;
  order.duration = order.age;
  order.qty_remaining = getRemainingQty(order);
  order.quantity_remaining = order.qty_remaining;
  order.pressure = getPressureConfig(order.commodity);
  return order;
}

function ensurePressureState(state) {
  const pressure = state.economyPressure || state.pressure || {};
  if (!pressure.by_resource || typeof pressure.by_resource !== 'object') pressure.by_resource = {};
  if (!pressure.by_type || typeof pressure.by_type !== 'object') pressure.by_type = {};
  if (!Number.isFinite(pressure.total)) pressure.total = 0;
  if (!Array.isArray(pressure.last_expired)) pressure.last_expired = [];
  if (!Array.isArray(pressure.history)) pressure.history = [];
  state.economyPressure = pressure;
  state.pressure = pressure;
  return pressure;
}

export function addPressure(state, commodity, quantity, source = null, metadata = {}) {
  const unresolved = asPositiveNumber(quantity);
  if (unresolved <= 0) return 0;

  const pressure = ensurePressureState(state);
  const config = getPressureConfig(commodity);
  // Unmet optional consumption is less urgent than essential needs and upkeep.
  const amount = unresolved * config.weight * (source?.category === 'wants' ? 0.05 : 1);
  pressure.by_resource[commodity] = (pressure.by_resource[commodity] || 0) + amount;
  pressure.by_type[config.key] = (pressure.by_type[config.key] || 0) + amount;
  pressure.total += amount;

  const event = {
    turn: state.turn,
    resource: commodity,
    pressure: config.key,
    quantity: unresolved,
    amount,
    source: source || null,
    persistence_policy: metadata.persistence_policy || metadata.persistencePolicy || null,
    resource_type: metadata.resource_type || metadata.resourceType || null
  };
  pressure.last_expired.push(event);
  pressure.history.push(event);
  if (pressure.last_expired.length > 100) pressure.last_expired.splice(0, pressure.last_expired.length - 100);
  if (pressure.history.length > 500) pressure.history.splice(0, pressure.history.length - 500);
  return amount;
}

export function finalizeBacklogOrders(state, orders) {
  const activeOrders = [];
  const expiredOrders = [];
  const cancelledOrders = [];
  const pressureEvents = [];
  const pressure = ensurePressureState(state);
  const expiredBeforeFinalize = Array.isArray(state.economyBacklogExpiredLastTick)
    ? state.economyBacklogExpiredLastTick
    : [];
  const pressureEventsBeforeFinalize = [...pressure.last_expired];
  const cancelledBeforeFinalize = Array.isArray(state.economyBacklogCancelledLastTick)
    ? state.economyBacklogCancelledLastTick
    : [];
  pressure.last_expired = [];
  pressureEventsBeforeFinalize.forEach(event => pressure.last_expired.push(event));

  for (const order of orders || []) {
    if (!isDemandBacklogOrder(order)) {
      if (getRemainingQty(order) > 0) activeOrders.push(order);
      continue;
    }

    normalizeBacklogOrder(order, state);
    const remaining = getRemainingQty(order);
    if (remaining <= 0) continue;

    if (!order.source_valid) {
      cancelledOrders.push(order);
      continue;
    }

    const nextAge = order.age + 1;
    order.age = nextAge;
    order.backlog_age = nextAge;
    order.duration = nextAge;
    order.qty_remaining = remaining;
    order.quantity_remaining = remaining;

    if (order.persistence_policy !== PERSISTENCE_POLICIES.PERSISTENT &&
        Number.isFinite(order.max_backlog_age) && nextAge >= order.max_backlog_age) {
      const pressureAmount = addPressure(state, order.commodity, remaining, order.source, {
        persistence_policy: order.persistence_policy
      });
      const event = {
        order,
        resource: order.commodity,
        quantity: remaining,
        pressure: order.pressure?.key || getPressureConfig(order.commodity).key,
        amount: pressureAmount
      };
      expiredOrders.push(order);
      pressureEvents.push(event);
      continue;
    }

    activeOrders.push(order);
  }

  state.economyBacklogExpiredLastTick = [
    ...expiredBeforeFinalize,
    ...expiredOrders.map(order => ({
      id: order.id,
      resource: order.commodity,
      quantity: order.quantity_remaining,
      source: order.source,
      pressure: order.pressure?.key || getPressureConfig(order.commodity).key
    }))
  ];
  state.economyBacklogCancelledLastTick = [
    ...cancelledBeforeFinalize,
    ...cancelledOrders.map(order => ({
    id: order.id,
    resource: order.commodity,
    quantity: order.quantity_remaining,
    source: order.source
    }))
  ];

  return { activeOrders, expiredOrders, cancelledOrders, pressureEvents };
}

export function updateBacklogSnapshot(state, activeOrders) {
  const backlog = (activeOrders || [])
    .filter(order => getRemainingQty(order) > 0)
    .map(order => ({
      ...order,
      resource: order.commodity,
      qty_remaining: getRemainingQty(order),
      quantity_remaining: getRemainingQty(order),
      age: Number.isFinite(Number(order.age)) ? Number(order.age) : 0
    }));
  state.economyBacklog = backlog;
  return backlog;
}

export function refreshMarketBacklogSnapshots(state, activeOrders) {
  if (!state.market) return;
  const byCommodity = {};
  const byCommodityAndOwner = {};
  const rootRemaining = [];

  for (const order of activeOrders || []) {
    const remaining = getRemainingQty(order);
    if (remaining <= 0) continue;
    const snapshot = { ...order, remaining };
    rootRemaining.push(snapshot);
    byCommodity[order.commodity] = (byCommodity[order.commodity] || 0) + remaining;
    const ownerKey = order.owner_id || 'unknown';
    byCommodityAndOwner[order.commodity] ||= {};
    byCommodityAndOwner[order.commodity][ownerKey] =
      (byCommodityAndOwner[order.commodity][ownerKey] || 0) + remaining;

    if (state.market[order.commodity]) {
      state.market[order.commodity].remaining_buy_offers_post_clear =
        state.market[order.commodity].remaining_buy_offers_post_clear || [];
    }
  }

  Object.entries(state.market).forEach(([key, marketState]) => {
    if (!marketState || typeof marketState !== 'object' || !marketState.commodity) return;
    const ordersForCommodity = rootRemaining.filter(order => order.commodity === key);
    marketState.remaining_buy_offers_post_clear = ordersForCommodity;
    marketState.buy_backlog_total = byCommodity[key] || 0;
  });

  state.market.remaining_buy_offers_post_clear = rootRemaining;
  state.market.buy_backlog_by_commodity = byCommodity;
  state.market.buy_backlog_by_commodity_and_owner = byCommodityAndOwner;
}

export function ensureEconomyPressureState(state) {
  return ensurePressureState(state);
}
