import assert from 'node:assert/strict';
import { createSampleContent } from '../src/game/content.js';
import { createEmpire, createGameState, migrateGameState } from '../src/game/types.js';
import { initializeMarket } from '../src/game/marketEconomy.js';
import { loadResources } from '../src/game/economyTick/resources.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import {
  getAllImprovementRequests, createImprovement, createImprovementRequestInstance, initializeImprovementsState,
  processImprovementsTick, processImprovementSustainmentPostMarket
} from '../src/game/improvements/index.js';
import { processEmpireStockpileConsumption } from '../src/game/turn/economyPhase.js';
import { initializeTurnConsumptionTracking, getEmpireTurnConsumptionByCommodity, CONSUMPTION_SOURCES } from '../src/game/consumptionToRequisition.js';
import { GameManager } from '../src/server/gameManager.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { IMPROVEMENTS_CONSTANTS } from '../src/game/constants.js';

initializeLogger({ level: LogLevel.ERROR, enableConsole: false, enableFile: false, enableUI: false });
const content = createSampleContent(7);
const definitions = getAllImprovementRequests();
const resources = loadResources().commodities;
const resourceKeys = new Set(resources.map(resource => resource.key));
assert.equal(new Set(definitions.map(project => project.id)).size, definitions.length, 'Project IDs are unique');
assert.deepEqual(definitions.filter(project => project.productionOutputs?.biomass > 0).map(project => project.id).sort(),
  ['biofuel_refinery', 'civilization_hub', 'mycellium_grove'], 'Exactly three improvements produce biomass');

// Follow production from the starting empires through buildable project inputs.
// Each unlock tier also needs enough reachable projects in the preceding tier.
const reachable = new Set(content.empires.flatMap(empire => Object.entries(empire.production.outputs_per_tick)
  .filter(([, amount]) => amount > 0).map(([key]) => key)));
const buildable = new Set();
let changed = true;
while (changed) {
  changed = false;
  for (const project of definitions) {
    if (buildable.has(project.id)) continue;
    const previousCount = definitions.filter(candidate => buildable.has(candidate.id) && candidate.tier === project.tier - 1).length;
    const tierReady = project.tier === 1 || (project.tier === 2 ? previousCount >= 2 : previousCount >= 3);
    if (!tierReady || Object.keys(project.sustainmentCost || {}).some(key => key !== 'requisition' && !reachable.has(key))) continue;
    buildable.add(project.id);
    for (const [key, qty] of Object.entries(project.productionOutputs || {})) {
      if (qty > 0 && key !== 'requisition') reachable.add(key);
    }
    changed = true;
  }
}

for (const resource of resources) {
  const key = resource.key;
  assert(reachable.has(key), `${key} has a reachable producer`);
  const consumers = [
    ...content.empires.map(empire => (empire.needs.per_pop[key] || 0) + (empire.wants.per_pop[key] || 0)),
    ...content.armies.map(army => (army.demands?.needs?.[key] || 0) + (army.demands?.wants?.[key] || 0)),
    ...definitions.filter(project => buildable.has(project.id)).map(project => project.sustainmentCost?.[key] || 0)
  ];
  assert(consumers.some(amount => amount > 0), `${key} has an actual reachable consumer`);
}
const capacityBonus = Math.max(0, ...definitions
  .filter(project => project.tier === 1 && buildable.has(project.id))
  .map(project => project.modifiers?.improvement_queue_capacity || 0));
for (const project of definitions) {
  assert(buildable.has(project.id), `${project.name} has a reachable path to all its inputs`);
  assert(project.capacity <= IMPROVEMENTS_CONSTANTS.INITIAL_MAX_TOTAL_CAPACITY + capacityBonus,
    `${project.name} can fit in reachable construction capacity`);
  for (const key of [...Object.keys(project.sustainmentCost || {}), ...Object.keys(project.productionOutputs || {})]) {
    assert(key === 'requisition' || resourceKeys.has(key), `${project.name} references known resource ${key}`);
  }
}
for (const army of content.armies) {
  for (const key of [...Object.keys(army.demands?.needs || {}), ...Object.keys(army.demands?.wants || {})]) {
    assert(resourceKeys.has(key), `${army.name} demands a defined resource: ${key}`);
  }
  for (const rule of army.consumptionRules || []) {
    assert(resourceKeys.has(rule.commodity), `${army.name} has a defined resource for its consumption effect`);
    assert((army.demands?.needs?.[rule.commodity] || 0) > 0 || (army.demands?.wants?.[rule.commodity] || 0) > 0,
      `${army.name} can consume ${rule.commodity} for its effect`);
  }
}
for (const empire of content.empires) {
  for (const key of Object.keys(empire.production.outputs_per_tick)) {
    assert(resourceKeys.has(key), `${empire.name} produces a defined resource: ${key}`);
  }
  for (const key of [...Object.keys(empire.needs.per_pop), ...Object.keys(empire.wants.per_pop)]) {
    assert(resourceKeys.has(key), `${empire.name} demands a defined resource: ${key}`);
  }
  for (const rule of empire.consumptionRules || []) {
    assert(resourceKeys.has(rule.commodity), `${empire.name} has a defined resource for its consumption effect`);
    assert((empire.needs.per_pop[rule.commodity] || 0) > 0 || (empire.wants.per_pop[rule.commodity] || 0) > 0 ||
      definitions.some(project => buildable.has(project.id) && (project.sustainmentCost?.[rule.commodity] || 0) > 0),
    `${empire.name} can consume ${rule.commodity} for its effect`);
  }
}

