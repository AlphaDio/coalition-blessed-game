# Law Events with Choices

## Overview
These events trigger during law enactment and present choices that modify law progress and meters. They are separate from the standard event pool.

## Debate Phase Events

### Lobbyist Pressure (debate_choice_lobby_pressure)
- Accept support: progress +0.25, momentum +0.15, legitimacy -0.1, reject_pressure -0.05
- Reject influence: progress +0.1, momentum -0.1, legitimacy +0.15, polarization +0.05

### Public Forum Requested (debate_choice_public_forum)
- Hold open forum: progress +0.05, momentum -0.05, legitimacy +0.2, unrest -0.1, polarization -0.05
- Decline and expedite: progress +0.35, momentum +0.15, legitimacy -0.15, unrest +0.15, reject_pressure +0.1

### Passionate Speech in Council (debate_passionate_speech)
This major event auto-resolves without choices.
- Effects: progress +0.3, momentum +0.1, polarization +0.05

## Fallout Phase Events

### Opposition Rally (fallout_choice_opposition_rally)
- Engage with protesters: progress -0.1, unrest -0.15, legitimacy +0.1, reject_pressure +0.05, momentum -0.1
- Suppress rally: progress -0.05, unrest +0.2, momentum -0.15, reject_pressure +0.15, legitimacy -0.15

## Voting Phase Events

### Last-Minute Amendment Proposed (voting_choice_last_minute_amendment)
- Accept amendment: progress +0.4, momentum +0.2, legitimacy +0.05, reject_pressure -0.2, polarization -0.1
- Reject amendment: progress +0.1, momentum -0.1, legitimacy +0.1, reject_pressure +0.15, polarization +0.15

## Content Sources
- Law events: `modules/events/lawevent_*.ds.yml`
- System docs: `docs/systems/law-events-with-choices.md`
