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

## Coalition Procurement System
The coalition maintains a separate procurement system for acquiring commodities that are converted into **requisition** for building improvements.

### Procurement Mechanics
- Coalition procurement scans sell offers (excluding coalition sellers) sorted by ask price.
- Each commodity uses a priority threshold (`theta`) derived from tier defaults or coalition overrides.
- Purchases stop when budget is exhausted; spent amount is deducted from `treasury_credits` and `allowance_credits`.
- Allowance credits refill at 1000 credits per tick, capped at 4 ticks worth (4000 credits).
- Reserve floor prevents spending below 1500 treasury credits.

### Procurement Configuration
- **Spend Throttle**: 0.8 (80% of available spending capacity)
- **Theta Presets**: Per-commodity price thresholds (Balanced, Aggressive, Conservative)
- **Priority**: Coalition buys use commodity-specific theta multipliers

### Requisition System
Requisition is the coalition's construction currency, produced by converting purchased commodities.

#### Bank Mechanics
- **Stockpile Bank**: Accumulates purchased commodities
- **Stockpile Ready**: Commodities moved here when bank reaches threshold (1000 units)
- **Bank**: Final conversion destination using milli-unit precision

#### Conversion Process
1. Commodities accumulate in `stockpile_bank`
2. When bank reaches 1000+ units, commodities move to `stockpile_ready`
3. Ready commodities convert to bank units in batches of 1000 units
4. Conversion rates: T1 commodities = 1000 milli-units, T2 = 100, T3 = 10 per unit

#### Bank Rollover
- When bank reaches 25,000 milli-units, it converts to **requisition**
- Each rollover produces 24 requisition units
- Bank resets to 0 after rollover
- Batch conversion bonus: additional milli-units per conversion batch

### Starting Resources
- **Initial Requisition**: 500 units for basic improvement construction
- **Treasury Credits**: 0 (refills through allowance system)
- **Allowance Credits**: 0 (refills at 1000 per tick)

## Army Fulfillment
- Needs penalties kick in below the fulfillment threshold (default 0.80).
- Needs penalties cap at `max_penalty` (default 0.35).
- Wants bonuses use diminishing returns: `sqrt(fulfillment) * max_bonus` (default 0.20).
- Fulfillment ratios are stored in `army.supply_state`.

## Data Flow
- **Market Phase**: commodity definitions, economy config, buy/sell orders → update market state → compute target prices → smooth/clamp → clear orders
- **Procurement Phase**: coalition procurement from post-clear surplus → add to stockpile_bank
- **Conversion Phase**: stockpile_bank → stockpile_ready → bank → requisition (via rollover)
- **Fulfillment Phase**: compute army fulfillment → update `army.performance.current`

## Key Data
- **Market state**: `price`, `last_price`, `floor_price`, `demand_qty`, `supply_qty`, `traded_qty`, `volatility_index`
- **Orders**: buy orders (`max_price`, `priority`, `filled_qty`) and sell offers (`ask_price`, `priority`, `filled_qty`)
- **Procurement**: per-commodity theta presets, spend throttle, allowance credits, treasury credits
- **Requisition System**: stockpile_bank, stockpile_ready, bank (milli-units), requisition, rollover mechanics

## Integration Points
- `src/game/marketEconomy.js` handles pricing, market clearing, and fulfillment
- `src/game/coalitionProcurement.js` manages coalition procurement and requisition conversion
- `src/game/constants.js` defines coalition budget defaults
- `docs/input/economy_system.yaml` configures pricing parameters and procurement behavior
- `docs/input/resources.yaml` supplies commodity metadata and tiers
- `src/game/improvements/engine.js` consumes requisition for building improvements

## Files
- `src/game/marketEconomy.js` - Market pricing and clearing
- `src/game/coalitionProcurement.js` - Coalition procurement and requisition
- `docs/input/economy_system.yaml` - Economy configuration
- `docs/input/resources.yaml` - Commodity definitions
