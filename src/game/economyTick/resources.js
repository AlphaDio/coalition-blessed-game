import { getLogger } from '../../modules/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let RESOURCES_DATA = null;

const DEFAULT_RESOURCE_POLICIES = {
  biomass: 'perishable',
  plasma_fuel: 'deferred',
  super_alloys: 'persistent',
  genomes: 'persistent',
  ancient_relics: 'persistent',
  sentient_cores: 'persistent',
  wormhole_reactors: 'persistent',
  dark_matter: 'persistent',
  anti_grav_modules: 'persistent'
};

function normalizeCommodity(commodity) {
  const persistencePolicy = commodity.persistence_policy ||
    DEFAULT_RESOURCE_POLICIES[commodity.key] || 'deferred';
  const maxBacklogAge = persistencePolicy === 'persistent'
    ? null
    : (Number.isFinite(Number(commodity.max_backlog_age))
      ? Math.max(1, Math.floor(Number(commodity.max_backlog_age)))
      : (persistencePolicy === 'perishable' ? 1 : 3));
  const pressure = typeof commodity.pressure === 'object' && commodity.pressure
    ? commodity.pressure
    : { key: `${commodity.key}_pressure`, weight: 1 };

  return {
    ...commodity,
    persistence_policy: persistencePolicy,
    max_backlog_age: maxBacklogAge,
    pressure
  };
}

/**
 * Load resources data
 */
export function loadResources() {
  if (RESOURCES_DATA) return RESOURCES_DATA;

  try {
    const resourcesPath = path.join(__dirname, '..', '..', '..', 'modules', 'resources.yaml');
    const content = fs.readFileSync(resourcesPath, 'utf8');
    const doc = yaml.load(content);
    RESOURCES_DATA = {
      ...doc.resources,
      commodities: (doc.resources?.commodities || []).map(normalizeCommodity)
    };
    return RESOURCES_DATA;
  } catch (error) {
    getLogger().warn(`Failed to load resources: ${error.message}`);
    return { tiers: {}, commodities: [] };
  }
}
