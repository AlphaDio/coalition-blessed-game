/**
 * Hero ability and passive definitions (v0.3)
 */

import { createModuleRegistry, getModulesByType } from '../modules/loader.js';
import { DSInterpreter } from '../modules/interpreter.js';

const moduleRegistry = createModuleRegistry();
const moduleInterpreter = new DSInterpreter(moduleRegistry);

function loadHeroPassives(registry) {
  const passiveModules = getModulesByType(registry, 'hero_passive');
  return passiveModules.reduce((acc, entry) => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc?.declares?.hero_passive_data;
    if (!data?.id) return acc;
    acc.passives[data.id] = data;
    acc.moduleIds[data.id] = entry.id;
    return acc;
  }, { passives: {}, moduleIds: {} });
}

function loadHeroAbilities(registry) {
  const abilityModules = getModulesByType(registry, 'hero_ability');
  return abilityModules.reduce((acc, entry) => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc?.declares?.hero_ability_data;
    if (!data?.id) return acc;
    acc.abilities[data.id] = data;
    acc.moduleIds[data.id] = entry.id;
    return acc;
  }, { abilities: {}, moduleIds: {} });
}

const HERO_PASSIVE_INDEX = loadHeroPassives(moduleRegistry);
const HERO_ABILITY_INDEX = loadHeroAbilities(moduleRegistry);

export const HERO_PASSIVES = HERO_PASSIVE_INDEX.passives;
export const HERO_PASSIVE_MODULE_IDS = HERO_PASSIVE_INDEX.moduleIds;
export const HERO_ABILITIES = HERO_ABILITY_INDEX.abilities;
export const HERO_ABILITY_MODULE_IDS = HERO_ABILITY_INDEX.moduleIds;
export const HERO_MODULE_REGISTRY = moduleRegistry;
export const HERO_MODULE_INTERPRETER = moduleInterpreter;
