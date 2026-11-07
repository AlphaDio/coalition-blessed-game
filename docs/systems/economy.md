# Economy System

## Overview
The current economy is a fixed-price order market. Commodity prices are seeded at game start and then remain stable for the run. This is intentional for now: prices act as valuation anchors for order limits, trade valuation, and consumption-to-requisition conversion, while scarcity is expressed through unfilled orders, stockpiles, fulfillment, and budgets.

The economy does not currently use coalition procurement, commodity bank rollover, or emergency laws. Requisition comes from starting resources, direct improvement outputs, consumption conversion, normal law modifiers, and mission/effect hooks.

## Design Goals
- Keep commodity values deterministic within a run.
- Surface scarcity through fulfillment, backlog, and reserves rather than price volatility.
- Connect empire, army, and improvement consumption to coalition requisition income.
- Let normal laws, improvements, missions, and content effects tune economic pacing.
- Keep emergency laws out of the economy model.

## Runtime Data
- Economy config loads from `docs/input/economy_system.yaml`; the active runtime mainly uses fulfillment/performance settings from it.
- Commodity definitions load from `modules/resources.yaml`.
- New games created by `GameManager` start with:
  - `requisition`: 1000
  - `treasury_credits`: 10000
  - Each empire holds essential-only reserves equal to 80 turns of its initial demand. Market purchases fill needs first; reserves cover any remaining current need and are not replenished automatically. Production, demand, and population growth determine how long they last.
- Market state stores `price`, `last_price`, `floor_price`, `demand_qty`, `supply_qty`, `traded_qty`, remaining orders, and backlog diagnostics.

### Currency Boundaries
- `empire.budget_credits` is the hard, non-negative purchasing balance for an empire's market orders, including army orders owned by that empire.
- Posting fees are reserved before trade commitments. Standard new orders cost 0.01 credits per tick. Active buy orders, including persistent backlog orders, are capped by the owner's remaining budget at their maximum order price. Needs are prioritized ahead of wants within the same priority tier.
- `treasury_credits` is a coalition-level reserve used by laws and event effects. It is not an automatic fallback for empire market purchases.
- `requisition` is the coalition construction and improvement currency. It does not pay ordinary commodity buy orders.
- Budget-blocked orders are exposed in `economyBudgetBlockedLastTick` for diagnostics and UI reporting.

## Fixed Price Model
Prices are initialized once in `src/game/marketEconomy.js`:

1. Read each commodity floor price from `modules/resources.yaml`.
2. Apply a seeded floor variance of 85% to 115%.
3. Apply a seeded run multiplier from `0.5`, `1`, `1.5`, `2`, or `3`.
4. Pick the initial price between 50% and 150% of that adjusted floor.
5. Store the value in both `price` and `last_price`.

After initialization, prices do not move. Demand and supply quantities are still tracked each tick, but they are diagnostics and clearing inputs, not price-update inputs.

Inactive for now:
- Demand/supply target price updates.
- Smoothing with `smoothing_k`.
- Shortage panic caps.
- Tier elasticity.
- Dynamic volatility.

## Turn Flow
The relevant economy sequence inside a turn is:

1. Reset dynamic coalition modifiers and initialize turn consumption tracking.
2. Resolve normal law processes.
3. Process improvements before the market:
   - Advance construction.
   - Charge active requisition upkeep.
   - Queue sustainment demand.
   - Release eligible production-bank output.
   - Add direct requisition production immediately.
4. Run the economy tick:
   - Emit empire production sell offers.
   - Emit empire needs and wants buy orders.
   - Emit army needs and wants buy orders.
   - Apply order durations and posting fees.
   - Clear markets by commodity.
   - Age valid demand backlog after allocation; expire it into pressure or cancel invalid conditional sources.
   - Convert crossed cumulative pressure thresholds into queued Pressure Gameplay Events; pressure remains accumulated.
   - Save remaining backlog and reserve orders.
   - Update fulfillment effects.
