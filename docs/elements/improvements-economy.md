# Improvements and Economy

## Overview
Improvements provide long-term infrastructure effects, while the economy system clears market orders, updates prices, and fulfills supply needs. These elements are tightly coupled through sustainment and production flows.

## Improvement Elements
Improvements are defined in `src/game/improvementDefinitions.js` and surfaced as requests.

- Identity: `id`, `name`, `description`, `tags`
- Build costs: `suppliesCost`, `build`, `capacity`
- Sustainment: `sustainmentCost` per tick
- Production: `productionOutputs` per tick
- Modifiers: `modifiers` applied to empires or armies
- Tiering: `tier` and `branch` (industrial, research, military, cultural, economic)

### Improvement States
- `BUILDING`: progresses with coalition construction each tick
- `ACTIVE`: consumes sustainment and produces outputs
- `DEGRADED`: sustainment failed, no production until restored

### Tier Unlocks
Tier access is tracked per empire:
- T2 unlocks after 2 completed T1 improvements
- T3 unlocks after 2 completed T2 improvements

## Economy Elements
The market economy resolves supply and demand per commodity.

- Market state per commodity: `price`, `floor_price`, `demand_qty`, `supply_qty`, `traded_qty`
- Orders: buy orders and sell offers with priorities and tags
- Procurement: coalition buys remaining supply with budget caps
- Fulfillment: armies receive needs and wants with performance modifiers

### Improvement-Economy Integration
- Sustainment creates buy orders when stockpiles are short
- Production can inject outputs into stockpiles
- Tags on orders identify originator, payer, and beneficiary

## Content Sources
- Improvement definitions: `src/game/improvementDefinitions.js`
- Improvements system: `src/game/improvements.js`
- Economy system: `src/game/marketEconomy.js`
- System docs: `docs/systems/improvements.md`, `docs/systems/economy.md`
