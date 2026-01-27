# Production Bank System for Improvements

**Related Documentation:**
- [Consumption-Based Requisition System](CONSUMPTION_REQUISITION_IMPLEMENTATION.md) - How production flows into economy
- [Improvement Suggestions](SUGGESTION_QUEUE_PLATEAU_IMPLEMENTATION.md) - How improvements are requested
- [Game Definitions API](GAME_DEFINITIONS_API.md) - How improvements are defined

## Overview

Improvements now accumulate their production in a private `productionBank` before releasing it to the market. Production is only released when the bank reaches a configurable threshold, adding economic control and production timing strategy.

## How It Works

### Production Cycle (per tick)

1. **Release Phase** (Start of ACTIVE/DEGRADED processing)
   - Checks if accumulated production meets the threshold
   - If threshold is met, ALL accumulated production is released to the market as sell offers
   - If threshold is NOT met, production continues accumulating
   - The bank is only cleared after a successful release

2. **Production Phase** (During ACTIVE processing)
   - New production is accumulated in the `productionBank` for *this tick*
   - This accumulated amount contributes to reaching the release threshold

### Threshold System

The `productionBankThreshold` parameter (default: 10) multiplies the per-tick production output to determine the release trigger:

- **Threshold = 1**: Releases when bank ≥ 1 × per-tick production
  - Example: If producing 2 grain/tick, releases when bank reaches 2 grain
  - Result: Production flows to market almost every tick

- **Threshold = 10** (default): Releases when bank ≥ 10 × per-tick production
  - Example: If producing 2 grain/tick, releases when bank reaches 20 grain
  - Result: Production accumulates for ~10 ticks before release burst

- **Threshold = 20+**: Releases when bank reaches 20+ ticks of production
  - Example: If producing 2 grain/tick, releases when bank reaches 40 grain
  - Result: Production accumulates for extended period, then all releases at once

### Special Cases

- **Requisition**: Bypasses the bank entirely and flows directly to the coalition economy (immediate, no accumulation)
- **Population Scaling**: Production amounts are scaled by the empire's population before being added to the bank
- **Multiple Commodities**: Threshold is checked against the SUM of all accumulated commodities

## UI Display

The Works view now shows the production bank contents with threshold information:

```
Quick Release [=========   ] [ACTIVE] [Empire Name]
Releases often • +grain:+2 • [Bank: grain:2400 (Threshold: x1)]

Delayed Release [=========   ] [ACTIVE] [Empire Name]
Standard accumulation • +steel:+1 • [Bank: steel:3600 (Threshold: x10)]
```

The bank contents are displayed in yellow highlighting. The threshold multiplier is shown when explicitly set (x1 for fast release, x10+ for delayed).

While accumulating (not released):
```
Holding: Production bank accumulating (1200/3600 to release)
```

## Data Structure

Each improvement object has:

```javascript
{
  // ... other fields ...
  productionBank: {
    // commodity: quantity accumulated this tick
    grain: 2400,
    steel: 1200
  },
  productionBankThreshold: 1  // multiplier for release threshold (default: 1)
}
```

## Implementation Details

### Files Modified

- `src/game/improvements/engine.js`
  - Added `productionBankThreshold` parameter to `createImprovementRequest()` (default: 10)
  - Added `productionBankThreshold` field to improvement creation in `createImprovement()`
  - Modified `processImprovementProduction()` to silently accumulate (no logging during accumulation)
  - Updated `releaseProductionFromBank()` to log "Produced" message ONLY when threshold is met and release occurs
  - Restructured improvement processing order to release first (if threshold met), then produce

- `src/ui/renderer.js`
  - Updated `formatImprovementDetailLine()` to display bank contents with threshold information
  - Shows "Holding: (accumulated/threshold to release)" while accumulating
  - Shows threshold multiplier when > 1

### Processing Order

The new processing order for active/degraded improvements is:
1. **Release** accumulated production IF threshold is met (bank ≥ threshold × per-tick output)
2. Process requisition upkeep (ACTIVE only)
3. Process sustainment
4. **Produce** (accumulates this tick's production for next evaluation)

### Threshold Calculation

For each improvement:
```
threshold_amount = (sum of all non-requisition production outputs) × population × productionBankThreshold
release_triggered = total_accumulated_in_bank >= threshold_amount
```

## Configuration Examples

To set a custom threshold on an improvement request:

```javascript
createImprovementRequest(id, name, description, {
  productionOutputs: { grain: 2, steel: 1 },
  productionBankThreshold: 2,  // Releases when bank >= 2×(2+1) = 6 units
  // ... other options
})
```

Common threshold values:
- `1`: Release every tick (streaming production)
- `5`: Accumulate ~5 ticks, then burst release
- `10` (default): Accumulate ~10 ticks, create medium batch events
- `20+`: Strategic reserves, very infrequent large releases

## Future Enhancements

The production bank system can be extended with:
- **Dynamic Thresholds**: Adjust threshold based on market conditions or empire needs
- **Bank Capacity Limits**: Improvements could have maximum storage capacity (overflow or decay)
- **Manual Controls**: UI commands to manually trigger release or pause production
- **Bank Costs**: Maintenance costs for storing commodities
- **Threshold Modifiers**: Multiplicative/additive modifiers to thresholds based on improvements/laws
- **Market Response**: Release based on market price triggers instead of fixed thresholds
