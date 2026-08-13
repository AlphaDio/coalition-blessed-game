# Consumption-Based Requisition System

The active economy converts recorded commodity consumption directly into pooled coalition requisition. Allowance credits and the former credit-faucet layer have been removed.

## Conversion flow

For each empire and consumption source:

```text
raw_value = consumed_qty * static_market_price
weighted_value = raw_value * source_multiplier
coalition_value = weighted_value * effective_share_rate
scaled_value = coalition_value * conversion_requisition_multiplier * approval_scale
requisition_generated = scaled_value / credits_per_requisition * requisition_multiplier
```

Generated requisition accumulates in `consumption_requisition_pool` and is paid into `coalitionEconomy.requisition` every 15 turns by default.

## Share modifiers

The effective share rate is controlled by:

- `state.coalitionModifiers.consumptionShareMultiplier`
- `state.coalitionModifiers.consumptionShareBonus`

Approval scales the result from 50% at 0 approval to 200% at 100 approval. Empire needs and wants use their configured source multiplier; army consumption and improvement sustainment use their own source multipliers.

## Currency boundaries

- `empire.budget_credits` pays normal market buy orders and is enforced as a non-negative hard limit.
- `coalitionEconomy.requisition` pays for construction and improvement upkeep.
- `coalitionEconomy.treasury_credits` is a coalition reserve for laws and event effects.
- Normal commodity orders cannot draw from requisition or treasury credits.

## Runtime locations

- `src/game/consumptionToRequisition.js` records consumption and performs conversion.
- `src/game/turn/index.js` invokes conversion after consumption effects.
- `src/game/constants.js` defines conversion rates and approval scaling.
- `src/game/economyTick/ordersLifecycle.js` enforces empire market affordability.
