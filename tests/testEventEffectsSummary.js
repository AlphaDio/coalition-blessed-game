#!/usr/bin/env node

import { createSampleContent } from '../src/game/content.js';
import { resolveEventVariables, interpolateText } from '../src/game/selectors.js';
import { getAllLawEvents } from '../src/game/lawEventTemplates.js';
import { initializeLogger, LogLevel } from '../src/modules/logger.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${message}`);
  } else {
    failed += 1;
    console.log(`[FAIL] ${message}`);
  }
}

console.log('=== Event Effects Summary Tests ===\n');

// --- Test 1: effects_summary and description survive module loading ---
console.log('--- Test 1: Effects Summary And Description Survive Module Loading ---');

const content = createSampleContent(42);

content.events.forEach(event => {
  event.choices.forEach((choice, i) => {
    assert(
      typeof choice.effects_summary === 'string' && choice.effects_summary.length > 0,
      `${event.id} choice ${i + 1} has effects_summary`
    );
    assert(
      typeof choice.description === 'string' && choice.description.length > 0,
      `${event.id} choice ${i + 1} has description`
    );
  });
});

// --- Test 2: effects_summary is interpolated for variable-driven events ---
console.log('\n--- Test 2: Effects Summary Is Interpolated For Variable-Driven Events ---');

const mockState = {
  empires: content.empires,
  armies: content.armies,
  events: content.events,
};

const eventsWithVars = content.events.filter(e => e.variables);
assert(eventsWithVars.length > 0, 'At least one event has variables');

eventsWithVars.forEach(event => {
  const ctx = resolveEventVariables(event.variables, mockState);
  event.choices.forEach((choice, i) => {
    if (choice.effects_summary && choice.effects_summary.includes('${')) {
      const interpolated = interpolateText(choice.effects_summary, ctx, mockState);
      assert(
        !interpolated.includes('${'),
        `${event.id} choice ${i + 1} effects_summary variables are resolved after interpolation`
      );
    }
    if (choice.description && choice.description.includes('${')) {
      const interpolated = interpolateText(choice.description, ctx, mockState);
      assert(
        !interpolated.includes('${'),
        `${event.id} choice ${i + 1} description variables are resolved after interpolation`
      );
    }
  });
});

// --- Test 3: effects_summary uses qualitative terms for scaled values ---
console.log('\n--- Test 3: Effects Summary Uses Qualitative Terms For Scaled Values ---');

content.events.forEach(event => {
  event.choices.forEach((choice, i) => {
    if (!choice.effects_summary) return;
    const summary = choice.effects_summary;
    // Approval and fervor values should NOT appear as exact numbers in summaries
    // (they get ×2 scaling at runtime, so exact YAML numbers would be misleading)
    // Exception: requisition and cohesion are net ×1 and can use exact numbers
    const hasApprovalNumber = /empires?:\s*[+-]\d+\s*approval/i.test(summary);
    const hasFervorNumber = /armies?:\s*[+-]\d+\s*fervor/i.test(summary);
    assert(
      !hasApprovalNumber,
      `${event.id} choice ${i + 1} effects_summary uses qualitative approval (not exact numbers)`
    );
    assert(
      !hasFervorNumber,
      `${event.id} choice ${i + 1} effects_summary uses qualitative fervor (not exact numbers)`
    );
  });
});

// --- Test 4: Law choice events have effects_summary ---
console.log('\n--- Test 4: Law Choice Events Have Effects Summary ---');

const allLawEvents = getAllLawEvents();
const lawChoiceEvents = allLawEvents.filter(e => e.choices && e.choices.length > 0);
assert(lawChoiceEvents.length > 0, 'At least one law event has choices');

lawChoiceEvents.forEach(event => {
  event.choices.forEach((choice, i) => {
    assert(
      typeof choice.effects_summary === 'string' && choice.effects_summary.length > 0,
      `Law event ${event.id} choice ${i + 1} has effects_summary`
    );
  });
});

// --- Summary ---
console.log(`\n============================================================`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`============================================================`);

if (failed > 0) {
  process.exit(1);
}
