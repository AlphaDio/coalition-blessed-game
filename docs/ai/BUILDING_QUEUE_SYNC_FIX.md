# Building Queue Sync Fix

## Problem

The Building Queue view was not syncing with improvements being built because the frontend gameState hook was looking for improvements in the wrong data structure.

## Root Cause

**Backend Structure**:
```javascript
state.improvements = {
  requests: [],      // Available improvement requests
  queue: [],         // All improvements (BUILDING, ACTIVE, DEGRADED)
  completed: [],
  maxTotalCapacity: 4,
  currentCapacity: 0
}
```

Each improvement in `queue` has a `state` field with values: `'BUILDING'`, `'ACTIVE'`, `'DEGRADED'`

**Frontend Bug**:
```javascript
// WRONG - Looking for non-existent path
getBuildingImprovements: () => {
  return state.improvements?.building || [];  // ❌ state.improvements.building doesn't exist
}

getActiveImprovements: () => {
  return state.improvements?.active || [];    // ❌ state.improvements.active doesn't exist
}
```

## Solution

Updated the gameState selectors to correctly filter from `state.improvements.queue`:

```javascript
// CORRECT - Filter by state value
getBuildingImprovements: () => {
  const queue = state.improvements?.queue || [];
  return queue.filter(imp => imp.state === 'BUILDING');
}

getActiveImprovements: () => {
  const queue = state.improvements?.queue || [];
  return queue.filter(imp => imp.state === 'ACTIVE' || imp.state === 'DEGRADED');
}
```

## Files Modified

- `coalition-frontend/src/hooks/useGameState.js` (lines 193-201)

## Impact

✅ Building Queue view now syncs with actual building improvements from backend  
✅ Empire details view now shows correct active improvements  
✅ Real-time updates work correctly as game state changes  

## Testing

The Building Queue component now:
1. Correctly retrieves improvements with `state === 'BUILDING'` from the queue
2. Updates in real-time as improvements progress
3. Removes completed improvements when they transition to other states

## Related Code

- `BuildingQueue.jsx` - Uses `getBuildingImprovements()` selector (lines 5)
- `EmpiresPanel.jsx` - Uses improvements from queue for empire details (lines 22-23)
- Backend: `src/game/improvements/engine.js` - Defines improvements state structure (lines 149-161)
