---
title: Heroes System v0.3
status: implemented
updated: 2026-11-07
---

# Heroes System v0.3

Heroes are empire-bound political operators. Significant game events generate **Charge**; real empire spending builds **Funding**, which modifies signature ability strength. Passives, political meters, law pressure, proposals, sponsorship, recruitment, and army spillover retain their existing roles.

## Hero data

Heroes are defined in `modules/heroes/*.ds.yml` under `declares.hero_data`:

- `id`, `empireId`, `name`, `tagline`, `tags`, `values`
- `status`: `ACTIVE | SIDELINED | DISGRACED | EXILED`
- `charge_triggers`: thematic event rules with amounts and eligibility
- `charge`: accumulated ability energy, capped at the ability's `chargeRequired`
- `budget_share`: fraction of the empire's remaining treasury requested per tick (the existing content uses small fractions such as `0.0012`)
- `funding`: political apparatus rating, bounded to `0..100`
- `funding_total`: accumulated actual credits paid to this Hero, preserved across turns and saves
- `funding_last_paid`: credits actually paid during the latest funding tick
- `ability_id`, `passive`, `meters`, `cooldowns`, `last_trigger_turn`, and army-composition `modifiers`

Ability thresholds and cooldowns are content-defined in `modules/hero_abilities/*.ds.yml`; thresholds vary from 100 to 200. The Hero view obtains ability metadata and balancing constants from `/api/game/definitions/heroes` rather than assuming every ability needs 100 Charge.

## Event-driven Charge

Each built-in Hero has six thematic Charge rules reflecting their identity and agenda. Supported developments include law proposals, enactments and rejections; battles begun, won and lost; technology unlocks; and completed improvements. Rules can restrict the event to the Hero's empire or battle participants, require ideological support or opposition, match law tags, or require that the Hero proposed the law. For example, an admiral's rules include:

```yaml
charge_triggers:
  - event: LAW_ENACTED
    amount: 55
    description: "Aligned law enacted: advance fleet discipline"
    empire_scope: any
    alignment: support
  - event: BATTLE_LOST
    amount: 80
    description: "Empire loses battle: demand fleet recovery"
    empire_scope: participant
  - event: LAW_PROPOSED
    amount: 12
    description: "Ideological law proposed: mobilize around fleet discipline"
    empire_scope: any
    alignment: either
```

Alignment uses the Hero's current values and the law's axis vector, with cosine thresholds of `+0.15` for support and `-0.15` for opposition. Both supporters and opponents may gain Charge from an enactment, for different reasons. Defeats and rejected agendas can mobilize Heroes even when an empire has little money.

Only the strongest matching rule awards Charge for a given event; overlapping rules never stack. Stable namespaced event IDs are recorded per Hero in the saved `charge_events` ledger, preventing separate observers from awarding the same occurrence twice. Charge gains retain status scaling: `ACTIVE x1.0`, `SIDELINED x0.6`, `DISGRACED x0.3`, `EXILED x0`.

Balance targets several significant developments per activation. Enacted supportive laws award 55 Charge and opposed laws 60; rejected aligned laws award 75. Each Hero also gains 12 from an ideologically relevant proposal, with stronger personal thematic proposal rules awarding 35–45 instead of stacking. Proposals provide a modest, more frequent source between rarer outcomes. Technology unlocks award 70–85, completed improvements 65–75, battle starts 45, victories 65 and defeats 75–90. These larger outcome rewards account for their lower frequency in actual turn processing; abilities still require 100–200 Charge and retain cooldowns. No Charge is generated from recurring law ticks or funding.

## Incremental Funding

`applyHeroFunding()` runs after the empire's normal economic expenses. Each tick:

1. Funding decays by 1 point, to a minimum of zero.
2. Each eligible Hero requests `remaining_budget * budget_share`, capped at 10 credits and the amount needed to reach 100 Funding.
3. Total Hero spending is capped at 30% of the same remaining treasury. If necessary, requests are reduced proportionally, so Hero array order gives no advantage.
4. Credits are deducted immediately and add `0.5 Funding / credit`, before efficiency bonuses. No debt or deferred activation bill is created.

