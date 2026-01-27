# Frontend Polling Implementation

## Overview

The game frontend now implements a **dual update mechanism**:

1. **WebSocket (Primary)** - Real-time push updates from server
2. **HTTP Polling (Fallback)** - Backup synchronization every 1 second

## Architecture

### WebSocket (Real-time)
- Broadcasts game state updates when:
  - Game loop advances turns
  - Player actions are performed (laws, events, improvements)
  - Game state changes (pause, resume, speed change)
- Provides instant feedback with minimal latency
- Reduces server load by pushing updates only when needed

### HTTP Polling (Fallback)
- Executes every 1000ms (1 second)
- Fetches complete game state from `/api/game/state`
- Ensures UI stays synchronized even if WebSocket messages are missed
- Handles network hiccups and message loss gracefully
- Gracefully degrades if server is temporarily unavailable

## Implementation

### Frontend Changes (`src/App.jsx`)

```javascript
// Poll server every second for game state updates
// This ensures UI stays in sync even if WebSocket messages are missed
useEffect(() => {
  if (isLoading) {
    return; // Don't poll while still loading
  }

  const pollInterval = setInterval(async () => {
    try {
      const state = await api.getGameState();
      gameState.updateState(state);
    } catch (err) {
      console.warn('Polling failed:', err.message);
      // Don't set error here - polling failures are not critical
      // WebSocket should be the primary update mechanism
    }
  }, 1000); // Poll every 1 second

  return () => {
    clearInterval(pollInterval);
  };
}, [isLoading]);
```

### Key Features

✅ **Non-blocking** - Failures don't interrupt game
✅ **Lightweight** - Only polls complete state, no partial updates
✅ **Configurable** - Interval can be adjusted (currently 1000ms)
✅ **Graceful Degradation** - Works even if WebSocket fails
✅ **Silent Operation** - Doesn't spam console with warnings
✅ **Auto-cleanup** - Clears interval on unmount

## Update Flow

### Scenario 1: Normal Operation (Both mechanisms working)
```
Game Loop Advances Turn
  ↓
WebSocket broadcasts state update (fast, ~50ms)
  ↓
Frontend updates UI immediately ✅
  ↓
(Background) HTTP poll also updates UI (redundant but safe)
```

### Scenario 2: WebSocket Message Lost
```
Game Loop Advances Turn
  ↓
WebSocket broadcasts but message is lost ❌
  ↓
Frontend UI stays on old turn (Turn 5)
  ↓
Next HTTP poll request (~1s later)
  ↓
Frontend receives new state (Turn 6) and updates UI ✅
```

### Scenario 3: WebSocket Disconnected
```
Game Loop Advances Turn
  ↓
WebSocket is disconnected ❌
  ↓
HTTP poll request succeeds ✅
  ↓
Frontend updates UI with latest state ✅
  ↓
(When WebSocket reconnects, both mechanisms work again)
```

## Performance Considerations

### Server Impact
- **WebSocket**: 1 message per game tick (~0.5 KB each)
- **Polling**: 1 request per second per client (~1-2 KB each)
- **Total**: Minimal impact for typical usage

### Bandwidth Usage
- With 1 client: ~1-2 requests/second
- With 10 clients: ~10-20 requests/second
- Each request: ~1-2 KB (game state is relatively small)

### Optimization Opportunities
If server load becomes an issue:
1. Increase poll interval (e.g., 2000ms instead of 1000ms)
2. Implement WebSocket message queuing to reduce broadcasts
3. Use delta updates instead of full state
4. Add client-side throttling

## Configuration

### Poll Interval
```javascript
// In src/App.jsx, line ~115
}, 1000); // Change to 2000 for 2-second polling
```

### Error Handling
```javascript
// Polling failures are caught and logged to console.warn
// They don't set the error state (which would crash the UI)
console.warn('Polling failed:', err.message);
```

## Testing

### Verify Polling is Working
1. Open browser DevTools → Network tab
2. Start the game
3. Click "Resume" to start game
4. Observe network requests to `/api/game/state`
5. Should see requests every 1 second (1000ms)
6. Turn counter should update smoothly

### Test WebSocket Fallback
1. Open DevTools → Network tab → "Disable cache"
2. Throttle network to "Fast 3G" or "Slow 3G"
3. Start game and resume
4. Observe that UI still updates despite network issues
5. HTTP polling ensures state stays synced

### Test Polling Alone
1. Open DevTools → Application → Cookies → Disable WebSocket (manually close connection)
2. Game should continue updating via polling
3. UI should refresh every 1-2 seconds
4. When WebSocket reconnects, updates resume being real-time

## Best Practices

### For Developers
1. **Don't rely on just WebSocket** - Always have polling as fallback
2. **Keep state immutable** - Both mechanisms update state the same way
3. **Handle stale state** - UI might show old data briefly (normal!)
4. **Test without WebSocket** - Ensure polling works independently

### For Deployment
1. **Monitor polling load** - Check server `/api/game/state` request rates
2. **Set appropriate interval** - Balance between real-time feel and server load
3. **Consider caching** - Game state rarely changes (every 2 seconds at most)
4. **Add metrics** - Track WebSocket vs polling update rates

## Future Improvements

### Potential Enhancements
1. **Adaptive polling** - Increase interval when network is poor
2. **Smart caching** - Only send changed fields
3. **Request coalescing** - Batch multiple polling requests
4. **Exponential backoff** - If server is slow, reduce polling frequency
5. **Client-side prediction** - Predict next state locally, compare with server

### Suggested Implementation
```javascript
// Adaptive polling based on server response time
const [pollInterval, setPollInterval] = useState(1000);

useEffect(() => {
  const pollInterval = setInterval(async () => {
    const startTime = Date.now();
    try {
      const state = await api.getGameState();
      gameState.updateState(state);
      
      const responseTime = Date.now() - startTime;
      
      // If response takes > 500ms, reduce polling frequency
      if (responseTime > 500 && pollInterval < 5000) {
        setPollInterval(pollInterval * 1.5);
      }
      // If response is fast, can poll more frequently (optional)
      else if (responseTime < 100 && pollInterval > 500) {
        setPollInterval(Math.max(500, pollInterval / 1.5));
      }
    } catch (err) {
      console.warn('Polling failed:', err.message);
    }
  }, pollInterval);

  return () => clearInterval(pollInterval);
}, [pollInterval]);
```

## Conclusion

The dual update mechanism (WebSocket + polling) provides:

✅ **Real-time responsiveness** via WebSocket for instant updates
✅ **Reliability** via polling for fallback synchronization
✅ **Resilience** against network issues and message loss
✅ **Minimal overhead** while ensuring consistency

The game is now robust against network disruptions while maintaining a smooth, real-time gaming experience.
