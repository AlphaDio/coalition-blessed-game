# Expeditions

Expeditions introduce a frontier of independent empires and non-empire discoveries. Exploration gives new economic and diplomatic opportunities without adding full Coalition members, council votes, populations, heroes or law processes.

## Player flow and controls

In the terminal client, press **X** or choose **Expeditions** in Actions. Launch a frontier expedition, then inspect the empire or discovery it finds. Up/Down and Enter navigate; Esc goes back; K/J or Page Up/Down scroll details. An invasion opens a confirmation screen with cancellation selected by default. Both the action menu and contact details show costs, timers and reasons for unavailable actions. Disabled actions spend nothing. Requests in flight cannot be submitted twice.

The overview explains the first steps, available materials, active journeys, contacts, discoveries and recent reports. Contact details show approval, priorities, production, sustain fulfillment, defenses, investments, raid warnings, partnership returns and occupation expenses. Discovery details show the benefit before study begins.

## Exploration and material access

There is one expedition slot. **Launch frontier expedition** reveals one new destination from a shared pool of six independent empires and six discoveries. The launch menu shows the destination category, the current cost and the travel-time range. Once every destination is found, no further expedition can launch.

The base cost is **150 Biomass and 100 Plasma Fuel** for an empire contact or **150 Super Alloys and 100 Plasma Fuel** for a discovery. Each previous launch adds 25% of the applicable base cost to the next one, rounded up per material. The second launch therefore costs 188 of the destination's primary material and 125 Plasma Fuel. Launching requires zero requisition.

New and migrated campaigns receive a finite frontier charter of **240 Super Alloys, 220 Biomass and 160 Plasma Fuel** in Coalition stockpiles. The charter covers the opening launch and helps fund early investments. It never refills on save/load. Further supplies come from discovery salvage and market surplus created by production improvements and contacts.

Expedition actions use zero requisition. Material costs use Coalition stockpiles first. Remaining materials are bought from actual unfilled empire or minor-empire sell offers at the current commodity price. Treasury credits pay the seller and only the purchased quantity is retired. Costs show those credit requirements; validating all resources precedes any deduction. Essential reserves held inside member empires are not requisitioned.

Base travel time varies from **10 to 16 turns**. The destination and travel roll use a dedicated stream seeded by the campaign seed and expedition count. Both are saved at launch, so pausing or reloading preserves the trip.

Hyperdrive Technology in any Coalition empire grants **+20% expedition speed**. Studying the Transit Lattice adds **+30%**. The game divides the base roll by one plus the combined speed bonus and rounds up, for a **7–11 turn** range with both bonuses. Bonuses apply when an expedition launches.

## Independent empires

Each contact produces one fixed commodity and requires one sustain commodity per turn. It trades with its own finite credit budget through ordinary market orders. Production is multiplied by the previous turn's sustain fulfillment, with a 25% minimum; budget limits and scarcity therefore matter. Unmet sustainment is a daily shortfall, not accumulating Coalition backlog. Full sustainment adds 0.1 approval; a complete shortage loses 0.75 approval per turn, proportionally less for partial shortages. War and hostility embargo their trade and cancel outstanding orders.

| Empire | Output per turn | Sustain per turn | Priority | Defenders |
| --- | --- | --- | --- | --- |
| Cinder Compact | 24 Super Alloys | 8 Biomass | Industry | 7,000 MP |
| Verdant Enclaves | 30 Biomass | 8 Plasma Fuel | Civilian welfare | 5,000 MP |
| Glass Observatory | 5 Rare Gases | 10 Super Alloys | Knowledge | 6,000 MP |
| Free Harbors | 28 Plasma Fuel | 9 Biomass | Sovereignty | 8,500 MP |
| Gene Cantons | 3 Genomes | 10 Biomass | Civilian welfare | 5,500 MP |
| Relic Wardens | 2 Ancient Relics | 9 Plasma Fuel | Sovereignty | 9,000 MP |

An envoy is free, reveals priorities and adds 3 approval. Tailored aid then costs 50 of the preferred material, giving 14 approval or 20 for welfare-minded contacts. Aid has a six-turn cooldown that persists through saves.

Knowledge-minded contacts gain 5 approval when a discovery study completes. Sovereignty-minded contacts give extra approval for pacts and strongly oppose conquest.

At **65 approval**, an envoy-informed contact can sign a partnership for 40 Biomass and 20 Plasma Fuel. This raises exports to 125% and grants **2 requisition plus 1 per development level each turn**, scaled by previous sustain fulfillment. Approval below 40 suspends the pact.

## Development

Each contact offers a repeatable development program with its own materials. Each existing level adds 50% of the base cost to the next upgrade, rounded up for each material. The Expeditions overview shows reserves for the materials required by discovered contacts.

