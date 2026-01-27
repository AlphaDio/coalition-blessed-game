# Scourge Prediction Confidence in Events

## Overview

The Scourge Prediction System integrates with the event system to allow players to improve (or worsen) their ability to predict Scourge attacks through gameplay choices.

## Event-Based Confidence Mechanics

### How Events Impact Prediction

Events can now include a `scourgePredictionConfidence` effect that adjusts the prediction confidence modifier. This allows:

- **Intelligence gathering events** to boost confidence (scouts, analysis)
- **Combat encounters** to provide tactical knowledge
- **Intel losses** to reduce confidence (killed scouts, failed operations)

## New Scourge Events

### 1. Scout Report on Scourge Movement
**ID:** `event_scourge_scouts_report`

Coalition scouts gather intelligence on Scourge force movements.

**Choices:**
- "Analyze intelligence thoroughly": +0.3 confidence, +5 army fervor
- "Conserve scout resources": +0.1 confidence (no other cost)
- "Ignore reports": +2 coalition cohesion (no confidence boost)

### 2. Strategic Insight into Scourge Patterns
**ID:** `event_scourge_prediction_insight`

Military analysts identify patterns in Scourge behavior.

**Choices:**
- "Distribute insights": +0.4 confidence, +5 empire approval (collaborative)
- "Share with core allies": +0.2 confidence (modest)
- "Classify for exclusive use": +0.25 confidence, -3 empire approval (isolationist)

### 3. Lost Scout Team
**ID:** `event_scourge_intel_loss`

A reconnaissance team is eliminated by the Scourge.

**Choices:**
- "Reorganize and rebuild": -0.2 confidence, +2 approval (recovery focused)
- "Acknowledge the loss": -0.3 confidence (accept reduced visibility)
- "Launch rescue mission": -0.15 confidence, -5 cohesion (costly attempt)

## Enhanced Events with Confidence

### Event 1: Requisition Convoy Attacked
**Original:** Simple choice between military response and abandonment
**Enhanced:** Now includes tactical intelligence gathering

**New choices:**
- "Send reinforcements + analyze tactics": -100 requisition, +5 approval, +0.15 confidence
- "Ambush the ambushers": -5 cohesion, -3 scourge cohesion, +0.2 confidence

### Event 4: Scourge Advance
**Original:** Military engagement choices
**Enhanced:** Now reflects learning from combat

**Updated with confidence bonuses:**
- "Stand and fight": -3 cohesion, -5 scourge cohesion, +0.15 confidence
- "Tactical retreat": -5 cohesion, +2 scourge cohesion, +0.1 confidence
- "Scorched earth": -150 requisition, -8 scourge cohesion, +0.4 confidence (major victory)

## Effect Specification

In event YAML files, add the `scourgePredictionConfidence` effect:

```yaml
choices:
  - text: "Choice description"
    effects:
      scourgePredictionConfidence: 0.3  # Boost by 0.3
      # ... other effects ...
```

The value can be:
- **Positive** (0.1 to 0.4): Boost prediction confidence
- **Negative** (-0.3 to -0.1): Reduce prediction confidence
- **Function**: Dynamic values based on game state

## Event Logging

When a scourge prediction confidence effect triggers, players see:

```
Scourge prediction confidence +0.3 (now MEDIUM)
```

Or for decreases:

```
Scourge prediction confidence -0.2 (now LOW)
```

## Strategy Implications

### Gaining Confidence
- Choose intelligence-gathering options in events
- Engage with Scourge forces tactically
- Share military analysis across the coalition
- Maintain well-organized armies

### Losing Confidence
- Avoid engagement with Scourge forces
- Suffer losses of reconnaissance teams
- Become isolated from coalition intelligence
- Let army organization decay

## Balance Notes

- Maximum boost per event: +0.4 (strategically important intel)
- Typical boost: +0.1 to +0.3 (regular intelligence)
- Maximum penalty per event: -0.3 (significant loss)
- Overall modifier range: 0.1 to 2.0 (clamped)

The confidence system rewards players who:
1. Engage strategically with the Scourge
2. Share information with allies
3. Maintain military readiness
4. Learn from past conflicts

## Integration with Other Systems

Confidence affects:
- **Prediction accuracy**: Wider or narrower uncertainty ranges
- **UI display**: Color-coded confidence levels (red/yellow/green)
- **Gameplay strategy**: Helps players prepare defenses earlier
- **Alliance dynamics**: Collaborative intelligence vs. isolation

Events are the primary way players can actively adjust their prediction capabilities outside of passive factors like cohesion tier and army organization.
