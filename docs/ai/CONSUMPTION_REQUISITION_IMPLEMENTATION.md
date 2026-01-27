# Consumption-Based Requisition System Implementation

**Related Documentation:**
- [Production Bank System](PRODUCTION_BANK_SYSTEM.md) - How improvements accumulate and release production
- [Suggestion Queue Plateau](SUGGESTION_QUEUE_PLATEAU_IMPLEMENTATION.md) - How improvements are suggested

## Summary

The coalition procurement and stockpile conversion system has been completely redesigned. Coalition now generates both requisitions AND credits from empire commodity consumption, with a configurable share rate that can be modified by laws and effects.

## Key Changes

### System Architecture

**Old System:**
- Coalition maintained a separate `treasury_credits` and `allowance_credits`
- Coalition purchased commodities from market surplus post-clear
- Commodities accumulated in `stockpile_bank` and `stockpile_ready`
- Complex multi-stage conversion from commodities → milli-requisition → requisition

**New System:**
- Coalition maintains `treasury_credits` and `allowance_credits` for a **faucet-based credit system**
- Requisitions and credits are generated directly from empire commodity consumption
- Consumption share rate: base 10% (configurable with multiplicative and additive modifiers)
- Credits come from the allowance pool (refilled 1000/tick, capped at 4000)
- Requisitions are generated: `(Consumed Value × Effective Share Rate) / 1000`

### Effective Share Rate Calculation

The coalition's consumption share rate can be modified by game systems:

```
Effective Share Rate = Base Share (10%) × Multiplicative Modifier × (1 + Additive Modifier)
Clamped to [0, 1]
```

Modifiers come from:
- `state.coalitionModifiers.consumptionShareMultiplier` (multiplicative, default 1.0)
- `state.coalitionModifiers.consumptionShareBonus` (additive, default 0)

These can be set by enacted laws or other game effects.

### Credit Faucet System

**Allowance Refill (Economy Tick):**
- Called in `economyTick.js` Step 7
- Adds `ALLOWANCE_PER_TICK` (1000) credits to allowance
- Capped at `ALLOWANCE_MAX` (4000 = 4 ticks worth)

**Consumption Conversion (Turn Phase):**
- Called after empire consumption in `advanceTurn`
- Credits allocated from allowance pool are deducted
- If consumption value exceeds available allowance, only available credits are spent
- Requisitions are always generated regardless of allowance constraints

This creates a controlled faucet: players get a steady credit income from the allowance that replenishes each tick, but only so much can be converted per cycle.

### Implementation Details

#### Conversion Formula
```
Requisition Gained = (Consumed Commodity Value × Effective Share Rate) / CREDITS_PER_REQUISITION
Credits Gained = min(Consumed Value × Effective Share Rate, Available Allowance)
```

#### Examples
- **Base case:** Empire consumes 1000 biomass @ 10 credits each = 10,000 value
  - Coalition share (10%): 1,000 credits
  - Requisition: 1,000 / 1,000 = 1.0
  - Credits: min(1,000, allowance) allocated from allowance pool

- **Modified case:** Share rate boosted to 15% (1.5x multiplier)
  - Same consumption (10,000 value)
  - Coalition share (15%): 1,500 credits
  - Requisition: 1,500 / 1,000 = 1.5
  - Credits: min(1,500, allowance) allocated from allowance pool

- **Allowance limited:** Only 500 credits available in allowance
  - Consumption value 10,000, share 10% = 1,000 credits needed
  - Requisition: still generated = 1.0 (not constrained)
  - Credits: only 500 allocated (allowance exhausted)
  - Allowance becomes 0, next tick it refills to 1,000

### Files Changed