for (const seed of [0, 1, 7, 42, 123, 987]) {
  const manager = new GameManager();
  manager.initializeNewGame(seed);
  const requests = manager.state.improvements.requests;
  const biomassOptions = new Set(requests.filter(request => request.tier === 1 && request.productionOutputs?.biomass > 0)
    .map(request => request.definitionId));
  assert(biomassOptions.size >= 2, `Seed ${seed} offers a choice of early biomass projects`);
  assert(requests.some(request => request.tier === 1 && request.productionOutputs?.biomass > 0 &&
    !(request.sustainmentCost?.biomass > 0)), `Seed ${seed} offers a biomass producer that does not consume biomass`);
  assert(biomassOptions.has('biofuel_refinery'), `Seed ${seed} offers the industrial biomass option`);
  for (const empire of manager.state.empires) {
    assert.equal(requests.filter(request => request.empireId === empire.id).length, 3);
  }
}

function economyState() {
  const state = createGameState(7);
  state.turn = 2;
  state.empires = [createEmpire('test', 'Test Empire', 60, {}, {}, { population: 1000 })];
  state.armies = [];
  state.market = initializeMarket(resources, () => 0.5);
  state.improvements = initializeImprovementsState();
  return state;
}

for (const [id, commodity] of [
  ['nano_lattice_plant', 'nano_machines'],
  ['circuit_synthesis_lab', 'quantum_circuits'],
  ['genomic_lab', 'genomes'],
  ['relic_shrine', 'ancient_relics'],
  ['intelligence_bureau', 'sentient_cores']
]) {
  const definition = definitions.find(project => project.id === id);
  assert.equal(definition.tier, 1);
  assert(definition.productionOutputs[commodity] > 0);
  assert(Object.keys(definition.sustainmentCost).every(key => ['biomass', 'plasma_fuel', 'rare_gases', 'super_alloys'].includes(key)),
    `${definition.name} can supply ${commodity} using only basic inputs`);
}

for (const [id, retiredUpkeep] of [
  ['nano_lattice_plant', { nano_machines: 1 }],
  ['nano_logistics_hub', { rare_gases: 3 }],
  ['wealth_singularity', { quantum_circuits: 6, psycho_implants: 7 }]
]) {
  const definition = definitions.find(project => project.id === id);
  const state = economyState();
  const legacyDefinition = { ...definition, sustainmentCost: { ...definition.sustainmentCost, ...retiredUpkeep } };
  const request = createImprovementRequestInstance(legacyDefinition, 'test', state.turn, () => 0.5);
  const improvement = createImprovement(request.id, 'test', state.turn, request);
  state.improvements.requests.push(request);
  state.improvements.queue.push(improvement);

  const migrated = migrateGameState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(migrated.improvements.requests[0].sustainmentCost, definition.sustainmentCost);
  assert.deepEqual(migrated.improvements.queue[0].sustainmentCost, definition.sustainmentCost);
}

function activeProject(id, owner = 'test') {
  const definition = definitions.find(project => project.id === id);
  assert(definition, `Missing project ${id}`);
  const project = createImprovement(id, owner, 1, { ...definition, id: `${id}_${owner}` });
  project.state = 'ACTIVE';
  project.completedAtTick = 1;
  return project;
}

function tick(state) {
  initializeTurnConsumptionTracking();
  processImprovementsTick(state);
  processEconomyTick(state);
  processImprovementSustainmentPostMarket(state);
  const consumption = getEmpireTurnConsumptionByCommodity('test', [CONSUMPTION_SOURCES.IMPROVEMENT_SUSTAINMENT]);
  processEmpireStockpileConsumption(state, []);
  state.turn++;
  return consumption;
}

{
  const state = economyState();
  state.empires[0].production.outputs_per_tick = { super_alloys: 1, plasma_fuel: 1, rare_gases: 1, genomes: 1 };
  state.empires[0].needs.per_pop.biomass = 0.01;
  state.improvements.queue = [activeProject('biofuel_refinery')];
  let biomassTraded = 0;
  for (let i = 0; i < 60; i++) {
    tick(state);
    biomassTraded += state.market.biomass.flow_traded_qty_turn || 0;
  }
  assert.equal(state.improvements.queue[0].state, 'ACTIVE', 'The biofuel refinery can be sustained');
  assert(biomassTraded > 0, 'The biofuel refinery supplies biomass to actual consumers');
}

