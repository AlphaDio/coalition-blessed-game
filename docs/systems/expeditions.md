# Expeditions

Expeditions introduce a frontier of independent empires and non-empire discoveries. Exploration gives new economic and diplomatic opportunities without adding full Coalition members, council votes, populations, heroes or law processes.

## Player flow and controls

In the terminal client, press **X** or choose **Expeditions** in Actions. Choose a mission, inspect a returned contact, then select an interaction. Up/Down and Enter navigate; Esc goes back; K/J or Page Up/Down scroll details. An invasion opens a confirmation screen with cancellation selected by default. Both the action menu and contact details show costs, timers and reasons for unavailable actions. Disabled actions spend nothing. Requests in flight cannot be submitted twice.

The overview explains the first steps, available materials, active journeys, contacts, discoveries and recent reports. Contact details show approval, priorities, production, sustain fulfillment, defenses, investments, raid warnings, partnership returns and occupation expenses. Discovery details show the benefit before study begins.

## Exploration and material access

There is one expedition slot. **Seek new empires** costs 40 requisition, 20 Biomass and 15 Plasma Fuel, returning a unique empire after six turns. **Survey the unknown** costs 30 requisition, 20 Super Alloys and 15 Plasma Fuel, returning a unique discovery after five turns. Each pool contains six authored destinations; exhausted pools cannot be farmed. Journeys have guaranteed results so an early investment does not disappear to a random failure.

New and migrated campaigns receive a finite frontier charter of **240 Super Alloys, 220 Biomass and 160 Plasma Fuel** in Coalition stockpiles. The ordinary opening economy has no spare market materials, so this charter makes the first journeys and investments accessible. It never refills on save/load. Further supplies come from discovery salvage and market surplus created by production improvements and contacts.

Costs use Coalition stockpiles first. Remaining materials are bought from actual unfilled empire or minor-empire sell offers at the run's fixed commodity price. Treasury credits pay the seller and only the purchased quantity is retired. Costs show those credit requirements; validating all resources precedes any deduction. Essential reserves held inside member empires are not requisitioned.

The destination is chosen using a separate seeded stream at launch and saved with the mission. Simulation turns advance travel and construction. Pause, save/load and unrelated random rolls cannot reroll a destination or repeat a reward.

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

An envoy costs 15 requisition, reveals priorities and adds 3 approval. Tailored aid then costs 20 requisition and 50 of the preferred material, giving 14 approval or 20 for welfare-minded contacts. Aid has a six-turn cooldown that persists through saves.

Priorities also respond to decisions: industry values industrial projects, welfare values civilian infrastructure, knowledge gains 5 approval when a discovery study completes, and sovereignty values pacts while strongly opposing conquest.

At **65 approval**, an envoy-informed contact can sign a partnership for 60 requisition, 40 Biomass and 20 Plasma Fuel. This raises exports to 125% and grants **2 + development level requisition per turn**, multiplied by previous sustain fulfillment. Approval below 40 suspends the pact. These benefits favor sustained diplomacy and investment.

## Development

Contacts require **40 approval** to accept development. Only one project per contact can build at once. Materials and requisition are committed up front; output changes arrive on completion. War, hostility and unstable occupation pause projects.

| Project | Base cost | Base duration | Benefit | Cap |
| --- | --- | --- | --- | --- |
| Local industry | 35 req, 90 Alloys, 35 Biomass, 20 Fuel | 6 turns | +50% original output per level | 3 |
| Civilian infrastructure | 25 req, 65 Alloys, 60 Biomass, 25 Fuel | 5 turns | −20% original sustain per level | 2 |

Each existing development adds 50% to the next project's base costs and one turn to its duration. Completion adds 6 approval, or 12 when matching the empire's industry/welfare priority. Development also increases partnership and tribute income. Occupied empires start at low approval, so developing them takes longer than developing a willing partner.

## Raids, invasion and occupation

At **20 approval or less**, an independent contact becomes hostile and closes its market. After its initial grace period and any truce, a visible **four-turn warning** precedes a raid. A ceasefire costs 35 requisition and 60 of its sustain commodity; it restores at least 35 approval and prevents raids for 20 turns. A defended raid uses real front battles and lasting army losses. If no army is ready, the raid takes up to 80 requisition and 0.5 Coalition Cohesion at current cohesion pacing. Successful defense restores independence, at least 30 approval and a 20-turn truce.

An invasion costs **125 requisition, 100 Alloys and 60 Fuel**, plus **1.5 Coalition Cohesion at current pacing**, 3 approval from every Coalition member and 12 approval from other independent contacts (20 for sovereignty-minded contacts). One ready army is selected by default, with at least 35 organization. Its identity and strength, enemy defenders and economic consequences appear before confirmation. The army cannot serve on simultaneous Scourge or rebellion fronts. Combat applies real permanent capacity losses, wounds, organization changes and experience. It does not alter Scourge Cohesion or grant Scourge victory rewards.

Victory creates a **15-turn occupation**, starting at 20 approval, with 35% exports during occupation and 70% afterward. Permanent upkeep is **1.5 + 0.5 × development level requisition** and **2 + development level Fuel** each turn. Paid, stabilized occupations earn **3 + development level requisition tribute**, multiplied by prior sustain fulfillment. This gives conquest a return, while diplomatic fallout, troop losses, delayed income and fuel/admin costs keep it from being the default best choice. Developed, willing partnerships offer stronger net returns and exports.

Unpaid upkeep stops exports and adds unrest. Eight unpaid turns cause secession into hostility; paid upkeep reduces unrest. Liberation immediately ends occupation, restores 55 approval and gives other free contacts 5 approval. It grants no repeatable loot. Defeat loses the invasion investment and leaves surviving armies with their casualties.

## Discoveries

Discovery sites have no population, approval, sustainment or army. Their study cost, duration and benefit are visible before investing. Studies can run alongside a journey or contact developments, complete once, and persist in saves.

| Discovery | Study reward |
| --- | --- |
| Derelict Convoy | One-time 300 Alloys, 180 Biomass, 120 Fuel |
| Ancient Relay | +0.5 Coalition Intel per turn |
| Precursor Foundry | +10% improvement construction speed |
| Living Nebula | +0.05 approval per member empire per turn |
| Silent Archive | +0.5 research points per member empire per turn |
| Transit Lattice | +5% consumption requisition generation |

Study costs and timers are authored in `src/game/expeditions/catalog.js`. Dynamic benefits are reapplied after the turn's modifier reset, avoiding permanent stacking. The expedition tick is idempotent within a turn, and completed fronts resolve once.

## Integration and validation

`POST /api/game/actions/expedition` accepts `launch`, `envoy`, `aid`, `pact`, `develop`, `appease`, `invade`, `liberate` and `study`. All actions resolve against server-produced options, including current affordability and prerequisites. REST returns and WebSocket broadcasts include `state.expeditions`, its action options, charter/market reserves, contact state and reports. Invalid requests and actions after game over are rejected.

`npm run test:expeditions` covers travel, deterministic destinations, atomic payments and seller credit, diplomacy, delayed/capped development, unique discovery rewards, migration, save/load, raids, occupation, budget-limited trading, casualty persistence, concurrent army exclusion, and the live REST/WebSocket opening flow. The terminal client's `npm test` covers real Blessed navigation, scrolling, hidden interests, disabled actions, costs, invasion confirmation/cancellation and API dispatch.
