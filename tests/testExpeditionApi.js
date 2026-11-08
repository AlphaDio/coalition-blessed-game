import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApiServer } from '../src/server/api.js';
import { getLogger } from '../src/modules/logger.js';

// Exercise the real REST/WebSocket boundary with unmodified opening resources.
const logger = getLogger();
logger.enableConsole = false;
logger.enableFile = false;
const { httpServer, gameManager } = await createApiServer(0, 'http://localhost', 42);
const base = `http://127.0.0.1:${httpServer.address().port}`;
const socket = new WebSocket(base.replace('http', 'ws'));
const messages = [];
const launch = { action: 'launch', planId: 'frontier' };
socket.on('message', data => messages.push(JSON.parse(data.toString())));
const post = async payload => {
  const response = await fetch(`${base}/api/game/actions/expedition`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return { status: response.status, body: await response.json() };
};

try {
  await once(socket, 'open');
  const opening = gameManager.getGameState();
  const plans = opening.expeditions.options.filter(option => option.targetType === 'plan');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].disabled, false, 'The frontier expedition must be affordable in an actual new game');
  assert.deepEqual(plans[0].durationRange, { min: 10, max: 16 });
  assert.equal(plans[0].destinationKind, 'empire');
  const supplies = structuredClone(opening.stockpiles);
  const requisition = opening.coalitionEconomy.requisition;
  const malformed = await post({});
  assert.equal(malformed.status, 400);
  const unknown = await post({ action: 'launch', planId: 'invalid' });
  assert.equal(unknown.status, 400);
  assert.deepEqual(opening.stockpiles, supplies);

  const launched = await post(launch);
  assert.equal(launched.status, 200);
  assert.equal(launched.body.data.expeditions.active.length, 1);
  assert.equal(launched.body.data.stockpiles.biomass, supplies.biomass - 150);
  assert.equal(launched.body.data.coalitionEconomy.requisition, requisition);
  assert.equal((await post(launch)).status, 400);
  const { duration } = launched.body.data.expeditions.active[0];
  assert(duration >= plans[0].durationRange.min && duration <= plans[0].durationRange.max);
  for (let turn = 0; turn < duration; turn++) {
    assert.equal(gameManager.advanceTurnManually().success, true);
  }
  const contact = gameManager.getGameState().expeditions.empires[0];
  assert(contact, 'The ordinary turn pipeline returns the expedition');
  assert.equal(contact.interestRevealed, false);
  const envoy = await post({ action: 'envoy', targetId: contact.id });
  assert.equal(envoy.status, 200);
  assert.equal(envoy.body.data.expeditions.empires[0].interestRevealed, true);
  assert(envoy.body.data.expeditions.options.some(option => option.action === 'aid' && !option.disabled));
  const develop = { action: 'develop', targetId: contact.id };
  assert.equal((await post({ ...develop, projectId: 'industry' })).status, 400, 'a stale project choice must be refreshed');
  const firstUpgrade = envoy.body.data.expeditions.options.find(option => option.action === 'develop');
  assert.deepEqual(firstUpgrade.cost.materials, { super_alloys: 45, plasma_fuel: 20 });
  const developed = await post(firstUpgrade.payload);
  assert.equal(developed.status, 200);
  assert.equal(developed.body.data.expeditions.empires[0].developmentLevel, 1);
  assert.equal(developed.body.data.expeditions.empires[0].project, null);
  assert.deepEqual(developed.body.data.expeditions.options.find(option => option.action === 'develop').cost.materials,
    { super_alloys: 68, plasma_fuel: 30 });
  assert.equal((await post(firstUpgrade.payload)).status, 400);
  const developedAgain = await post(develop);
  assert.equal(developedAgain.status, 200);
  assert.equal(developedAgain.body.data.expeditions.empires[0].developmentLevel, 2);
  assert.equal(developedAgain.body.data.coalitionEconomy.requisition, envoy.body.data.coalitionEconomy.requisition);

  const saved = gameManager.getSaveState();
  const beforeLoad = structuredClone(saved.stockpiles);
  gameManager.loadSaveState(saved);
  assert.deepEqual(gameManager.getGameState().stockpiles, beforeLoad, 'Loading cannot refill charter supplies');
  const oldSave = gameManager.getSaveState();
  delete oldSave.expeditions;
  oldSave.stockpiles = {};
  gameManager.loadSaveState(oldSave);
  assert.deepEqual(gameManager.getGameState().stockpiles, supplies, 'Older campaigns gain the finite opening charter');
  const migrated = gameManager.getSaveState();
  gameManager.loadSaveState(migrated);
  assert.deepEqual(gameManager.getGameState().stockpiles, supplies, 'Migration supplies are granted once');

  for (let attempt = 0; attempt < 100 && !messages.some(message =>
    message.type === 'state_update' && message.payload.expeditions?.empires?.some(minor => minor.interestRevealed)); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert(messages.some(message => message.type === 'state_update' && message.payload.expeditions?.empires?.some(minor => minor.interestRevealed)),
    'Clients receive contact and diplomacy updates over the actual WebSocket');
  const project = gameManager.getGameState().projects.options.find(entry => entry.commodity === 'biomass');
  const ordered = await fetch(`${base}/api/game/actions/project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commodity: project.commodity, targetLevel: 1, maxCredits: project.credits })
  });
  assert.equal(ordered.status, 200);
  assert((await ordered.json()).data.projects.pending.biomass);
  assert(gameManager.advanceTurnManually().success);
  assert.equal(gameManager.getGameState().projects.levels.biomass, 1);
  gameManager.state.gameOver = true;
  assert.equal((await post(launch)).status, 400);
  console.log('Expedition API and opening-game integration tests passed.');
} finally {
  gameManager.stopGameLoop();
  socket.terminate();
  httpServer.closeAllConnections();
  await new Promise(resolve => httpServer.close(resolve));
}
