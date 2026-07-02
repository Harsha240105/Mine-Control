# Architecture Overview

MineControl OS is an Electron desktop application that combines a React frontend with an Express/Socket.IO backend to manage Minecraft Java Edition servers.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Electron Window                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │         React Frontend (Vite + Tailwind)          │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  ActiveServerContext (global server state)  │  │  │
│  │  │  AuthContext (JWT authentication)           │  │  │
│  │  │  useSocket (Socket.IO client)               │  │  │
│  │  └──────────────┬──────────────────────────────┘  │  │
│  │                 │ HTTP (fetch) + Socket.IO         │  │
│  └─────────────────┼─────────────────────────────────┘  │
│                    │                                    │
│  ┌─────────────────▼─────────────────────────────────┐  │
│  │         Express + Socket.IO Backend               │  │
│  │  ┌─────────────────────────────────────────┐      │  │
│  │  │  activeServer.ts (centralized singleton) │      │  │
│  │  │  Express Router (25 route modules)      │      │  │
│  │  │  Socket.IO (server state, players, chat)│      │  │
│  │  │  socketManager.ts (IO for all routes)   │      │  │
│  │  │  SQLite (better-sqlite3, WAL mode)      │      │  │
│  │  │  MinecraftServerManager (process mgmt)  │      │  │
│  │  └─────────────────────────────────────────┘      │  │
│  │                      │ spawn                       │  │
│  │  ┌───────────────────▼─────────────────────────┐  │  │
│  │  │      Minecraft Java Process (Paper, etc.)   │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  IPC Bridge (preload.ts) — contextBridge API            │
│  • getVersion, file dialogs, auto-updater controls      │
│  • Menu navigation, server actions, update events       │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Server Lifecycle
```
User clicks Start
    │
    ▼
Frontend → POST /api/server/start
    │
    ▼
Backend validates pre-flight:
  - Java installed
  - Server jar exists
  - Port available
  - EULA accepted
    │
    ▼
MinecraftServerManager.spawn()
  - Sets status → STARTING
  - Emits 'server:starting' via Socket.IO
  - Spawns Java process
    │
    ▼
Process output monitored:
  - "Done (XXs)!" → status → RUNNING
  - "Error" / crash → status → FAILED
    │
    ▼
Socket.IO emits status change to frontend
```

### Player Detection
```
File system watcher + periodic scan:
  playerdata/*.dat → prismarine-nbt parse → UUID, health, food, XP, position, inventory
  stats/*.json → parse → playtime, distance, blocks, deaths, items
  advancements/*.json → parse → unlocked advancements
  usercache.json → UUID → username mapping
    │
    ▼
Enrich → DB upsert → Socket.IO 'players:update'
```

---

## Key Modules

### Backend (server/)
| Module | File | Purpose |
|--------|------|---------|
| Active Server | `activeServer.ts` | Singleton managing the currently selected server |
| Database | `database.ts` | SQLite init, migrations, schema v12 |
| Paths | `paths.ts` | Cross-platform data directory resolution |
| Socket Manager | `socketManager.ts` | Socket.IO server singleton with cross-module events |
| Minecraft Manager | `services/minecraftServer.ts` | Process spawn, lifecycle, enrichment |
| Backup | `services/backup.ts` | ZIP create/restore, scheduling, cleanup |
| Import | `services/importServer.ts` | Server/world import from ZIP or directory |
| Feedback | `services/feedback.ts` | Issue tracking, diagnostics, sync queue |
| Firewall | `services/firewallManager.ts` | Windows Firewall netsh integration |
| Discord | `services/discord.ts` | Discord bot for notifications |
| Playit | `services/playit.ts` | Playit.gg tunnel management |
| Routes | `routes/*.ts` | 25 Express route modules |

### Frontend (src/)
| Module | File | Purpose |
|--------|------|---------|
| API Client | `lib/api.ts` | Typed HTTP client (627 lines, all endpoints) |
| Auth Context | `hooks/useAuth.tsx` | JWT login/logout, token management |
| Active Server | `hooks/useActiveServer.tsx` | Current server state for all pages |
| Socket | `hooks/useSocket.ts` | Socket.IO connection, event subscriptions |
| Pages | `pages/*.tsx` | 28 page components with 29 routes |

### Electron (electron/)
| Module | File | Purpose |
|--------|------|---------|
| Main | `main.ts` | Window, tray, IPC, auto-updater, CSP |
| Preload | `preload.ts` | Context bridge API for renderer |
| Migration | `migration.ts` | Legacy data migration (v1.0.44 and earlier) |

---

## State Management

### Server Status State Machine
```
STOPPED ──→ STARTING ──→ RUNNING ──→ STOPPING ──→ STOPPED
                │                       │
                ▼                       ▼
             FAILED ←───────────────── (on crash)
```

### Active Server
- Singleton in `server/activeServer.ts`
- Loaded from DB on backend start
- Switched via `setActive()` which updates Socket.IO
- Frontend `ActiveServerContext` wraps all authenticated pages
- All route modules access active server through the singleton

### Database
- Single SQLite file at `userData/data/minecontrol.db`
- WAL mode for concurrent read/write
- Schema versioned (currently v12)
- Never recreated — safe migrations only
- Full list of tables: 30+ tables for servers, players, worlds, plugins, mods, backups, feedback, etc.

---

## Networking

### Connection Modes
| Mode | Address | Use Case |
|------|---------|----------|
| localhost | `127.0.0.1:25565` | Single player, same machine |
| LAN | `192.168.x.x:25565` | Friends on same network |
| Internet | Via Playit.gg tunnel | Anyone anywhere |

### API Communication
- Frontend ↔ Backend: HTTP (fetch) + Socket.IO
- Backend ↔ Minecraft: stdin/stdout (process pipe) + TCP ping (Minecraft protocol)
- Backend ↔ Firewall: `netsh advfirewall` commands
- Backend ↔ Playit.gg: Playit agent process + REST API
- Backend ↔ Discord: discord.js WebSocket

---

## Security

### Authentication
- JWT-based with configurable secret
- Default owner account created on first launch
- All API routes except login require `authMiddleware`

### Credential Storage
- AES-256-GCM encryption with machine-derived key
- No master password needed — survives restarts
- 6 credential slots: Discord, Playit, GitHub, GitLab, Jira, Issue Tracker

### Data Privacy
- All data stored locally — no cloud dependency
- Feedback diagnostics auto-mask credentials before submission
- Full data export/delete from Privacy & Security Center

---

## Build Pipeline

```
npm run build:client   → Vite bundles React to dist/client/
npm run build:server   → tsc compiles server/ to dist/server/
npm run build:electron → tsc compiles electron/ to dist/electron/
npm run build          → All three above
npx electron-rebuild   → Rebuilds native modules for Electron
npx electron-builder   → Packages into .exe/.dmg/.AppImage
```

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
