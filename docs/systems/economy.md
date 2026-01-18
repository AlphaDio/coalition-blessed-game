# Economy System

## Overview
The economy system simulates a market-based supply/demand loop with coalition procurement layered on top. It clears buy and sell orders per commodity, updates prices based on demand pressure, and applies performance modifiers to armies based on fulfillment of needs and wants.

## Design Goals
- Model scarcity and surplus with visible price feedback.
- Keep coalition procurement deterministic and budget-bound.
- Connect supply fulfillment to combat performance without hard gating.

## Primary Flow
- Configuration loads from `docs/input/economy_system.yaml` (fallback defaults in `src/game/marketEconomy.js`).
- The market initializes from `docs/input/resources.yaml` commodity definitions.
- Each tick, the system updates supply/demand quantities, computes target prices, and smooths prices.
- Buy and sell orders are cleared per commodity, producing trades or unfilled orders.
- Coalition procurement buys from remaining sell offers using tier-based thresholds and budget caps.
- Army fulfillment converts received supplies into needs/wants fulfillment and applies performance modifiers.

## Pricing Model
- Target price scales with the demand/supply ratio and is capped by `shortage_panic_cap` (default 4.0).
- Smoothed price updates prevent sudden swings using `smoothing_k` (default 0.25).
- Price is clamped to 0–3x the floor price after smoothing.
- Commodity tier elasticity scales how aggressively prices move (t1 0.6 → t4 2.4).

## Order Clearing
- Orders are filtered per commodity and sorted by priority, then price.
- In surplus (supply >= demand), all buys fill and remaining supply stays with sellers.
- In shortage (supply < demand), each buyer receives `needed * (supply / demand)`.
- `traded_qty` records total executed volume for the tick.

## Procurement and Budgeting
- Coalition procurement scans sell offers (excluding coalition sellers) sorted by ask price.
- Each commodity uses a priority threshold (`theta`) derived from tier defaults or coalition overrides.
- Purchases stop when budget is exhausted; spent amount is deducted from `budget_credits`.
- Default budget per tick is `budget_credits_per_tick` (5,000 by config).

## Army Fulfillment
- Needs penalties kick in below the fulfillment threshold (default 0.80).
- Needs penalties cap at `max_penalty` (default 0.35).
- Wants bonuses use diminishing returns: `sqrt(fulfillment) * max_bonus` (default 0.20).
- Fulfillment ratios are stored in `army.supply_state`.

## Data Flow
- Inputs: commodity definitions, economy config, buy/sell orders.
- Tick: update market state → compute target prices → smooth/clamp → clear orders.
- Post-clear: run coalition procurement → update coalition stockpiles/budget.
- Final: compute army fulfillment → update `army.performance.current`.

## Key Data
- Market state: `price`, `last_price`, `floor_price`, `demand_qty`, `supply_qty`, `traded_qty`, `volatility_index`.
- Orders: buy orders (`max_price`, `priority`, `filled_qty`) and sell offers (`ask_price`, `priority`, `filled_qty`).
- Procurement: per-commodity priority thresholds derived from tier defaults and coalition overrides.

## Integration Points
- `src/game/marketEconomy.js` handles pricing, market clearing, procurement, and fulfillment.
- `docs/input/economy_system.yaml` configures pricing parameters and procurement behavior.
- `docs/input/resources.yaml` supplies commodity metadata and tiers.

## Files
- `src/game/marketEconomy.js`
- `docs/input/economy_system.yaml`
- `docs/input/resources.yaml`
