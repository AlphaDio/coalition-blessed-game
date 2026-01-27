# API Standardization Implementation Summary

## Overview

Successfully standardized the API response format across all endpoints and added specific error codes with detailed messages. This provides a consistent, predictable interface for the frontend and better error diagnostics.

---

## What Was Changed

### 1. **Created Response Formatter Module** (`apiResponseFormatter.js`)

A new centralized module that provides:

- **Error Code Constants** - 20+ specific error codes for different scenarios
- **Status Code Mapping** - Maps error codes to appropriate HTTP status codes
- **Response Formatters** - `formatSuccess()` and `formatError()` functions
- **Express Middleware** - `apiResponseMiddleware` adds helper methods to response object
- **Error Constructor** - `createGameError()` for typed error creation

**File:** `src/server/apiResponseFormatter.js`

### 2. **Updated API Server** (`api.js`)

All endpoints updated to use the standardized format:

#### Endpoints Updated:
- ✅ `GET /api/game/state`
- ✅ `POST /api/game/new`
- ✅ `POST /api/game/actions/pause`
- ✅ `POST /api/game/actions/speed`
- ✅ `POST /api/game/actions/enact-law`
- ✅ `POST /api/game/actions/event-choice`
- ✅ `POST /api/game/actions/improvement`
- ✅ `POST /api/game/actions/emergency-law`
- ✅ `POST /api/game/actions/advance-turn`
- ✅ `GET /api/game/save`
- ✅ `POST /api/game/load`
- ✅ `GET /api/health`

#### Improvements Per Endpoint:

**Parameter Validation:**
- Checks for missing required parameters
- Validates parameter types and ranges
- Returns `MISSING_PARAMETER` or `INVALID_PARAMETER` errors

**Error Code Mapping:**
- Game logic errors mapped to specific codes
- Examples:
  - `LAW_NOT_FOUND` for non-existent laws
  - `INSUFFICIENT_INFLUENCE` for low resources
  - `LAW_ALREADY_ENACTED` for duplicate enactments

**Notification Support:**
- All action endpoints include `notification` field
- Contains action type and relevant details
- Helps clients understand what changed

**Consistent Responses:**
- All success responses use `res.sendSuccess(data, options)`
- All error responses use `res.sendError(code, message, details)`
- Automatic HTTP status code assignment

### 3. **Updated Frontend API Client** (`src/services/api.js`)

Improved error handling to work with new format:

```javascript
// Now extracts error code and details
if (data.error) {
  error.code = data.error.code;
  error.details = data.error.details;
}
```

### 4. **Created Documentation** (`API_RESPONSE_FORMAT.md`)

Comprehensive documentation including:
- Response format specifications
- All error codes with descriptions
- Example responses for each error type
- Endpoint-specific documentation
- Frontend error handling patterns
- Migration guide for updating components
- Testing examples with curl commands

---

## Error Codes by Category

### Validation Errors (400)
- `INVALID_REQUEST`
- `MISSING_PARAMETER`
- `INVALID_PARAMETER`

### Resource Not Found (404)
- `NOT_FOUND`
- `RESOURCE_NOT_FOUND`
- `LAW_NOT_FOUND`
- `EVENT_NOT_FOUND`
- `IMPROVEMENT_NOT_FOUND`
- `EMPIRE_NOT_FOUND`

### Game Logic Errors (400)
- `INSUFFICIENT_RESOURCES`
- `INSUFFICIENT_INFLUENCE`
- `INSUFFICIENT_SUPPLY`
- `INSUFFICIENT_CREDITS`
- `LAW_ALREADY_ENACTED`
- `LAW_ON_COOLDOWN`
- `GAME_OVER`
- `INVALID_GAME_STATE`

### Permission/State Errors (403)
- `ACTION_NOT_ALLOWED`
- `ACTION_INVALID_STATE`

### Server Errors (500)
- `INTERNAL_SERVER_ERROR`
- `DATABASE_ERROR`
- `UNKNOWN_ERROR`

---

## Example: Old vs New Response Format

### Before: Law Enactment Error

```json
{
  "success": false,
  "error": "Law not found"
}
```

**Problems:**
- No error code for programmatic handling
- Generic message doesn't help debugging
- No context about what's missing

### After: Law Enactment Error

```json
{
  "success": false,
  "error": {
    "code": "LAW_NOT_FOUND",
    "message": "Law not found: law_999",
    "details": {}
  },
  "timestamp": 1674234567890
}
```

**Benefits:**
- Specific error code (`LAW_NOT_FOUND`)
- Clear message with the problematic lawId
- Consistent timestamp for logging
- Can distinguish from other 404 errors

---

## Example: Resource Shortage

### Before: Insufficient Resources Error

```json
{
  "success": false,
  "error": "Insufficient influence"
}
```

