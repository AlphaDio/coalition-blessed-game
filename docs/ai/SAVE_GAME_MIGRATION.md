# Save Game Migration and Backward Compatibility

**Status:** Implemented with defensive checks  
**Last Updated:** 2026-01-27

## Overview

This document describes the migration strategy for handling save game schema changes, particularly the addition of new army replenishment fields.

## Problem Statement

When new fields are added to entities like armies (e.g., `replenishmentMultiplier`, `replenishmentBonus`), older saved games won't have these fields. This can lead to:
- `undefined` values in calculations
- Incorrect behavior when loading old saves
- Potential crashes if defensive checks are missing

## Solution: Multi-Layer Defense

### Layer 1: Defensive Null Checks (In Calculations)
**File:** `src/game/turn.js` (lines 571, 575)

The replenishment calculation includes defensive fallbacks:
```javascript
const replenishmentMultiplier = army.replenishmentMultiplier || 1.0;
const replenishmentBonus = army.replenishmentBonus || 0;
```

**Benefits:**
- No crashes from undefined values
- Old saves work immediately without migration
- Graceful defaults are applied

**Limitations:**
- Leaves old saves in inconsistent state
- Multiple defensive checks needed throughout codebase
- Harder to verify data integrity

### Layer 2: Schema Migration (On Load)
**File:** `src/game/types.js` - `migrateGameState()` function

When a save is loaded, the migration function normalizes missing fields:
```javascript
export function migrateGameState(state) {
  if (state.armies && Array.isArray(state.armies)) {
    state.armies.forEach(army => {
      if (army.replenishmentMultiplier === undefined) {
        army.replenishmentMultiplier = 1.0;
      }
      if (army.replenishmentBonus === undefined) {
        army.replenishmentBonus = 0;
      }
      if (!Array.isArray(army.timedFervorBonuses)) {
        army.timedFervorBonuses = [];
      }
    });
  }
  if (!Array.isArray(state.timedModifiers)) {
    state.timedModifiers = [];
  }
  return state;
}
```

**Integration:** `src/server/gameManager.js`
```javascript
loadSaveState(saveData) {
  this.state = migrateGameState(saveData);
  // ...
}
```

**Benefits:**
- State is normalized immediately on load
- No defensive checks needed in business logic
- Ensures data consistency

**Coverage:**
- ✅ Army replenishment fields
- ✅ Timed fervor bonuses array
- ✅ Timed modifiers array

## Adding New Fields

When adding new fields to saved entities:

### Step 1: Add to Creation Function
```javascript
// In types.js createArmy()
export function createArmy(...) {
  return {
    // ... existing fields
    newField: defaultValue,  // ← ADD HERE
  };
}
```

### Step 2: Add Defensive Check (Optional but Recommended)
```javascript
// In calculation code
const value = entity.newField || defaultValue;
```

### Step 3: Add Migration (Required)
```javascript
// In migrateGameState()
if (state.armies) {
  state.armies.forEach(army => {
    if (army.newField === undefined) {
      army.newField = defaultValue;
    }
  });
}
```

### Step 4: Document in This File
Add entry to the "Migrations" section below

## Field Migration History

### Army Fields

| Field | Default | Added | Reason |
|-------|---------|-------|--------|
| `replenishmentMultiplier` | 1.0 | 2026-01-27 | Allow modifiers to affect replenishment rate |
| `replenishmentBonus` | 0 | 2026-01-27 | Additive bonus for special bonuses |
| `timedFervorBonuses` | [] | 2026-01-27 | Support time-limited fervor bonuses from events |

### State Fields

| Field | Default | Added | Reason |
|-------|---------|-------|--------|
| `timedModifiers` | [] | 2026-01-27 | Track temporary modifier applications |

## Testing Migrations

### Test Case: Load Old Save with Missing Fields
```javascript
const oldSave = {
  turn: 100,
  armies: [
    {
      id: 'army_1',
      name: 'Main Army',
      mp: { current: 5000, max: 10000 }
      // Note: missing replenishmentMultiplier, replenishmentBonus
    }
  ]
};

const migrated = migrateGameState(oldSave);

// Should have defaults now
assert(migrated.armies[0].replenishmentMultiplier === 1.0);
assert(migrated.armies[0].replenishmentBonus === 0);
assert(Array.isArray(migrated.armies[0].timedFervorBonuses));
```

### Test Case: Replenishment Calculation with Missing Fields
```javascript
const armyMissingFields = {
  id: 'test',
  name: 'Test',
  fervor: 100,
  mp: { current: 5000, max: 10000 }
  // Missing replenishmentMultiplier and replenishmentBonus
};

const replenishmentMultiplier = armyMissingFields.replenishmentMultiplier || 1.0;
const replenishmentBonus = armyMissingFields.replenishmentBonus || 0;

// Should not crash and use defaults
assert(replenishmentMultiplier === 1.0);
assert(replenishmentBonus === 0);
```

## Backward Compatibility Policy

**Rule:** Always maintain backward compatibility with saved games

1. **Never remove fields** - Mark as deprecated instead
2. **Always provide defaults** - Use `||` operator with sensible defaults
3. **Always migrate on load** - Call `migrateGameState()` when loading
4. **Document changes** - Update this file and add comments in code

## Known Limitations

### Nested Structures
Currently migration only handles top-level arrays (armies, timedModifiers). If you add nested structures, update `migrateGameState()` accordingly.

Example of needed expansion:
```javascript
// If you add empire.customSettings.newField
if (state.empires) {
  state.empires.forEach(empire => {
    if (!empire.customSettings) {
      empire.customSettings = {};
    }
    if (empire.customSettings.newField === undefined) {
      empire.customSettings.newField = defaultValue;
    }
  });
}
```

### Version Tracking
Currently no version number is stored in save files. If migration logic becomes complex, consider adding:
```javascript
// In saveData
{
  schemaVersion: 2,  // Increment when schema changes
  turn: 100,
  // ...
}
```

## Related Files

- `src/game/types.js` - Schema definitions and migration functions
- `src/server/gameManager.js` - Save/load orchestration
- `src/server/api.js` - API endpoints for save/load
- `src/game/turn.js` - Calculations that use migrated fields
