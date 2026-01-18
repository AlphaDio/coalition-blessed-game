# Improvements System

## Overview

The Improvements System is a strategic layer that allows the coalition to accept requests for infrastructure and industry improvements. These improvements are built over time in per-owner queues and provide benefits when completed.

## Core Concepts

### Requests Board

The Requests Board is a pool of available improvement proposals that refresh periodically:
- **Capacity**: Board holds up to 12 requests at a time
- **TTL**: Each request expires after 400 ticks if not accepted
- **Refresh**: New requests generated every 50 ticks
- **Sources**: Requests come from empires or the system

### Improvement Queues

Each owner (coalition and each empire) has their own improvement queue:
- **Capacity**: Total size budget for active improvements (default: 100)
- **Potency**: Progress points distributed per tick (default: 10)
- **Fill Policy**: How pending items become active (FIFO/priority/manual)
- **Share Policy**: How potency is distributed (proportional/equal/focus)

### Improvement Lifecycle

1. **Request Generated**: Appears on the requests board with TTL
2. **Request Accepted**: Coalition pays supplies, approval effects applied
3. **Pending**: Improvement added to queue, waiting for capacity
4. **Active**: Building - progress advances each tick
5. **Completed**: onBuilt effects applied to target entity

## Share Policies

### Proportional (default)
Progress distributed based on size: `share_i = potency * (size_i / sum(size_active))`

### Equal
Progress split equally: `share_i = potency / n_active`

### Focus
All progress to first item: `share_i = potency` for first, 0 for others

## Approval Mechanics

When accepting a request targeting an empire:
- **Target Empire**: +6 approval
- **Other Empires Without Queue**: -2 approval (if they have no improvements in their queue)

This creates strategic tension - empires want their own improvements but may resent being left out.

## Templates

Two sample templates are provided:

### Logistics Depot
- **Type**: Infrastructure
- **Size**: 40 | **Work**: 120 | **Cost**: 30 Supplies
- **Benefits**:
  - +1 Organization (flat)
  - +5% Supply Efficiency (modifier, 800 ticks)

### Export Foundry
- **Type**: Industry
- **Size**: 60 | **Work**: 180 | **Cost**: 50 Supplies
- **Benefits**:
  - +10% Supply Efficiency (permanent)

## CLI Commands

### Request Commands

```bash
# List all active requests
req list

# Inspect a specific request
req inspect <request_id>

# Accept a request (costs supplies immediately)
req accept <request_id>

# Ignore a request (leaves it until expiry)
req ignore <request_id>
```

### Improvement Commands

```bash
# Show an improvement queue
imp show <owner_id>
# Examples:
imp show coalition
imp show empire:empire1

# Cancel an improvement (no refunds)
imp cancel <owner_id> <improvement_id>

# Set queue capacity (dev/cheat)
imp set capacity <owner_id> <value>

# Set queue potency (dev/cheat)
imp set potency <owner_id> <value>
```

## Examples

### Accepting a Request

```bash
# 1. List available requests
req list

# 2. Inspect a request to see details
req inspect req_50_778

# 3. Accept the request
req accept req_50_778
# Result: Coalition pays supplies, improvement enqueued
```

### Monitoring Progress

```bash
# Check coalition queue
imp show coalition

# Output example:
# Improvement Queue: coalition
# Capacity: 100
# Potency: 10/tick
# Fill Policy: fifo
# Share Policy: proportional
#
# ACTIVE:
# 1. Logistics Depot - 45/120 (38%) [Normal]
# 
# PENDING:
# 1. Export Foundry - Size: 60, Work: 180
```

## Integration with Game Systems

### Economy
- Requests cost coalition Supplies to accept
- No refunds on cancellation

### Approval
- Accepting requests affects empire approval
- Strategic consideration for which empires get improvements

### Stats & Modifiers
- Completed improvements apply stat bonuses
- Some bonuses are permanent, others have duration
- Uses formula: `(base + flat) * (1 + pct)`

## Future Enhancements

The following features are planned but not yet implemented:

### Sustainment & Degradation
- Completed improvements will require upkeep (resources per cadence)
- If upkeep not met, improvement enters Degraded state
- Degraded state reduces output by 50%

### Production
- Improvements can produce resources each cadence
- Two modes: market_sell (create sell orders) or stockpile_add (direct to stockpile)

### Market Integration
- Upkeep sources from empire stockpiles first, then market
- Production outputs create market sell orders or add to stockpiles
- All orders tagged with originator/payer/beneficiary

## Technical Details

### Data Structures

**Request**:
```javascript
{
  id: string,
  source: string,              // 'system' | 'empire:<id>'
  target: string,              // 'coalition' | 'empire:<id>'
  template_key: string,
  supplies_cost: number,
  approval_on_accept: {
    target_add: number,
    others_without_queue_add: number
  },
  created_at_tick: number,
  expires_at_tick: number
}
```

**Improvement**:
```javascript
{
  id: string,
  owner_queue: string,
  target: string,
  template_key: string,
  title: string,
  size: number,
  work: number,
  progress: number,
  status: string,              // 'pending' | 'active' | 'completed' | 'cancelled'
  state: string,               // 'Normal' | 'Degraded'
  paid: { supplies: number },
  onBuilt: Array<Effect>
}
```

**Queue**:
```javascript
{
  owner_id: string,
  capacity: number,
  potency: number,
  fill_policy: string,         // 'fifo' | 'priority' | 'manual'
  share_policy: string,        // 'proportional' | 'equal' | 'focus'
  active_ids: Array<string>,
  pending_ids: Array<string>,
  completed_log: Array<Object>
}
```

### Tick Pipeline

Each game tick:
1. **Refresh Requests**: Generate new requests if board below cap, remove expired
2. **Schedule Queues**: Move pending items to active based on capacity
3. **Advance Progress**: Distribute potency to active improvements
4. **Complete**: Apply onBuilt effects when work reaches threshold

### Determinism

The system uses the game's deterministic RNG for:
- Request generation (template selection, target selection)
- All random choices maintain deterministic behavior with same seed
