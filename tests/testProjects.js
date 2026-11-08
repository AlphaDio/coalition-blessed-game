import assert from 'node:assert/strict';
import { GameManager } from '../src/server/gameManager.js';
import { getLogger } from '../src/modules/logger.js';
import { createGameState, migrateGameState } from '../src/game/types.js';
import { loadResources } from '../src/game/economyTick/resources.js';
import { clearMarket, createMarketState } from '../src/game/marketEconomy.js';
import { createOrderAggregator } from '../src/game/economyTick/orders.js';
import { createProjectOrders, fundProject, getProjectBonus, settleProjectOrders, updateProjectPrices } from '../src/game/projects.js';

getLogger().enableConsole = false;

const commodityKeys = loadResources().commodities.map(commodity => commodity.key);
const initial = createGameState(42);
assert.deepEqual(Object.keys(initial.projects.variants), commodityKeys);
assert.deepEqual(initial.projects.variants, createGameState(42).projects.variants);
assert.notDeepEqual(initial.projects.variants, createGameState(43).projects.variants);
assert.deepEqual(new Set(Object.values(initial.projects.variants)), new Set(['production', 'conservation']));
delete initial.projects;
assert.deepEqual(migrateGameState(initial).projects.variants, createGameState(42).projects.variants);

{
  const book = createMarketState('biomass', 14.821);
  const automatic = { id: 'buy_0', owner_type: 'empire', commodity: 'biomass', qty: 5, max_price: 14.795,
    priority: 0, age: 4, source: { type: 'empire_demand' } };
  const explicit = { ...automatic, id: 'manual' };
  const ask = { id: 'ask', commodity: 'biomass', qty: 5, ask_price: 14.821, priority: 0 };
  const state = { turn: 10, market: { biomass: book }, marketOrders: { buyOrders: [automatic, explicit] } };
  createOrderAggregator(state);
  assert.equal(automatic.max_price, 14.821);
  assert.equal(automatic.age, 4);
  assert.equal(explicit.max_price, 14.795);
  assert.equal(clearMarket([automatic, explicit], [ask], book).trades[0].buy_order_id, automatic.id);
}

const game = new GameManager();
game.initializeNewGame(42);
const biomass = () => game.getGameState().projects.options.find(project => project.commodity === 'biomass');
const nextOrder = () => ({ commodity: 'biomass', targetLevel: biomass().level + 1, maxCredits: biomass().credits });
const opening = nextOrder();
assert.match(game.handleProjectAction({ ...opening, maxCredits: 0 }).error, /price changed/);
const stockpiles = structuredClone(game.state.stockpiles);
const finances = { ...game.state.coalitionEconomy };
assert(game.handleProjectAction(opening).log);
assert.match(game.handleProjectAction(opening).error, /already underway/);
assert.equal(game.state.projects.creditsIssued, 0);
assert.deepEqual(game.state.stockpiles, stockpiles);
assert.deepEqual(game.state.coalitionEconomy, finances);

game.loadSaveState(game.getSaveState());
assert(biomass().pending);
assert(game.advanceTurnManually().success);
assert.equal(biomass().level, 0);
assert.equal(biomass().progress, 1);
assert(game.advanceTurnManually().success);
assert.equal(biomass().pending, false);
assert.equal(biomass().level, 1);
assert(game.state.projects.creditsSpentLastTick > 0);
assert.equal(game.state.projects.creditsIssued, 0, 'Existing Treasury Credits fund the purchase first');
const treasuryBeforeUpkeep = game.state.coalitionEconomy.treasury_credits;
assert(game.advanceTurnManually().success);
const { creditsSpentLastTick } = game.state.projects;
assert(creditsSpentLastTick > 0, 'completed projects buy upkeep each turn');
assert.equal(game.state.coalitionEconomy.treasury_credits,
  treasuryBeforeUpkeep + game.state.marketFeesLastTick - creditsSpentLastTick + game.state.marketTaxLastTick);
assert.equal(biomass().level, 1);
assert(getProjectBonus(game.state, 'population') > 0, 'both Biomass Projects boost population growth');
assert(game.handleProjectAction({ commodity: 'biomass', action: 'pause' }).log);
assert(game.advanceTurnManually().success);
assert.equal(game.state.projects.creditsSpentLastTick, 0);
assert.equal(game.state.projects.creditsIssuedLastTick, 0);
assert.deepEqual(game.state.projects.marketLastTick, {});
assert.equal(getProjectBonus(game.state, 'population'), 0);
assert.deepEqual(game.state.stockpiles, stockpiles);
assert.deepEqual(game.state.projects.variants, createGameState(42).projects.variants);

{
  const state = createGameState(42);
  state.market = { biomass: createMarketState('biomass', 1) };
  state.projects.variants.biomass = 'production';
  state.projects.levels.biomass = 9;
  assert(fundProject(state, { commodity: 'biomass', targetLevel: 10, maxCredits: 50 }).log);
  const deliver = amount => {
    const [order] = createProjectOrders(state);
    order.filled_qty = amount;
    settleProjectOrders(state, [order], [{ buy_order_id: order.id, qty: amount, price: 1 }]);
  };
  deliver(45);
  assert.equal(state.projects.pending.biomass.progress, 0, 'ordinary upkeep takes priority over upgrade work');
  for (let i = 0; i < 19; i++) deliver(50);
  assert.equal(state.projects.levels.biomass, 9);
  deliver(50);
  assert.equal(state.projects.levels.biomass, 10);
  assert.equal(getProjectBonus(state, 'population'), 1.1);
  assert.equal(createProjectOrders(state)[0].qty, 50);
  deliver(25);
  assert.equal(getProjectBonus(state, 'population'), 0.55, 'partial upkeep scales the level effect');
  assert.match(fundProject(state, { commodity: 'biomass', targetLevel: 11, maxCredits: 55 }).error, /Maximum/);
}

function testPriceResponse(supply) {
  const state = createGameState(0);
  state.empires = [{ budget_credits: 200 }];
  state.projects.creditsIssued = 100;
  state.market = { biomass: { ...createMarketState('biomass', 1), flow_supply_qty_turn: supply, flow_traded_qty_turn: 10 } };
  updateProjectPrices(state);
  return state;
}
const tight = testPriceResponse(10);
const slack = testPriceResponse(40);
assert(tight.market.biomass.price > slack.market.biomass.price);
assert(tight.market.biomass.price > 1);
assert.equal(tight.market.biomass.reference_price, 1);
tight.empires[0].budget_credits = 0;
updateProjectPrices(tight);
assert.equal(tight.projects.activeProjectCredits, 0);
assert(tight.market.biomass.price < tight.market.biomass.last_price, 'draining credits eases price pressure');

console.log('Project selection, procurement, progression, and price response tests passed.');