At the base rate, 2 credits per tick maintains an apparatus; 10 credits per tick grows it by a net 4 points. Funding can persist through a short shortage and gradually declines during a sustained one. Exiled Heroes receive no funding. The old siphon-efficiency modifier names remain compatibility aliases for funding efficiency, preserving existing improvement and saved-game bonuses.

Every actual payment also adds its credit amount to `funding_total`. This running total continues accumulating when the apparatus rating is full and stays unchanged during shortages and ability activations. Funding is ongoing support, not an activation cost. An ability never empties the funding rating or deducts additional credits.

## Automatic signature abilities

A Hero automatically attempts their signature ability when sufficiently charged and off cooldown. Attempts occur on relevant events and during turn processing, including when there is no law in progress. Law-dependent abilities wait for a live law; army-dependent abilities wait for an applicable army effect. A hook that produces no meaningful effect does not spend Charge or start a cooldown.

A successful ability spends its Charge and starts its content-defined cooldown. Cooldowns tick at the start of the turn, before events are produced, so activations receive the full cooldown regardless of which event fires them. Funding sets signature ability strength directly.

```text
ability_scalar = 0.6 + (funding / 100) * 0.8
```

An unfunded Hero acts at ×0.6 strength. Fully funded Heroes act at ×1.4 strength. Popularity governs political support and passive effects.

Ability DSL hooks receive `scope.ability_scalar`, `scope.funding_scalar`, and `scope.popularity_only_scalar`. For existing ability content, `scope.popularity_scalar` supplies the ability strength. Passive hooks use Popularity.

## Existing political systems

Law mismatch still raises Heat and Grievance, modulated by unrest and legitimacy. Heat decays each turn, popular Heroes shed it faster, grievance caps Popularity, and sustained tension can spill into army aggravation. Existing phase/cadence passives, Hero law proposals and sponsorship continue to work alongside event Charge.

Hero definitions remain unique empire-affiliated characters. Each empire has five candidates. Initial assignment and recruitment use the existing roster; a hero-less empire can receive a recruitment event after 5–25 ticks offering two candidates.

## Presentation

The terminal's **Heroes** view (`H`) shows each Hero's empire, status, signature ability, Charge, cooldown, Funding, and Popularity. It groups Charge sources into laws, battles, research, and construction. The log records individual Charge gains, funding changes, and ability activations.

## Save compatibility

Saves without `funding_total` start the running total at zero; past payments cannot be reconstructed from the apparatus rating. New payments accumulate from that point, and saved totals are preserved on reload.

Legacy `siphon_bank` values are discarded: they represent virtual money that was neither paid nor owed. They do not become funding, debt, or a future activation charge. Existing Charge is preserved up to the current ability threshold; meters, affiliations, proposals, sponsorship and cooldowns are preserved and normalized. Missing Funding starts at zero. Missing Charge rules on saved Heroes and roster entries are restored by ID from current YAML. Malformed rule entries without an event name and positive finite amount are filtered out. Unknown custom Heroes receive default ideological proposal, support/opposition enactment, aligned rejection and participant defeat triggers. New Funding, payments and event identity data survive save/load, so replaying an observed event cannot award it again.

## Implementation and checks

Core behavior is in `src/game/heroes/`, with definitions in `src/game/heroDefinitions.js`, recruitment in `src/game/heroes/recruitment.js`, and save normalization in `src/game/types.js`. Existing law, battle, technology, improvement and turn pipelines deliver events through the Hero event dispatcher. The client uses its existing combined info panel and logging flow.

Focused tests cover eligibility and ideological reactions, event deduplication, actual funding and decay, meaningful automatic activation, save migration, and the Hero view's non-100 thresholds and funding display.
