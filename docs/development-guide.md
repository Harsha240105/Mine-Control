# Development Guide

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** 9+
- **Git**
- **TypeScript** 5.x (installed via npm)
- **Electron** 28 (installed via npm)
- **Java** 17+ (for running Minecraft servers)

## Setup

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd Mine-Control
npm install
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development mode (frontend + backend concurrently) |
| `npm run build` | Build all (client + server + electron) |
| `npm run build:client` | Build React frontend via Vite |
| `npm run build:server` | Compile backend TypeScript |
| `npm run build:electron` | Compile Electron TypeScript |
| `npm run typecheck` | Run TypeScript type checking on all three targets |
| `npm run lint` | Run ESLint |
| `npm run dev:server` | Start backend in dev mode (ts-node watch) |
| `npm run dev:client` | Start Vite dev server for frontend |

## Development Flow

### Frontend Development
```bash
npm run dev:server   # Terminal 1: backend on port 3001
npm run dev:client   # Terminal 2: frontend on port 5173
```
Open `http://localhost:5173` — Vite proxies API requests to port 3001.

### Full Electron Development
```bash
npm run dev
```
This runs both backend and frontend, then opens Electron pointing to the Vite dev server.

### Production Build
```bash
npm run build                    # Compile all TypeScript
npx electron-rebuild -f -w better-sqlite3  # Rebuild native modules
npx electron-builder --win       # Windows installer
npx electron-builder --mac       # macOS DMG
npx electron-builder --linux     # Linux AppImage
```

## Project Structure

```
MineControl-OS/
├── src/               # React frontend
│   ├── components/    # Reusable UI components
│   ├── hooks/         # React hooks (useAuth, useSocket, useActiveServer, useNotifications)
│   ├── lib/           # API client library
│   ├── pages/         # 28 page components
│   ├── App.tsx        # Root component with routing
│   └── main.tsx       # Entry point
├── server/            # Express + Socket.IO backend
│   ├── routes/        # 25 route modules
│   ├── services/      # 21 services
│   ├── middleware/     # Auth middleware
│   ├── activeServer.ts # Centralized singleton
│   ├── database.ts    # SQLite with migrations
│   ├── paths.ts       # Data directory resolution
│   └── index.ts       # Server entry point
├── electron/          # Electron main process
│   ├── main.ts        # Window, IPC, auto-updater
│   ├── preload.ts     # Context bridge
│   └── migration.ts   # Legacy data migration
├── build/             # Build resources (icons, configs)
├── docs/              # Documentation
├── scripts/           # Utility scripts
├── tests/             # Test files
├── .github/           # CI/CD and issue templates
├── package.json
├── electron-builder.yml
├── vite.config.ts
└── tsconfig*.json
```

## Code Conventions

### TypeScript
- Strict mode enabled
- No `any` type unless absolutely necessary
- Prefer interfaces over types for object shapes
- Use `const` assertions for literal types

### React
- Functional components with hooks only (no class components)
- Custom hooks for reusable logic
- Tailwind CSS for all styling (no CSS modules or styled-components)
- Lucide React for icons

### Express
- Route handlers should be wrapped with `asyncHandler` for error propagation
- Each route module exports a default `Router`
- All routes (except login) use `authMiddleware`
- Permission checks via `requirePermission(permission)` middleware

### SQLite (better-sqlite3)
- Synchronous API (no async/await for DB operations)
- Prepared statements for all queries
- WAL mode for concurrent performance
- Schema changes go through migration functions, never raw `ALTER TABLE`

## Adding a New Route

1. Create `server/routes/your-feature.ts`
2. Add routes with `authMiddleware` and `requirePermission` as needed
3. Mount in `server/index.ts`: `app.use('/api/your-feature', yourFeatureRouter);`
4. Add frontend API function in `src/lib/api.ts`
5. Create page at `src/pages/YourFeature.tsx`
6. Add route in `src/App.tsx`
7. Add nav link in `src/components/Layout.tsx`

## Adding a New Database Migration

In `server/database.ts`, `initializeSchema()`:

1. Check current schema version: `const version = db.prepare('SELECT MAX(version) FROM schema_version').get();`
2. Add a new version block: `if (version < N) { ... db.exec('ALTER TABLE ...'); db.prepare('INSERT INTO schema_version (version) VALUES (N)').run(); }`

Never recreate the database. Always use additive migrations.

## Debugging

### Backend
```bash
npm run dev:server
# Or with debugger:
node --inspect dist/server/index.js
```

### Frontend
- Chrome DevTools (F12 in Electron)
- React DevTools browser extension
- Vite HMR for instant updates

### Electron
- `console.log` in main process appears in terminal
- Renderer logs in DevTools
- Use `electron-log` for file-based logging

### Native Modules
If `better-sqlite3` fails to load in Electron:
```bash
npx electron-rebuild -f -w better-sqlite3
```

## Testing

Tests are in `tests/` (future use). Currently:
- TypeScript type checking: `npm run typecheck`
- Lint: `npm run lint`
- Manual testing required for Minecraft server interactions

When adding code that interacts with Minecraft processes, test with:
- Paper 1.21.1 (most common)
- Fabric 1.20.4 (modded)
- Vanilla latest (baseline)

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
