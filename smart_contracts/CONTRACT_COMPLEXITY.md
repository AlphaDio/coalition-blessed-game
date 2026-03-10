# Contract Count and Complexity for a Coalition-Like Game

This note describes how many smart contracts a game like Coalition is likely to need, which contracts are genuinely complex, and how the current repo compares to a fuller on-chain design.

## Current Solidity Footprint

The current smart-contract folder contains **5 Solidity files**:

| File | Role | Deployable | Approx. complexity |
|---|---|---:|---|
| `src/CoalitionGame.sol` | Main game coordinator | Yes | Very high |
| `src/modules/SentientCoreIntelModule.sol` | Example event module | Yes | Low |
| `src/interfaces/ICoalitionEventModule.sol` | Module interface | No | Low |
| `src/interfaces/ICoalitionModuleHost.sol` | Legacy/support interface | No | Low |
| `src/libraries/CoalitionHooks.sol` | Shared hook ids/payload structs | No | Low |

By line count, the current codebase is heavily concentrated in the coordinator:

- `CoalitionGame.sol`: about 1,100 lines
- `SentientCoreIntelModule.sol`: about 80 lines
- Remaining support files: 8-31 lines each

That means the current implementation is a **monolithic vertical slice**: one contract owns most of the real gameplay state and orchestration, and modules hang off that core.

## Complexity Bands

For a strategy game like Coalition, contract count is not the main problem. The main problem is where state mutation, turn sequencing, and cross-system rules accumulate.

Use these bands:

- **Low complexity**: under ~150 lines or one narrow responsibility.
  Examples: interfaces, libraries, simple trigger modules, single-purpose metadata registries.
- **Medium complexity**: ~150-400 lines with one primary state domain.
  Examples: roster registries, vaults, module registries, simple controller/admin contracts.
- **High complexity**: ~400-800 lines with multiple write paths, config surfaces, and internal accounting.
  Examples: economy ledgers, improvement queues, battlefront state machines, law engines.
- **Very high complexity**: ~800+ lines or any contract coordinating multiple systems in turn order.
  Examples: world coordinators, turn engines, or any "god contract" that owns economy + battles + modules + progression together.

## Expected Contract Count by Scope

### 1. MVP / Vertical Slice

Expected deployed contracts: **2-4**

- 1 coordinator/game-state contract
- 1 module or extension contract
- Optional 1 registry or treasury split
- Optional 1 battle/economy split if the core gets too large

This is roughly where the current repo is headed: fast to iterate, simple to reason about locally, but contract complexity is concentrated in one place.

### 2. Hybrid Production-Ready Core

Expected deployed contracts: **4-6 core contracts**, plus optional modules

Recommended split:

1. **Core / Turn Coordinator**: turn advancement, seeds, top-level orchestration.  
   Complexity: Very high
2. **Economy / Treasury**: resource balances, requisition accounting, valuation, procurement rules.  
   Complexity: High
3. **Empire / Army Ledger**: empire metadata, army roster, ownership/controller rules.  
   Complexity: Medium to high
4. **Battle System**: battle resolution, recovery, experience, combat stats.  
   Complexity: High
5. **Improvements / Works**: build queue, sustainment, production outputs, degradation.  
   Complexity: High
6. **Event / Module Gateway**: narrative/event hooks, module allow/registry policy, template catalog.  
   Complexity: Medium

This is the most practical target for Coalition if the game wants meaningful on-chain state without immediately over-fragmenting the design.

### 3. Full Coalition-Like On-Chain Game

Expected deployed contracts: **8-12 core contracts**, plus **5-N low-complexity content modules over time**

Why the count grows:

- The repo already describes major systems for:
  - economy
  - battles
  - improvements
  - laws / law enactment
  - events
  - heroes
  - scourge
  - insurrection
  - technology
- Some of those can share a contract, but not all of them should if the game goes fully on-chain.

Reasonable full split:

1. Core turn coordinator
2. Economy / treasury / requisition
3. Empire state ledger
4. Army roster and stat ledger
5. Battlefront resolver
6. Improvements / construction / sustainment
7. Lawbook / governance
8. Event gateway / module registry
9. Scourge campaign system
10. Heroes / commanders / progression
11. Technology / unlocks
12. Optional checkpoint, digest, or migration helper contract

Then add small modules for special effects, narrative triggers, temporary campaigns, or seasonal mechanics.

## Where Coalition's Complexity Actually Lives

For Coalition specifically, the hardest domains are not the small helper contracts. The hardest domains are:

- **Turn orchestration**: many systems apply in sequence and need deterministic ordering.
- **Economy**: requisition, balances, valuation, production, sustainment, and conversion logic all touch each other.
- **Battles**: battle power, losses, recovery, experience, and progression produce dense state transitions.
- **Improvements**: queues, prerequisites, sustainment, outputs, and status transitions create a large state machine.
- **Laws and events**: lots of cross-cutting modifiers and targeted effects.
- **Expansion systems**: scourge, insurrection, heroes, and technology each add another high-complexity ruleset.

That is why a Coalition-like game often ends up with a **small number of very complex contracts** plus a **larger number of low-complexity leaf modules**, rather than dozens of equally important contracts.

## Recommended Direction for Coalition

For this project, the best framing is:

- **Current state**: 1 very complex core contract + 1 low-complexity module + support files
- **Recommended near-term target**: 4-6 deployed core contracts
- **Likely long-term full on-chain target**: 8-12 core contracts plus many small event/module contracts

Practical rule:

- Split a system into its own contract when it has a distinct trust boundary, upgrade cadence, hot write-path, or testing burden.
- Do **not** create one contract per narrative event or one contract per small rules tweak; those should stay as modules, data, or low-complexity extensions.

## Simple Summary

If Coalition stays mostly hybrid, expect **4-6 deployed contracts**.

If Coalition tries to put nearly all major systems on-chain, expect **8-12 deployed core contracts** plus **many small content modules**.

The main architectural risk is not "too many contracts." It is letting one coordinator absorb too many systems until it becomes the only place where any change is possible.
