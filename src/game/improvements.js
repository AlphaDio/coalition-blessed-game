/**
 * Improvements System - Core types and logic
 * Implements the coalition game improvements system including:
 * - Requests board with TTL
 * - Per-owner improvement queues
 * - Sustainment and degradation
 * - Market integration
 */

import { getLogger } from '../modules/logger.js';

// ============================================================================
// Type Creators
// ============================================================================

/**
 * Create an improvement template definition
 */
export function createImprovementTemplate(id, options = {}) {
  return {
    id,
    title: options.title || id,
    kind: options.kind || 'infrastructure',
    size: options.size || 40,
    work: options.work || 120,
    supplies_cost: options.supplies_cost || 30,
    
    onBuilt: options.onBuilt || [],
    
    upkeep: options.upkeep || {
      cadence: 10,
      inputs: {},
      sourcing: {
        priority: ['stockpile', 'market'],
        payer: 'empire',
        delivery: 'improvement_buffer'
      }
    },
    
    production: options.production || {
      cadence: 10,
      mode: 'market_sell',
      outputs: {},
      sell: {
        seller_goods_from: 'improvement_buffer',
        credit_receiver: 'empire',
        originator_tags: ['improvement_output']
      },
      stockpile_add: {
        owner: 'empire'
      }
    }
  };
}

/**
 * Create a request (proposal for an improvement)
 */
export function createRequest(id, options = {}) {
  return {
    id,
    source: options.source || 'system',
    target: options.target || 'coalition',
    template_key: options.template_key,
    supplies_cost: options.supplies_cost || 30,
    approval_on_accept: options.approval_on_accept || {
      target_add: 6,
      others_without_queue_add: -2
    },
    created_at_tick: options.created_at_tick || 0,
    expires_at_tick: options.expires_at_tick || 0,
    preview_effects: options.preview_effects || []
  };
}

/**
 * Create an improvement queue (per owner: coalition or empire)
 */
export function createImprovementQueue(owner_id, options = {}) {
  return {
    owner_id,
    capacity: options.capacity || 100,
    potency: options.potency || 10,
    fill_policy: options.fill_policy || 'fifo',
    share_policy: options.share_policy || 'proportional',
    active_ids: [],
    pending_ids: [],
    completed_log: []
  };
}

/**
 * Create an improvement item (in a queue)
 */
export function createImprovementItem(id, options = {}) {
  return {
    id,
    owner_queue: options.owner_queue,
    target: options.target,
    template_key: options.template_key,
    title: options.title || 'Improvement',
    size: options.size || 40,
    work: options.work || 120,
    progress: 0,
    status: 'pending', // pending|active|completed|cancelled
    state: 'Normal', // Normal|Degraded
    paid: options.paid || { supplies: 0 },
    sustain: options.sustain || {
      buffer: {},
      last_upkeep_tick: 0,
      last_production_tick: 0,
      upkeep_met: true
    },
    onBuilt: options.onBuilt || []
  };
}

/**
 * Create a stat modifier
 */
export function createStatModifier(key, options = {}) {
  return {
    key,
    tags: options.tags || [],
    stacking: options.stacking || 'stack', // stack|refresh|unique
    duration: options.duration || -1, // -1 = permanent
    applied_at_tick: options.applied_at_tick || 0,
    effects: options.effects || []
  };
}

/**
 * Create a stat definition
 */
export function createStatDefinition(key, options = {}) {
  return {
    key,
    default_base: options.default_base !== undefined ? options.default_base : 0,
    min: options.min !== undefined ? options.min : null,
    max: options.max !== undefined ? options.max : null,
    rounding: options.rounding || 'none' // none|floor|ceil|round
  };
}

// ============================================================================
// Stats System - (base + flat) * (1 + pct)
// ============================================================================

/**
 * Calculate final stat value from base and modifiers
 * Formula: (base + flat_total) * (1 + pct_total)
 */
