/**
 * Hero ability and passive definitions (v0.3)
 */

import { createModuleRegistry, getModulesByType } from '../modules/loader.js';
import { getLogger } from '../modules/logger.js';

function loadHeroPassives() {
  const registry = createModuleRegistry();
  const passiveModules = getModulesByType(registry, 'hero_passive');
  return passiveModules.reduce((acc, entry) => {
    const moduleDoc = registry.modules[entry.id];
    const data = moduleDoc?.declares?.hero_passive_data;
    if (!data?.id) return acc;
    acc[data.id] = data;
    return acc;
  }, {});
}

export const HERO_PASSIVES = loadHeroPassives();

export const HERO_ABILITIES = {
  ABILITY_PUBLIC_MANDATE: {
    id: 'ABILITY_PUBLIC_MANDATE',
    description: 'Convert popularity into short-term stability: reduce heat/grievance, boost popularity.',
    cooldown: 10,
    trigger({ hero, popularityScalar, log }) {
      const heatReduction = 10 * popularityScalar;
      const grievanceReduction = 6 * popularityScalar;
      const popularityBoost = 4 * popularityScalar;
      hero.meters.heat = Math.max(0, hero.meters.heat - heatReduction);
      hero.meters.grievance = Math.max(0, hero.meters.grievance - grievanceReduction);
      hero.meters.popularity = Math.min(100, hero.meters.popularity + popularityBoost);
      const message = `Hero Ability: ${hero.name} invoked Public Mandate (heat -${heatReduction.toFixed(1)}, grievance -${grievanceReduction.toFixed(1)}).`;
      log.push(message);
      getLogger().info(message);
    }
  },
  ABILITY_LEGISLATIVE_SURGE: {
    id: 'ABILITY_LEGISLATIVE_SURGE',
    description: 'Add immediate law phase progress if a law is active.',
    cooldown: 12,
    trigger({ hero, lawProcess, popularityScalar, log }) {
      if (!lawProcess) return;
      const bonus = 0.08 * popularityScalar;
      const before = lawProcess.phaseProgress;
      lawProcess.phaseProgress = Math.min(2.0, lawProcess.phaseProgress + bonus);
      const message = `Hero Ability: ${hero.name} surged law progress ${before.toFixed(2)} -> ${lawProcess.phaseProgress.toFixed(2)}.`;
      log.push(message);
      getLogger().info(message);
    }
  },
  ABILITY_EMERGENCY_FUNDS: {
    id: 'ABILITY_EMERGENCY_FUNDS',
    description: 'Inject credits into the hero empire.',
    cooldown: 8,
    trigger({ hero, empire, popularityScalar, log }) {
      const baseGrant = 2000;
      const grant = Math.round(baseGrant * popularityScalar);
      empire.budget_credits = (empire.budget_credits || 0) + grant;
      const message = `Hero Ability: ${hero.name} released ${grant} emergency credits for ${empire.name}.`;
      log.push(message);
      getLogger().info(message);
    }
  }
};
