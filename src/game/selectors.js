/**
 * Dynamic selector system for module-based targeting
 * 
 * Selectors allow events, laws, and other modules to target game entities
 * dynamically rather than hardcoding specific IDs.
 * 
 * Selector syntax in YAML:
 *   target:
 *     type: "empire" | "army"
 *     select: "all" | "random" | "highest" | "lowest" | "first" | "exclude"
 *     by: "population" | "approval" | "fervor" | "organization" | etc.
 *     filter:
 *       - { field: "approval", op: "gt", value: 50 }
 *       - { has_tag: "Industrial" }
 *       - { has_trait: "mechanical" }
 *     count: 1  # for random/highest/lowest, how many to select
 *     exclude: ["$primary"]  # exclude previously selected targets
 *     as: "primary" | "secondary" | etc.  # name for later reference
 */

import { getLogger } from '../modules/logger.js';

/**
 * Resolve a selector against game state
 * @param {Object} selector - The selector definition
 * @param {Object} state - Current game state
 * @param {Object} context - Resolution context (previously selected targets)
 * @returns {Array} - Array of selected entity IDs
 */
export function resolveSelector(selector, state, context = {}) {
  const logger = getLogger();
  
  if (!selector || !selector.type) {
    logger.error('Invalid selector: missing type', { selector });
    return [];
  }

  // Get the entity pool based on type
  let pool = getEntityPool(selector.type, state);
  if (!pool || pool.length === 0) {
    logger.debug(`No entities of type ${selector.type} found`);
    return [];
  }

  // Apply filters
  if (selector.filter) {
    pool = applyFilters(pool, selector.filter, state, context);
  }

  // Apply exclusions
  if (selector.exclude) {
    pool = applyExclusions(pool, selector.exclude, context);
  }

  // Apply selection strategy
  const selected = applySelection(pool, selector, state);

  logger.debug(`Selector resolved: ${selector.type}/${selector.select || 'all'}`, {
    poolSize: pool.length,
    selectedCount: selected.length,
    selectedIds: selected.map(e => e.id)
  });

  return selected;
}

/**
 * Get the entity pool for a given type
 */
function getEntityPool(type, state) {
  switch (type) {
    case 'empire':
      return [...(state.empires || [])];
    case 'army':
      // Filter out synthetic armies (scourge, insurrection, combined)
      return (state.armies || []).filter(a => 
        !a.id.startsWith('_scourge') &&
        !a.id.startsWith('_coalition_combined') &&
        !a.id.startsWith('_insurrection')
      );
    default:
      return [];
  }
}

/**
 * Apply filter conditions to the pool
 */
function applyFilters(pool, filters, state, context) {
  if (!Array.isArray(filters)) {
    filters = [filters];
  }

  return pool.filter(entity => {
    return filters.every(filter => evaluateFilter(entity, filter, state, context));
  });
}

/**
 * Evaluate a single filter condition
 */
function evaluateFilter(entity, filter, state, context) {
  // Tag filter
  if (filter.has_tag) {
    const tags = entity.tags || [];
    return tags.includes(filter.has_tag);
  }

  // Trait filter
  if (filter.has_trait) {
    const traits = entity.traits || {};
    return traits[filter.has_trait] === true;
  }

  // Field comparison filter
  if (filter.field && filter.op) {
    const value = getFieldValue(entity, filter.field, state);
    return compareValues(value, filter.op, filter.value);
  }

  // Not filter (invert)
  if (filter.not) {
    return !evaluateFilter(entity, filter.not, state, context);
  }

  // Or filter (any match)
  if (filter.or && Array.isArray(filter.or)) {
    return filter.or.some(f => evaluateFilter(entity, f, state, context));
  }

  return true; // Unknown filter passes
}

/**
 * Get a field value from an entity, supporting nested paths
 */