export function calculateStat(base, modifiers, statDef) {
  let flat_total = 0;
  let pct_total = 0;
  
  modifiers.forEach(mod => {
    mod.effects.forEach(effect => {
      if (effect.add_stat_flat && effect.add_stat_flat.key === statDef.key) {
        flat_total += effect.add_stat_flat.add;
      }
      if (effect.add_stat_pct && effect.add_stat_pct.key === statDef.key) {
        pct_total += effect.add_stat_pct.add;
      }
    });
  });
  
  let final = (base + flat_total) * (1 + pct_total);
  
  // Apply rounding
  if (statDef.rounding === 'floor') {
    final = Math.floor(final);
  } else if (statDef.rounding === 'ceil') {
    final = Math.ceil(final);
  } else if (statDef.rounding === 'round') {
    final = Math.round(final);
  }
  
  // Apply bounds
  if (statDef.min !== null && final < statDef.min) {
    final = statDef.min;
  }
  if (statDef.max !== null && final > statDef.max) {
    final = statDef.max;
  }
  
  return final;
}

/**
 * Add a modifier to an entity's modifier list
 * Handles stacking modes: stack, refresh, unique
 */
export function addModifier(entity, modifier) {
  if (!entity.modifiers_list) {
    entity.modifiers_list = [];
  }
  
  const existing = entity.modifiers_list.find(m => m.key === modifier.key);
  
  if (modifier.stacking === 'unique') {
    // Only one instance allowed
    if (existing) {
      // Refresh duration
      existing.duration = modifier.duration;
      existing.applied_at_tick = modifier.applied_at_tick;
    } else {
      entity.modifiers_list.push(modifier);
    }
  } else if (modifier.stacking === 'refresh') {
    // Remove existing and add new
    if (existing) {
      entity.modifiers_list = entity.modifiers_list.filter(m => m.key !== modifier.key);
    }
    entity.modifiers_list.push(modifier);
  } else {
    // stack - always add
    entity.modifiers_list.push(modifier);
  }
}

/**
 * Remove a modifier by key
 */
export function removeModifier(entity, modifierKey) {
  if (!entity.modifiers_list) {
    return;
  }
  entity.modifiers_list = entity.modifiers_list.filter(m => m.key !== modifierKey);
}

/**
 * Remove expired modifiers (duration tracking)
 */
export function removeExpiredModifiers(entity, currentTick) {
  if (!entity.modifiers_list) {
    return;
  }
  
  entity.modifiers_list = entity.modifiers_list.filter(mod => {
    if (mod.duration === -1) {
      return true; // Permanent
    }
    const elapsed = currentTick - mod.applied_at_tick;
    return elapsed < mod.duration;
  });
}

// ============================================================================
// Requests Board
// ============================================================================

/**
 * Initialize requests board
 */
export function initializeRequestsBoard(state) {
  if (!state.requestsBoard) {
    state.requestsBoard = {
      cap: 12,
      default_ttl_ticks: 400,
      refresh_cadence_ticks: 50,
      per_empire_soft_cap: 2,
      requests: [],
      last_refresh_tick: 0
    };
  }
}

/**
 * Refresh requests board if due
 */
export function refreshRequestsIfDue(state, templates, rng) {
  const board = state.requestsBoard;
  if (!board) return;
  
  const ticksSinceRefresh = state.turn - board.last_refresh_tick;
  if (ticksSinceRefresh < board.refresh_cadence_ticks) {
    return;
  }
  
  board.last_refresh_tick = state.turn;
  
  // Remove expired requests
  board.requests = board.requests.filter(req => req.expires_at_tick > state.turn);
  
  // Generate new requests if below cap
  while (board.requests.length < board.cap) {
    const request = generateRequest(state, templates, rng);
    if (request) {
      board.requests.push(request);
    } else {
      break; // No more requests to generate
    }
  }
}

/**
 * Generate a new request
 */
