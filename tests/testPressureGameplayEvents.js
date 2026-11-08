#!/usr/bin/env node

import assertModule from 'node:assert/strict';
import { createSampleContent } from '../src/game/content.js';
import { createGameState } from '../src/game/types.js';
import { handleEventChoice } from '../src/game/events.js';
import { addPressure } from '../src/game/economyTick/backlog.js';
import {
  applyCriticalShortageLoss,
  DEFAULT_PRESSURE_EVENT_THRESHOLDS,
  popNextGameplayEvent,
  triggerPressureGameplayEvents
} from '../src/game/pressureEvents.js';

const assert = assertModule;

function makeState() {
  const state = createGameState(17);
  const content = createSampleContent(17);
  state.events = content.events;
  state.empires = content.empires;
  state.armies = content.armies;
  state.economyPressure.by_type = {};
  state.economyPressure.last_expired = [];
  state.economyPressure.history = [];
  state.economyPressure.escalation_by_type = {};
  return state;
}

function expiry(resource, pressure, quantity, source, persistence_policy = 'perishable') {
  return {
    resource,
    pressure,
    quantity,
    source,
    persistence_policy
  };
}

console.log('Pressure Gameplay Event Tests');

{
  const state = makeState();
  const pressureEvents = state.events.filter(event => event.scope === 'PRESSURE');
  assert.deepEqual(
    pressureEvents.map(event => event.id).sort(),
    [
      'pressure_desperate_measures',
      'pressure_emergency_procurement',
      'pressure_institutional_breakdown',
      'pressure_public_discontent',
      'pressure_rationing'
    ],
    'The shared pressure pool contains the five reusable pressure events'
  );
}

{
  const state = makeState();
  const source = { type: 'empire_demand', id: state.empires[0].id, category: 'needs' };
  state.economyPressure.by_type.biomass_pressure = 30;
  const result = triggerPressureGameplayEvents(state, [
    expiry('biomass', 'biomass_pressure', 30, source)
  ]);

  assert.equal(result.createdEvents.length, 1, 'Crossing the first pressure threshold creates one event');
  assert.equal(state.gameplayEventQueue.length, 1, 'Pressure event is enqueued instead of made active immediately');
  assert.equal(state.activeEvent, null, 'Pressure trigger does not directly activate an event');
  assert.equal(state.economyPressure.by_type.biomass_pressure, 30, 'Accumulated pressure is retained after triggering');

  const pressureEvent = state.gameplayEventQueue[0];
  assert.equal(pressureEvent.pressure_context.resource, 'biomass', 'Event context includes the triggering resource');
  assert.equal(pressureEvent.pressure_context.pressure_type, 'biomass_pressure', 'Event context includes the pressure type');
  assert.equal(pressureEvent.pressure_context.accumulated_pressure, 30, 'Event context includes accumulated pressure');
  assert.equal(pressureEvent.pressure_context.expired_quantity, 30, 'Event context includes expired quantity');
  assert.deepEqual(pressureEvent.pressure_context.source, source, 'Event context includes the shortage source');
  assert.equal(pressureEvent.pressure_context.tier, 1, 'Event context includes the newly crossed tier');
  assert.equal(state.economyPressure.escalation_by_type.biomass_pressure.tier, 1, 'Pressure tier advances after the event is created');
  assert.equal(state.economyPressure.escalation_by_type.biomass_pressure.next_threshold, 100, 'Next threshold advances without resetting pressure');
  assert.match(pressureEvent.ai_narration, /Biomass/, 'Pressure event narration is interpolated with the resource name');
}

{
  const state = makeState();
  state.economyPressure.by_type.fuel_pressure = 100;
  const first = triggerPressureGameplayEvents(state, [
    expiry('plasma_fuel', 'fuel_pressure', 100, { type: 'army_demand', id: 'army_1' }, 'deferred')
  ]);
  const firstId = first.createdEvents[0].id;
  state.economyPressure.by_type.fuel_pressure = 250;
  const second = triggerPressureGameplayEvents(state, [
    expiry('plasma_fuel', 'fuel_pressure', 150, { type: 'army_demand', id: 'army_1' }, 'deferred')
  ]);

  assert.equal(second.createdEvents.length, 1, 'A later threshold crossing creates another event');
  assert.notEqual(second.createdEvents[0].id, firstId, 'The same pressure event is not immediately repeated when alternatives exist');
}