function getFieldValue(entity, field, state) {
  // Handle special computed fields
  if (field === 'population' && entity.stats) {
    return entity.stats.population || 0;
  }

  // Handle nested paths like "stats.population"
  const parts = field.split('.');
  let value = entity;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

/**
 * Compare values based on operator
 */
function compareValues(a, op, b) {
  switch (op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'in': return Array.isArray(b) && b.includes(a);
    case 'nin': return Array.isArray(b) && !b.includes(a);
    default: return false;
  }
}

/**
 * Apply exclusions based on context references
 */
function applyExclusions(pool, exclusions, context) {
  if (!Array.isArray(exclusions)) {
    exclusions = [exclusions];
  }

  const excludeIds = new Set();
  for (const exc of exclusions) {
    if (typeof exc === 'string' && exc.startsWith('$')) {
      // Reference to context variable
      const ref = exc.slice(1);
      const refEntities = context[ref];
      if (Array.isArray(refEntities)) {
        refEntities.forEach(e => excludeIds.add(e.id));
      } else if (refEntities && refEntities.id) {
        excludeIds.add(refEntities.id);
      }
    } else if (typeof exc === 'string') {
      // Direct ID
      excludeIds.add(exc);
    }
  }

  return pool.filter(e => !excludeIds.has(e.id));
}

/**
 * Apply selection strategy to get final entities
 */
function applySelection(pool, selector, state) {
  const select = selector.select || 'all';
  const count = selector.count || 1;
  const by = selector.by;

  switch (select) {
    case 'all':
      return pool;

    case 'random':
      return selectRandom(pool, count);

    case 'highest':
      return selectByRank(pool, by, count, false, state);

    case 'lowest':
      return selectByRank(pool, by, count, true, state);

    case 'first':
      return pool.slice(0, count);

    default:
      return pool;
  }
}

/**
 * Select random entities from pool
 */
function selectRandom(pool, count) {
  if (pool.length <= count) {
    return pool;
  }

  const shuffled = [...pool];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Select entities ranked by a field
 */
function selectByRank(pool, by, count, ascending, state) {
  if (!by) {
    return pool.slice(0, count);
  }

  const sorted = [...pool].sort((a, b) => {
    const aVal = getFieldValue(a, by, state) || 0;
    const bVal = getFieldValue(b, by, state) || 0;
    return ascending ? aVal - bVal : bVal - aVal;
  });

  return sorted.slice(0, count);
}

/**
 * Resolve all selectors in an event's variables block
 * Returns a context object with named selections
 */
export function resolveEventVariables(variables, state) {
  const context = {};

  if (!variables || !Array.isArray(variables)) {
    return context;
  }

  for (const varDef of variables) {
    const { as, ...selectorDef } = varDef;
    if (!as) {
      continue; // Skip variables without a name
    }

    const selected = resolveSelector(selectorDef, state, context);
    context[as] = selected.length === 1 ? selected[0] : selected;
  }

  return context;
}

/**
 * Expand effect targets using context
 * Converts selector-based effects to concrete ID-based effects
 */
export function expandEffectTargets(effects, context, state) {
  if (!effects) return {};

  const expanded = {};

  for (const [key, value] of Object.entries(effects)) {
    if (key === 'empireApproval' && value && typeof value === 'object') {
      expanded.empireApproval = expandEntityEffects(value, context, 'empire', state);
    } else if (key === 'armyFervor' && value && typeof value === 'object') {
      expanded.armyFervor = expandEntityEffects(value, context, 'army', state);
    } else if (key === 'empireRelations' && value && typeof value === 'object') {
      expanded.empireRelations = expandEmpireRelations(value, context, state);
    } else {
      // Pass through non-entity effects
      expanded[key] = value;
    }
  }

  return expanded;
}

/**
 * Expand entity-targeted effects
 */
function expandEntityEffects(effectDef, context, entityType, state) {
  const result = {};

  for (const [target, value] of Object.entries(effectDef)) {
    if (target.startsWith('$')) {
      // Reference to context variable
      const ref = target.slice(1);
      const entities = context[ref];
      
      if (Array.isArray(entities)) {
        for (const entity of entities) {
          result[entity.id] = value;
        }
      } else if (entities && entities.id) {
        result[entities.id] = value;
      }
    } else if (target === '@all') {
      // Target all entities of this type
      const pool = getEntityPool(entityType, state);
      for (const entity of pool) {
        result[entity.id] = value;
      }
    } else if (target === '@others') {
      // Target all except those in context
      const pool = getEntityPool(entityType, state);
      const excludeIds = new Set();
      for (const [, ctxValue] of Object.entries(context)) {
        if (Array.isArray(ctxValue)) {
          ctxValue.forEach(e => e && e.id && excludeIds.add(e.id));
        } else if (ctxValue && ctxValue.id) {
          excludeIds.add(ctxValue.id);
        }
      }
      for (const entity of pool) {
        if (!excludeIds.has(entity.id)) {
          result[entity.id] = value;
        }
      }
    } else {
      // Direct ID reference (backwards compatibility)
      result[target] = value;
    }
  }

  return result;
}

/**
 * Expand empire relations effects - handles from->to empire pairs
 */
function expandEmpireRelations(effectDef, context, state) {
  const result = {};

  for (const [fromTarget, toTargets] of Object.entries(effectDef)) {
    if (!toTargets || typeof toTargets !== 'object') continue;

    // Get the source empires
    const fromEmpires = expandRelationTargets(fromTarget, context, state);

    for (const fromEmpire of fromEmpires) {
      if (!result[fromEmpire.id]) result[fromEmpire.id] = {};

      for (const [toTarget, value] of Object.entries(toTargets)) {
        // Get the target empires
        const toEmpires = expandRelationTargets(toTarget, context, state);

        for (const toEmpire of toEmpires) {
          if (fromEmpire.id !== toEmpire.id) { // Can't have relations to self
            result[fromEmpire.id][toEmpire.id] = value;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Expand relation targets (similar to expandEntityEffects but for relations)
 */
function expandRelationTargets(target, context, state) {
  const entities = [];

  if (target.startsWith('$')) {
    // Reference to context variable
    const ref = target.slice(1);
    const refEntities = context[ref];

    if (Array.isArray(refEntities)) {
      entities.push(...refEntities);
    } else if (refEntities && refEntities.id) {
      entities.push(refEntities);
    }
  } else if (target === '@all') {
    // Target all empires
    entities.push(...(state.empires || []));
  } else if (target === '@others') {
    // This is context-dependent for relations, skip for now
    // (would need more complex logic)
  } else {
    // Direct ID reference
    const empire = state.empires?.find(e => e.id === target);
    if (empire) entities.push(empire);
  }

  return entities;
}

/**
 * Interpolate text with context variables
 * Replaces ${varName} and ${varName.field} patterns
 */
export function interpolateText(text, context, state) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    const parts = expr.split('.');
    const varName = parts[0];
    const fieldPath = parts.slice(1).join('.');

    let value = context[varName];
    
    if (value === undefined) {
      return match; // Keep original if not found
    }

    // Handle arrays (take first for display)
    if (Array.isArray(value)) {
      value = value[0];
    }

    // Get nested field if specified
    if (fieldPath && value) {
      value = getFieldValue(value, fieldPath, state);
    }

    // Return name if it's an entity, otherwise the value
    if (value && typeof value === 'object' && value.name) {
      return value.name;
    }

    return value !== undefined ? String(value) : match;
  });
}
