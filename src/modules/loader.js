import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './logger.js';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a single module from a YAML file
 */
export function loadModuleFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = yaml.load(content);
    
    // Validate module structure
    if (!doc.module || !doc.module.id) {
      throw new Error(`Invalid module file: ${filePath} - missing module.id`);
    }

    return doc;
  } catch (error) {
    throw new Error(`Failed to load module from ${filePath}: ${error.message}`);
  }
}

/**
 * Load all modules from a directory recursively
 */
export function loadModulesFromDirectory(dirPath) {
  const modules = {};
  const index = [];

  function scanDirectory(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ds.yml')) {
        try {
          const moduleDoc = loadModuleFromFile(fullPath);
          const moduleId = moduleDoc.module.id;

          modules[moduleId] = moduleDoc;
          index.push({
            id: moduleId,
            name: moduleDoc.module.name,
            type: moduleDoc.module.type,
            category: moduleDoc.module.category,
            version: moduleDoc.module.version,
            tags: moduleDoc.metadata?.tags || [],
            dependencies: moduleDoc.module.dependencies || [],
            file_path: fullPath,
            hash: '', // Could compute hash if needed
            compiled_at: new Date().toISOString()
          });
        } catch (error) {
          getLogger().warn(`Skipping module file ${fullPath}: ${error.message}`);
        }
      }
    }
  }

  scanDirectory(dirPath);

  return {
    modules,
    index
  };
}

/**
 * Create a module registry from the modules directory
 */
export function createModuleRegistry(modulesDir = null) {
  const defaultModulesDir = path.join(__dirname, '..', '..', 'modules');
  const targetDir = modulesDir || defaultModulesDir;

  if (!fs.existsSync(targetDir)) {
    getLogger().warn(`Modules directory not found: ${targetDir}`);
    return { modules: {}, index: [] };
  }

  return loadModulesFromDirectory(targetDir);
}

/**
 * Get module by ID from registry
 */
export function getModule(registry, moduleId) {
  return registry.modules[moduleId];
}

/**
 * Get all modules of a specific type
 */
export function getModulesByType(registry, type) {
  return registry.index.filter(entry => entry.type === type);
}

/**
 * Get all modules with a specific tag
 */
export function getModulesByTag(registry, tag) {
  return registry.index.filter(entry => entry.tags.includes(tag));
}
