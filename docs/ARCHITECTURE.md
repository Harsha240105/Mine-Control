# MineControl OS - Architecture Document

## Overview
MineControl OS is a self-hosted Minecraft Server Management Platform designed for personal use on a laptop (8-16GB RAM). It provides a modern web UI and optional desktop application for managing a PaperMC Minecraft server.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Client Layer                        │
├─────────────────┬──────────────────┬────────────────────┤
│   React SPA     │   Electron App   │   Mobile Browser   │
│   (Vite/React)  │   (Desktop Wrapper)   │   (Responsive)    │
└────────┬────────┴────────┬─────────┴────────┬───────────┘
         │                 │                  │
         └─────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Socket.IO   │
                    │  (WebSocket) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Express   │
                    │   (REST)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼────┐ ┌────▼────┐
        │  SQLite  │ │Minecraft│ │  File   │
        │  (Data)  │ │ Server  │ │  System │
        │          │ │Process  │ │ (Worlds)│
        └──────────┘ └─────────┘ └─────────┘
```

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Recharts** for charts
- **Lucide React** for icons
- **Socket.IO Client** for real-time
- **React Router DOM** for routing

### Backend
- **Node.js** runtime
- **Express** web framework
- **Socket.IO** real-time engine
- **better-sqlite3** database
- **node-cron** for scheduling
- **archiver/unzipper** for backups
- **bcryptjs** for password hashing
- **jsonwebtoken** for sessions

### Minecraft Server
- **PaperMC** server software
- **LuckPerms** for permissions
- **EssentialsX** for utilities

### Desktop
- **Electron** for desktop app
- **System tray** integration
- **Menu bar** shortcuts

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| username | TEXT UNIQUE | Login username |
| password_hash | TEXT | bcrypt hash |
| role | TEXT | 'owner' or 'admin' |
| created_at | TEXT | ISO timestamp |
| last_login | TEXT | ISO timestamp |
| session_token | TEXT | JWT token |

### players
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| username | TEXT UNIQUE | Minecraft username |
| uuid | TEXT UNIQUE | Minecraft UUID |
| role | TEXT | Role name |
| status | TEXT | online/offline/banned |
| last_login | TEXT | ISO timestamp |
| playtime | INTEGER | Minutes played |
| ip | TEXT | IP address |
| join_date | TEXT | ISO timestamp |
| muted | INTEGER | 0 or 1 |
| notes | TEXT | Admin notes |

### roles
| Column | Type | Description |
|--------|------|-------------|
| name | TEXT PK | Role name |
| level | INTEGER | Permission level |
| color | TEXT | Hex color |
| permissions | TEXT | JSON array |

### sessions
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | References users |
| token | TEXT | JWT token |
| ip | TEXT | Client IP |
| user_agent | TEXT | Browser info |
| created_at | TEXT | ISO timestamp |
| expires_at | TEXT | ISO timestamp |

### backups
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Backup name |
| size | TEXT | Human readable |
| created_at | TEXT | ISO timestamp |
| type | TEXT | manual/auto |
| worlds | TEXT | JSON array |
| encrypted | INTEGER | 0 or 1 |
| path | TEXT | File path |

### system_stats
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| cpu | REAL | CPU percentage |
| ram | REAL | RAM in MB |
| tps | REAL | Ticks per second |
| players | INTEGER | Online count |
| timestamp | INTEGER | Unix ms |

### audit_log
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| action | TEXT | Action name |
| username | TEXT | Who did it |
| details | TEXT | Extra info |
| ip | TEXT | Client IP |
| timestamp | TEXT | ISO timestamp |

## Folder Structure

```
MineControlOS/
├── package.json              # Root package with scripts
├── tsconfig.json             # TypeScript config (frontend)
├── tsconfig.server.json      # TypeScript config (backend)
├── tsconfig.electron.json    # TypeScript config (electron)
├── vite.config.ts            # Vite build config
├── tailwind.config.js        # Tailwind theme
├── postcss.config.js         # PostCSS config
├── index.html                # Entry HTML
│
├── public/
│   └── favicon.svg           # App icon
│
├── shared/
│   └── types.ts              # Shared TypeScript types
│
├── server/
│   ├── index.ts              # Express + Socket.IO server
│   ├── database.ts           # SQLite setup & schema
│   ├── middleware/
│   │   └── auth.ts           # Auth, permissions, rate limiting
│   ├── routes/
│   │   ├── auth.ts           # Login, logout, password change
│   │   ├── server.ts         # Server control, logs, config
│   │   ├── players.ts        # CRUD, ban, kick, mute, whitelist
│   │   ├── worlds.ts         # World management
│   │   ├── plugins.ts        # Plugin management
│   │   └── backup.ts         # Backup CRUD
│   └── services/
│       ├── minecraftServer.ts # Minecraft process manager
│       └── backup.ts         # Backup/restore engine
│
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Root with routes
│   ├── index.css             # Tailwind + custom styles
│   ├── lib/
│   │   └── api.ts            # API client
│   ├── hooks/
│   │   ├── useAuth.ts        # Auth context & hook
│   │   └── useSocket.ts      # Socket.IO hook
│   ├── components/
│   │   └── Layout.tsx        # Sidebar + header layout
│   └── pages/
│       ├── Login.tsx          # Login page
│       ├── Dashboard.tsx      # Main dashboard
│       ├── Players.tsx        # Player management
│       ├── Console.tsx        # Live console
│       ├── Worlds.tsx         # World manager
│       ├── Plugins.tsx        # Plugin manager
│       ├── Backups.tsx        # Backup manager
│       └── Settings.tsx       # Server settings
│
├── electron/
│   ├── main.ts               # Electron main process
│   └── preload.ts            # Context bridge
│
├── minecraft/
│   ├── plugins/              # Bukkit plugins (.jar)
│   ├── worlds/               # Minecraft worlds
│   ├── backups/              # Backup archives
│   ├── logs/                 # Server logs
│   └── config/               # Server configuration
│
├── scripts/
│   ├── setup.bat             # Windows setup
│   ├── setup.sh              # Linux/macOS setup
│   ├── download-paper.sh     # Download PaperMC
│   └── deploy-oracle.sh      # Oracle Cloud deploy
│
└── docs/
    ├── ARCHITECTURE.md       # This file
    ├── API.md                # API documentation
    ├── INSTALL.md            # Installation guide
    ├── DEPLOY.md             # Deployment guide
    ├── SECURITY.md           # Security checklist
    └── TROUBLESHOOTING.md    # Troubleshooting guide
```

## Data Flow

1. User opens browser/app
2. Frontend loads React SPA from Express server
3. User authenticates via /api/auth/login
4. Frontend receives JWT token, stores in localStorage
5. All subsequent API calls include Bearer token
6. Socket.IO connects for real-time events
7. Server status, logs, chat stream via WebSocket
8. Backend manages Minecraft server as child process
9. Backend reads/writes SQLite for persistence
10. Backend reads/writes filesystem for worlds/backups/plugins

## Security Model

- JWT-based authentication with 24h expiry
- bcrypt password hashing
- Rate limiting on all endpoints
- Role-based permission system
- Owner has all permissions
- Admin can manage server/players/backups/plugins
- Moderator can kick/ban/mute
- Whitelist for server access control
- Optional backup encryption (AES-256-CBC)
- SQL injection protected via parameterized queries
- Helmet headers for HTTP security
- CORS restricted to localhost origins
