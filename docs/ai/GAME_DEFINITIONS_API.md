# Game Definitions API

## Overview

Game definitions (technologies, laws, improvements) are now served from the backend via REST API. This ensures the frontend always has the correct and up-to-date data from the server.

## Endpoints

### Technologies

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
      }
    ]
  }
}
```

**Frontend Usage**:
```javascript
const data = await api.getTechnologies();
const techMap = {};
data.technologies.forEach(tech => {
  techMap[tech.id] = tech.name;
});
```

---

### Laws

**Endpoint**: `GET /api/game/definitions/laws`

**Location**: `src/server/api.js` (lines 569-587)

**Response Format**:
```json
{
  "success": true,
  "data": {
    "laws": [
      {
        "id": "peace_accord_initiative",
        "name": "Peace Accord Initiative",
        "description": "Diplomatic framework...",
        "tier": 1,
        "branch": "diplomacy",
        "tags": ["diplomatic", "peace"]
      },
      {
        "id": "total_war_mobilization",
        "name": "Total War Mobilization",
        "description": "Military framework...",
        "tier": 3,
        "branch": "military",
        "tags": ["military", "combat"]
      }
    ]
  }
}
```

**Frontend Usage**:
```javascript
const data = await api.getLaws();
const lawMap = {};
data.laws.forEach(law => {
  lawMap[law.id] = law;
});
```

---

### Improvements

**Endpoint**: `GET /api/game/definitions/improvements`

**Location**: `src/server/api.js` (lines 589-609)

**Response Format**:
```json
{
  "success": true,
  "data": {
    "improvements": [
      {
        "id": "cultural_center",
        "name": "Cultural Center",
        "description": "Community hub fostering social bonds...",
        "tier": 1,
        "branch": "social",
        "supplyUpkeep": 2,
        "modifiers": {
          "empire_approval": 5,
          "population_growth": 1.0
        }
      },
      {
        "id": "orbital_foundry",
        "name": "Orbital Foundry Complex",
        "description": "Network of orbital facilities...",
        "tier": 2,
        "branch": "industrial",
        "supplyUpkeep": 5,
        "modifiers": {
          "industrial_output": 0.02
        }
      }
    ]
  }
}
```

**Frontend Usage**:
```javascript
const data = await api.getImprovements();
const improvementMap = {};
data.improvements.forEach(imp => {
  improvementMap[imp.id] = imp;
});
```

---

## Architecture

### Backend Implementation

All definition endpoints:
1. Import the necessary definitions from their respective modules
2. Map the raw definition objects to a simplified frontend-friendly format
3. Return consistent API response format with `sendSuccess()` or `sendError()`

**Data Sources**:
- Technologies: `src/game/technologyDefinitions.js` - `TECH_BY_ID`
- Laws: `src/game/lawDefinitions.js` - `TIERED_LAW_DEFINITIONS`
- Improvements: `src/game/improvements/definitions.js` - `getTieredImprovementRequests()`

### Frontend Implementation

**API Client Location**: `src/services/api.js`

**Methods**:
- `api.getTechnologies()` - lines 156-159
- `api.getLaws()` - lines 161-164
- `api.getImprovements()` - lines 166-169

**Usage Pattern in Components**:

1. Create state to store definitions map
2. Fetch definitions on component mount using `useEffect`
3. Transform fetched array to map for O(1) lookups
4. Use map to display human-readable names

```javascript
import { useEffect, useState } from 'react';
import api from '../services/api.js';

export default function MyComponent() {
  const [techMap, setTechMap] = useState({});

  useEffect(() => {
    async function fetchDefinitions() {
      try {
        const data = await api.getTechnologies();
        const map = {};
        data.technologies.forEach(tech => {
          map[tech.id] = tech.name;
        });
        setTechMap(map);
      } catch (error) {
        console.error('Failed to fetch definitions:', error);
      }
    }
    fetchDefinitions();
  }, []);

  return (
    <div>
      {techIds.map(techId => (
        <span key={techId}>{techMap[techId] || techId}</span>
      ))}
    </div>
  );
}
```

---

## Benefits

1. **Single Source of Truth**: All definitions live in backend and serve frontend
2. **Maintainability**: Add/modify definitions in one place (backend)
3. **Consistency**: Frontend always displays accurate backend data
4. **Extensibility**: Easy to add new fields to definitions later
5. **Decoupling**: Frontend doesn't need to know about definition internals
6. **Performance**: Data cached in component state after initial fetch

---

## Files Modified

### Backend
- `src/server/api.js` - Added three definition endpoints

### Frontend
- `src/services/api.js` - Added three API client methods

---

## Future Enhancements

1. **Endpoint Caching**: Cache responses in API to reduce repeated requests
2. **More Definitions**: Add endpoints for laws, events, improvements branches, etc.
3. **Filtering**: Add query parameters (e.g., `/api/game/definitions/laws?tier=2&branch=military`)
4. **Relationships**: Include related data (e.g., which techs unlock which laws)
5. **Search**: Add endpoint for searching definitions by name or tags
6. **Pagination**: For large definition sets, add pagination support
7. **Versioning**: Track definition schema versions for frontend compatibility