function generateRequest(state, templates, rng) {
  const logger = getLogger();
  
  // Helper to call rng - handles both function and object with .random()
  const random = () => {
    if (typeof rng === 'function') {
      return rng();
    } else if (rng && typeof rng.random === 'function') {
      return rng.random();
    }
    return Math.random();
  };
  
  // Simple generation: pick a random template and random target empire
  const templateKeys = Object.keys(templates);
  if (templateKeys.length === 0) return null;
  
  const templateKey = templateKeys[Math.floor(random() * templateKeys.length)];
  const template = templates[templateKey];
  
  // Pick a random empire as target (75%) or coalition (25%)
  let target = 'coalition';
  let source = 'system';
  
  if (random() < 0.75 && state.empires.length > 0) {
    const targetEmpire = state.empires[Math.floor(random() * state.empires.length)];
    target = `empire:${targetEmpire.id}`;
    
    // Sometimes the source is another empire (50%)
    if (random() < 0.5 && state.empires.length > 1) {
      const otherEmpires = state.empires.filter(e => e.id !== targetEmpire.id);
      if (otherEmpires.length > 0) {
        const sourceEmpire = otherEmpires[Math.floor(random() * otherEmpires.length)];
        source = `empire:${sourceEmpire.id}`;
      }
    }
  }
  
  const requestId = `req_${state.turn}_${Math.floor(random() * 10000)}`;
  const request = createRequest(requestId, {
    source,
    target,
    template_key: templateKey,
    supplies_cost: template.supplies_cost,
    created_at_tick: state.turn,
    expires_at_tick: state.turn + state.requestsBoard.default_ttl_ticks
  });
  
  logger.debug(`Generated request: ${requestId} for ${target} (template: ${templateKey})`);
  return request;
}

/**
 * Accept a request
 */
export function acceptRequest(state, requestId, templates) {
  const logger = getLogger();
  const board = state.requestsBoard;
  const request = board.requests.find(r => r.id === requestId);
  
  if (!request) {
    logger.warn(`Request ${requestId} not found`);
    return { success: false, reason: 'Request not found' };
  }
  
  // Step 1: Pay supplies from coalition stockpile
  if (!state.coalitionEconomy || !state.coalitionEconomy.stockpiles) {
    logger.warn('Coalition economy not initialized');
    return { success: false, reason: 'Coalition economy not initialized' };
  }
  
  const suppliesAvailable = state.coalitionEconomy.stockpiles.Supplies || 0;
  if (suppliesAvailable < request.supplies_cost) {
    logger.warn(`Insufficient supplies: need ${request.supplies_cost}, have ${suppliesAvailable}`);
    return { success: false, reason: 'Insufficient supplies' };
  }
  
  state.coalitionEconomy.stockpiles.Supplies -= request.supplies_cost;
  
  // Step 2: Apply approval effects
  applyRequestApproval(state, request);
  
  // Step 3: Enqueue improvement
  const template = templates[request.template_key];
  if (!template) {
    logger.warn(`Template ${request.template_key} not found`);
    return { success: false, reason: 'Template not found' };
  }
  
  const improvement = createImprovementFromRequest(request, template, state.turn);
  enqueueImprovement(state, improvement);
  
  // Remove request from board
  board.requests = board.requests.filter(r => r.id !== requestId);
  
  logger.info(`Accepted request ${requestId}, improvement ${improvement.id} enqueued`);
  return { success: true, improvement };
}

/**
 * Apply approval effects from accepting a request
 */
function applyRequestApproval(state, request) {
  const logger = getLogger();
  
  // Parse target
  let targetEmpireId = null;
  if (request.target.startsWith('empire:')) {
    targetEmpireId = request.target.substring(7);
  }
  
  if (!targetEmpireId) {
    logger.debug('Request target is coalition, no approval changes');
    return;
  }
  
  // Get empires with improvements in their queue
  const empiresWithQueue = new Set();
  if (state.improvementQueues) {
    Object.keys(state.improvementQueues).forEach(ownerId => {
      if (ownerId.startsWith('empire:')) {
        const queue = state.improvementQueues[ownerId];
        if (queue.active_ids.length > 0 || queue.pending_ids.length > 0) {
          const empireId = ownerId.substring(7);
          empiresWithQueue.add(empireId);
        }
      }
    });
  }
  
  // Apply approval changes
  state.empires.forEach(empire => {
    if (empire.id === targetEmpireId) {
      // Target empire gets bonus
      empire.approval = Math.min(100, empire.approval + request.approval_on_accept.target_add);
      logger.debug(`Empire ${empire.id} approval +${request.approval_on_accept.target_add} -> ${empire.approval}`);
    } else if (!empiresWithQueue.has(empire.id)) {
      // Other empires without queue get penalty
      empire.approval = Math.max(-100, empire.approval + request.approval_on_accept.others_without_queue_add);
      logger.debug(`Empire ${empire.id} approval ${request.approval_on_accept.others_without_queue_add} -> ${empire.approval}`);
    }
  });
}

