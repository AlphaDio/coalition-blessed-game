# Frontend-Backend Interface Review

## Overview
This document reviews the core gameplay action interfaces between the React frontend and Node.js backend for Coalition: The Blessed Game.

---

## 1. EVENT CHOICES Interface

### Frontend → Backend Flow

#### Component: `EventModal.jsx`
```
User clicks choice button
  ↓
handleChoice(choiceIndex) called
  ↓
api.handleEventChoice(event.id, choiceIndex)
  ↓
POST /api/game/actions/event-choice
  Body: { eventId, choiceIndex }
```

**Frontend Implementation:**
- File: `src/components/EventModal.jsx`
- API Call: `api.handleEventChoice(eventId, choiceIndex)`
- Error Handling: ✅ Local error state
- Loading State: ✅ Button disabled during request
- User Feedback: ✅ "Processing choice..." indicator

#### Backend Handler: `api.js`
```javascript
POST /api/game/actions/event-choice
- Validates: eventId, choiceIndex
- Calls: gameManager.handleEventChoice(eventId, choiceIndex)
- Response: { success: boolean, data: result }
- Broadcasting: Sends game state update to all clients
```

**GameManager Method:**
- File: `src/server/gameManager.js`
- Method: `handleEventChoice(eventId, choiceIndex)`
- Calls: `handleEventChoice()` from `src/game/events.js`
- State Update: ✅ Calls `notifyStateChange()` on success
- Return: `{ success: true, data: result }`

**Game Logic:**
- File: `src/game/events.js`
- Function: `export function handleEventChoice(state, eventId, choiceIndex)`
- Responsibility: Process choice consequences and update game state

### State Synchronization

**WebSocket Broadcasting:**
```
Backend processes action
  ↓
broadcastGameState(state) - sends full state to all clients
broadcastNotification('event_choice', { eventId, choiceIndex, turn })
  ↓
Frontend receives via WebSocket
  ↓
useGameState.updateState(payload)
  ↓
UI re-renders with new state
```

**Frontend State Hook:**
- File: `src/hooks/useGameState.js`
- Action Type: `UPDATE_STATE`
- Merge Strategy: Shallow merge with existing state
- Selectors: `getActiveEvent()` returns current event

### Issues & Observations

✅ **Well-Designed:**
- Proper error handling on both sides
- Clean API contract (eventId, choiceIndex)
- Immediate UI feedback

⚠️ **Potential Improvements:**
- No optimistic UI updates (waits for server confirmation)
- No timeout handling (long-running choice processing)
- Choice buttons remain active during loading (though disabled state works)

---

## 2. LAW ENACTMENT Interface

### Frontend → Backend Flow

#### Component: `LawsPanel.jsx`
```
User clicks "Enact Law" button
  ↓
handleEnactLaw(lawId) called
  ↓
api.enactLaw(lawId)
  ↓
POST /api/game/actions/enact-law
  Body: { lawId }
```

**Frontend Implementation:**
- File: `src/components/LawsPanel.jsx`
- API Call: `api.enactLaw(lawId)`
- Available Laws: Filtered via `getAvailableLaws()` selector
- Error Handling: ✅ Local error state display
- Loading State: ✅ Button shows "Enacting..." during request
- Law Display: Shows law name, tier, and description

#### Backend Handler: `api.js`
```javascript
POST /api/game/actions/enact-law
- Validates: lawId
- Calls: gameManager.enactLaw(lawId)
- Conditions: Only broadcasts if result.success === true
- Response: { success: boolean, data: result }
- Broadcasting: Full game state + event notification
```

**GameManager Method:**
- File: `src/server/gameManager.js`
- Method: `enactLaw(lawId)`
- Calls: `enactLaw()` from `src/game/laws.js`
- Error Handling: ✅ Try-catch with error return
- State Notification: ✅ Called on success

**Game Logic:**
- File: `src/game/laws.js`
- Function: `export function enactLaw(state, lawId)`
- Responsibility: Apply law effects, consume resources, update state

### State Synchronization

**Available Laws Calculation:**
```
Frontend Selector (useGameState):
getAvailableLaws() {
  return state.lawDefinitions.filter(
    law => !state.enactedLaws.includes(law.id)
  )
}
```

**After Enactment:**
1. Backend updates `state.enactedLaws` array
2. Broadcasts new game state
3. Frontend receives UPDATE_STATE
4. Selector recalculates available laws
5. Panel re-renders without enacted law

### Issues & Observations

✅ **Well-Designed:**
- Clear success/failure contract
- Proper law filtering logic
- Good user feedback during action

