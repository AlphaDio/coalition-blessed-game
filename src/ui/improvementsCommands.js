/**
 * Command handlers for improvements system
 * Handles req and imp command groups
 */

import { acceptRequest } from '../game/improvements.js';

/**
 * Handle 'req' command group
 * Commands: req list, req inspect <id>, req accept <id>, req ignore <id>
 */
export function handleReqCommand(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: req <list|inspect|accept|ignore> [args]. Type "help req" for details.'
    };
  }
  
  const subcommand = args[0];
  const subargs = args.slice(1);
  
  switch (subcommand) {
    case 'list':
      return handleReqList(subargs, state);
    case 'inspect':
      return handleReqInspect(subargs, state);
    case 'accept':
      return handleReqAccept(subargs, state);
    case 'ignore':
      return handleReqIgnore(subargs, state);
    default:
      return {
        success: false,
        message: `Unknown req subcommand: '${subcommand}'. Use: list, inspect, accept, ignore`
      };
  }
}

/**
 * Handle 'imp' command group
 * Commands: imp show <owner_id>, imp cancel <owner_id> <imp_id>, imp reorder, imp set
 */
export function handleImpCommand(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: imp <show|cancel|reorder|set> [args]. Type "help imp" for details.'
    };
  }
  
  const subcommand = args[0];
  const subargs = args.slice(1);
  
  switch (subcommand) {
    case 'show':
      return handleImpShow(subargs, state);
    case 'cancel':
      return handleImpCancel(subargs, state);
    case 'reorder':
      return handleImpReorder(subargs, state);
    case 'set':
      return handleImpSet(subargs, state);
    default:
      return {
        success: false,
        message: `Unknown imp subcommand: '${subcommand}'. Use: show, cancel, reorder, set`
      };
  }
}

// ============================================================================
// Request command handlers
// ============================================================================

function handleReqList(args, state) {
  if (!state.requestsBoard || !state.requestsBoard.requests) {
    return {
      success: false,
      message: 'Requests board not initialized.'
    };
  }
  
  const requests = state.requestsBoard.requests;
  
  if (requests.length === 0) {
    return {
      success: true,
      message: 'No active requests on the board.'
    };
  }
  
  // Format request list
  const lines = [
    '{bold}Active Requests:{/bold}',
    ''
  ];
  
  requests.forEach((req, index) => {
    const ttl = req.expires_at_tick - state.turn;
    lines.push(`${index + 1}. {cyan-fg}${req.id}{/cyan-fg}`);
    lines.push(`   Template: ${req.template_key}`);
    lines.push(`   Target: ${req.target}`);
    lines.push(`   Cost: ${req.supplies_cost} Supplies`);
    lines.push(`   TTL: ${ttl} ticks`);
    lines.push('');
  });
  
  return {
    success: true,
    message: lines.join('\n')
  };
}

function handleReqInspect(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: req inspect <request_id>'
    };
  }
  
  const requestId = args[0];
  const request = state.requestsBoard?.requests?.find(r => r.id === requestId);
  
  if (!request) {
    return {
      success: false,
      message: `Request '${requestId}' not found.`
    };
  }
  
  const template = state.improvementTemplates?.[request.template_key];
  const ttl = request.expires_at_tick - state.turn;
  
  const lines = [
    `{bold}Request: {cyan-fg}${request.id}{/cyan-fg}{/bold}`,
    '',
    `Source: ${request.source}`,
    `Target: ${request.target}`,
    `Template: ${request.template_key}`,
    `Cost: ${request.supplies_cost} Supplies`,
    `TTL: ${ttl} ticks`,
    ''
  ];
  
  if (template) {
    lines.push('{bold}Improvement Details:{/bold}');
    lines.push(`Title: ${template.title}`);
    lines.push(`Type: ${template.kind}`);
    lines.push(`Size: ${template.size} (queue capacity)`);
    lines.push(`Work: ${template.work} (progress to complete)`);
    lines.push('');
    
    if (template.onBuilt && template.onBuilt.length > 0) {
      lines.push('{bold}Benefits on Completion:{/bold}');
      template.onBuilt.forEach(effect => {
        if (effect.add_stat_flat) {
          lines.push(`  +${effect.add_stat_flat.add} ${effect.add_stat_flat.key}`);
        }
        if (effect.add_stat_pct) {
          lines.push(`  +${(effect.add_stat_pct.add * 100).toFixed(0)}% ${effect.add_stat_pct.key}`);
        }
        if (effect.add_modifier) {
          lines.push(`  Modifier: ${effect.add_modifier.key}`);
        }
      });
    }
  }
  
  lines.push('');
  lines.push('{green-fg}Use "req accept ' + request.id + '" to accept this request{/green-fg}');
  
  return {
    success: true,
    message: lines.join('\n')
  };
}

function handleReqAccept(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: req accept <request_id>'
    };
  }
  
  const requestId = args[0];
  
  if (!state.improvementTemplates) {
    return {
      success: false,
      message: 'Improvements system not initialized.'
    };
  }
  
  const result = acceptRequest(state, requestId, state.improvementTemplates);
  
  if (!result.success) {
    return {
      success: false,
      message: `Failed to accept request: ${result.reason}`
    };
  }
  
  return {
    success: true,
    action: 'REQUEST_ACCEPTED',
    message: `Request accepted! Improvement ${result.improvement.title} enqueued to ${result.improvement.target}.`
  };
}