5. Resolve improvement sustainment after market clearing.
6. Apply consumption-triggered empire effects.
7. Convert recorded consumption into pooled coalition requisition.
8. Replenish armies and apply army consumption effects for armies not currently in active battles.
9. Apply passive requisition upticks from enacted normal laws.

## Order Clearing
Markets clear independently per commodity.

Buy orders are sorted by:
1. Higher priority.
2. Larger remaining quantity.
3. Higher max price.

Sell offers are sorted by:
1. Higher priority.
2. Lower ask price.

A trade executes when `buy.max_price >= sell.ask_price`. The trade price is the seller's ask price, reduced by the bulk discount when the buy order quantity is above the bulk threshold. The current constants are:

- Bulk threshold: 20 units.
- Maximum bulk discount: 15%.
- Empire sell ask: usually 95% of static market price.
- Empire needs buy cap: usually 110% of static market price.
- Empire wants buy cap: usually 105% of static market price.
- Army needs buy cap: usually 120% of static market price.
- Army wants buy cap: usually 115% of static market price.

Unfilled buy orders and sell offers persist as backlog/reserves. Buy-side demand backlog is policy-aware:

- Perishable resources normally survive one unmet turn.
- Deferred resources survive their configured maximum age, normally several turns.
- Persistent resources do not expire through age alone.

Each demand backlog item records its resource, remaining quantity, age, source, policy, maximum age where relevant, and source validity. Supply is allocated before backlog age advances. When perishable or deferred demand expires, its unresolved quantity is added to `state.economyPressure.by_resource` and the configured pressure key in `state.economyPressure.by_type`; it is then removed from the backlog. Invalid conditional demand is cancelled without pressure. This keeps expected-to-be-fulfilled backlog distinct from shortages whose consequences have already been absorbed.

Pressure itself has no mechanical effects. Expired optional wants contribute 5% of the pressure of equivalent unmet needs or upkeep. Cumulative thresholds (25, 100, 250, 500, and 1000 by default, then doubling) advance a per-pressure-type escalation tier and enqueue a shared pressure event. The pressure value is not reset. The queued event carries the resource, pressure type, accumulated pressure, expired quantity, source, persistence policy, resource type, and tier into the normal event resolver.

## Production and Stockpiles
Empire production emits sell offers into the market. Improvement commodity production accumulates in a per-improvement production bank. All improvement sustainment is queued first; same-empire production banks can then supply it every turn, independent of project order or the market-release threshold. Remaining output is released to the market when the bank reaches its threshold, calculated from output after the producing project's own sustainment.

Each seller's output forms a new batch per commodity per turn. Ordinary batches have six turns to sell. Improvement batches have at least six turns and can remain open for the usual bank release interval. Older batches keep their expiry when more output arrives.

Industrial output bonuses earned from consumption cap at +100% of base empire production. This cap also applies when older campaigns load.

Direct `requisition` production from an improvement bypasses the production bank and is added to the coalition economy immediately. Other commodities are banked and released as sell offers.

## Fulfillment Effects
Empire and army demand is split into needs and wants.

- Army fulfillment updates `army.supply_state` and performance.
- Empire fulfillment updates `empire.supply_state`, approval pressure, and population growth modifiers.
- Needs are harsher than wants.
- Civilian demand uses the same baseline population scale as production; army population demand uses a smaller logarithmic multiplier.
- Wants use gentler positive/negative pressure.
- The fulfillment thresholds and caps live in `docs/input/economy_system.yaml` and `src/game/constants.js`.

## Army Advanced-Resource Scaling
Armies can define commodity demands and threshold-based consumption effects in `modules/armies/*.ds.yml`.

- Army needs are gated by damage; healthy armies do not continuously request repair needs.
- Army wants persist while the army exists, so wants are the correct channel for long-horizon upgrades and advanced-resource scaling.
- Army consumption thresholds are multiplied by `ARMY_CONSUMPTION_EFFECT_THRESHOLD_MULTIPLIER` at content load. The current multiplier is 20.
- Army consumption effects are processed after battles for armies not currently in active battles. Received commodities accumulate in per-army effect pools until a threshold is reached.

