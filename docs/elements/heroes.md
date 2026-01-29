---
title: Heroes
status: implemented
updated: 2026-01-29
---

# Heroes

Heroes are empire-bound political operators that influence laws, meters, and stability.
They are not armies; they act through **passives**, **signature abilities**, and **alignment pressure**.

## Entity Fields
- `id`, `empire_id`, `name`
- `tagline`
- `tags`, `values`
- `status`: `ACTIVE | SIDELINED | DISGRACED | EXILED`
- `budget_share`: 0..0.30
- `charge`: 0..100 (ability meter)
- `siphon_bank`: virtual credits accumulated and spent when ability fires
- `ability_id`
- `passive`: `{ phase, cadence, passive_id }`
- `meters`: `{ heat, grievance, popularity }`

## Budget Siphon (Virtual)
Each tick, hero charge scales with a **virtual siphon** based on the empire’s remaining `budget_credits`.
Credits are **not** deducted each tick; instead they accumulate in `siphon_bank` and are only spent when
the hero’s ability fires. This keeps budgets intact while still “paying” the accumulated siphon on use.

## Abilities
Abilities auto-fire when:
- `charge >= 100`
- cooldown is 0

On trigger:
- `charge` resets
- cooldown applied
- `siphon_bank` is deducted from the empire’s budget

## Passives
Each hero has exactly one passive, defined by `(phase, cadence)`:
- `phase`: `DEBATE | FALLOUT | VOTING`
- `cadence`: `OnStart | OnTick`

## Law Integration
Hero/Empire alignment vs law values creates:
- **Heat** when the empire mismatches the law
- **Grievance** when the hero mismatches the law

## Recruitment Events (Staggered)
If an empire has no hero, a recruitment event is triggered after a random delay:
- **Delay range:** 5–25 ticks
- Rolled per empire the first time it becomes hero-less

The event offers 2–3 candidates with a short tagline for selection.
