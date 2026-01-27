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

### Requisition Convoy Attacked (event_1)
Requisition convoy ambushed by the Scourge.
- Send reinforcements + analyze tactics: requisition -100, approval +5, prediction confidence +0.15
- Abandon convoy but help struggling allies: boost weakest empire approval, hurt richest empire approval
- Ambush the ambushers: coalition cohesion -5, scourge cohesion -3, prediction confidence +0.2

### Heroic Stand (event_2)
Coalition armies hold a critical breach.
- Publicize the victory: army fervor +10 for all armies
- Rotate forces: army fervor -5 for all armies

### Diplomatic Crisis (event_3)
Tensions rise over resource allocation.
- Favor ${favored.name}: dynamic targeting with approval +15 to chosen empire, -8 to others
- Maintain equal treatment: approval -3 all, coalition cohesion +5

### Scourge Advance (event_4)
Scourge advances on a Nexus relay station.
- Stand and fight: requisition -50, coalition cohesion -4, scourge cohesion -5, prediction confidence +0.2
- Tactical retreat: coalition cohesion -2, scourge cohesion +2, prediction confidence +0.07
- Scorched earth deployment: requisition -150, coalition cohesion -8, scourge cohesion -8, prediction confidence +0.4

### Resource Discovery (event_5)
Requisition cache discovered in deep space.
- Secure immediately: requisition +200
- Distribute to struggling allies: requisition +50, boost weakest empire approval +12
- Reward strong partners: requisition +75, boost richest empire approval +10

### Desertion Crisis (event_6)
Desertions rise across coalition forces.
- Boost requisition and equipment: requisition -100
- Target support to weakest allies: requisition -50, boost weakest empire approval +6, army fervor +3 all
- Propaganda campaign: army fervor +8 all, approval -5 all

### Scout Report on Scourge Movement (event_scourge_scouts_report)
Coalition scouts gather intelligence on Scourge movements.
- Analyze thoroughly with full resources: requisition -75, prediction confidence +0.35, army fervor +5 all
- Share selectively with weaker allies: boost weakest empire approval +5, prediction confidence +0.18, cohesion +1
- Keep findings internal: prediction confidence +0.12, cohesion +2

### Lost Scout Team (event_scourge_intel_loss)
Coalition reconnaissance team ambushed and eliminated.
- Rapid rebuild with all available resources: requisition -100, prediction confidence -0.12, cohesion +3
- Request allied support: approval -1 all, prediction confidence -0.22, cohesion +1
- Accept the loss peacefully: prediction confidence -0.35, cohesion +2

### Strategic Insight into Scourge Patterns (event_scourge_prediction_insight)
Military analysts identify patterns in Scourge strategies.
- Distribute insights widely: requisition -80, prediction confidence +0.4, approval +2 all
- Share selectively with wealthy allies: boost richest empire approval +5, prediction confidence +0.2
- Classify for exclusive use: approval -2 all, prediction confidence +0.22

## Content Sources
- Laws: `modules/laws/*.ds.yml`
- Events: `modules/events/event_*.ds.yml`