// These projects form a biomass/fuel loop without external biomass or fuel.
// Rare gases remain available while the loop operates.
for (const ids of [
  ['mycellium_grove', 'fuel_extractor'],
  ['fuel_extractor', 'mycellium_grove']
]) {
  const state = economyState();
  state.empires[0].production.outputs_per_tick = { rare_gases: 0.1 };
  state.improvements.queue = ids.map(id => activeProject(id));
  let biomassUsed = 0;
  let fuelUsed = 0;
  let biomassOffered = 0;
  for (let i = 0; i < 45; i++) {
    const consumption = tick(state);
    biomassUsed += consumption.biomass || 0;
    fuelUsed += consumption.plasma_fuel || 0;
    biomassOffered += state.market.biomass.flow_supply_qty_turn || 0;
  }
  assert(state.improvements.queue.every(project => project.state === 'ACTIVE'), 'Mutually supporting projects remain active');
  assert(biomassUsed > 30 && fuelUsed > 30, 'Both inputs are really consumed');
  assert(biomassOffered > 0, 'The loop produces biomass beyond its own upkeep');
  state.improvements.queue = state.improvements.queue.filter(project => project.definitionId !== 'fuel_extractor');
  state.empires[0].production.outputs_per_tick = {};
  state.marketOrders.sellOffers = state.marketOrders.sellOffers.filter(order => !['plasma_fuel', 'rare_gases'].includes(order.commodity));
  for (let i = 0; i < 25; i++) tick(state);
  assert.equal(state.improvements.queue[0].state, 'DEGRADED', 'Losing both upkeep sources still has consequences');
}

for (const scenario of [
  { producer: 'exotic_matter_fabricator', consumer: 'imperial_fortress', resource: 'dark_matter' },
  { producer: 'anti_grav_assembly', consumer: 'dyson_harvester', resource: 'anti_grav_modules', support: 'exotic_matter_fabricator' },
  { producer: 'anti_grav_assembly', consumer: 'nano_logistics_hub', resource: 'anti_grav_modules', support: 'exotic_matter_fabricator' }
]) {
  const state = economyState();
  state.empires[0].production.outputs_per_tick = {
    super_alloys: 1, quantum_circuits: 1, genomes: 1, plasma_fuel: 1, nano_machines: 1, wormhole_reactors: 1, rare_gases: 1
  };
  if (scenario.resource === 'anti_grav_modules') {
    state.empires[0].consumptionRules = [{ commodity: scenario.resource, threshold: 1,
      effect: { type: 'coalition_construction_bonus', amount: 3 } }];
  }
  state.improvements.queue = [activeProject(scenario.consumer), activeProject(scenario.producer)];
  if (scenario.support) state.improvements.queue.push(activeProject(scenario.support));
  let consumed = 0;
  for (let i = 0; i < 45; i++) consumed += tick(state)[scenario.resource] || 0;
  assert(consumed > 1, `${scenario.resource} output is used for real upkeep`);
  assert(state.improvements.queue.every(project => project.state === 'ACTIVE'), `${scenario.resource} chain remains operational`);
  if (scenario.resource === 'anti_grav_modules') assert(state.coalitionConstruction > 4, 'Anti-grav consumption can trigger its construction effect');
}

// Also exercise the full market path between empires; an input path that only
// works for a producer and consumer owned by the same empire is insufficient.
for (const scenario of [
  { producer: 'exotic_matter_fabricator', consumer: 'imperial_fortress', resource: 'dark_matter' },
  { producer: 'anti_grav_assembly', consumer: 'dyson_harvester', resource: 'anti_grav_modules', support: 'exotic_matter_fabricator' },
  { producer: 'anti_grav_assembly', consumer: 'nano_logistics_hub', resource: 'anti_grav_modules', support: 'exotic_matter_fabricator' }
]) {
  const state = economyState();
  const basicProduction = {
    super_alloys: 1, quantum_circuits: 1, genomes: 1, plasma_fuel: 1, nano_machines: 1, wormhole_reactors: 1, rare_gases: 1
  };
  state.empires[0].production.outputs_per_tick = { ...basicProduction };
  state.empires.push(createEmpire('source', 'Source', 60, {}, {}, { population: 1000, production: { outputs_per_tick: { ...basicProduction } } }));
  state.improvements.queue = [activeProject(scenario.producer, 'source'), activeProject(scenario.consumer)];
  if (scenario.support) state.improvements.queue.push(activeProject(scenario.support, 'source'));
  let consumed = 0;
  let activeLate = 0;
  let firstDelivery = null;
  for (let i = 0; i < 200; i++) {
    const amount = tick(state)[scenario.resource] || 0;
    consumed += amount;
    if (amount > 0 && firstDelivery === null) firstDelivery = i + 1;
    if (i >= 120 && state.improvements.queue[1].state === 'ACTIVE') activeLate++;
  }
  assert(consumed > 1, `${scenario.resource} reaches another empire through the market`);
  assert(firstDelivery <= 15, `${scenario.resource} can reach another empire without a long banking delay (turn ${firstDelivery})`);
  assert(activeLate >= 50, `${scenario.resource} consumer can sustain ongoing operation`);
}

console.log('Resource cycle tests passed.');