⚠️ **Potential Issues:**
- No validation of law.cost vs available resources (frontend)
- No cooldown display for recently enacted laws
- Law tier display exists but no tier validation shown
- No influence cost deduction display

---

## 3. BUILDING IMPROVEMENTS Interface

### Frontend → Backend Flow

#### Component: `ImprovementsPanel.jsx`

**Accept Improvement:**
```
User clicks "Accept" button
  ↓
handleAcceptImprovement(requestId, empireId)
  ↓
api.acceptImprovement(requestId, empireId)
  ↓
POST /api/game/actions/improvement
  Body: { action: 'accept', requestId, empireId }
```

**Cancel Improvement:**
```
User clicks "Cancel" button
  ↓
handleCancelImprovement(requestId)
  ↓
api.cancelImprovement(requestId)
  ↓
POST /api/game/actions/improvement
  Body: { action: 'cancel', requestId }
```

**Frontend Implementation:**
- File: `src/components/ImprovementsPanel.jsx`
- API Calls: 
  - `api.acceptImprovement(requestId, empireId)`
  - `api.cancelImprovement(requestId)`
- Available Requests: `getImprovementRequests()` selector
- Active Improvements: `getActiveImprovements()` selector
- Building Improvements: `getBuildingImprovements()` selector
- Error Handling: ✅ Local error state
- Loading State: ✅ Buttons disabled during request

**Improvement Display:**
```javascript
Available Requests:
- req.name
- req.description
- req.supplyUpkeep (cost display)
- req.buildTime (duration display)

Active Improvements:
- Status: "Active"

Building Improvements:
- Status: "Building X%"
- Progress: Math.round((imp.progress || 0) * 100)
```

#### Backend Handler: `api.js`
```javascript
POST /api/game/actions/improvement
- Parameters: 
  - action: 'accept' | 'cancel'
  - requestId: string
  - empireId: string (for accept only)
- Calls: gameManager.handleImprovementAction(action, requestId, empireId)
- Response: { success: boolean, data: result }
- Broadcasting: Full game state + event notification
```

**GameManager Method:**
- File: `src/server/gameManager.js`
- Method: `handleImprovementAction(action, requestId, empireId)`
- Routing:
  - `action === 'accept'` → `acceptImprovementRequest(state, requestId, empireId)`
  - `action === 'cancel'` → `cancelImprovement(state, requestId)`
- Error Handling: ✅ Try-catch with validation
- State Notification: ✅ Called on success

**Game Logic:**
- File: `src/game/improvements/index.js`
- Functions:
  - `acceptImprovementRequest(state, requestId, empireId)`
  - `cancelImprovement(state, requestId)`
- Responsibility: Move request → active/building, apply building mechanics

### State Synchronization

**Improvement State Structure:**
```javascript
state.improvements = {
  requests: [],      // Available improvement requests
  active: [],        // Active improvements (ongoing effects)
  building: []       // Currently building improvements
}
```

**Frontend Selectors:**
```javascript
getImprovementRequests() {
  return state.improvements?.requests || [];
}

getActiveImprovements() {
  return state.improvements?.active || [];
}

getBuildingImprovements() {
  return state.improvements?.building || [];
}
```

### Issues & Observations

✅ **Well-Designed:**
- Separate state for requests, active, and building
- Progress tracking for building improvements
- Clear visual status indicators

⚠️ **Potential Issues:**
- Empire selection hardcoded: `gameState.state.empires?.[0]?.id`
  - Should allow user to select which empire benefits
  - Fallback silently fails if no empires
- No validation of supply upkeep costs before accept
- Building progress display shows decimal, could be confusing
- No "in progress" state for accept button (immediate response)
- No way to view improvement details/benefits before accepting

---

## 4. API Response Contract Inconsistencies

### Inconsistent Response Formats

**Event Choice:**
```javascript
// Returns nested data
{ success: true, data: result }
```

**Law Enactment:**
```javascript
// Returns result directly (sometimes)
{ success: true/false, ... }
```

**Improvement:**
```javascript
// Returns nested data
{ success: true, data: result }
```

**Recommended Standardization:**
```javascript
// Consistent format
{
  success: boolean,
  data: gameState,          // Current game state after action
  notification: {           // Optional change summary
    type: string,           // 'law_enacted', 'choice_made', etc
    details: object
  },
  error?: string            // Only if success === false
}
```

---

## 5. Error Handling Analysis

### Frontend Error Display
- All components show errors via local state
- Errors clear when user retries action
- No persistent error log

