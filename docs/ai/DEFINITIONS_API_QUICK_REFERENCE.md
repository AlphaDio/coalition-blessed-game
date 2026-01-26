# Game Definitions API - Quick Reference

## Summary

All game definitions (technologies, laws, improvements) are now served from the backend via REST API instead of being hardcoded in the frontend.

## Endpoints

| Endpoint | Method | Response | Location |
|----------|--------|----------|----------|
| `/api/game/definitions/technologies` | GET | `{ technologies: [...] }` | `src/server/api.js:550-568` |
| `/api/game/definitions/laws` | GET | `{ laws: [...] }` | `src/server/api.js:571-591` |
| `/api/game/definitions/improvements` | GET | `{ improvements: [...] }` | `src/server/api.js:594-616` |

## Frontend API Client

**Location**: `src/services/api.js`

```javascript
// Fetch all definitions
const techs = await api.getTechnologies();      // lines 157-160
const laws = await api.getLaws();              // lines 162-165
const improvements = await api.getImprovements(); // lines 167-170
```

## Backend Data Sources

| Type | Module | Export |
|------|--------|--------|
| Technologies | `src/game/technologyDefinitions.js` | `TECH_BY_ID` |
| Laws | `src/game/lawDefinitions.js` | `TIERED_LAW_DEFINITIONS` |
| Improvements | `src/game/improvements/definitions.js` | `getTieredImprovementRequests()` |

## Implementation Pattern

1. **Backend**: Each endpoint imports definitions, maps to frontend-friendly format, returns standardized response
2. **Frontend**: Fetch in `useEffect`, store in state map for O(1) lookups
3. **Display**: Use map to show human-readable names instead of IDs

## Benefits

✅ Single source of truth (backend)  
✅ No frontend rebuilds when definitions change  
✅ Consistent data across all components  
✅ Easy to extend with new definition types  
✅ Cached in component state for performance  

## Documentation

See `docs/ai/GAME_DEFINITIONS_API.md` for detailed information, response formats, and usage examples.
