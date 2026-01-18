# Laws System

## Overview
The law system manages multi-phase enactment (DEBATE, FALLOUT, VOTING) with weighted law events, empire stances, and vote tallying. Laws consume player influence to start and resolve over multiple turns.

## Design Goals
- Convert ideological alignment into political friction and momentum.
- Make law progress feel incremental rather than binary.
- Tie laws to the wider state (cohesion, security, economy) via bias weights.

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

## Law Events and Meters
- Events are filtered by phase tags, triggers, and weight modifiers.
- Major events advance or reject law progress; minor events adjust meters.
- Meters (momentum, reject_pressure, legitimacy, unrest) influence eligibility and outcomes.
- Phase progress generally advances in 0.1–0.4 increments per event.

## Voting
- Voting uses the current power system policy (equal council, pressure-weighted, etc.).
- Quorum and pass thresholds are derived from policy configuration.
- Votes tally support, oppose, and abstain across empires.
- Example: equal council uses `base_votes_per_empire` with quorum and pass thresholds.

## Data Flow
- Inputs: law definition, empire values, current meters, RNG.
- Tick: select eligible events → apply effects → update meters/progress.
- Phase change when `phaseProgress >= 1.0`, then reset and advance phase.
- Final: tally votes and mark ENACTED or BURIED.

## Integration Points
- `src/game/lawProcessManager.js` resolves law processes, stances, and voting.
- `src/game/lawEventTemplates.js` provides core law event templates.
- `src/game/lawDefinitions.js` defines the available law catalog.

## Files
- `src/game/lawProcessManager.js`
- `src/game/lawEventTemplates.js`
- `src/game/lawDefinitions.js`
- `docs/LAW_ENACTMENT_SYSTEM.md`
