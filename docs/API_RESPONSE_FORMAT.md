# API Response Format Specification

## Overview

All API endpoints follow a standardized response format for consistency and better error handling. This document describes the format for success and error responses.

---

## Success Response Format

### Standard Success Response

```json
{
  "success": true,
  "data": {
    "...": "Game state or endpoint-specific data"
  },
  "notification": {
    "type": "action_name",
    "details": {
      "...": "Action-specific details"
    }
  },
  "timestamp": 1234567890
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | ✅ Yes | Always `true` for success responses |
| `data` | object | ✅ Yes | Response payload (game state or action result) |
| `notification` | object | ❌ No | Summary of the action performed |
| `notification.type` | string | - | Type of notification (e.g., 'law_enacted', 'event_choice') |
| `notification.details` | object | - | Detailed information about the action |
| `timestamp` | number | ✅ Yes | Unix timestamp when response was generated |

### Example: Law Enactment

```json
{
  "success": true,
  "data": {
    "turn": 5,
    "coalitionCohesion": 72,
    "enactedLaws": ["law_01", "law_02", "law_03"],
    "...": "Complete game state"
  },
  "notification": {
    "type": "law_enacted",
    "details": {
      "lawId": "law_03",
      "turn": 5
    }
  },
  "timestamp": 1674234567890
}
```

---

## Error Response Format

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "...": "Additional context about the error"
    }
  },
  "timestamp": 1234567890
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | ✅ Yes | Always `false` for error responses |
| `error` | object | ✅ Yes | Error information |
| `error.code` | string | ✅ Yes | Machine-readable error code |
| `error.message` | string | ✅ Yes | Human-readable error message |
| `error.details` | object | ❌ No | Additional error context (varies by error) |
| `timestamp` | number | ✅ Yes | Unix timestamp when error occurred |

---

## Error Codes Reference

### Validation Errors (400 Bad Request)

| Code | Status | Description | Example Details |
|------|--------|-------------|-----------------|
| `INVALID_REQUEST` | 400 | Generic invalid request | - |
| `MISSING_PARAMETER` | 400 | Required parameter not provided | `{ parameter: "lawId" }` |
| `INVALID_PARAMETER` | 400 | Parameter has invalid value/type | `{ parameter: "speed", reason: "must be between 0.5 and 3.0" }` |

### Resource Not Found (404 Not Found)

| Code | Status | Description | Example Details |
|------|--------|-------------|-----------------|
| `NOT_FOUND` | 404 | Generic not found error | - |
| `LAW_NOT_FOUND` | 404 | Law ID does not exist | `{ lawId: "law_99" }` |
| `EVENT_NOT_FOUND` | 404 | Event ID does not exist | `{ eventId: "evt_123" }` |
| `IMPROVEMENT_NOT_FOUND` | 404 | Improvement ID does not exist | `{ requestId: "imp_456" }` |
| `EMPIRE_NOT_FOUND` | 404 | Empire ID does not exist | `{ empireId: "emp_789" }` |

### Game Logic Errors (400 Bad Request)

| Code | Status | Description | Example Details |
|------|--------|-------------|-----------------|
| `INSUFFICIENT_RESOURCES` | 400 | Not enough resources for action | `{ required: 150, available: 100 }` |
| `INSUFFICIENT_INFLUENCE` | 400 | Not enough influence | `{ required: 150, available: 100 }` |
| `INSUFFICIENT_SUPPLY` | 400 | Not enough supply | `{ required: 500, available: 200 }` |
| `INSUFFICIENT_CREDITS` | 400 | Not enough credits | `{ required: 5000, available: 3000 }` |
| `LAW_ALREADY_ENACTED` | 400 | Law has already been enacted | `{ lawId: "law_01" }` |
| `LAW_ON_COOLDOWN` | 400 | Law is on cooldown | `{ lawId: "law_01", cooldownTurns: 3 }` |
| `GAME_OVER` | 400 | Game has ended | `{ reason: "coalition_defeated" }` |
| `INVALID_GAME_STATE` | 400 | Game state doesn't allow action | `{ currentState: "paused" }` |

### Permission/State Errors (403 Forbidden)

| Code | Status | Description | Example Details |
|------|--------|-------------|-----------------|
| `ACTION_NOT_ALLOWED` | 403 | Action not permitted in current state | `{ reason: "action_requires_unpause" }` |

### Server Errors (500 Internal Server Error)

| Code | Status | Description | Notes |
|------|--------|-------------|-------|
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | See logs for details |
| `DATABASE_ERROR` | 500 | Database operation failed | See logs for details |
| `UNKNOWN_ERROR` | 500 | Unknown error occurred | See logs for details |

---

## Example Error Responses

### Missing Parameter Error

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

### Invalid Parameter Error

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

### Resource Not Found Error

```json
{
  "success": false,
  "error": {
    "code": "LAW_NOT_FOUND",
    "message": "Law not found: law_999"
  },
  "timestamp": 1674234567890
}
```

### Game Logic Error

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

---

## Endpoint-Specific Responses

### GET /api/game/armies

**Success Response:**
- Returns a list of all active (non-synthetic) coalition armies with panel-ready data
- No `notification` field
- Armies include empire info, manpower, morale, combat stats, supply state, and active battle status

```json
{
  "success": true,
  "data": {
    "armies": [
      {
        "id": "army_1",
        "name": "1st Stellar Battle Fleet",
        "empire": { "id": "empire_1", "name": "Stellar Federation" },
        "manpower": { "current": 9500, "max": 10000, "percent": 95 },
        "morale": { "current": 80, "max": 100 },
        "stats": {
          "organization": 76,
          "fervor": 52,
          "aggravation": 42,
          "command": 58
        },
        "combat": {
          "dmgPerUnitMP": 0.9,
          "dmgPerTickMO": 2.2,
          "protection": 0.33,
          "resolve": 0.43,
          "killRate": 0.08
        },
        "supply": {
          "needsFulfillment": { "super_alloys": 0.9, "plasma_fuel": 0.85 },
          "wantsFulfillment": { "rare_gases": 0.7 }
        },
        "battle": null
      }
    ]
  },
  "timestamp": 1674234567890
}
```

- `battle` is `null` when the army is not in a battle, or an object with:
  - `frontId` - battle front identifier
  - `opponentArmyId` - ID of the opposing army
  - `opponentName` - Name of the opposing army
  - `battlefieldSize` - Size of the battlefield
  - `moraleBroken` - Whether this army's morale is broken

**Error Responses:**
- `INVALID_GAME_STATE` - game is not initialized

### GET /api/game/state

**Success Response:**
- Returns complete game state as `data`
- No `notification` field

```json
{
  "success": true,
  "data": {
    "turn": 1,
    "coalitionCohesion": 75,
    "...": "Complete game state object"
  },
  "timestamp": 1674234567890
}
```

### POST /api/game/actions/enact-law

**Success Response:**
- Returns updated game state as `data`
- Includes notification with lawId and turn

```json
{
  "success": true,
  "data": { "...": "Updated game state" },
  "notification": {
    "type": "law_enacted",
    "details": {
      "lawId": "law_03",
      "turn": 5
    }
  },
  "timestamp": 1674234567890
}
```

**Error Responses:**
- `MISSING_PARAMETER` - lawId not provided
- `LAW_NOT_FOUND` - lawId does not exist
- `LAW_ALREADY_ENACTED` - law has already been enacted
- `LAW_ON_COOLDOWN` - law is still on cooldown
- `INSUFFICIENT_RESOURCES` - player lacks required resources
- `INVALID_GAME_STATE` - game state doesn't allow enactment

### POST /api/game/actions/event-choice

**Success Response:**
- Returns updated game state as `data`
- Includes notification with eventId and choiceIndex

```json
{
  "success": true,
  "data": { "...": "Updated game state" },
  "notification": {
    "type": "event_choice",
    "details": {
      "eventId": "evt_123",
      "choiceIndex": 2,
      "turn": 5
    }
  },
  "timestamp": 1674234567890
}
```

**Error Responses:**
- `MISSING_PARAMETER` - eventId or choiceIndex not provided
- `INVALID_PARAMETER` - choiceIndex is invalid
- `EVENT_NOT_FOUND` - event does not exist

### POST /api/game/actions/improvement

**Success Response:**
- Returns updated game state as `data`
- Includes notification with action type

```json
{
  "success": true,
  "data": { "...": "Updated game state" },
  "notification": {
    "type": "improvement_action",
    "details": {
      "action": "accept",
      "requestId": "imp_456",
      "turn": 5
    }
  },
  "timestamp": 1674234567890
}
```

**Error Responses:**
- `MISSING_PARAMETER` - requestId or empireId (for accept) not provided
- `INVALID_PARAMETER` - action value is invalid
- `IMPROVEMENT_NOT_FOUND` - improvement does not exist
- `EMPIRE_NOT_FOUND` - empire does not exist
- `INSUFFICIENT_RESOURCES` - insufficient supply/credits

### POST /api/game/actions/pause

**Success Response:**
- Returns pause state (not full game state)
- Includes notification

```json
{
  "success": true,
  "data": {
    "paused": true
  },
  "notification": {
    "type": "game_pause",
    "details": {
      "paused": true,
      "turn": 5
    }
  },
  "timestamp": 1674234567890
}
```

**Error Responses:**
- `INVALID_PARAMETER` - paused is not a boolean

### POST /api/game/actions/speed

**Success Response:**
- Returns speed value (not full game state)
- Includes notification

```json
{
  "success": true,
  "data": {
    "speed": 2.0
  },
  "notification": {
    "type": "game_speed",
    "details": {
      "speed": 2.0,
      "turn": 5
    }
  },
  "timestamp": 1674234567890
}
```

**Error Responses:**
- `MISSING_PARAMETER` - speed not provided
- `INVALID_PARAMETER` - speed is not between 0.5 and 3.0

---

## Frontend Error Handling

### Basic Error Handling

```javascript
try {
  const response = await api.enactLaw(lawId);
  // Handle success
} catch (error) {
  // error.code contains the error code
  // error.message contains the message
  // error.details contains additional context
  
  if (error.code === 'LAW_NOT_FOUND') {
    console.log('Law not found');
  } else if (error.code === 'INSUFFICIENT_INFLUENCE') {
    console.log(`Need ${error.details.required} influence, have ${error.details.available}`);
  }
}
```

### Component Error Display

```javascript
const [error, setError] = useState(null);

