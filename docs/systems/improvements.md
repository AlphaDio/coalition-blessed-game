# Improvements System

## Overview
The improvements system manages coalition infrastructure proposed by empires. Improvements are accepted from empire suggestion queues, spend coalition requisition up front, build over time, then provide outputs and modifiers while active.

The system is deterministic, queue-based, and integrated with the fixed-price economy through sustainment buy orders, production sell offers, direct requisition output, and consumption tracking.

## Core Concepts

### Improvement Requests
Each request defines:

- Display name and description.
- Requisition cost.
- Build duration.
- BUILDING capacity cost.
- Sustainment commodity cost.
- Production outputs.
- Stat modifiers.
- Requisition upkeep.
- Tags and branch/tier metadata.

### Suggestions
- Each empire maintains up to 3 improvement suggestions.
- Accepting a suggestion starts construction and allows a replacement suggestion to be generated.
- Suggestions are drawn from improvements that empire has unlocked.
- Duplicate suggestions are allowed.

### Tiers
- T1 is always available.
- T2 requires 2 completed T1 improvements for that empire.
- T3 requires 3 completed T2 improvements for that empire.

### Queue States
- `BUILDING`: Under construction and counting against build capacity.
- `ACTIVE`: Operational, paying upkeep, demanding sustainment, and producing output.
- `DEGRADED`: Sustainment failed; production and active modifiers are disabled until sustainment resumes.

### Build Capacity
The current implementation uses one BUILDING capacity limit:

- Starting max capacity: 4.
- Only `BUILDING` improvements count against the limit.
- Each BUILDING improvement receives the full coalition construction value each tick.
- Base coalition construction: 4 build progress per tick.

## Turn Integration
The relevant turn order is:

1. Resolve normal law processes.
2. Process improvements before market clearing:
   - Advance build progress.
   - Complete finished construction.
   - Charge active requisition upkeep.
   - Queue sustainment demand.
   - Produce goods and add direct requisition output.
   - Route goods to local upkeep and list surplus on the market.
3. Run the economy tick:
   - Clear sustainment and production orders alongside empire and army orders.
   - Update army and empire fulfillment.
4. Resolve improvement sustainment after market clearing:
   - Consume same-turn market fills.
   - Consume same-empire local production routed to sustainment.
   - Restore or degrade improvements.
5. Apply population, consumption effects, and consumption-to-requisition conversion later in the turn.

## Sustainment Flow
For each active or degraded improvement:

1. Calculate scaled sustainment demand from the definition cost, empire population, rationing, supply efficiency, sustainment scale, and balance multipliers.
2. Queue pooled empire buy orders before the economy clears.
3. Route same-empire local production into pending sustainment before released production reaches the market.
4. Resolve market receipts after clearing.
5. Restore to `ACTIVE` when all required commodities are available.
6. Change to `DEGRADED` when any required commodity is short.

Sustainment orders use:

```javascript
tags: {
  payer: 'empire_id',
  beneficiary: 'empire_id',
  purpose: 'improvement_sustainment_pool'
}
```

Market parameters:

- Sustainment buy priority: 800.
- Sustainment max price: current static market price.
- Sustainment order max duration: 6.

## Production Flow
For each active improvement:

1. Apply base production efficiency.
2. Scale non-requisition commodity output by empire population.
3. Apply commodity-specific economy balance multipliers.
4. Add commodity output to the improvement production bank.
5. Route goods from the bank into same-empire sustainment.
6. List remaining goods for sale that turn.
7. Add direct `requisition` output immediately to the coalition economy.

Production sell offers use priority 100 and `fee: 0` in the order definition.

## Modifiers
Active improvements can apply coalition, empire, and army modifiers.

Common economy-facing modifiers include:

- `industrial_output`
- `production_efficiency_add`
- `production_efficiency_mult`
- `supply_efficiency`
- `market_efficiency`
- `trade_income`
- `population_growth`
- `empire_approval`
- `research_speed`
- `law_progress_speed`
- `improvement_queue_capacity`
- `coalition_construction_add`
- `coalition_construction_mult`

Common army-facing modifiers include:

- `army_organization`
- `army_fervor`
- `army_protection`
- `army_damage_add`
- `army_damage_mult`
- `army_replenishment_mult`
- `army_consumption_mp_gain_mult`

## Acceptance Rules
An improvement can be accepted when:

1. The coalition has enough requisition for its upfront cost.
2. The improvement's BUILDING capacity will fit under the current capacity limit.
3. The proposing empire has unlocked the improvement tier.

On acceptance:

- Requisition is deducted immediately.
- The improvement enters the queue as `BUILDING`.
- Build progress starts at 0.

On cancellation:

- The improvement is removed from the queue.
- Requisition is not refunded.
- BUILDING capacity is recalculated.

## Degradation
An improvement degrades when sustainment cannot be paid for the tick.

Effects:

- State changes to `DEGRADED`.
- Production stops.
- Active modifiers stop applying.
- Recovery happens automatically once sustainment succeeds again.

## Catalog
The current economy-facing catalog, tier summary, and branch summary live in `docs/elements/improvements-economy.md`. The source of truth is `src/game/improvements/definitions.js`.

## Files
- `src/game/improvements/definitions.js` - Improvement catalog and tier unlocks.
- `src/game/improvements/engine.js` - Acceptance, cancellation, initialization, and exports.
- `src/game/improvements/engine/tick.js` - Build progress, requisition upkeep, and active tick flow.
- `src/game/improvements/engine/sustainment.js` - Sustainment demand, local routing, and post-market resolution.
- `src/game/improvements/engine/production.js` - Production bank, sell offers, and direct requisition output.
- `src/game/improvements/engine/modifiers.js` - Modifier aggregation/application.
- `src/game/improvements/types.js` - Type constants and sustainment constants.
- `src/game/improvements/ui.js` - Terminal UI helpers.
- `src/game/turn/index.js` - Turn-loop integration.
- `docs/elements/improvements-economy.md` - Current catalog and economy notes.

## Dependencies
- Economy system for market orders and fulfillment.
- Consumption-to-requisition system for income from consumed sustainment.
- Empire system for ownership, population, budgets, approval, and stockpiles.
- Army systems for army modifier effects.
- Turn system for sequencing.