1. **src/game/consumptionToRequisition.js** (MODIFIED)
   - Updated with modifier support: `calculateEffectiveShareRate(modifiers)`
   - Added credit generation: `processConsumptionToRequisition()` now returns credits info
   - Added allowance management: `refillCoalitionAllowance()`
   - New constants: `ALLOWANCE_PER_TICK`, `ALLOWANCE_MAX`
   - Modified constant: `COALITION_CONSUMPTION_SHARE_BASE` (was `COALITION_CONSUMPTION_SHARE`)
   - Key functions:
     - `initializeTurnConsumptionTracking()` - Reset tracking at turn start
     - `recordConsumption(commodityId, quantity)` - Record empire consumption
     - `calculateEffectiveShareRate(modifiers)` - Calculate rate with modifiers
     - `processConsumptionToRequisition(market, coalitionEconomy, modifiers)` - Convert and allocate
     - `refillCoalitionAllowance(coalitionEconomy)` - Add credits to allowance

2. **src/game/turn.js** (MODIFIED)
   - Updated to build `consumptionModifiers` from `state.coalitionModifiers`
   - Passes modifiers to `processConsumptionToRequisition()`
   - Updated logging to show both requisition and credit gains
   - Modifiers sourced from:
     - `consumptionShareMultiplier` (multiplicative)
     - `consumptionShareBonus` (additive)

3. **src/game/economyTick.js** (MODIFIED)
   - Added import of `refillCoalitionAllowance`
   - Calls `refillCoalitionAllowance()` in Step 7 (before market clearing)
   - Updated coalition economy initialization with treasury and allowance

4. **src/game/types.js** (MODIFIED)
   - Updated `coalitionEconomy` object with:
     - `requisition: 500`
     - `treasury_credits: 10000` (restored)
     - `allowance_credits: 1000` (restored)

5. **src/server/gameManager.js** (MODIFIED)
   - Updated initialization to include treasury and allowance

6. **index.js** (MODIFIED)
   - Updated initialization to include treasury and allowance

7. **src/ui/renderer.js** (MODIFIED)
   - Removed import of `BANK_THRESHOLD` from coalitionProcurement

### Files NOT Changed (Deprecated but Left in Place)

- **src/game/coalitionProcurement.js** - Left as-is for reference/rollback purposes
  - All functions are now unused
  - Can be safely deleted in future if needed

## Behavior Changes

### Impact on Gameplay

1. **Requisition Generation**
   - Previously: Slow accumulation from market procurement with multiple conversion stages
   - Now: Direct generation from empire commodity usage, configurable by modifiers

2. **Credit Faucet**
   - NEW: Steady income of credits from allowance refill (1000/tick, capped at 4000)
   - Allowance is spent on consumption conversions, creating a credit sink
   - Alliance between credit supply and requisition demand

3. **Coalition Economy**
   - Previously: Required managing procurement budgets and throttle settings
   - Now: Automatic based on empire behavior + modifiable share rate

4. **Modifier System**
   - Laws and events can modify consumption share rate multiplicatively or additively
   - Examples:
     - "War Levy": `consumptionShareMultiplier = 1.5` (50% more requisitions)
     - "Efficiency Bonus": `consumptionShareBonus = 0.05` (5% additional share)

## Constants

- `COALITION_CONSUMPTION_SHARE_BASE = 0.10` (10% base share, modifiable)
- `CREDITS_PER_REQUISITION = 1000`
- `ALLOWANCE_PER_TICK = 1000` (credits added each tick)
- `ALLOWANCE_MAX = 4000` (4 ticks worth cap)

All defined in `src/game/consumptionToRequisition.js` and can be adjusted if needed.

## Modifier Integration

Laws or events can set these in `state.coalitionModifiers`:

```javascript
// Example: 50% boost to consumption share
state.coalitionModifiers.consumptionShareMultiplier = 1.5;

// Example: Additional 5% base share
state.coalitionModifiers.consumptionShareBonus = 0.05;
```

The `advanceTurn()` function reads these and applies them when processing consumption.

## Future Considerations

- The UI still references procurement/stockpiles but they're no longer populated (can be cleaned up)
- The coalitionProcurement.js file is deprecated and can be deleted
- Treasury is not actively used in the new system (allows room for future features)
- If reverting, simply restore those files from git history
