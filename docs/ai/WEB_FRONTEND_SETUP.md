# Web Frontend Implementation - Setup Guide

## Overview

This document covers the complete setup and deployment of the Coalition web frontend with backend API server integration.

## What Was Implemented

### Backend (coalition-blessed-game)

#### New Files Created
1. **`src/server/api.js`** - Express + WebSocket API server
   - REST endpoints for all game actions
   - WebSocket server for real-time state updates
   - Game state broadcasting to connected clients

2. **`src/server/gameManager.js`** - Game orchestration layer
   - Manages game state independently of UI
   - Provides interface for API endpoints
   - Handles all game logic calls

3. **`server.js`** - Server entry point
   - Standalone entry point for API mode
   - Separate from CLI mode (can run both)
   - Configurable via environment variables

#### Updated Files
- **`package.json`** - Added dependencies: express, ws, cors

### Frontend (coalition-frontend)

#### Project Structure
```
coalition-frontend/
├── src/
│   ├── hooks/
│   │   ├── useWebSocket.js      - WebSocket connection management
│   │   └── useGameState.js      - Game state reducer and selectors
│   ├── services/
│   │   └── api.js               - REST API client
│   ├── components/
│   │   ├── GameBoard.jsx        - Main layout
│   │   ├── StatsPanel.jsx       - Statistics display
│   │   ├── ActiveBattles.jsx    - Battle fronts
│   │   ├── ActiveLaws.jsx       - Active laws
│   │   ├── LawsPanel.jsx        - Law enactment
│   │   ├── EventModal.jsx       - Event choices
│   │   ├── ImprovementsPanel.jsx - Improvements
│   │   ├── MarketPanel.jsx      - Market economy
│   │   └── LogsPanel.jsx        - Game logs
│   ├── utils/
│   │   └── formatters.js        - Display formatting utilities
│   ├── styles/
│   │   ├── GameBoard.css        - Layout styles
│   │   ├── StatsPanel.css       - Stats display styles
│   │   ├── Panels.css           - Generic panel styles
│   │   ├── EventModal.css       - Modal styles
│   │   └── LogsPanel.css        - Logs display styles
│   ├── App.jsx                  - Main app component
│   ├── index.jsx                - React entry point
│   └── index.css                - Global styles
├── public/
│   └── index.html               - HTML template
├── vite.config.js               - Vite configuration
├── package.json                 - Dependencies and scripts
├── .env.example                 - Environment template
└── README.md                    - Frontend documentation
```

## Installation

### Backend Setup

1. Navigate to the game directory:
```bash
cd coalition-blessed-game
```

2. Install new dependencies:
```bash
yarn install
```

3. (Optional) Create `.env` file from template:
```bash
cp .env.example .env
```

4. Start the API server:
```bash
yarn server
```

The backend will be available at `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd coalition-frontend
```

2. Install dependencies:
```bash
yarn install
```

3. (Optional) Create `.env.local` file:
```bash
cp .env.example .env.local
```

4. Start the development server:
```bash
yarn dev
```

The frontend will be available at `http://localhost:3000`

## Running Both CLI and Web Frontend

The CLI and web frontend can run simultaneously:

### Terminal 1 - Web Frontend
```bash
cd coalition-frontend
yarn dev  # Runs on http://localhost:3000
```

### Terminal 2 - Backend API (shared by web frontend)
```bash
cd coalition-blessed-game
yarn server  # Runs on http://localhost:3001
```

### Terminal 3 - CLI (original game)
```bash
cd coalition-blessed-game
yarn start  # Original CLI game
```

All three can run independently without conflicts.

## Environment Variables

### Backend (coalition-blessed-game)

Create `.env` file:
```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

### Frontend (coalition-frontend)

Create `.env.local` file (optional, defaults work):
```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

## Architecture

### Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ React Frontend (coalition-frontend)                         │
│ - React components                                          │
│ - useGameState (Redux-like reducer)                        │
│ - useWebSocket (WebSocket connection)                      │
└─────────────────────────────────────────────────────────────┘
         │                                        │
         │ REST API                              │ WebSocket
         │ (game actions)                        │ (state updates)
         ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Express API Server (coalition-blessed-game/server.js)       │
│ - Express HTTP server                                       │
│ - WebSocket server                                          │
│ - GameManager instance                                      │
│ - Broadcasts state to all connected clients                │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Game Logic (existing code, unchanged)                       │
│ - src/game/*                                                │
│ - Game state and turn simulation                            │
│ - All existing game mechanics                               │
└─────────────────────────────────────────────────────────────┘
```

### State Update Cycle

1. **User Action**: Click button in React UI
2. **API Call**: Frontend calls REST endpoint
3. **Server Processing**: GameManager processes action
4. **State Update**: Game state modified
5. **WebSocket Broadcast**: State sent to all connected clients
6. **UI Update**: Frontend receives via WebSocket, updates React state
7. **Re-render**: React components re-render with new state

## Key Features

### Real-Time Updates
- WebSocket connection maintains live state sync
- State updates broadcast to all connected clients
- Automatic reconnection with exponential backoff

### Responsive Design
- Grid-based layout that adapts to screen size
- Works on desktop (1920px), laptop (1366px), tablet (768px)
- Mobile-friendly (375px) with vertical layout

### Dark Theme
- CLI-inspired dark aesthetic
- Color scheme: green (#4ade80), yellow (#facc15), red (#ef4444)
- Accessible contrast ratios

### Complete Feature Parity
- All game actions available via API
- Event handling with modal interface
- Law enactment system
- Improvements management
- Market economy display
- Game logs

## Testing

See `docs/ai/INTEGRATION_TESTING.md` for comprehensive testing guide.

Quick test:
```bash
# Terminal 1: Backend
cd coalition-blessed-game
yarn server

# Terminal 2: Frontend
cd coalition-frontend
yarn dev

# Open browser to http://localhost:3000
```

## Production Deployment

### Build Frontend
```bash
cd coalition-frontend
yarn build
```

Creates optimized build in `dist/` directory.

### Deploy Backend
```bash
cd coalition-blessed-game
# Install production dependencies
yarn install --production

# Start server
PORT=3001 CORS_ORIGIN=https://yourdomain.com node server.js
```

### Docker (Optional)

Create Dockerfile for backend:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN yarn install --production
CMD ["node", "server.js"]
```

## Troubleshooting

### Backend won't start
- Check port 3001 is available
- Verify all dependencies installed: `yarn install`
- Check Node.js version is 14+

### Frontend shows "Connecting..."
- Ensure backend is running on port 3001
- Check browser console for WebSocket errors
- Verify CORS_ORIGIN in backend .env

### WebSocket disconnects frequently
- Check network stability
- Review browser console for errors
- Increase WebSocket timeout if needed

### Buttons not responding
- Verify backend is running
- Check network tab in DevTools
- Review console for API errors

## Future Enhancements

- Multi-player support (multiple game instances)
- Persistent save/load UI
- Advanced battle visualization
- Empire management interface
- Performance metrics dashboard
- User authentication
- Game replay functionality

## Documentation

- Backend API: See REST endpoints in `src/server/api.js`
- Frontend: See `coalition-frontend/README.md`
- Testing: See `docs/ai/INTEGRATION_TESTING.md`
- Game Systems: See `docs/systems/` for game mechanics

## Support

For issues or questions:
1. Check the README in respective directories
2. Review console logs (browser DevTools or Node output)
3. Run test suite: `yarn test` (backend)
4. Check environment variables are set correctly