const handleEnactLaw = async (lawId) => {
  try {
    await api.enactLaw(lawId);
  } catch (err) {
    setError({
      code: err.code,
      message: err.message,
      details: err.details
    });
  }
};

return (
  <>
    {error && (
      <div className="error-message">
        <strong>{error.code}</strong>: {error.message}
        {error.details && <pre>{JSON.stringify(error.details, null, 2)}</pre>}
      </div>
    )}
  </>
);
```

---

## Migration Guide

### From Old Format to New Format

**Old Error Response:**
```json
{
  "success": false,
  "error": "Law not found"
}
```

**New Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "LAW_NOT_FOUND",
    "message": "Law not found: law_999"
  },
  "timestamp": 1674234567890
}
```

### Updating Frontend Code

**Before:**
```javascript
if (!result.success) {
  setError(result.error);  // Generic string
}
```

**After:**
```javascript
if (!result.success) {
  setError(result.error.message);  // Better message
  // Can also access error.code for specific handling
  if (result.error.code === 'INSUFFICIENT_INFLUENCE') {
    // Special handling
  }
}
```

---

## Testing Error Responses

### Testing Missing Parameter

```bash
curl -X POST http://localhost:3001/api/game/actions/enact-law \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
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

### Testing Invalid Parameter

```bash
curl -X POST http://localhost:3001/api/game/actions/speed \
  -H "Content-Type: application/json" \
  -d '{"speed": 5.0}'
```

**Response:**
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

## Summary

The standardized API response format provides:

✅ **Consistency** - All endpoints follow the same structure
✅ **Clarity** - Error codes are machine-readable and specific
✅ **Context** - Detailed error messages help debug issues
✅ **Extensibility** - Additional fields can be added as needed
✅ **Type Safety** - Frontend can rely on predictable response structure
