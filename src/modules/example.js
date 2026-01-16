/**
 * Example usage of the module system
 * 
 * This demonstrates how to:
 * 1. Load modules from the modules directory
 * 2. Create an interpreter
 * 3. Execute module hooks and functions
 */

import { createModuleRegistry, DSInterpreter, DeterministicRNG } from './index.js';

// Create module registry from modules directory
const registry = createModuleRegistry();

console.log(`Loaded ${registry.index.length} modules:`);
registry.index.forEach(entry => {
  console.log(`  - ${entry.id} (${entry.type})`);
});

// Create interpreter with RNG
const rng = new DeterministicRNG(12345);
const interpreter = new DSInterpreter(registry, rng);

// Register all modules with the interpreter
for (const [moduleId, moduleDoc] of Object.entries(registry.modules)) {
  interpreter.registerModule(moduleId, moduleDoc);
}

// Example: Execute a hook from a module
const exampleContext = {
  scope: {
    game: {
      time: Date.now(),
      difficulty: 1,
      seed: 12345,
      rng: () => rng.random()
    },
    scene: {
      nodes: {},
      spawn_points: {}
    },
    self: {
      id: 'player_1',
      type: 'hero',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: { x: 1, y: 1, z: 1 },
      components: {},
      tags: ['player'],
      stats: {
        hp: 100,
        maxHp: 100,
        mana: 50,
        maxMana: 50,
        attack: 20,
        defense: 10
      },
      faction: 'player'
    }
  },
  vars: {}
};

// Example: Get a module
const wolfModule = registry.modules['creature_wolf'];
if (wolfModule) {
  console.log(`\nModule: ${wolfModule.module.name}`);
  console.log(`Description: ${wolfModule.module.description}`);
  console.log(`Hooks: ${Object.keys(wolfModule.hooks || {}).join(', ')}`);
}

// Example: Execute a function from AI module
try {
  const aiModule = registry.modules['ai_basic_hunter'];
  if (aiModule) {
    const result = interpreter.executeFunction(
      'ai_basic_hunter',
      'should_retreat',
      {
        self: exampleContext.scope.self
      },
      exampleContext
    );
    console.log(`\nShould retreat? ${result}`);
  }
} catch (error) {
  console.error(`Error executing function: ${error.message}`);
}

export { registry, interpreter, exampleContext };
