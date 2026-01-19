import { createEmpire, createArmy, createLaw, createEvent } from './types.js';
import { createModuleRegistry, getModulesByType } from '../modules/loader.js';
import { DeterministicRNG } from '../modules/rng.js';

const EVENT_EFFECT_RANGE_MULTIPLIER = 2;

function scaleEventEffects(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'number') {
    return value * EVENT_EFFECT_RANGE_MULTIPLIER;
  }

  if (typeof value === 'function') {
    return () => value() * EVENT_EFFECT_RANGE_MULTIPLIER;
  }

  if (Array.isArray(value)) {
    return value.map(scaleEventEffects);
  }

  if (typeof value === 'object') {
    const scaled = {};
    Object.entries(value).forEach(([key, nestedValue]) => {
      scaled[key] = scaleEventEffects(nestedValue);
    });
    return scaled;
  }

  return value;
}

export function createSampleContent(seed = 0) {
  // Load all modules from the modules directory
  const registry = createModuleRegistry();
  const rng = new DeterministicRNG(seed || 0);
  
  // Extract empires from modules
  const empireModules = getModulesByType(registry, 'empire');
  const empires = empireModules.map(entry => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc.declares.empire_data;
    const stabilityRoll = (rng.random() * 30) - 10; // 50..80 centered around 60
    const stability = Math.max(-100, Math.min(100, 60 + stabilityRoll));
    const stats = { ...data.stats, stability, color: data.color };
    return createEmpire(
      data.id,
      data.name,
      data.approval,
      data.traits || {},
      data.values || {},
      stats,
      data.tags || [],
      data.modifiers || {}
    );
  });
  
  // Extract armies from modules
  const armyModules = getModulesByType(registry, 'army');
  const armies = armyModules.map(entry => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc.declares.army_data;
    return createArmy(
      data.id,
      data.empireId,
      data.name,
      data.fervor,
      data.organization,
      data.aggravation, // This is supplyNeed in the original data
      data.command || 50, // Default Command if not specified
      data.recovery || 50 // Default Recovery if not specified
    );
  });
  
  // Extract laws from modules
  const lawModules = getModulesByType(registry, 'law');
  const laws = lawModules.map(entry => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc.declares.law_data;
    return createLaw(
      data.id,
      data.name,
      data.cost,
      data.tier,
      data.effects || {},
      data.vector || {},
      data.weights || {},
      data.tag_effects || []
    );
  });
  
  // Extract events from modules
  const eventModules = getModulesByType(registry, 'event');
  const events = eventModules.map(entry => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc.declares.event_data;
    
    // Process choices to handle random effects
    const choices = data.choices.map(choice => {
      const processedEffects = {};
      
      for (const [key, value] of Object.entries(choice.effects || {})) {
        if (value === 'random') {
          // Handle random effects for event_1
          if (key === 'coalitionCohesion') {
            processedEffects[key] = () => Math.random() > 0.5 ? 5 : -5;
          } else if (key === 'scourgeCohesion') {
            processedEffects[key] = () => Math.random() > 0.5 ? -3 : 0;
          }
        } else {
          processedEffects[key] = value;
        }
      }

      return {
        text: choice.text,
        effects: scaleEventEffects(processedEffects)
      };
    });
    
    return createEvent(
      data.id,
      data.name,
      data.description,
      choices
    );
  });
  
  return { empires, armies, laws, events };
}