| Empire | Development program | Level 1 cost |
| --- | --- | --- |
| Cinder Compact | Rebuild furnace lines | 45 Super Alloys, 20 Plasma Fuel |
| Verdant Enclaves | Restore garden canopies | 55 Biomass, 15 Plasma Fuel |
| Glass Observatory | Upgrade spectral arrays | 45 Super Alloys, 25 Biomass |
| Free Harbors | Expand fuel depots | 50 Plasma Fuel, 25 Super Alloys |
| Gene Cantons | Expand seed vaults | 40 Biomass, 3 Genomes |
| Relic Wardens | Restore ruin archives | 25 Super Alloys, 2 Ancient Relics |

Development is immediate and uses zero requisition. Each level adds **50% of base production**, lowers the current sustainment requirement by **20%**, and grants **6 approval**. Contacts need **40 approval** and must be at peace. Conquered contacts also need to finish the initial occupation period.

Older campaigns keep their development levels and economic benefits. New upgrades stack on top of those benefits. Projects already paid for keep their saved timers and rewards.

## Raids, invasion and occupation

At **20 approval or less**, an independent contact becomes hostile and closes its market. After its initial grace period and any truce, a visible **four-turn warning** precedes a raid. A ceasefire costs 60 of its sustain commodity, restores at least 35 approval and prevents raids for 20 turns. A defended raid uses real front battles and lasting army losses. If no army is ready, the raid takes up to 80 requisition and 0.5 Coalition Cohesion at current cohesion pacing. Successful defense restores independence, at least 30 approval and a 20-turn truce.

An invasion costs **100 Alloys and 60 Fuel**, plus **1.5 Coalition Cohesion at current pacing**, 3 approval from every Coalition member and 12 approval from other independent contacts (20 for sovereignty-minded contacts). One ready army is selected by default, with at least 35 organization. Its identity and strength, enemy defenders and economic consequences appear before confirmation. The army cannot serve on simultaneous Scourge or rebellion fronts. Combat applies real permanent capacity losses, wounds, organization changes and experience. It does not alter Scourge Cohesion or grant Scourge victory rewards.

Victory starts an occupation at 20 approval. Exports run at 35% for the first **15 paid turns** and 70% afterward. The base upkeep is **1.5 requisition and 2 Plasma Fuel** each turn. Each development level adds **0.5 requisition and 1 Plasma Fuel** to that upkeep. A stabilized occupation pays **3 requisition plus 1 per development level** in tribute on each paid turn, scaled by previous sustain fulfillment.

Unpaid upkeep pauses new exports and tribute. The empire breaks free after **20 consecutive missed payments**. Paying upkeep resets the countdown. Expedition reports warn on the first missed payment and again with five turns left. Contact details show the shortfall and remaining turns. Existing occupations start a fresh countdown on migration.

Liberation immediately ends occupation, restores 55 approval and gives other free contacts 5 approval. Defeat loses the invasion investment and leaves surviving armies with their casualties.

## Discoveries

Discovery sites have no population, approval, sustainment or army. Their study cost, duration and benefit are visible before investing. Studies can run alongside a journey, complete once, and persist in saves.

| Discovery | Study reward |
| --- | --- |
| Derelict Convoy | One-time 300 Alloys, 180 Biomass, 120 Fuel |
| Ancient Relay | +0.5 Coalition Intel per turn |
| Precursor Foundry | +10% improvement construction speed |
| Living Nebula | +0.05 approval per member empire per turn |
| Silent Archive | +0.5 research points per member empire per turn |
| Transit Lattice | +5% consumption requisition generation and +30% expedition speed |

Study costs and timers are authored in `src/game/expeditions/catalog.js`. Dynamic benefits are reapplied after the turn's modifier reset, avoiding permanent stacking. The expedition tick is idempotent within a turn, and completed fronts resolve once.

## Integration and validation

`POST /api/game/actions/expedition` accepts `launch` with `planId: 'frontier'`, along with `envoy`, `aid`, `pact`, `develop`, `appease`, `invade`, `liberate` and `study`. Development takes the contact's `targetId`. Include the option's `targetLevel` to tie the purchase to the level quoted by the server. All actions resolve against server-produced options, including current affordability and prerequisites. REST returns and WebSocket broadcasts include `state.expeditions`, its action options, charter/market reserves, contact state and reports. Invalid requests and actions after game over are rejected.

`npm run test:expeditions` covers travel, deterministic destinations, atomic payments and seller credit, diplomacy, repeatable development, unique discovery rewards, migration, save/load, raids, occupation, budget-limited trading, casualty persistence, concurrent army exclusion, and the live REST/WebSocket opening flow. The terminal client's `npm test` covers real Blessed navigation, scrolling, hidden interests, disabled actions, costs, invasion confirmation/cancellation and API dispatch.