### After: Insufficient Resources Error

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_INFLUENCE",
    "message": "Insufficient influence to enact law",
    "details": {
      "required": 150,
      "available": 100,
      "shortage": 50
    }
  },
  "timestamp": 1674234567890
}
```

**Benefits:**
- Frontend can show "You need 50 more influence"
- Specific code for UI handling
- Detailed context for tooltips/help text

---

## Example: Parameter Validation

### Missing Parameter

```json
{
  "success": false,
  "error": {
    "code": "MISSING_PARAMETER",
    "message": "Missing required parameter: lawId"
  },
  "timestamp": 1674234567890
}
```

### Invalid Parameter

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Game speed must be a number between 0.5 and 3.0",
    "details": {
      "min": 0.5,
      "max": 3.0,
      "provided": 5.0
    }
  },
  "timestamp": 1674234567890
}
```

---

## Frontend Error Handling Pattern

### Before: Generic Error Display

```javascript
try {
  const result = await api.enactLaw(lawId);
  if (!result.success) {
    setError(result.error);  // Just a string
  }
} catch (err) {
  setError(err.message);  // Generic error
}
```

### After: Specific Error Handling

```javascript
try {
  const result = await api.enactLaw(lawId);
} catch (err) {
  if (err.code === 'LAW_NOT_FOUND') {
    setError('This law no longer exists');
  } else if (err.code === 'INSUFFICIENT_INFLUENCE') {
    setError(`Need ${err.details.required} influence, have ${err.details.available}`);
  } else if (err.code === 'LAW_ALREADY_ENACTED') {
    setError('This law has already been enacted');
  } else {
    setError('An unexpected error occurred: ' + err.message);
  }
}
```

---

## Testing the New Format

### Test Missing Parameter

```bash
curl -X POST http://localhost:3001/api/game/actions/enact-law \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "MISSING_PARAMETER",
    "message": "Missing required parameter: lawId"
  },
  "timestamp": 1674234567890
}
```

### Test Success Response

```bash
curl -X GET http://localhost:3001/api/game/state
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "turn": 1,
    "coalitionCohesion": 75,
    ...
  },
  "timestamp": 1674234567890
}
```

---

## Backward Compatibility

⚠️ **Breaking Changes:**
- Old clients expecting `{ success, error: "string" }` format will receive `{ success, error: { code, message } }`
- Frontend API client has been updated to handle new format
- Components using error responses should be tested

**Recommended:**
- Update all component error handling to use `error.code` and `error.message`
- See `API_RESPONSE_FORMAT.md` for migration patterns

---

## Files Modified/Created

### Created
- ✅ `src/server/apiResponseFormatter.js` - Response formatting utilities
- ✅ `docs/API_RESPONSE_FORMAT.md` - Complete API documentation

### Modified
- ✅ `src/server/api.js` - Updated all endpoints
- ✅ `src/services/api.js` - Updated error handling

---

## Benefits

### For Frontend Developers
✅ **Predictable Format** - All endpoints respond consistently
✅ **Better Error Messages** - Understand exactly what went wrong
✅ **Specific Codes** - Can handle different errors differently
✅ **Detailed Context** - Can show helpful info to players

### For Backend Developers
✅ **Centralized Logic** - All formatting in one place
✅ **Type Safety** - Error codes are constants
✅ **Consistency** - No inconsistent response formats
✅ **Extensibility** - Easy to add new error codes

### For Game Players
✅ **Clear Errors** - Understand why actions failed
✅ **Better Help** - Can show detailed explanations
✅ **Better UX** - Relevant error messages

---

## Next Steps

### Recommended Follow-ups
1. **Update Error Display Components** - Show specific error messages for each code
2. **Add Error Recovery** - Provide actions to fix errors (e.g., "Gain More Influence")
3. **Create Error Test Suite** - Test each error code and response
4. **Update CLI** - If CLI also uses API, update for new format
5. **Add Metrics** - Track error codes to identify problem areas

### Example: Error-Specific UI

```javascript
{error && (
  <div className={`error-${error.code}`}>
    <p>{error.message}</p>
    
    {error.code === 'INSUFFICIENT_INFLUENCE' && (
      <p>You need {error.details.shortage} more influence. 
         Complete more laws to earn influence.</p>
    )}
    
    {error.code === 'LAW_ON_COOLDOWN' && (
      <p>Try again in {error.details.cooldownTurns} turns.</p>
    )}
  </div>
)}
```

---

## Documentation Location

📄 **Full Specification:** `docs/API_RESPONSE_FORMAT.md`
📄 **Interface Review:** `docs/ai/INTERFACE_REVIEW.md`

---

## Summary

The API response standardization provides a solid foundation for:
- ✅ Consistent error handling across all endpoints
- ✅ Better debugging with specific error codes
- ✅ Improved player experience with contextual messages
- ✅ Type-safe error handling in frontend code
- ✅ Future extensibility without breaking changes

All endpoints are now using the standardized format and the servers are running successfully!
