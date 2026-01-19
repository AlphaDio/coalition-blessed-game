# Resources and Commodities

## Overview
Resources are commodities traded in the market economy, used for sustainment, production, and events. They are tiered by scarcity and volatility, shaping economic pressure.

## Commodity Elements
Commodities are defined in `docs/input/resources.yaml`.

- Identity: `key`, `name`, `tier`, `floor_price`
- Tags: descriptors like industrial, medical, strategic
- Notes: flavor text and usage hints

### Tiers
- T1: Common bulk inputs (stable pricing)
- T2: Strategic goods (moderate volatility)
- T3: Advanced goods (scarce, high leverage)
- T4: Economy-warping rarity (extreme volatility)

## Usage Touchpoints
- Market pricing and order clearing in `src/game/marketEconomy.js`
- Improvement sustainment and production in `src/game/improvements.js`
- Event effects that add/remove stockpiles

## Content Sources
- Commodity definitions: `docs/input/resources.yaml`
- Economy system: `docs/systems/economy.md`
