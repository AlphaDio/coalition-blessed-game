# Law Enactment System

## Overview
The law system uses a multi-phase process (DEBATE, FALLOUT, VOTING) to adopt powerful laws. Laws are organized into three categories (Economy, Military, Gouvernance) with three tiers (T1-T3). Only one law per category can be active at a time; enacting a new law in a category replaces the old one and removes its ongoing modifiers.

## Core Principles
1. Category slots: one active law per category (replacement on enactment).
2. Tiered progression: T1 always available, T2 unlocks after any T1 enacted, T3 unlocks after any T2 enacted (global history).
3. Ideological alignment: laws use axis vectors to drive stances and reactions.
4. Immediate adoption effects: each law grants a strong reward on enactment (credits, requisition, cohesion, influence, approval).
5. Ongoing modifiers: while active, laws apply coalition modifiers (trade income, supply efficiency, industrial output, etc.).

## Data Model

Law definitions live in `src/game/lawDefinitions.js` and include:
```javascript
{
  id: 'law_market_open_1',
  name: 'Open Markets Act',
  tier: 1,
  category: 'economy',
  law_type: 'Market',
  axis_vector: { spiritual_materialistic: 0.4 },
  law_tags: ['market', 'trade'],
  support_weights: { economy_incentive: 0.5 },
  phase_tags: { DEBATE: ['market'], FALLOUT: ['economic'], VOTING: ['economic'] },
  modifiers: { trade_income: 150, supply_efficiency: 0.05 },
  immediate_effects: { coalition_credits: 1500, requisition: 200, cohesion: 2 }
}
```

State tracking:
- `enactedLawsByCategory`: active law per category
- `enactedLaws`: active law ids (derived from category map)
- `enactedLawsHistory`: all laws ever enacted (for tier unlocks)
- `lawTierUnlocks`: `{ 1: true, 2: false, 3: false }`

## Enactment Flow
1. Check tier unlock and influence cost.
2. Start law process (DEBATE -> FALLOUT -> VOTING).
3. On enactment:
   - Replace prior law in the same category and remove its ongoing modifiers.
   - Apply ongoing modifiers from the new law.
   - Apply immediate adoption effects (credits, requisition, cohesion, influence, approval).
   - Record history and unlock next tier if applicable.

## Categories and Types
- Economy: Market, Industry, Fiscal
- Military: Readiness, Conscription, Intelligence
- Gouvernance: Unity, Delegation, Bureaucracy

## Files
- `src/game/lawDefinitions.js` - law catalog
- `src/game/lawProcessManager.js` - enactment logic, replacement, immediate effects
- `src/game/types.js` - state fields
