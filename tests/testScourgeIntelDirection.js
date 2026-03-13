#!/usr/bin/env node

import { createArmy, createEmpire, createGameState } from '../src/game/types.js';
import {
  activateEmergencyPower,
  canActivateEmergencyPower,
  getEmergencyPowerDefinitions
} from '../src/game/emergencyPowers.js';
import {
  applyMissionSliderEffects,
  buildDeepMissionEvent,
  buildPreAttackMissionEvent,
  getDeepMissionThreshold,
  maybeSpawnDeepMission,
  handleMissionEventChoice
} from '../src/game/scourgeMissions.js';
import { calculateScourgePrediction, selectScourgeTargetEmpire } from '../src/game/scourgePrediction.js';
import { SCOURGE_MISSION_CONSTANTS } from '../src/game/constants.js';
import { handleEventChoice } from '../src/game/events.js';
import { triggerScourgeBattle } from '../src/game/turn/battlePhase.js';
import { GameManager } from '../src/server/gameManager.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function approxEqual(left, right, epsilon = 0.0001) {
  return Math.abs(left - right) <= epsilon;
}

function createBasicState() {
  const state = createGameState(42);
  state.empires = [
    createEmpire('empire_1', 'Alpha Combine', 60),
    createEmpire('empire_2', 'Beta Compact', 55)
  ];
  state.diplomacy = {
    relations: {
      empire_1: { empire_2: 0 },
      empire_2: { empire_1: 0 }
    }
  };
  return state;
}

function testMissionIntelFlow() {
  const state = createBasicState();
  state.coalitionEconomy.requisition = 1000;
  state.missionSlider = 5;

  applyMissionSliderEffects(state, []);
  assert(approxEqual(state.coalitionIntel, 1.25), `Expected 1.25 intel from mission budget, got ${state.coalitionIntel}`);
  assert(
    approxEqual(state.scourgePrediction.confidenceModifier, 1.0625),
    `Expected mission slider intel to also update confidence immediately, got ${state.scourgePrediction.confidenceModifier}`
  );

  const preAttackEvent = buildPreAttackMissionEvent(state, () => 0);
  const intelBeforeSafe = state.coalitionIntel;
  const requisitionBeforeSafe = state.coalitionEconomy.requisition;
  const threatBeforeSafe = state.coalitionThreat || 0;
  const safeResult = handleMissionEventChoice(state, preAttackEvent, 1, () => 0);
  assert(safeResult.success, 'Pre-attack defensive recon choice should succeed');
  assert(
    approxEqual(state.coalitionIntel, intelBeforeSafe + SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_SAFE_INTEL),
    `Expected defensive recon to grant ${SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_SAFE_INTEL} intel, got ${state.coalitionIntel - intelBeforeSafe}`
  );
  assert(
    approxEqual(state.coalitionEconomy.requisition, requisitionBeforeSafe - SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_SAFE_COST),
    'Defensive recon should spend its tuned requisition cost'
  );
  assert(
    approxEqual(state.coalitionThreat, threatBeforeSafe + SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_SAFE_THREAT_DELTA),
    'Defensive recon should use the tuned low threat increase'
  );

  const secondPreAttackEvent = buildPreAttackMissionEvent(state, () => 0);
  const intelBeforeEscalate = state.coalitionIntel;
  const requisitionBeforeEscalate = state.coalitionEconomy.requisition;
  const threatBeforeEscalate = state.coalitionThreat || 0;
  const escalateResult = handleMissionEventChoice(state, secondPreAttackEvent, 2, () => 0);
  assert(escalateResult.success, 'Pre-attack escalate choice should succeed');
  assert(approxEqual(state.coalitionIntel, intelBeforeEscalate), 'Escalate should no longer grant intel');
  assert(
    approxEqual(
      state.coalitionEconomy.requisition,
      requisitionBeforeEscalate + SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_ESCALATE_REQUISITION
    ),
    'Escalate should use the reduced tuned requisition reward'
  );
  assert(
    approxEqual(state.coalitionThreat, threatBeforeEscalate + SCOURGE_MISSION_CONSTANTS.PRE_ATTACK_ESCALATE_THREAT_DELTA),
    'Escalate should use the tuned threat increase'
  );

  const deepMissionEvent = buildDeepMissionEvent(state, () => 0);
  const intelBeforeHarvest = state.coalitionIntel;
  const harvestResult = handleMissionEventChoice(state, deepMissionEvent, 2, () => 0);
  assert(harvestResult.success, 'Deep mission harvest choice should succeed');
  assert(approxEqual(state.coalitionIntel, intelBeforeHarvest), 'Deep harvest should no longer grant intel');
}

