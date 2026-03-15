# Improvement Suggestion Rate Analysis

## Current System Overview

### Generation Points

1. **Initial Generation** (`initializeImprovementsState()` in engine.js:183)
   - Called once when improvements system initializes
   - Generates up to 2 suggestions per empire immediately

2. **Periodic Refreshes** (turn.js:745-795)
   - **Frequency:** Every turn (continuous)
   - **60% chance** if empire has active improvement
   - **20% chance** if empire has no active improvement
   - **Limit:** Max 3 suggestions per empire (was 2 in generateImprovementSuggestions)
   - **Process:** Adds 1 new suggestion per empire per trigger

3. **Cleanup** (turn.js:740)
   - Removes suggestions older than 90 ticks
   - Only removes expired ones, not to limit total count

### Current Constraints

| Parameter | Value | Location |
|-----------|-------|----------|
| Max suggestions per empire (initial) | 2 | definitions.js:736 |
| Max suggestions per empire (during gameplay) | 3 | turn.js:767 |
| Generation chance (with active improvement) | 60% | turn.js:764 |
| Generation chance (without active improvement) | 20% | turn.js:764 |
| Suggestion expiry | 90 ticks | improvements/engine/state.js |
| T1 weight | 5x | definitions.js |
| T2 weight | 5x | definitions.js |
| T3 weight | 3x | definitions.js |

## Problem Analysis

With multiple empires and continuous 60% generation chance per turn:
- **Per turn:** Each empire with activity generates ~0.6 new suggestions
- **With 4 empires:** ~2.4 new suggestions per turn
- **Per 10 turns:** ~24 new suggestions generated
- **Cleanup:** Only removes suggestions older than 45 ticks

**Result:** Queue fills up quickly because:
1. Generation rate > Cleanup rate
2. No hard cap on total suggestions
3. Random chance means occasional turns with many additions

## Solution Options

### Option A: Reduce Generation Frequency (EASIEST)
```javascript
// Reduce generation chances
const suggestionChance = hasActiveImprovement ? 0.3 : 0.1;  // Was 0.6 / 0.2
```
**Pros:**
- Simple one-line change
- Maintains existing behavior
- Gives player more time between new suggestions

**Cons:**
- Players might miss suggestions if they look infrequently
- Takes longer to fill in options

### Option B: Enforce Strict Cap (BALANCED)
```javascript
// Add a global hard cap
const totalSuggestions = state.improvements.requests.length;
const MAX_TOTAL_SUGGESTIONS = 10;  // New global limit

if (totalSuggestions >= MAX_TOTAL_SUGGESTIONS) {
  return;  // Don't generate more
}
```
**Pros:**
- Predictable maximum queue size
- Players know suggestions won't overwhelm them
- Still allows natural growth

**Cons:**
- Might prevent legitimate new suggestions
- Needs tuning of the cap

### Option C: Implement Queue Cycling (BEST)
```javascript
// Replace oldest suggestion when at limit
const MAX_SUGGESTIONS_PER_EMPIRE = 2;
const MAX_TOTAL_SUGGESTIONS = 8;

if (state.improvements.requests.length >= MAX_TOTAL_SUGGESTIONS) {
  // Remove oldest suggestion from any empire that has > MAX_SUGGESTIONS_PER_EMPIRE
  const empireRequestCounts = {};
  state.improvements.requests.forEach(r => {
    if (r.empireId) {
      empireRequestCounts[r.empireId] = (empireRequestCounts[r.empireId] || 0) + 1;
    }
  });
  
  for (const [empireId, count] of Object.entries(empireRequestCounts)) {
    if (count > MAX_SUGGESTIONS_PER_EMPIRE) {
      const oldest = state.improvements.requests
        .filter(r => r.empireId === empireId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
      
      if (oldest) {
        state.improvements.requests = state.improvements.requests.filter(r => r.id !== oldest.id);
        break;
      }
    }
  }
}
```
**Pros:**
- Fresh suggestions always available
- Maintains suggestion diversity
- Predictable queue size
- Prevents stale suggestions from taking space

**Cons:**
- More complex implementation
- Need to add `createdAt` timestamp to suggestions

### Option D: Reduce Expiry Cycle (SIMPLE)
```javascript
// Suggestions expire faster, naturally clearing queue
// Change from 45 ticks to 20 ticks
const MAX_AGE_TICKS = 20;
```
**Pros:**
- Simpler cleanup
- Suggestions stay fresh

**Cons:**
- Player might miss good suggestions
- Less time to decide

### Option E: Progressive Chance Reduction (SMART)
```javascript
// Chance reduces as queue fills
const queueSize = state.improvements.requests.length;
const maxQueueSize = 12;
const baseSuggestionChance = hasActiveImprovement ? 0.6 : 0.2;
const fullQueuePenalty = 1 - (queueSize / maxQueueSize);
const actualChance = baseSuggestionChance * fullQueuePenalty;

if (rngFn() < actualChance) {
  // Generate suggestion
}
```
**Pros:**
- Natural throttling as queue fills
- Never completely stops suggesting
- Self-regulating system

**Cons:**
- More complex logic
- Slightly less predictable

## Recommendation

**Start with Option A or E:**
- **Option A** if you want fastest result and don't mind gradual tweaking
- **Option E** if you want elegant self-regulating system

**Consider adding to Option A/E:**
- Increase expiry from 45 to 30 ticks
- Cap max per empire at 2 instead of 3

## Implementation Locations

- Generation logic: `src/game/turn.js` lines 745-795
- Cleanup: `src/game/improvements/index.js` (removeExpiredSuggestions)
- Initial generation: `src/game/improvements/definitions.js` line 736
- Constants: Update turn.js lines 764-767
