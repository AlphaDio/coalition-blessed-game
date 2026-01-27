# WebSocket Error Handling and Debugging

**Status:** Enhanced with detailed error messages  
**Last Updated:** 2026-01-27

## Overview

This document describes the WebSocket error handling strategy and error message formats to help clients debug connection and communication issues.

## Connection Error Handling

### Improved Error Communication
**File:** `src/server/api.js` (lines 118-131)

When a connection initialization error occurs, the server now:
1. Logs the error with full stack trace
2. Sends a detailed error message to the client before closing
3. Closes the connection with a standard WebSocket close code

**Error Message Format:**
```javascript
{
  type: 'connection_error',
  payload: {
    message: 'Connection initialization failed',
    details: 'Specific error message from the server'
  },
  timestamp: Date.now()
}
```

**Example Errors:**
```javascript
// Game state retrieval failed
{
  type: 'connection_error',
  payload: {
    message: 'Connection initialization failed',
    details: 'Cannot read property "turn" of undefined'
  },
  timestamp: 1706349600000
}

// Resource loading failed
{
  type: 'connection_error',
  payload: {
    message: 'Connection initialization failed',
    details: 'Economy system initialization failed: ENOENT: no such file or directory'
  },
  timestamp: 1706349600000
}
```

### WebSocket Close Codes
**Standard WebSocket Close Codes Used:**

| Code | Meaning | When Used |
|------|---------|-----------|
| 1000 | Normal Closure | Client or server closes connection gracefully |
| 1011 | Server Error | Connection initialization fails on server side |
| 1006 | Abnormal Closure | Connection lost unexpectedly |

**Implementation:**
```javascript
ws.close(1011, 'Server error during connection initialization');
```

This code (1011) tells the client that the server encountered an error, distinguishing it from normal closures.

## Message-Level Error Handling

### Error Message Types
**File:** `src/server/api.js` (lines 84-91, 106, 116)

#### 1. Initial State Error
When fetching game state for the first message fails:
```javascript
{
  type: 'error',
  payload: { message: 'Failed to get initial game state' },
  timestamp: Date.now()
}
```

**When it occurs:**
- Game manager is not ready
- Database/state loading failed
- Memory issues

#### 2. Message Processing Error
When processing a client message fails:
```javascript
{
  type: 'message_error',
  payload: {
    original_type: 'game_action',  // What the client tried to do
    message: 'Action processing failed',
    details: 'Specific error reason'
  },
  timestamp: Date.now()
}
```

**When it occurs:**
- Invalid JSON in message
- Action handler throws exception
- State validation fails

#### 3. WebSocket Protocol Error
When receiving malformed messages:
```
WebSocket message error: SyntaxError: Unexpected token...
```

**When it occurs:**
- Non-JSON data sent to WebSocket
- Incomplete message received
- Binary data sent to text socket

## Client-Side Debug Guide

### Detecting Connection Errors

```javascript
// Check if error occurred during initialization
ws.onopen = () => {
  console.log('WebSocket opened, waiting for initial_state...');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'connection_error') {
    console.error('Connection failed:', message.payload.details);
    // Implement retry logic here
  }
  
  if (message.type === 'error') {
    console.warn('Server error:', message.payload.message);
    // Handle gracefully
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  if (event.code === 1011) {
    console.error('Server error caused connection close');
  } else if (event.code === 1000) {
    console.log('Connection closed normally');
  }
};
```

### Recommended Retry Strategy

```javascript
class GameWebSocket {
  constructor(url) {
    this.url = url;
    this.retries = 0;
    this.maxRetries = 5;
    this.backoffMultiplier = 1.5;
    this.baseDelay = 1000; // 1 second
  }
  
  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      this.scheduleReconnect();
    }
  }
  
  handleClose(event) {
    if (event.code === 1011) {
      // Server error - try reconnecting with exponential backoff
      console.error('Server error:', event.reason);
      this.scheduleReconnect();
    }
  }
  
  scheduleReconnect() {
    if (this.retries >= this.maxRetries) {
      console.error('Max retries reached');
      return;
    }
    
    const delay = this.baseDelay * Math.pow(this.backoffMultiplier, this.retries);
    this.retries++;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.retries}/${this.maxRetries})`);
    setTimeout(() => this.connect(), delay);
  }
  
  handleOpen() {
    console.log('WebSocket connected');
    this.retries = 0; // Reset retry counter on successful connection
  }
}
```

## Server-Side Error Handling Checklist

### ✅ Connection Phase
- [x] Catch errors during connection initialization
- [x] Send error message to client
- [x] Use appropriate WebSocket close code (1011)
- [x] Log full error with stack trace
- [x] Handle errors in error handler (nested try-catch)

### ✅ Message Phase
- [x] Catch errors during message parsing
- [x] Catch errors during action handling
- [x] Send error response to client
- [x] Log error details for debugging

### ✅ Error Recovery
- [x] Don't crash server on client errors
- [x] Allow connection to continue for other clients
- [x] Provide clear error messages
- [x] Enable client-side retry logic

## Common Errors and Solutions

### Error: "Cannot read property 'turn' of undefined"
**Cause:** Game state is not initialized  
**Solution:** Ensure `gameManager.getGameState()` returns valid state before sending

### Error: "ENOENT: no such file or directory"
**Cause:** Resource files (YAML configs) are missing  
**Solution:** Check file paths and ensure resources are in correct location

### Error: "JSON.stringify() called on circular structure"
**Cause:** Circular references in game state  
**Solution:** Use custom replacer in JSON.stringify or remove circular refs

### Silent Connection Drop
**Cause:** Error occurred but no message sent (old code)  
**Solution:** Now fixed - error messages are sent before close

## Testing WebSocket Error Handling

### Unit Test Example
```javascript
describe('WebSocket Connection Error Handler', () => {
  it('should send error message before closing on initialization failure', async () => {
    const ws = new MockWebSocket();
    const sendSpy = jest.spyOn(ws, 'send');
    const closeSpy = jest.spyOn(ws, 'close');
    
    // Simulate initialization error
    gameManager.getGameState = () => {
      throw new Error('Test error');
    };
    
    // Trigger connection
    wss.emit('connection', ws);
    
    // Wait for error handling
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should have sent error message
    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('connection_error')
    );
    
    // Should have closed connection with 1011 code
    expect(closeSpy).toHaveBeenCalledWith(
      1011,
      expect.stringContaining('Server error')
    );
  });
});
```

## Related Files

- `src/server/api.js` - WebSocket connection and message handling
- `src/server/gameManager.js` - Game state management
- API Response Format: See `apiResponseFormatter.js` for REST error formats