function testNegativeMissionSliderPlayableAndBalanced() {
  const state = createBasicState();
  state.missionSlider = -1;
  state.coalitionEconomy.requisition = 1000;
  state.coalitionThreat = 0;

  applyMissionSliderEffects(state, []);

  const expectedBonus = Math.min(
    SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_REQUISITION_BONUS_CAP,
    SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_REQUISITION_BASE_BONUS
      + (1000 * SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_REQUISITION_RATE)
  );
  assert(
    approxEqual(state.coalitionEconomy.requisition, 1000 + expectedBonus),
    `Expected emergency slider to grant ${expectedBonus} requisition, got ${state.coalitionEconomy.requisition - 1000}`
  );
  assert(
    approxEqual(state.coalitionThreat, SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_THREAT_INCREASE),
    'Emergency slider should apply the tuned low threat increase'
  );
  assert(
    approxEqual(state.coalitionModifiers.glory_gain_multiplier, SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_GLORY_GAIN_MUL),
    'Emergency slider should apply glory gain penalty once'
  );
  assert(state.timedModifiers.length === 1, `Expected a single timed penalty modifier, got ${state.timedModifiers.length}`);

  state.turn += 1;
  applyMissionSliderEffects(state, []);

  assert(state.timedModifiers.length === 1, 'Emergency slider penalty should refresh, not stack each tick');
  assert(
    approxEqual(state.coalitionModifiers.glory_gain_multiplier, SCOURGE_MISSION_CONSTANTS.MISSION_NEGATIVE_GLORY_GAIN_MUL),
    'Emergency slider should keep glory penalty at tuned level without compounding'
  );

  const debtState = createBasicState();
  debtState.missionSlider = -1;
  debtState.coalitionEconomy.requisition = -20;
  applyMissionSliderEffects(debtState, []);

  assert(
    debtState.coalitionEconomy.requisition > -20,
    'Emergency slider should still provide requisition while in debt so it remains playable'
  );
}

function testDirectTargetUsesIntel() {
  const manager = new GameManager();
  manager.state = createBasicState();
  manager.state.coalitionIntel = 10;

  const result = manager.directScourgeTarget('empire_2');
  assert(result.success, 'Direct target action should succeed');
  assert(approxEqual(manager.state.coalitionIntel, 4), `Expected 4 intel remaining, got ${manager.state.coalitionIntel}`);
  assert(manager.state.scourgeDirectedTargetEmpireId === 'empire_2', 'Directed target should be stored');
  assert(manager.state.scourgePrediction.targetEmpireId === 'empire_2', 'Prediction should immediately point at directed target');
  assert(manager.state.scourgePrediction.targetingMode === 'directed', 'Prediction should mark directed targeting mode');
  assert(manager.state.scourgePrediction.confidenceLevel === 'high', 'Directed target should show high confidence');
}

