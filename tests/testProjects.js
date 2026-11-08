import assert from 'node:assert/strict';
import { GameManager } from '../src/server/gameManager.js';
import { getLogger } from '../src/modules/logger.js';
import { createGameState, migrateGameState } from '../src/game/types.js';
import { loadResources } from '../src/game/economyTick/resources.js';
import { clearMarket, createMarketState } from '../src/game/marketEconomy.js';
import { getProjectDemandMultiplier, getProjectOutputMultiplier, updateProjectPrices } from '../src/game/projects.js';

getLogger().enableConsole = false;

const commodityKeys = loadResources().commodities.map(commodity => commodity.key);
const initial = createGameState(42);
assert.deepEqual(Object.keys(initial.projects.variants), commodityKeys);
assert.deepEqual(initial.projects.variants, createGameState(42).projects.variants);
assert.notDeepEqual(initial.projects.variants, createGameState(43).projects.variants);
assert.deepEqual(new Set(Object.values(initial.projects.variants)), new Set(['production', 'conservation']));
delete initial.projects;
assert.deepEqual(migrateGameState(initial).projects.variants, createGameState(42).projects.variants);

const buy = { id: 'project', commodity: 'biomass', qty: 5, filled_qty: 0, all_or_nothing: true, max_price: 2, priority: 1.5 };
const sell = { id: 'seller', commodity: 'biomass', qty: 4, filled_qty: 0, ask_price: 1, priority: 0 };
const book = createMarketState('biomass', 1);
assert.equal(clearMarket([buy], [sell], book).trades.length, 0);
assert.equal(sell.filled_qty, 0, 'a Project cannot consume a partial delivery');
sell.qty = 5;
sell.ask_price = 3;
assert.equal(clearMarket([buy], [sell], book).trades.length, 0, 'the Project honors its price cap');

const game = new GameManager();
game.initializeNewGame(42);
const biomass = () => game.getGameState().projects.options.find(project => project.commodity === 'biomass');
const nextOrder = () => ({ commodity: 'biomass', targetLevel: biomass().level + 1, maxCredits: biomass().credits });
const opening = nextOrder();
assert.match(game.handleProjectAction({ ...opening, maxCredits: 0 }).error, /price changed/);
const stockpiles = structuredClone(game.state.stockpiles);
const finances = { ...game.state.coalitionEconomy };
assert(game.handleProjectAction(opening).log);
assert.match(game.handleProjectAction(opening).error, /already awaiting/);
assert.equal(game.state.projects.creditsIssued, 0);
assert.deepEqual(game.state.stockpiles, stockpiles);
assert.deepEqual(game.state.coalitionEconomy, finances);

game.loadSaveState(game.getSaveState());
assert(biomass().pending);
assert(game.advanceTurnManually().success);
assert.equal(biomass().pending, false);
assert.equal(biomass().level, 1);
assert(game.state.projects.creditsIssued > 0 && game.state.projects.creditsIssued <= opening.maxCredits);
assert.deepEqual(game.state.stockpiles, stockpiles);
assert.equal(game.state.coalitionEconomy.treasury_credits, finances.treasury_credits);
assert.match(game.handleProjectAction(opening).error, /level changed/);
assert(game.handleProjectAction(nextOrder()).log);
assert(game.advanceTurnManually().success);
assert.equal(biomass().level, 2);
assert.deepEqual(game.state.projects.variants, createGameState(42).projects.variants);
if (biomass().variant === 'production') {
  assert.equal(getProjectOutputMultiplier(game.state, 'biomass'), 1.1);
} else {
  assert.equal(getProjectDemandMultiplier(game.state, 'biomass'), 1 / 1.1);
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
