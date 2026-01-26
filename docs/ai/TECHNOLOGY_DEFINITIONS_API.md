# Technology Definitions API

## Overview

Technology definitions are now served from the backend via REST API instead of being hardcoded in the frontend. This ensures the frontend always has the correct and up-to-date technology information from the server.

## Architecture

### Backend Implementation

**Endpoint**: `GET /api/game/definitions/technologies`

**Location**: `src/server/api.js` (lines 549-567)

**Response Format**:
```json
{
  "success": true,
  "data": {
    "technologies": [
      {
        "id": "power_armor",
        "name": "Power Armor",
        "description": "Enhanced armor technology boosts army effectiveness.",
        "category": "general"
      },
      {
        "id": "cybernetics",
        "name": "Cybernetics",
        "description": "Machine enhancements dramatically boost army and research capabilities.",
        "category": "aligned"
      },
      // ... more technologies
    ]
  }
}
```

**Data Source**: `src/game/technologyDefinitions.js` - Uses existing `TECH_BY_ID` export to retrieve technology definitions.

### Frontend Implementation

**API Client Method**: `api.getTechnologies()`

**Location**: `src/services/api.js` (lines 156-160)

**Usage in EmpiresPanel**:
```javascript
// Fetch technologies on component mount
useEffect(() => {
  async function fetchTechnologies() {
    try {
      const data = await api.getTechnologies();
      const techMap = {};
      data.technologies.forEach(tech => {
        techMap[tech.id] = tech.name;
      });
      setTechnologiesMap(techMap);
    } catch (error) {
      console.error('Failed to fetch technologies:', error);
    }
  }
  fetchTechnologies();
}, []);

// Display technology names using fetched map
{technologies.map((techId) => (
  <div key={techId} className="tech-item">
    {technologiesMap[techId] || techId}
  </div>
))}
```

## Benefits

1. **Single Source of Truth**: Technology data comes from backend definitions
2. **Maintainability**: No need to update frontend when adding/modifying technologies
3. **Consistency**: Frontend always displays data matching backend logic
4. **Extensibility**: Easy to add new fields (effects, costs, requirements, etc.) to technology definitions
5. **Performance**: Data is cached in component state after initial fetch

## Files Modified

- `src/server/api.js` - Added `/api/game/definitions/technologies` endpoint
- `src/services/api.js` - Added `getTechnologies()` method
- `src/components/EmpiresPanel.jsx` - Updated to fetch and use technologies from API
- Removed: `src/utils/techNames.js` - No longer needed

## Future Enhancements

- Add endpoint caching in API to reduce repeated requests
- Consider adding other definition endpoints (laws, improvements, commodities, etc.)
- Add optional filters to endpoint (e.g., `/api/game/definitions/technologies?category=aligned`)