/**
 * Create improvement from request
 */
function createImprovementFromRequest(request, template, currentTick) {
  const improvementId = `imp_${currentTick}_${request.id}`;
  
  return createImprovementItem(improvementId, {
    owner_queue: request.target,
    target: request.target,
    template_key: request.template_key,
    title: template.title,
    size: template.size,
    work: template.work,
    paid: { supplies: request.supplies_cost },
    onBuilt: template.onBuilt || []
  });
}

/**
 * Enqueue an improvement
 */
function enqueueImprovement(state, improvement) {
  const logger = getLogger();
  
  if (!state.improvementQueues) {
    state.improvementQueues = {};
  }
  
  if (!state.improvements) {
    state.improvements = {};
  }
  
  // Get or create queue
  const queueId = improvement.owner_queue;
  if (!state.improvementQueues[queueId]) {
    state.improvementQueues[queueId] = createImprovementQueue(queueId);
  }
  
  const queue = state.improvementQueues[queueId];
  
  // Check capacity
  if (improvement.size > queue.capacity) {
    logger.warn(`Improvement ${improvement.id} size ${improvement.size} exceeds queue capacity ${queue.capacity}`);
    return false;
  }
  
  // Add to pending
  queue.pending_ids.push(improvement.id);
  state.improvements[improvement.id] = improvement;
  
  logger.debug(`Enqueued improvement ${improvement.id} to ${queueId}`);
  return true;
}

// ============================================================================
// Queue Scheduling
// ============================================================================

/**
 * Schedule improvements in all queues
 * Moves pending items to active based on capacity and fill policy
 */
export function scheduleAllQueues(state) {
  if (!state.improvementQueues) return;
  
  Object.values(state.improvementQueues).forEach(queue => {
    scheduleQueue(state, queue);
  });
}

/**
 * Schedule a single queue
 */
function scheduleQueue(state, queue) {
  const logger = getLogger();
  
  // Calculate used capacity
  let usedCapacity = 0;
  queue.active_ids.forEach(impId => {
    const imp = state.improvements[impId];
    if (imp && imp.status === 'active') {
      usedCapacity += imp.size;
    }
  });
  
  // Try to activate pending items
  while (queue.pending_ids.length > 0) {
    const nextId = queue.pending_ids[0];
    const nextImp = state.improvements[nextId];
    
    if (!nextImp) {
      queue.pending_ids.shift();
      continue;
    }
    
    // Check if it fits
    const freeCapacity = queue.capacity - usedCapacity;
    if (nextImp.size > freeCapacity) {
      break; // Can't fit
    }
    
    // Activate it
    queue.pending_ids.shift();
    queue.active_ids.push(nextId);
    nextImp.status = 'active';
    usedCapacity += nextImp.size;
    
    logger.debug(`Activated improvement ${nextId} in queue ${queue.owner_id}`);
  }
}

// ============================================================================
// Progress Advancement
// ============================================================================

/**
 * Advance progress on all active improvements
 */
export function advanceImprovementProgress(state) {
  if (!state.improvementQueues) return;
  
  Object.values(state.improvementQueues).forEach(queue => {
    advanceQueueProgress(state, queue);
  });
}

/**
 * Advance progress for a queue
 */
