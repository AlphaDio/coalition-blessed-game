/**
 * File loading utilities for YAML configuration and data files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { getLogger } from '../modules/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for loaded files
const FILE_CACHE = new Map();

/**
 * Get the project root directory
 * @returns {string} Path to project root
 */
export function getProjectRoot() {
  return path.join(__dirname, '..', '..');
}

/**
 * Load a YAML file with caching
 * @param {string} relativePath - Path relative to project root
 * @param {*} defaultValue - Default value if file not found
 * @returns {*} Parsed YAML content or default value
 */
export function loadYaml(relativePath, defaultValue = null) {
  const cacheKey = relativePath;
  
  if (FILE_CACHE.has(cacheKey)) {
    return FILE_CACHE.get(cacheKey);
  }
  
  try {
    const fullPath = path.join(getProjectRoot(), relativePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const doc = yaml.load(content);
    FILE_CACHE.set(cacheKey, doc);
    return doc;
  } catch (error) {
    const logger = getLogger();
    logger.warn(`Failed to load YAML file ${relativePath}: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Load resources data from docs/input/resources.yaml
 * @returns {Object} Resources data with tiers and commodities
 */
export function loadResources() {
  const doc = loadYaml('modules/resources.yaml', { resources: { tiers: {}, commodities: [] } });
  return doc.resources || { tiers: {}, commodities: [] };
}

/**
 * Load economy system configuration from docs/input/economy_system.yaml
 * @returns {Object} Economy system configuration
 */
export function loadEconomySystemConfig() {
  const doc = loadYaml('docs/input/economy_system.yaml', null);
  return doc?.economy_system || null;
}

/**
 * Clear the file cache (useful for testing or hot reloading)
 */
export function clearFileCache() {
  FILE_CACHE.clear();
}

/**
 * Get a commodity's tier from resources data
 * @param {string} commodityKey - The commodity key
 * @param {Object} resources - Resources data (optional, will load if not provided)
 * @returns {string} Tier key (e.g., 't1', 't2', 't3', 't4')
 */
export function getCommodityTier(commodityKey, resources = null) {
  const res = resources || loadResources();
  const commodity = res.commodities?.find(c => c.key === commodityKey);
  return commodity?.tier || 't1';
}
