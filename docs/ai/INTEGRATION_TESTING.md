# Web Frontend Integration Testing Guide

This guide covers testing the web frontend with the backend API server.

## Prerequisites

1. Backend running: `yarn server` (port 3001)
2. Frontend running: `yarn dev` (port 3000)

## Test Scenarios

### 1. Connection Test

**Objective:** Verify WebSocket connection and initial state transfer

**Steps:**
1. Open browser console (F12)
2. Navigate to `http://localhost:3000`
3. Observe logs: "WebSocket connected", "Game initialized"

**Expected Results:**
- Connection indicator shows "connected" (green dot)
- Game board loads with current state
- Stats panel displays current turn, cohesion values
- No errors in console

### 2. State Synchronization Test

**Objective:** Verify game state updates sync to frontend

**Steps:**
1. Keep frontend open in one window
2. Open backend logs in another terminal
3. Watch frontend as turns advance automatically

**Expected Results:**
- Stats panel updates every turn
- Turn counter increments
- Cohesion values change
- No lag between server update and UI render

### 3. Law Enactment Test

**Objective:** Verify law actions work through API

**Steps:**
1. Click "Laws" panel
2. Click "Enact Law" on an available law
3. Observe API response and state update

**Expected Results:**
- Law disappears from available list
- Law appears in "Active Laws" panel
- Log shows law enacted
- No error messages

### 4. Event Handling Test

**Objective:** Verify event modals and choices

**Steps:**
1. Wait for event to trigger (or speed up game with `[` `]` keys)
2. When event modal appears, click a choice
3. Observe game response

**Expected Results:**
- Event modal displays with options
- Clicking choice processes action
- Modal closes after choice
- Game resumes or new state reflects choice effects

### 5. Pause/Resume Test

**Objective:** Verify game control actions

**Steps:**
1. Click "Speed" buttons or use keyboard shortcuts
2. Game should pause/resume
3. Speed should change

**Expected Results:**
- Game pauses and header shows "⏸ PAUSED"
- Speed changes update immediately
- State updates stop when paused
- Resume continues normal operation

### 6. Error Handling Test

**Objective:** Verify error messages display correctly

**Steps:**
1. Stop backend server while frontend is running
2. Try to perform an action
3. Observe error handling

**Expected Results:**
- Error message displays in red
- User can retry after backend restarts
- Connection status shows "disconnected"
- Reconnect logic attempts to restore connection

### 7. Performance Test

**Objective:** Verify frontend handles sustained gameplay

**Steps:**
1. Set game speed to 3x
2. Run for 5+ minutes
3. Monitor browser DevTools Performance tab
4. Check memory usage

**Expected Results:**
- Smooth rendering at 60 FPS
- Memory usage stays stable
- Logs don't accumulate excessively
- No performance degradation over time

### 8. Responsiveness Test

**Objective:** Verify responsive layout

**Steps:**
1. Open DevTools (F12)
2. Use device emulation to test various screen sizes
3. Test: 1920x1080, 1366x768, 768x1024, 375x667

**Expected Results:**
- Layout adapts to screen size
- All panels accessible
- Scrolling works smoothly
- Text remains readable

### 9. WebSocket Reconnection Test

**Objective:** Verify automatic reconnection after disconnect

**Steps:**
1. Open browser DevTools Network tab
2. Find WebSocket connection
3. Right-click and "Disconnect"
4. Observe frontend behavior
5. Connection should auto-reconnect within 5 seconds

**Expected Results:**
- Connection indicator shows "connecting"
- After a few seconds, shows "connected"
- Game state resumes updating
- No errors in console

### 10. Save/Load Test

**Objective:** Verify game persistence

**Steps:**
1. Play for a few turns
2. Note the current turn number and cohesion values
3. Close browser
4. Reopen and navigate to frontend
5. Verify saved state is restored

**Expected Results:**
- Turn number matches
- Cohesion values match (or close)
- All game elements restore
- Game continues from where it left off

## Automated Test Commands

### Backend Tests
```bash
cd coalition-blessed-game
yarn test                    # Run all tests
yarn test:determinism      # Test game determinism
yarn test:battles          # Test battle system
```

### Manual Testing Checklist

- [ ] Connection successful
- [ ] State updates smooth
- [ ] Laws can be enacted
- [ ] Events display and choices work
- [ ] Pause/resume functions
- [ ] Speed changes work
- [ ] Errors display clearly
- [ ] Performance acceptable
- [ ] Responsive on multiple screens
- [ ] Reconnection works
- [ ] Save/load functions

## Common Issues and Solutions

**WebSocket fails to connect**
- Check PORT environment variable (should be 3001)
- Verify backend is running
- Check CORS_ORIGIN setting
- Clear browser cache and hard refresh

**State not updating**
- Check browser console for errors
- Verify WebSocket is connected (green dot)
- Check backend logs for errors
- Verify game is not paused

**Buttons not responding**
- Check for loading state (button text changes)
- Check console for API errors
- Verify backend is running
- Hard refresh browser

**Performance degrading over time**
- Check memory usage in DevTools
- Reduce log buffer size
- Clear browser cache
- Restart frontend and backend

## Debugging Tips

**Enable detailed logging:**
```javascript
// In browser console
localStorage.debug = '*'
```

**Check network requests:**
1. Open DevTools Network tab
2. Filter by Fetch/XHR
3. Monitor API calls and responses

**Monitor WebSocket traffic:**
1. Open DevTools Network tab
2. Switch to "WS" tab if available
3. Click on WebSocket connection to see messages

**Performance profiling:**
1. Open DevTools Performance tab
2. Start recording
3. Perform actions
4. Stop and analyze

## Test Completion

Once all tests pass:
- [ ] Document any issues found
- [ ] Update plan/checklist if needed
- [ ] Mark integration testing complete
- [ ] Prepare deployment documentation