function advanceQueueProgress(state, queue) {
  const logger = getLogger();
  
  // Get active improvements
  const activeImps = queue.active_ids
    .map(id => state.improvements[id])
    .filter(imp => imp && imp.status === 'active');
  
  if (activeImps.length === 0) return;
  
  // Calculate progress shares based on policy
  const shares = calculateProgressShares(activeImps, queue);
  
  // Apply progress
  activeImps.forEach((imp, index) => {
    const share = shares[index];
    imp.progress += share;
    
    // Check for completion
    if (imp.progress >= imp.work) {
      imp.progress = imp.work;
      imp.status = 'completed';
      queue.active_ids = queue.active_ids.filter(id => id !== imp.id);
      queue.completed_log.push({
        id: imp.id,
        completed_at_tick: state.turn
      });
      
      // Apply onBuilt effects
      applyOnBuiltEffects(state, imp);
      
      logger.info(`Improvement ${imp.id} completed in queue ${queue.owner_id}`);
    }
  });
}

/**
 * Calculate progress shares for active improvements
 */
function calculateProgressShares(activeImps, queue) {
  const shares = [];
  
  if (queue.share_policy === 'equal') {
    // Equal share
    const sharePerImp = queue.potency / activeImps.length;
    activeImps.forEach(() => shares.push(sharePerImp));
  } else if (queue.share_policy === 'proportional') {
    // Proportional to size
    const totalSize = activeImps.reduce((sum, imp) => sum + imp.size, 0);
    activeImps.forEach(imp => {
      const share = queue.potency * (imp.size / totalSize);
      shares.push(share);
    });
  } else if (queue.share_policy === 'focus') {
    // All to first (or focused item if implemented)
    activeImps.forEach((imp, index) => {
      shares.push(index === 0 ? queue.potency : 0);
    });
  }
  
  return shares;
}

/**
 * Apply onBuilt effects when improvement completes
 */
function applyOnBuiltEffects(state, improvement) {
  const logger = getLogger();
  
  if (!improvement.onBuilt || improvement.onBuilt.length === 0) {
    return;
  }
  
  // Parse target
  let targetEntity = null;
  if (improvement.target === 'coalition') {
    targetEntity = state; // Apply to state itself
  } else if (improvement.target.startsWith('empire:')) {
    const empireId = improvement.target.substring(7);
    targetEntity = state.empires.find(e => e.id === empireId);
  }
  
  if (!targetEntity) {
    logger.warn(`Cannot apply onBuilt effects for ${improvement.id}: target ${improvement.target} not found`);
    return;
  }
  
  improvement.onBuilt.forEach(effect => {
    if (effect.add_modifier) {
      const modifier = createStatModifier(effect.add_modifier.key, {
        duration: effect.add_modifier.duration || -1,
        applied_at_tick: state.turn,
        effects: [] // Effects are in the modifier definition
      });
      addModifier(targetEntity, modifier);
      logger.debug(`Applied modifier ${modifier.key} to ${improvement.target}`);
    }
    
    if (effect.add_stat_flat) {
      // For immediate stat changes, we'd need a stats field on the entity
      // For now, we'll use modifiers for everything
      const modifier = createStatModifier(`${improvement.id}_flat_${effect.add_stat_flat.key}`, {
        duration: -1,
        applied_at_tick: state.turn,
        effects: [effect]
      });
      addModifier(targetEntity, modifier);
      logger.debug(`Applied flat stat ${effect.add_stat_flat.key} to ${improvement.target}`);
    }
    
    if (effect.add_stat_pct) {
      const modifier = createStatModifier(`${improvement.id}_pct_${effect.add_stat_pct.key}`, {
        duration: -1,
        applied_at_tick: state.turn,
        effects: [effect]
      });
      addModifier(targetEntity, modifier);
      logger.debug(`Applied pct stat ${effect.add_stat_pct.key} to ${improvement.target}`);
    }
  });
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize improvements system
 */
export function initializeImprovementsSystem(state) {
  initializeRequestsBoard(state);
  
  if (!state.improvementQueues) {
    state.improvementQueues = {};
  }
  
  if (!state.improvements) {
    state.improvements = {};
  }
  
  if (!state.improvementTemplates) {
    state.improvementTemplates = {};
  }
}
