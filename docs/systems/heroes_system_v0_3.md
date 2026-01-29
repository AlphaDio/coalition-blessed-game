---
title: Heroes System v0.3
status: implemented
updated: 2026-01-29
---

# Heroes System v0.3

## Summary
Heroes are empire-bound political operators with:
- **Budgets** (credit siphon),
- **Charge** (ability meter),
- **Passives** (phase/cadence procs),
- **Meters** (heat, grievance, popularity),
- **Alignment pressure** tied to law phases,
- **Spillover** into army aggravation and insurrection risk.

This implementation follows the `heroes_system_v0_3` spec and adds an event-driven layer in law processing.

## Data Model
Hero fields (see `src/game/types.js`):
- `id`, `empire_id`, `name`
- `tagline`
- `tags`, `values` (axis vectors)
- `status`: `ACTIVE | SIDELINED | DISGRACED | EXILED`
- `budget_share`: 0..0.30
- `charge`: 0..100
- `siphon_bank`: credits accumulated from virtual siphon (spent on ability fire)
- `ability_id`
- `passive`: `{ phase, cadence, passive_id }`
- `meters`: `{ heat, grievance, popularity }`
- `last_trigger_turn`, `cooldowns`
- `modifiers` (kept for army-composition integration)

## Budgets → Charge
Per empire tick (after mandatory spending):
1. **Hero siphon** scales with `sum(budget_share)` of remaining `budget_credits` (virtual).
2. Each hero receives a share and converts credits to charge.
3. Siphoned credits accumulate in a **siphon bank** and are only deducted from `budget_credits` when the hero ability fires.

This keeps budgets intact during charge-up while still ensuring the full virtual siphon is paid on ability activation.

Charge gains scale by hero status:
- `ACTIVE`: 1.0
- `SIDELINED`: 0.6
- `DISGRACED`: 0.3
- `EXILED`: 0.0

Implementation: `applyHeroBudgetSiphon()` in `src/game/heroes.js`.

## Law Phase Integration
Per law process tick:
- **Hero mismatch → Grievance**
- **Empire mismatch → Heat**
Both are scaled by law context:
```
unrestPressure = clamp((unrest - UNREST_THRESHOLD) / UNREST_SPAN, 0..1)
legitimacyDampener = 1 - (legitimacy * 0.7)

heat += HEAT_BASE * empireOpp * unrestPressure * legitimacyDampener
grievance += GRIEVANCE_BASE * heroOpp * unrestPressure * legitimacyDampener
```

Implementation: `applyHeroLawPressure()` in `src/game/heroes.js` and hooked into
`resolveLawProcess()` in `src/game/lawProcessManager.js`.

## Passives
Each hero has exactly one passive bound to `(phase, cadence)`:
- `cadence`: `OnStart` or `OnTick`
- `phase`: `DEBATE | FALLOUT | VOTING`

Hooks:
- `OnPhaseStart` => `phaseTicks === 0`
- `OnPhaseTick` => every resolve tick

Implementation: `runHeroPassives()` in `src/game/heroes.js` and calls inside
`resolveLawProcess()`.

## Abilities (Signature Skills)
Hero abilities trigger automatically when:
- `charge >= 100`
- cooldown is 0

After firing:
- `charge` resets to 0
- cooldown applied

Implementation: `triggerHeroAbilities()` in `src/game/heroes.js`.

## Popularity Effects (Granular)
Popularity scales both passive effects **and** ability effects.

Effective popularity is capped by grievance:
```
popularity_cap = 100 - (grievance * 0.5)
effective_popularity = min(popularity, popularity_cap)
```

Granular scalar:
```
popularity_scalar = clamp(0.3 + (effective_popularity / 100) * 0.7, 0.3..1.0)
```

This makes effects **continuously** scale with popularity instead of using hard thresholds.

Used by:
- `HERO_PASSIVES` in `src/game/heroDefinitions.js`
- `HERO_ABILITIES` in `src/game/heroDefinitions.js`

## Stability Dynamics
Each turn:
- Heat decays (faster in good context).
- Grievance decays slowly.
- High heat can “bake” into grievance.
- Popularity drifts with context, capped by grievance.

Implementation: `tickHeroMeters()` in `src/game/heroes.js`.

## Spillover to Armies
Average hero heat/grievance per empire adds aggravation drift to armies:
```
aggravation += (avgHeat/100)*HEAT_DRIFT + (avgGrievance/100)*GRIEVANCE_DRIFT
```

This increases insurrection risk via the existing aggravation threshold model.
Implementation: `applyHeroSpillover()` in `src/game/heroes.js` (called each turn).

## Files / Hooks
Core:
- `src/game/heroes.js`
- `src/game/heroDefinitions.js`
- `src/game/types.js`
- `src/game/content.js` (sample heroes)

Integrations:
- `src/game/lawProcessManager.js` (passives + law pressure + ability trigger)
- `src/game/turn.js` (hero meter tick, siphon, cooldowns, spillover)
- `src/game/armyComposition.js` (hero modifiers compatibility)

## Notes
- No UI panel yet (can be added to info panel in clients if desired).
- Law log lines include `Hero pressure`, `Hero Passive`, and `Hero Ability` for visibility.