function handleReqIgnore(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: req ignore <request_id>'
    };
  }
  
  const requestId = args[0];
  
  return {
    success: true,
    message: `Request '${requestId}' will be ignored (remains until expiry).`
  };
}

// ============================================================================
// Improvement command handlers
// ============================================================================

function handleImpShow(args, state) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: imp show <owner_id>. Examples: imp show coalition, imp show empire:empire1'
    };
  }
  
  const ownerId = args[0];
  const queue = state.improvementQueues?.[ownerId];
  
  if (!queue) {
    return {
      success: false,
      message: `No improvement queue found for '${ownerId}'.`
    };
  }
  
  const lines = [
    `{bold}Improvement Queue: {cyan-fg}${ownerId}{/cyan-fg}{/bold}`,
    '',
    `Capacity: ${queue.capacity}`,
    `Potency: ${queue.potency}/tick`,
    `Fill Policy: ${queue.fill_policy}`,
    `Share Policy: ${queue.share_policy}`,
    ''
  ];
  
  // Active improvements
  if (queue.active_ids.length > 0) {
    lines.push('{bold}ACTIVE:{/bold}');
    queue.active_ids.forEach((impId, index) => {
      const imp = state.improvements?.[impId];
      if (imp) {
        const progress = ((imp.progress / imp.work) * 100).toFixed(0);
        lines.push(`${index + 1}. ${imp.title} - ${imp.progress}/${imp.work} (${progress}%) [${imp.state}]`);
      }
    });
    lines.push('');
  }
  
  // Pending improvements
  if (queue.pending_ids.length > 0) {
    lines.push('{bold}PENDING:{/bold}');
    queue.pending_ids.forEach((impId, index) => {
      const imp = state.improvements?.[impId];
      if (imp) {
        lines.push(`${index + 1}. ${imp.title} - Size: ${imp.size}, Work: ${imp.work}`);
      }
    });
    lines.push('');
  }
  
  if (queue.active_ids.length === 0 && queue.pending_ids.length === 0) {
    lines.push('No improvements in queue.');
  }
  
  return {
    success: true,
    message: lines.join('\n')
  };
}

function handleImpCancel(args, state) {
  if (args.length < 2) {
    return {
      success: false,
      message: 'Usage: imp cancel <owner_id> <improvement_id>'
    };
  }
  
  const ownerId = args[0];
  const impId = args[1];
  
  const queue = state.improvementQueues?.[ownerId];
  if (!queue) {
    return {
      success: false,
      message: `No queue found for '${ownerId}'.`
    };
  }
  
  const imp = state.improvements?.[impId];
  if (!imp) {
    return {
      success: false,
      message: `Improvement '${impId}' not found.`
    };
  }
  
  // Remove from queue
  queue.active_ids = queue.active_ids.filter(id => id !== impId);
  queue.pending_ids = queue.pending_ids.filter(id => id !== impId);
  imp.status = 'cancelled';
  
  return {
    success: true,
    action: 'IMPROVEMENT_CANCELLED',
    message: `Improvement '${imp.title}' cancelled. No refunds.`
  };
}

function handleImpReorder(args, state) {
  return {
    success: false,
    message: 'imp reorder not yet implemented.'
  };
}

function handleImpSet(args, state) {
  if (args.length < 3) {
    return {
      success: false,
      message: 'Usage: imp set <capacity|potency> <owner_id> <value>'
    };
  }
  
  const property = args[0];
  const ownerId = args[1];
  const value = parseFloat(args[2]);
  
  if (isNaN(value)) {
    return {
      success: false,
      message: `Invalid value: '${args[2]}'. Must be a number.`
    };
  }
  
  const queue = state.improvementQueues?.[ownerId];
  if (!queue) {
    return {
      success: false,
      message: `No queue found for '${ownerId}'.`
    };
  }
  
  if (property === 'capacity') {
    queue.capacity = value;
    return {
      success: true,
      message: `Queue capacity for '${ownerId}' set to ${value}.`
    };
  } else if (property === 'potency') {
    queue.potency = value;
    return {
      success: true,
      message: `Queue potency for '${ownerId}' set to ${value}.`
    };
  } else {
    return {
      success: false,
      message: `Unknown property: '${property}'. Use: capacity, potency`
    };
  }
}

/**
 * Get help text for improvements commands
 */
export function getImprovementsHelpText() {
  return [
    '{cyan-fg}Requests:{/cyan-fg}',
    '  req list                    - List all active requests',
    '  req inspect <id>            - Inspect a request',
    '  req accept <id>             - Accept a request (costs supplies)',
    '  req ignore <id>             - Ignore a request (leaves until expiry)',
    '',
    '{cyan-fg}Improvements:{/cyan-fg}',
    '  imp show <owner>            - Show improvement queue',
    '  imp cancel <owner> <id>     - Cancel an improvement (no refunds)',
    '  imp set capacity <owner> <n> - Set queue capacity',
    '  imp set potency <owner> <n>  - Set queue potency'
  ];
}
