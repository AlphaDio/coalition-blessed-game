# Laws System

## Overview
The law system manages multi-phase enactment (DEBATE, FALLOUT, VOTING) with weighted law events, empire stances, and vote tallying. Laws consume player influence to start and resolve over multiple turns.

## Design Goals
- Convert ideological alignment into political friction and momentum.
- Make law progress feel incremental rather than binary.
- Tie laws to the wider state (cohesion, security, economy) via bias weights.
- **Each meter has ONE primary effect** - avoid cross-coupling.

## Primary Flow
- Law definitions are loaded into `state.lawDefinitions` on startup.
- `startLawProcess` spends influence and creates a law process with empire stances.
- Each tick, the law process resolves a phase event (major + minor) and advances progress.
- When VOTING completes, votes are tallied based on the power system policy.
- Laws end as ENACTED or BURIED.

## Empire Stances and Bias
- Each empire gets a stance from value alignment against the law axis vector.
- Support bias applies population, security, and economy incentives to shift stances.
- Stances drive initial vote intent (support, oppose, abstain).

## Law Meters (Decoupled Design)

Each meter has **one primary effect** to avoid over-coupling:

| Meter | Range | Primary Effect | What It Means |
|-------|-------|----------------|---------------|
| **Momentum** | 0-1 | Boosts APPROVE/ADVANCE event weight | Forward drive - how much energy pushes the law forward |
| **Reject_Pressure** | 0-1 | Boosts REJECT/STALL event weight, enables hard rejects | Opposition heat - risk of progress reversal or burial |
| **Legitimacy** | 0-1 | Reduces unrest consequences (0.3x-1.0x), lowers vote threshold | Perceived validity - how "proper" the process feels |
| **Unrest** | 0-1 | Produces externalities, boosts EXTERNALITY events | Populace volatility - spillover to cohesion/approval/armies |

### Event Natures
Events have a `nature` that determines which meter boosts their weight:

| Nature | Boosted By | Typical Effect |
|--------|-----------|----------------|
| APPROVE | Momentum | +progress, +momentum |
| ADVANCE | Momentum | +progress, +legitimacy |
| REJECT | Reject_Pressure | -progress, +reject_pressure |
| STALL | Reject_Pressure | no progress change, +reject_pressure |
| EXTERNALITY | Unrest | triggers applyUnrestExternalities() |
| NEUTRAL | (none) | varies |

### Legitimacy Effects
- **Unrest Damage Reduction**: `damageMultiplier = 1.0 - (legitimacy * 0.7)`
  - At legitimacy 1.0: only 30% of unrest damage applies
  - At legitimacy 0: full 100% damage
- **Vote Threshold Adjustment**: `threshold = base + 0.05 - (legitimacy * 0.2)`
  - At legitimacy 1.0: threshold reduced by 0.15 (e.g., 0.5 -> 0.35)
  - At legitimacy 0: threshold increased by 0.05 (e.g., 0.5 -> 0.55)

### Unrest Externalities
When `unrest >= 0.3`, each law tick applies negative externalities (scaled by legitimacy):
- **Cohesion Loss**: up to -2 per tick at max unrest
- **Approval Loss**: up to -3 per tick to all empires
- **Insurrection Risk**: up to +5 army aggravation per tick

## Law Events
- Events are filtered by phase tags and triggers (meter thresholds, reject counts).
- Weight formula: `base_weight * meter_boost` where meter_boost depends on nature.
- Major events drive progress; minor events adjust meters.
- Phase progress advances in 0.1-0.4 increments per event.

## Voting
- Voting uses the current power system policy (equal council, pressure-weighted, etc.).
- Quorum and pass thresholds are derived from policy configuration.
- **Legitimacy reduces required threshold** via `getAdjustedVoteThreshold()`.
- Votes tally support, oppose, and abstain across empires.

## Law Modifiers
- `tick_delay_multiplier` scales how quickly law ticks fire (lower is faster).
- `enactment_chance_bonus` reduces the pass threshold during vote tallying.

## Immediate Effects (NEW)
When a law is enacted, it applies both **immediate one-time effects** and **ongoing modifiers**:

### Immediate Effects
Applied instantly when the law passes voting:
- **supplies**: Immediate boost/drain to coalition supply stockpile
- **credits**: Immediate boost/drain to coalition credit balance  
- **cohesion**: Immediate change to coalition cohesion (±1 to ±10 typical)
- **empireApproval**: Immediate approval change applied to all empires
- **armyOrganization**: Immediate organization change to all armies

These represent the immediate impact of the law being enacted - the instant shock, relief, or mobilization as the policy takes effect.

### Ongoing Modifiers
Applied every tick while the law remains active:
- **empire_approval**: Approval change per tick to all empires
- **trade_income**: Credits per tick
- **population_growth**: Population increase per tick
- **industrial_output**: Production multiplier (percentage)
- **cohesionModifier**: Cohesion recovery multiplier
- **army_maintenance_cost_modifier**: Cost reduction multiplier
- **relations_strength_modifier**: Diplomacy effectiveness multiplier
- **supply_efficiency**: Supply usage reduction
- **army_organization**: Organization boost to all armies (also applied immediately)

### Examples
- **Prosperity Doctrine** (T1 Economic): +500 credits + 100 supplies immediately, then +150 credits/tick ongoing
- **Liberty Framework** (T1 Rights): +5 approval + 3 cohesion immediately, then +1 approval/tick ongoing
- **Emergency Resource Rationing** (T2 Emergency): +200 supplies - 3 approval - 2 cohesion immediately, then +20% supply efficiency ongoing

This dual-effect design makes laws feel impactful **now** (solve immediate problems) while also providing strategic **long-term** value.

## Data Flow
- Inputs: law definition, empire values, current meters, RNG.
- Tick: select eligible events -> apply effects -> update meters/progress -> apply unrest externalities.
- Phase change when `phaseProgress >= 1.0`, then reset and advance phase.
- Final: tally votes (with legitimacy-adjusted threshold) and mark ENACTED or BURIED.

## Integration Points
- `src/game/lawEngine.js` - core meter logic, event weighting, externalities.
- `src/game/lawProcessManager.js` - resolves law processes, stances, and voting.
- `src/game/lawEventTemplates.js` - event templates with decoupled meter effects.
- `src/game/lawDefinitions.js` - defines the available law catalog.

## Files
- `src/game/lawEngine.js`
- `src/game/lawProcessManager.js`
- `src/game/lawEventTemplates.js`
- `src/game/lawDefinitions.js`

## Additional Docs
- `docs/systems/law-enactment.md`
- `docs/systems/law-events-with-choices.md`
- `docs/systems/value-alignment.md`
