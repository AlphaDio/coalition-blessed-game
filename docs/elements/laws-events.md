# Laws and Events

## Overview
This section covers active laws (player-enacted) and standard non-law events. Law enactment choice events are documented separately in `docs/elements/law-events.md`.

## Laws in Play
Each law costs influence to start and is enacted through the multi-phase law process. Laws are grouped into three categories:
- Economy
- Military
- Gouvernance

Only one law per category can be active at a time. Enacting a new law in a category replaces the previous law and removes its ongoing modifiers.

### Law Properties
Each law definition includes:
- `tier` (1-3)
- `category` (economy | military | governance)
- `law_type` (varies per category)
- `axis_vector` for alignment and reactions
- `modifiers` (ongoing effects while active)
- `immediate_effects` (one-time adoption rewards)

### Law Catalog (Current)
Economy
- Market:
  - T1 Open Markets Act — Modifiers: +150 trade_income, +0.05 supply_efficiency. Immediate: +1500 credits, +200 requisition, +2 cohesion.
  - T2 Unified Exchange Protocol — Modifiers: +300 trade_income, +0.10 supply_efficiency. Immediate: +3000 credits, +400 requisition, +3 cohesion.
  - T3 Galactic Market Mandate — Modifiers: +600 trade_income, +0.20 supply_efficiency. Immediate: +6000 credits, +800 requisition, +4 cohesion.
- Industry:
  - T1 Industrial Mobilization — Modifiers: +0.10 industrial_output, +0.05 empire_production_multiplier. Immediate: +1200 credits, +250 requisition, +1 cohesion.
  - T2 Total Output Directive — Modifiers: +0.20 industrial_output, +0.10 empire_production_multiplier. Immediate: +2500 credits, +500 requisition, +2 cohesion.
  - T3 Forge-World Acceleration — Modifiers: +0.35 industrial_output, +0.15 empire_production_multiplier. Immediate: +5000 credits, +900 requisition, +3 cohesion.
- Fiscal:
  - T1 Fiscal Stabilization Act — Modifiers: +100 trade_income, +0.5 empire_approval. Immediate: +1500 credits, +150 requisition, +2 cohesion, +1 approval (immediate).
  - T2 Coalition Credit Injection — Modifiers: +200 trade_income, +1 empire_approval. Immediate: +3000 credits, +300 requisition, +3 cohesion, +2 approval (immediate).
  - T3 Unified Treasury Mandate — Modifiers: +350 trade_income, +1.5 empire_approval. Immediate: +6000 credits, +600 requisition, +4 cohesion, +3 approval (immediate).

Military
- Readiness:
  - T1 Rapid Response Charter — Modifiers: x0.9 army_maintenance_cost_modifier, x1.02 cohesionModifier. Immediate: +300 requisition, +2 cohesion.
  - T2 Fleet Readiness Mandate — Modifiers: x0.8 army_maintenance_cost_modifier, x1.05 cohesionModifier, +0.05 supply_efficiency. Immediate: +600 requisition, +3 cohesion.
  - T3 Total Mobilization Protocol — Modifiers: x0.7 army_maintenance_cost_modifier, x1.08 cohesionModifier, +0.10 supply_efficiency. Immediate: +1000 requisition, +4 cohesion.
- Conscription:
  - T1 Selective Service Act — Modifiers: +0.05 supply_efficiency, -0.5 empire_approval. Immediate: +400 requisition, +1 cohesion.
  - T2 Emergency Draft Order — Modifiers: +0.10 supply_efficiency, -1 empire_approval. Immediate: +800 requisition, +2 cohesion.
  - T3 War Levy Mandate — Modifiers: +0.15 supply_efficiency, -1.5 empire_approval. Immediate: +1200 requisition, +3 cohesion.
- Intelligence:
  - T1 Strategic Recon Bureau — Modifiers: x1.05 relations_strength_modifier, +0.05 research_speed. Immediate: +1000 credits, +2 cohesion.
  - T2 Coalition Intelligence Grid — Modifiers: x1.10 relations_strength_modifier, +0.10 research_speed. Immediate: +2000 credits, +3 cohesion.
  - T3 Total Surveillance Accord — Modifiers: x1.15 relations_strength_modifier, +0.15 research_speed. Immediate: +3500 credits, +4 cohesion.

Gouvernance
- Unity:
  - T1 Unity Charter — Modifiers: x1.08 cohesionModifier, +0.5 empire_approval. Immediate: +3 cohesion, +1 approval (immediate).
  - T2 Coalition Solidarity Act — Modifiers: x1.15 cohesionModifier, +1 empire_approval. Immediate: +4 cohesion, +2 approval (immediate).
  - T3 Singular Council Doctrine — Modifiers: x1.25 cohesionModifier, +2 empire_approval. Immediate: +6 cohesion, +3 approval (immediate).
- Delegation:
  - T1 Delegated Authority Pact — Modifiers: x1.05 relations_strength_modifier, +50 trade_income. Immediate: +1000 credits, +2 cohesion.
  - T2 Sector Delegation Accord — Modifiers: x1.10 relations_strength_modifier, +100 trade_income. Immediate: +2000 credits, +3 cohesion.
  - T3 Federated Authority Treaty — Modifiers: x1.20 relations_strength_modifier, +150 trade_income. Immediate: +3500 credits, +4 cohesion.
- Bureaucracy:
  - T1 Administrative Standardization — Modifiers: +0.08 research_speed, +0.05 supply_efficiency. Immediate: +20 influence, +2 cohesion.
  - T2 Central Coordination Office — Modifiers: +0.16 research_speed, +0.10 supply_efficiency. Immediate: +40 influence, +3 cohesion.
  - T3 Unified Administrative Grid — Modifiers: +0.25 research_speed, +0.15 supply_efficiency. Immediate: +60 influence, +4 cohesion.

### Tier Unlocks
Tier unlocks are global and history-based:
- T1 is always available.
- T2 unlocks after any T1 law is enacted.
- T3 unlocks after any T2 law is enacted.

## Standard Events in Play
Standard events are narrative choices not tied to the law system. Law-scoped events are handled by the law engine and are not part of the regular event pool.

## Content Sources
- Laws: `src/game/lawDefinitions.js`
- Events: `modules/events/event_*.ds.yml`
