# Quick Start Guide - Web Frontend

## 🚀 Get Started in 5 Minutes

### Prerequisites
- Node.js 18+ and yarn
- Two terminal windows/tabs

### Start Backend API

**Terminal 1:**
```bash
cd coalition-blessed-game
yarn install
yarn server
```

Expected output:
```
API server listening on port 3001
CORS enabled for origin: http://localhost:3000
```

### Start Frontend

**Terminal 2:**
```bash
cd coalition-frontend
yarn install
yarn dev
```

Expected output:
```
VITE v5.0.0 ready in XXX ms
➜  Local:   http://localhost:3000/
```

### 🎮 Play!

Open your browser to `http://localhost:3000`

## What You Get

- **Real-time game state** via WebSocket
- **Complete UI** with stats, battles, laws, events, improvements, market data
- **Dark theme** inspired by the CLI version
- **Responsive design** works on desktop, tablet, mobile
- **Full feature parity** with CLI game

## Key Commands

### Backend
- `yarn server` - Start API server (port 3001)
- `yarn server:dev` - Start with auto-reload (requires nodemon)
- `yarn test` - Run tests

### Frontend
- `yarn dev` - Start development server (port 3000)
- `yarn build` - Create production build
- `yarn preview` - Preview production build

## File Locations

| Component | Location |
|-----------|----------|
| Backend API | `coalition-blessed-game/src/server/api.js` |
| Game Manager | `coalition-blessed-game/src/server/gameManager.js` |
| Server Entry | `coalition-blessed-game/server.js` |
| Frontend Root | `coalition-frontend/src/App.jsx` |
| Components | `coalition-frontend/src/components/` |
| Hooks | `coalition-frontend/src/hooks/` |
| API Client | `coalition-frontend/src/services/api.js` |

## Configuration

### Backend (.env)
```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env.local)
```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

## Architecture

```
Browser (React)  ←→  Express Server  ←→  Game Logic
  Port 3000            Port 3001           (unchanged)
```

- **WebSocket**: Real-time state updates
- **REST API**: Game actions (laws, events, etc.)
- **React State**: Local game state management

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect" | Ensure backend is running: `yarn server` |
| Port already in use | Change `PORT=3001` in `.env` |
| "Connecting..." forever | Check browser console, verify firewall |
| API calls 404 | Verify proxy in `vite.config.js` |

## Next Steps

1. ✅ Backend running on port 3001
2. ✅ Frontend running on port 3000
3. ✅ Open http://localhost:3000
4. ✅ Start playing!

## Documentation

- **Setup Guide**: `docs/ai/WEB_FRONTEND_SETUP.md`
- **Testing Guide**: `docs/ai/INTEGRATION_TESTING.md`
- **Frontend README**: `coalition-frontend/README.md`
- **Implementation Summary**: `docs/ai/WEB_FRONTEND_IMPLEMENTATION_COMPLETE.md`

## Running Both CLI and Web

**Terminal 1: Web Backend**
```bash
cd coalition-blessed-game && yarn server
```

**Terminal 2: Web Frontend**
```bash
cd coalition-frontend && yarn dev
```

**Terminal 3: CLI (original)**
```bash
cd coalition-blessed-game && yarn start
```

All three can run simultaneously!

---

**Questions?** Check the documentation files or review the code comments.