function testInstantEmergencyPowersGrantResources() {
  const state = createBasicState();
  state.coalitionIntel = 50;
  state.empires[0].budget_credits = 1200;
  state.empires[1].budget_credits = 800;

  const requisitionDef = getEmergencyPowerDefinitions().find((power) => power.id === 'EP_REQUISITION_CACHE');
  const creditsDef = getEmergencyPowerDefinitions().find((power) => power.id === 'EP_CREDIT_LINE');
  const requisitionBefore = state.coalitionEconomy.requisition || 0;
  const creditBudgetsBefore = state.empires.map((empire) => empire.budget_credits || 0);

  const requisitionResult = activateEmergencyPower(state, 'EP_REQUISITION_CACHE');
  assert(requisitionResult.success, 'Instant requisition power should activate successfully');
  assert(
    approxEqual(
      state.coalitionEconomy.requisition,
      requisitionBefore + SCOURGE_MISSION_CONSTANTS.EP_REQUISITION_CACHE_AMOUNT
    ),
    'Instant requisition power should add coalition requisition immediately'
  );
  assert(
    approxEqual(state.coalitionIntel, 50 - (requisitionDef?.cost_intel || 0)),
    'Instant requisition power should spend intel'
  );
  assert(
    (state.activeEmergencyPowers || []).length === 0,
    'Instant requisition power should not consume an active emergency power slot'
  );

  const creditResult = activateEmergencyPower(state, 'EP_CREDIT_LINE');
  assert(creditResult.success, 'Instant credit power should activate successfully');
  state.empires.forEach((empire, index) => {
    assert(
      approxEqual(empire.budget_credits, creditBudgetsBefore[index] + SCOURGE_MISSION_CONSTANTS.EP_EMPIRE_CREDIT_GRANT),
      `Expected ${empire.name} to receive ${SCOURGE_MISSION_CONSTANTS.EP_EMPIRE_CREDIT_GRANT} credits`
    );
  });
  assert(
    approxEqual(
      state.coalitionIntel,
      50 - (requisitionDef?.cost_intel || 0) - (creditsDef?.cost_intel || 0)
    ),
    'Instant credit power should also spend intel'
  );
  assert(
    (state.activeEmergencyPowers || []).length === 0,
    'Instant credit power should not create an active timed buff'
  );
}

function testInstantEmergencyPowersIgnoreActiveSlotCap() {
  const state = createBasicState();
  state.coalitionIntel = 50;
  state.activeEmergencyPowers = [
    { id: 'EP_MOBILIZATION', remainingDuration: 20, totalDuration: 20, effects: [] },
    { id: 'EP_WAR_INDUSTRY', remainingDuration: 20, totalDuration: 20, effects: [] }
  ];

  const check = canActivateEmergencyPower(state, 'EP_REQUISITION_CACHE');
  assert(check.canActivate, `Instant emergency powers should bypass active slot cap, got: ${check.reason}`);

  const result = activateEmergencyPower(state, 'EP_REQUISITION_CACHE');
  assert(result.success, 'Instant requisition power should still activate at active-slot cap');
  assert(
    state.activeEmergencyPowers.length === 2,
    'Instant emergency power should leave active timed powers unchanged'
  );
}

