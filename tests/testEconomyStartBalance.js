import { GameManager } from '../src/server/gameManager.js';
import { processEconomyTick } from '../src/game/economyTick.js';
import { initializeStarterNeedsStockpiles } from '../src/game/economyTick/ordersPhase.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`✓ ${message}`);
  } else {
    failed += 1;
    console.log(`✗ ${message}`);
  }
}

function average(values) {
  const finiteValues = Object.values(values || {}).filter(value => Number.isFinite(value));
  return finiteValues.length > 0
    ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
    : 1;
}

console.log('=== Test: New Game Essential Needs Start Balance ===');

const manager = new GameManager();
manager.initializeNewGame(7);
const state = manager.state;

initializeStarterNeedsStockpiles(state);

for (const empire of state.empires) {
  const starterResources = Object.keys(empire.stockpiles || {});
  const needsResources = new Set(Object.keys(empire.needs?.per_pop || {}));
  const wantsResources = new Set(Object.keys(empire.wants?.per_pop || {}));

  assert(
    starterResources.every(resource => needsResources.has(resource) && !wantsResources.has(resource)),
    `${empire.name} starter stockpile contains needs only`
  );
}

processEconomyTick(state);

for (const empire of state.empires) {
  const needsAverage = average(empire.supply_state?.needs_fulfillment);
  const wantsValues = Object.values(empire.supply_state?.wants_fulfillment || {});
  const maximumWantFulfillment = wantsValues.length > 0 ? Math.max(...wantsValues) : 0;

  assert(
    needsAverage >= 0.70 && needsAverage <= 0.90,
    `${empire.name} starts with ${Math.round(needsAverage * 100)}% average essential-needs fulfillment`
  );
  assert(
    maximumWantFulfillment < 0.50,
    `${empire.name} advanced wants remain scarce at game start`
  );
}

assert(
  state.coalitionEconomy.starter_stockpiles_initialized === true &&
    state.coalitionEconomy.starter_stockpiles_turn === null,
  'Starter stockpiles are initialized once and consumed on the first economy tick'
);

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