### Backend Error Logging
- All endpoints log errors with `logger.error()`
- Stack traces logged (helpful for debugging)
- Errors returned to client as JSON

### Gaps
- ⚠️ No validation error messages (e.g., "Insufficient influence")
- ⚠️ Generic 500 errors may not distinguish between logic errors and system errors
- ⚠️ Frontend doesn't distinguish between error types

### Recommended Enhancement:
```javascript
// Structured error response
{
  success: false,
  error: {
    code: 'INSUFFICIENT_INFLUENCE',  // Machine-readable
    message: 'Need 150 influence, have 100',  // Human-readable
    details: {
      required: 150,
      available: 100
    }
  }
}
```

---

## 6. Broadcasting & State Sync Issues

### Current Flow
1. Client action → API endpoint
2. Backend processes → updates state
3. `broadcastGameState(state)` sends to **all** clients
4. Frontend receives via WebSocket
5. `updateState(payload)` merges into local state

### Potential Race Conditions
⚠️ **Issue:** Optimistic vs Pessimistic Updates
- Frontend does NOT update UI before server confirmation
- Slow/failed requests leave UI stale
- Multiple rapid clicks could queue up requests

**Current Mitigation:**
- Button disabled during `loading` state
- But doesn't prevent multiple sequential requests

### Recommended Enhancement:
```javascript
// Optimistic update approach
1. Show immediate UI feedback
2. Send request to server
3. Rollback on failure
4. Confirm on success

Or:

1. Disable button during request
2. Implement request deduplication
3. Queue subsequent requests
```

---

## 7. Test Coverage for Interfaces

### What's Tested (Implicit)
- ✅ Happy path (user clicks, server updates, UI refreshes)
- ✅ Error responses return properly
- ✅ State broadcast reaches all clients

### What's NOT Tested
- ❌ Rapid successive clicks
- ❌ Network latency effects
- ❌ WebSocket disconnection during action
- ❌ Concurrent actions from multiple users
- ❌ Invalid IDs (lawId, eventId, requestId not found)
- ❌ State consistency after action

### Recommended Tests:
1. Unit tests for game logic functions
2. Integration tests for API endpoints
3. E2E tests for complete user flows
4. Stress tests for rapid actions
5. Concurrency tests for multi-user scenarios

---

## 8. Recommendations & Priority

### HIGH Priority (Breaking Issues)
1. **Standardize API Response Format**
   - All endpoints should follow same structure
   - Impact: Easy client-side error handling
   - Effort: Medium

2. **Add Resource Validation Errors**
   - Return specific error codes
   - Distinguish "Not Found" vs "Invalid Request" vs "Logic Error"
   - Impact: Better UX and debugging
   - Effort: Medium

### MEDIUM Priority (Important Features)
1. **Improve Error Messages**
   - Show "why" an action failed
   - Example: "Law requires 150 influence, you have 100"
   - Impact: Better player guidance
   - Effort: Low

2. **User Selects Target Empire**
   - Don't hardcode `empires[0]`
   - Allow empire selection UI
   - Impact: Game design flexibility
   - Effort: Medium

3. **Request Deduplication/Queuing**
   - Prevent duplicate requests on rapid clicks
   - Implement proper async handling
   - Impact: Prevent race conditions
   - Effort: Medium

### LOW Priority (Polish)
1. **Optimistic UI Updates**
   - Show immediate feedback before server confirms
   - Fallback if server rejects
   - Impact: Perceived performance
   - Effort: High

2. **Detailed Improvement Info Modal**
   - Show benefits/stats before accepting
   - Preview effects
   - Impact: Better player decisions
   - Effort: Medium

---

## 9. Files Summary

### Frontend Files
- `src/services/api.js` - REST API client
- `src/hooks/useGameState.js` - State management
- `src/components/EventModal.jsx` - Event choice UI
- `src/components/LawsPanel.jsx` - Law enactment UI
- `src/components/ImprovementsPanel.jsx` - Improvement building UI

### Backend Files
- `src/server/api.js` - HTTP/WebSocket endpoints
- `src/server/gameManager.js` - State orchestration
- `src/game/laws.js` - Law logic
- `src/game/events.js` - Event logic
- `src/game/improvements/index.js` - Improvement logic

---

## Conclusion

The interface is **functional and well-structured** with good separation of concerns. The main areas for improvement are:

1. **Consistency** in API response formats
2. **Error reporting** with specific error codes
3. **UX improvements** for user selections and validations
4. **Robustness** against race conditions and rapid inputs

The architecture supports the game's design well and can be extended without major refactoring.