function testRegularEventSyncsIntelAndConfidence() {
  const state = createBasicState();
  const event = {
    id: 'evt_sync',
    title: 'Signal Intercept',
    choices: [
      {
        text: 'Exploit the intercept',
        effects: {
          scourgePredictionConfidence: 0.2
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);

  assert(result.success, 'Regular event choice should succeed');
  assert(approxEqual(state.coalitionIntel, 4), `Expected 4 intel from +0.2 confidence event, got ${state.coalitionIntel}`);
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.2), `Expected immediate confidence modifier 1.2, got ${state.scourgePrediction.confidenceModifier}`);
}

function testIntelEventBoostsConfidence() {
  const state = createBasicState();
  const event = {
    id: 'evt_intel_gain',
    title: 'Recovered Scout Cache',
    choices: [
      {
        text: 'Decrypt the recovered data',
        effects: {
          coalitionIntel: 2
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);

  assert(result.success, 'Intel event choice should succeed');
  assert(approxEqual(state.coalitionIntel, 2), `Expected +2 intel from explicit intel event, got ${state.coalitionIntel}`);
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.1), `Expected immediate confidence modifier 1.1 from +2 intel, got ${state.scourgePrediction.confidenceModifier}`);
}

function testIntelLossReducesConfidence() {
  const state = createBasicState();
  state.coalitionIntel = 5;
  state.scourgePrediction.confidenceModifier = 1.25;
  state.scourgePrediction.confidenceLevel = 'medium';

  const event = {
    id: 'evt_intel_loss',
    title: 'Compromised Relay',
    choices: [
      {
        text: 'Accept the loss',
        effects: {
          coalitionIntel: -2
        }
      }
    ]
  };

  state.activeEvent = event;
  const result = handleEventChoice(state, event.id, 0);

  assert(result.success, 'Intel loss event choice should succeed');
  assert(approxEqual(state.coalitionIntel, 3), `Expected intel to fall from 5 to 3, got ${state.coalitionIntel}`);
  assert(approxEqual(state.scourgePrediction.confidenceModifier, 1.15), `Expected confidence modifier to drop from 1.25 to 1.15, got ${state.scourgePrediction.confidenceModifier}`);
}

function testBattleTriggerHonorsDirective() {
  const state = createBasicState();
  state.scourgeDirectedTargetEmpireId = 'empire_2';
  state.armies = [
    createArmy('army_alpha', 'empire_1', 'Alpha Guard', 60, 70, 0, 50, 50, 10000),
    createArmy('army_beta', 'empire_2', 'Beta Guard', 60, 70, 0, 50, 50, 10000)
  ];

  const log = [];
  const logger = {
    debug() {},
    info() {},
    warn() {}
  };

  triggerScourgeBattle(state, () => 0, 1, [], log, logger);

  assert(state.scourgeTargetEmpireId === 'empire_2', 'Scourge trigger should honor the directed target');
  assert(state.pendingScourgeAttack?.targetEmpireId === 'empire_2', 'Pending scourge attack should target the directed empire');
  assert(state.scourgeDirectedTargetEmpireId === null, 'Directive should be consumed once the attack is locked');
  assert(state.activeEvent?.id === 'EVT_MISSION_PRE_ATTACK', 'Pre-attack mission should still be created');
}

function testDeepMissionThresholdScaling() {
  const state = createBasicState();
  const baseThreshold = SCOURGE_MISSION_CONSTANTS.DEEP_MISSION_THRESHOLD_BASE;
  const nextThreshold = Math.round(
    baseThreshold * (1 + SCOURGE_MISSION_CONSTANTS.DEEP_MISSION_THRESHOLD_GROWTH_RATE)
  );
  const thirdThreshold = Math.round(
    baseThreshold * Math.pow(1 + SCOURGE_MISSION_CONSTANTS.DEEP_MISSION_THRESHOLD_GROWTH_RATE, 2)
  );

  assert(
    getDeepMissionThreshold(state) === baseThreshold,
    `Expected initial Deep Mission threshold ${baseThreshold}, got ${getDeepMissionThreshold(state)}`
  );

  state.missionMeter = baseThreshold - 1;
  assert(maybeSpawnDeepMission(state, () => 0) === null, 'Deep mission should not trigger below the base threshold');
  assert(state.deepMissionCount === 0, 'Deep mission count should not change before the first trigger');

  state.missionMeter = baseThreshold;
  let deepMission = maybeSpawnDeepMission(state, () => 0);
  assert(deepMission?.id === 'EVT_DEEP_MISSION', 'Deep mission should trigger at the base threshold');
  assert(state.missionMeter === 0, `Expected mission meter to spend the full ${baseThreshold} cost, got ${state.missionMeter}`);
  assert(state.deepMissionCount === 1, `Expected deep mission count 1 after first trigger, got ${state.deepMissionCount}`);
  assert(
    getDeepMissionThreshold(state) === nextThreshold,
    `Expected second Deep Mission threshold ${nextThreshold}, got ${getDeepMissionThreshold(state)}`
  );

  state.missionMeter = nextThreshold - 1;
  assert(maybeSpawnDeepMission(state, () => 0) === null, 'Deep mission should not trigger below the scaled threshold');
  assert(state.deepMissionCount === 1, 'Deep mission count should not increase on a failed trigger');

  state.missionMeter = nextThreshold + 15;
  deepMission = maybeSpawnDeepMission(state, () => 0);
  assert(deepMission?.id === 'EVT_DEEP_MISSION', 'Deep mission should trigger once the scaled threshold is met');
  assert(state.missionMeter === 15, `Expected mission meter overflow to be preserved (15), got ${state.missionMeter}`);
  assert(state.deepMissionCount === 2, `Expected deep mission count 2 after second trigger, got ${state.deepMissionCount}`);
  assert(
    getDeepMissionThreshold(state) === thirdThreshold,
    `Expected third Deep Mission threshold ${thirdThreshold}, got ${getDeepMissionThreshold(state)}`
  );
}

function testEmpirePredictionPrefersClearlyWeakTarget() {
  const state = createGameState(99);
  state.empires = [
    createEmpire('empire_1', 'Fortress Union', 78, {}, {}, { stability: 78 }),
    createEmpire('empire_2', 'Fractured Reach', 24, {}, {}, { stability: 28 }),
    createEmpire('empire_3', 'Border League', 58, {}, {}, { stability: 62 })
  ];

  state.diplomacy = {
    relations: {
      empire_1: { empire_2: 70, empire_3: 55 },
      empire_2: { empire_1: -20, empire_3: -10 },
      empire_3: { empire_1: 55, empire_2: -10 }
    }
  };

  state.armies = [
    createArmy('army_1a', 'empire_1', 'Fortress Guard', 70, 85, 10, 50, 50, 12000),
    createArmy('army_1b', 'empire_1', 'Fortress Reserve', 65, 78, 15, 50, 50, 9000),
    createArmy('army_2a', 'empire_2', 'Fractured Militia', 45, 34, 72, 50, 50, 3500),
    createArmy('army_3a', 'empire_3', 'Border Guard', 55, 68, 25, 50, 50, 8000)
  ];

  const selection = selectScourgeTargetEmpire(state, () => 0.99);
  assert(selection.source === 'calculated', 'Weak-target test should use calculated targeting');
  assert(selection.empire?.id === 'empire_2', `Expected Fractured Reach to be the top target, got ${selection.empire?.id}`);

  const prediction = calculateScourgePrediction(state, () => 0.25);
  assert(prediction.targetEmpireId === 'empire_2', `Expected prediction to point at Fractured Reach, got ${prediction.targetEmpireId}`);
  assert(prediction.confidenceModifier > 1.1, `Expected a stronger confidence signal for a clear weak target, got ${prediction.confidenceModifier}`);
}

function run() {
  console.log('=== Test: Scourge Intel Direction ===');

  testMissionIntelFlow();
  console.log('PASS Mission budget generates intel and mission rewards no longer do');

  testNegativeMissionSliderPlayableAndBalanced();
  console.log('PASS -1 mission slider is now playable and uses non-stacking penalties');

  testDirectTargetUsesIntel();
  console.log('PASS Direct target spends intel and updates prediction');

  testInstantEmergencyPowersGrantResources();
  console.log('PASS Instant emergency powers inject credits and requisition without occupying slots');

  testInstantEmergencyPowersIgnoreActiveSlotCap();
  console.log('PASS Instant emergency powers remain usable while timed power slots are full');

  testRegularEventSyncsIntelAndConfidence();
  console.log('PASS Regular events keep intel and confidence synchronized');

  testIntelEventBoostsConfidence();
  console.log('PASS Explicit intel gains raise confidence');

  testIntelLossReducesConfidence();
  console.log('PASS Intel losses reduce confidence');

  testBattleTriggerHonorsDirective();
  console.log('PASS Battle trigger honors stored directive');

  testDeepMissionThresholdScaling();
  console.log('PASS Deep mission threshold scales permanently and preserves overflow');

  testEmpirePredictionPrefersClearlyWeakTarget();
  console.log('PASS Empire prediction locks onto the clearly weakest empire');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error('FAIL', error.message);
  process.exit(1);
}