{
  const state = makeState();
  const largeIncrease = DEFAULT_PRESSURE_EVENT_THRESHOLDS[DEFAULT_PRESSURE_EVENT_THRESHOLDS.length - 1] + 1;
  state.economyPressure.by_type.industrial_pressure = largeIncrease;
  const result = triggerPressureGameplayEvents(state, [
    expiry('super_alloys', 'industrial_pressure', largeIncrease, { type: 'empire_demand', id: 'empire_1' }, 'persistent')
  ]);
  const escalation = state.economyPressure.escalation_by_type.industrial_pressure;

  assert.equal(result.createdEvents.length, 5, 'A large pressure increase creates one event for every crossed threshold');
  assert.equal(escalation.tier, 5, 'Multiple crossed thresholds advance the escalation tier repeatedly');
  assert.equal(escalation.next_threshold, 2000, 'Multiple crossings calculate the next threshold correctly');
  assert.equal(state.economyPressure.by_type.industrial_pressure, largeIncrease, 'Multiple crossings do not reset accumulated pressure');
}

{
  const state = makeState();
  state.economyPressure.by_type.biomass_pressure = 30;
  triggerPressureGameplayEvents(state, [
    expiry('biomass', 'biomass_pressure', 30, { type: 'empire_demand', id: state.empires[0].id })
  ]);
  const queued = state.gameplayEventQueue[0];
  const before = {
    cohesion: state.coalitionCohesion,
    approval: state.empires.map(empire => empire.approval),
    treasury: state.coalitionEconomy.treasury_credits,
    requisition: state.coalitionEconomy.requisition
  };

  const active = popNextGameplayEvent(state);
  state.activeEvent = active;
  assert.equal(state.gameplayEventQueue.length, 0, 'Normal event promotion removes the event from the queue');
  assert.equal(state.activeEvent.id, queued.id, 'Normal event promotion makes the queued event active');
  assert.equal(
    state.coalitionCohesion,
    before.cohesion,
    'Creating a pressure event applies no direct cohesion consequence'
  );

  const resolution = handleEventChoice(state, active.id, 0);
  assert.equal(resolution.success, true, 'Pressure event resolves through the normal choice resolver');
  assert.equal(state.activeEvent, null, 'Normal resolution clears the active pressure event');
  assert.ok(
    state.coalitionCohesion !== before.cohesion ||
      state.coalitionEconomy.treasury_credits !== before.treasury ||
      state.coalitionEconomy.requisition !== before.requisition ||
      state.empires.some((empire, index) => empire.approval !== before.approval[index]),
    'Mechanical consequences occur during event resolution, not pressure accumulation'
  );
}

{
  const state = makeState();
  const needs = { type: 'empire_demand', id: state.empires[0].id, category: 'needs' };
  addPressure(state, 'biomass', 100, needs);
  triggerPressureGameplayEvents(state);
  assert.equal(applyCriticalShortageLoss(state), 0, 'Tier 2 gives time to respond');
  state.turn++;
  addPressure(state, 'biomass', 150, needs);
  addPressure(state, 'plasma_fuel', 250, needs);
  triggerPressureGameplayEvents(state);
  assert.equal(applyCriticalShortageLoss(state), 0.25, 'Critical shortages share a single per-turn Cohesion penalty');
  assert.equal(state.economyPressure.cohesion_loss_per_turn, 0.25);
  state.turn++;
  addPressure(state, 'biomass', 10, { ...needs, category: 'wants' });
  addPressure(state, 'biomass', 1e-9, needs);
  assert.equal(applyCriticalShortageLoss(state), 0, 'Historical shortages, optional wants and rounding dust cannot drain Cohesion');
  assert.equal(state.economyPressure.cohesion_loss_last_turn, 0);
  state.turn++;
  state.coalitionCohesion = 0.125;
  addPressure(state, 'biomass', 1, needs);
  assert.equal(applyCriticalShortageLoss(state), 0.125, 'A continuing critical shortage can exhaust the remaining Cohesion');
  assert.equal(state.coalitionCohesion, 0);
}

console.log('Passed: pressure gameplay events');
