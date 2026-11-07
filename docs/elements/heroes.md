---
title: Heroes
status: implemented
updated: 2026-11-07
---

# Heroes

Heroes are empire-bound political operators with passives, signature abilities, law agendas, and political meters. Their **Charge comes from game events**; their empire's **actual Funding modifies ability strength**.

## Charge and automatic abilities

Each built-in Hero's definition in `modules/heroes/*.ds.yml` contains six thematic `charge_triggers`. A militarist might charge when their empire enters battle, wins, or suffers a defeat; a reformer might charge when aligned laws are proposed, enacted or rejected. An enacted law can energize both its supporters and its opponents. Every Hero has a modest ideological proposal trigger to mobilize between less frequent outcomes; stronger personal proposal rules replace that award for the same event.

Only the strongest matching trigger awards Charge for an event, once per Hero. Affiliation, current values, law tags and event context determine eligibility. Status scales the award: Active 100%, Sidelined 60%, Disgraced 30%, Exiled 0%.

Abilities attempt automatically when Charge reaches their own content-defined threshold and the cooldown is clear. They are checked outside law processing too. An ability waits without spending Charge if its context is absent or it cannot produce a meaningful effect. The log explains successful activations and their effects.

## Funding and strength

Each tick after normal empire expenses, the Hero receives actual credits from the empire's remaining treasury according to `budget_share`, capped at 10 credits per Hero and 30% of the empire's remaining treasury across all Heroes. Requests share the cap proportionally. Each credit adds 0.5 Funding; the bounded `0..100` apparatus rating decays by 1 each tick. Funding never creates debt or a deferred activation charge.

Funding contributes a strength multiplier from `x0.60` at zero to `x1.40` at 100. This multiplies the existing cap-aware Popularity effect, with a combined minimum of `x0.35`. An underfunded Hero can still use their ability. Funding is not spent again on activation. Passives continue to scale with Popularity alone.

## Political behavior and recruitment

Hero/empire mismatch with laws still creates Grievance and Heat. Popularity, spillover into army aggravation, phase/cadence passives, law proposals and sponsorship retain their existing behavior.

Each empire has five unique predefined candidates. Initial assignment and the existing recruitment event use that roster; a hero-less empire can receive an event after 5–25 ticks, offering two candidates.

## Player view and saved games

Open **Heroes** with `H` to see accumulated Funding in credits beside each Hero's name. The total adds actual payments across turns and saves, including maintenance paid at full funding level. Details show event triggers and amounts, Charge versus the actual ability threshold, Funding level and its strength modifier, latest payment, total ability strength, cooldown, passives and political meters. Charge gains and ability effects appear in the existing log.

Legacy saves discard unpaid virtual `siphon_bank` data without charging or refunding it. Existing Hero progress is preserved and missing event/funding fields are safely initialized. See [Heroes System v0.3](../systems/heroes_system_v0_3.md) for rules, data and migration details.
