# Laws and Events

## Overview
This section covers the active laws players can enact and the standard (non-law) events that fire during gameplay. Law enactment events with choices are documented separately in `docs/elements/law-events.md`.

## Laws in Play
Each law costs influence to start and applies a direct effect or policy modifier when enacted.

### War Tax (law_1)
Imposes additional war financing to bolster the military.
- Cost: 0
- Effects: armyOrgConversion multiplier 1.1
- Alignment: pacifist_militaristic 0.6, stoicist_hedonistic -0.4, authoritarian_liberal -0.2

### Northern Industrial Support (law_2)
Direct support for Stellar Federation industry.
- Cost: 2
- Effects: armyOrgConversion multiplier 1.2 (empire_1 only)
- Alignment: natural_mechanical 0.8, spiritual_materialistic 0.5, authoritarian_liberal 0.1

### Southern Agricultural Aid (law_3)
Resource aid package for the Verdant Colonies.
- Cost: 2
- Effects: stockpiles supplies +200
- Alignment: natural_mechanical -0.6, spiritual_materialistic -0.3, essentialist_constructivist -0.4

### Eastern Trade Accord (law_4)
Trade pact with the Nexus Dominion.
- Cost: 3
- Effects: stockpiles super_alloys +100, rare_gases +50
- Alignment: authoritarian_liberal 0.5, spiritual_materialistic 0.4, essentialist_constructivist 0.3

### Coalition Unity Act (law_5)
Symbolic unity pact to stabilize the coalition.
- Cost: 5
- Effects: cohesionModifier 0.9
- Alignment: authoritarian_liberal 0.0, essentialist_constructivist -0.3, stoicist_hedonistic -0.2

### Emergency Powers (law_6)
Gives commanders sweeping authority in wartime.
- Cost: 4
- Effects: armyOrgConversion multiplier 1.15
- Alignment: authoritarian_liberal -0.7, pacifist_militaristic 0.8, stoicist_hedonistic -0.4

### AI Citizenship (law_ai_citizenship)
Grants full citizenship rights to artificial intelligences.
- Cost: 4
- Effects: none (alignment-driven approval changes)
- Alignment: natural_mechanical 0.9, essentialist_constructivist 0.6, authoritarian_liberal 0.2

### Streamlined Digital Governance Act (law_streamlined_governance)
AI-driven governance to accelerate law processing.
- Cost: 5
- Effects: tick_delay_multiplier 0.5, enactment_chance_bonus 0.0
- Alignment: natural_mechanical 0.8, spiritual_materialistic 0.7, authoritarian_liberal 0.2

### Organic Deliberation and Consensus Act (law_organic_deliberation)
Slow consensus-building that increases pass chance.
- Cost: 5
- Effects: tick_delay_multiplier 2.0, enactment_chance_bonus 0.1
- Alignment: natural_mechanical -0.7, spiritual_materialistic -0.5, authoritarian_liberal 0.4

### War Tithe (law_war_tithe)
Mandatory military service and resource contribution.
- Cost: 3
- Effects: armyOrgConversion multiplier 1.2
- Alignment: pacifist_militaristic 0.8, stoicist_hedonistic -0.2, authoritarian_liberal -0.3

## Standard Events in Play

### Supply Convoy Attacked (event_1)
Supply convoy ambushed by the Scourge.
- Send reinforcements: supplies -100, approval +5 (empires 1-3), +4 (clockwork/hive)
- Abandon convoy: approval -10 (empires 1-3), -8 (clockwork/hive)

### Heroic Stand (event_2)
Coalition armies hold a critical breach.
- Publicize victory: army fervor +10 for all armies
- Rotate forces: army fervor -5 for all armies

### Diplomatic Crisis (event_3)
Tensions rise over resource allocation.
- Favor Stellar Federation: approval +15 (empire_1), -8 (empires 2-3), -6 (clockwork/hive)
- Favor Verdant Colonies: approval +15 (empire_2), -8 (empire_1/3), -6 (clockwork/hive)

### Scourge Advance (event_4)
Scourge advances on a Nexus relay station.
- Stand and fight: coalition cohesion -3, scourge cohesion -5
- Tactical retreat: coalition cohesion -5, scourge cohesion +2
- Scorched earth: supplies -150, scourge cohesion -8

### Resource Discovery (event_5)
Supply cache discovered in deep space.
- Secure immediately: supplies +200
- Share with empires: supplies +100, approval +8 (empires 1-3), +6 (clockwork/hive)

### Desertion Crisis (event_6)
Desertions rise across coalition forces.
- Boost supplies: supplies -100
- Propaganda campaign: army fervor +8 for all armies, approval -5 (empires 1-3), -4 (clockwork/hive)
- Crack down: approval -8 (empires 1-3), -6 (clockwork/hive)

## Content Sources
- Laws: `modules/laws/*.ds.yml`
- Events: `modules/events/event_*.ds.yml`