Quantum Legion is the advanced-resource scaling reference:

- `quantum_circuits` are both a repair need and an upgrade want. Runtime threshold 160 adds persistent army damage.
- `nano_machines` are repair/growth input. Runtime threshold 240 adds MP capacity/current MP.
- `sentient_cores` are an army want. Runtime threshold 240 grants coalition intel.
- `wormhole_reactors` are an army want. Runtime threshold 80 adds +0.04 next-battle kill rate.

Empire-level `wormhole_reactors` consumption for Quantum Collective also adds +0.06 next-battle kill rate to its armies at threshold 8. These kill-rate effects are stored in battle prep, apply to permanent-loss ratio during the next battle, and clear with other battle prep after combat.

## Consumption-to-Requisition
Consumption is the main passive requisition path. The system records commodity consumption from:

- Empire needs.
- Empire wants.
- Army needs.
- Army wants.
- Improvement sustainment.

At the end of the turn, recorded consumption is valued at the current static market price.

```text
raw_value = consumed_qty * static_market_price
weighted_value = raw_value * source_multiplier
coalition_value = weighted_value * effective_share_rate
scaled_value = coalition_value * CONVERSION_REQUISITION_MULTIPLIER * approval_scale
requisition_generated = scaled_value / CREDITS_PER_REQUISITION * requisition_multiplier
```

Current constants:

- `CREDITS_PER_REQUISITION`: 1000
- `COALITION_CONSUMPTION_SHARE_BASE`: 10%
- `CONVERSION_REQUISITION_MULTIPLIER`: 100
- `REQUISITION_POOL_TURNS`: 15
- Approval scale: 50% at 0 approval to 200% at 100 approval
- Empire needs/wants source multiplier: normalized by the empire demand multiplier
- Army and improvement sustainment source multiplier: 1.0

Generated requisition goes into `consumption_requisition_pool` and pays out every 15 turns by default. This keeps the economy from spamming tiny requisition gains every tick.

## Improvements Economy
Improvements are the main requisition sink.

- Construction cost is paid upfront in requisition.
- BUILDING improvements consume build capacity.
- Every BUILDING improvement receives the full coalition construction value each tick.
- Starting build capacity is 4.
- Active improvements pay `requisitionUpkeep / 10` per tick.
- Active improvements can demand sustainment commodities from the market.
- Failed sustainment degrades an improvement until sustainment resumes.

See `docs/elements/improvements-economy.md` for the current catalog and tier cost summary.

## Removed or Inactive Systems
The following older docs/concepts are no longer part of the active economy:

- `src/game/coalitionProcurement.js`
- Coalition procurement thresholds/theta presets.
- `stockpile_bank`
- `stockpile_ready`
- Milli-unit bank rollover into requisition.
- Dynamic market price updates.
- Emergency law economic modifiers.

## Key Files
- `src/game/economyTick/index.js` - Economy tick orchestration.
- `src/game/marketEconomy.js` - Market state, fixed-price initialization, order creation, clearing, and fulfillment helpers.
- `src/game/economyTick/orders.js` - Order aggregation.
- `src/game/economyTick/ordersLifecycle.js` - Order persistence, fees, clearing calls, and saved order state.
- `src/game/economyTick/ordersPhase.js` - Empire and army demand generation.
- `src/game/economyTick/production.js` - Empire production sell offers.
- `src/game/economyTick/postTick.js` - Fulfillment effects and law modifier effects.
- `src/game/consumptionToRequisition.js` - Consumption tracking and requisition conversion.
- `src/game/improvements/engine` - Improvement construction, sustainment, and production.
- `modules/resources.yaml` - Commodity definitions.
- `docs/input/economy_system.yaml` - Economy configuration/spec notes.
