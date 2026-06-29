# MineControl OS

> A self-hosted, desktop-first Minecraft Server Management Platform. No cloud dependency, no third-party hosting — just your machine, your server.

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases">
    <img src="https://img.shields.io/badge/Latest_v1.0.52-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License"/>
  </a>
</p>

---

## Overview

MineControl OS is an all-in-one Electron desktop application that wraps Paper, Fabric, NeoForge, Purpur, Vanilla, and 8 other server types into a polished management interface. It handles server lifecycle, software downloads, plugin/mod installation, world management, backups, player administration, Discord integration, and more — entirely offline by default.

### Connection Modes

| Mode | Setup | Players |
|------|-------|---------|
| **Same Laptop** | `localhost:25565` | Just you |
| **LAN** | Auto-detected LAN IP | Friends on same network |
| **Internet** | Playit.gg tunnel or port forwarding | Anyone |

The app auto-detects your network environment and recommends the correct connection method.

---

## Features

### Server Management
- Create, import, switch between multiple servers with per-server isolation
- One-click start/stop/restart with proper 5-state lifecycle (STOPPED → STARTING → RUNNING → STOPPING → FAILED)
- Auto-restart on crash (max 3 attempts), port conflict detection, orphan process cleanup
- EULA auto-accept, Java pre-check with cross-platform auto-detection

### Software Support (12 types)
PaperMC, Purpur, Fabric, Quilt, Forge, NeoForge, Spigot, Folia, Vanilla, Velocity, Waterfall, BungeeCord — auto-download jars on creation, switch versions on demand.

### Plugins, Mods, Shaders & Resource Packs
- Plugin marketplace: Modrinth, Hangar, SpigotMC, CurseForge, BukkitDev
- Mod manager: Modrinth + CurseForge install, toggle, remove
- Shader/resource pack manager: install from URL or upload `.zip`, toggle on/off

### Player Management
- Auto-detection from `playerdata/`, `stats/`, `advancements/`, `usercache.json`
- Role-based access (Owner / Admin / Moderator / Member / Guest)
- Ban, kick, mute, temp-ban, whitelist, OP controls
- Player history, sessions, deep analytics

### World Management
- Create, clone, rename, delete, repair, optimize (Purpur region compression)
- Export/import worlds as ZIP with full NBT metadata via `prismarine-nbt`
- Directory traversal protection on all file operations

### Backup System
- ZIP with archiver (level 9 compression), integrity verification
- Restore with automatic pre-restore safety backup
- Export/import portable backups, cleanup by age/size/count
- Scheduled backups (configurable interval, default every 15 min)

### Connection & Networking
- Connection Wizard with auto-detection for localhost, LAN, Playit.gg
- Minecraft protocol ping for live status verification
- Windows Firewall one-click rule add/remove via netsh
- Compatibility Manager with launcher-specific indicators

### Feedback & Issue Management
- Local-first: no GitHub account required, everything stored in SQLite
- 5 issue types with guided templates and automatic diagnostics collection
- Screenshot support, credential masking, offline queue with auto-retry
- Full lifecycle: Open → Pending → In Review → Resolved → Closed → Rejected
- Issue tracker integration: GitHub, GitLab, Jira, Custom
- Socket.IO real-time updates and Dashboard widget

### Guide & Knowledge Center
- 19 guides across 5 categories: Getting Started, Features, Troubleshooting, FAQ, Shortcuts
- Server-side search with relevance ranking across 12 article types
- Tip-of-the-day on Dashboard, Help button in sidebar footer

### Privacy, Security & Data Protection
- 8-tab Privacy & Security Center with AES-256-GCM credential encryption
- Machine-derived encryption key (no password needed, survives restarts)
- 6 credential slots (Discord, Playit, GitHub, GitLab, Jira, Issue Tracker)
- 10 feature permissions with per-feature toggles
- 7 security checks with scoring, full data export, audit log

### Update & Version Management
- Check, download, install, rollback with pre-update backups
- Rich release notes viewer, migration history tracking
- Data preservation verification across 11 user data categories
- Server-aware operations (warns if server is running)

### Uninstall & Restore
- Two uninstall modes: Keep Data (app binaries only) or Delete Everything
- Existing installation auto-detection with one-click restore
- Storage analysis with per-server breakdown

---

## Installation

### Requirements

| Component | Requirement |
|-----------|-------------|
| OS | Windows 10/11 (x64), macOS (Intel/Apple Silicon), Linux (x64) |
| RAM | 2 GB minimum (server RAM is configurable) |
| Storage | 500 MB for app + variable for servers/worlds |
| Java | 17+ (auto-detected; downloaded if missing) |

### Download

| Platform | Download |
|----------|----------|
| Windows 10/11 (x64) | [Download Installer](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Intel) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Apple Silicon) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| Linux | [Download AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js, no separate backend.

### Quick Start

1. **Install** the app using the installer for your platform
2. **Launch** MineControl OS
3. **Create a server** — Choose Paper, Fabric, NeoForge, or Vanilla
4. **Start** the server — The app downloads the server jar and configures everything
5. **Connect** — Open Minecraft and connect using the address shown in the app

---

## Architecture

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

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 28 |
| Frontend Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Charts | Recharts |
| Backend Framework | Express 4 + TypeScript |
| Real-time | Socket.IO 4 |
| Database | SQLite via better-sqlite3 |
| Minecraft Protocol | prismarine-nbt |
| Discord Integration | discord.js 14 |
| Encryption | AES-256-GCM (Node crypto) |
| Packaging | electron-builder 26 |

### Active Server Architecture

Starting in v1.0.52, the application uses a centralized **Active Server** model:

```
server/activeServer.ts (singleton EventEmitter)
       │
       ├── loaded from database on startup
       ├── setActive() — switch active server
       ├── clear() — unset active server
       ├── updateStatus() — persist state changes
       ├── getConfig() — full server configuration
       └── emits 'changed' event
```

**Frontend**: `ActiveServerContext` wraps the authenticated route tree, providing `server`, `servers`, `refresh()`, and `selectServer()` to all pages.

**Backend**: All 25 route modules access the active server through the `activeServer` singleton, with `socketManager.ts` bridging Socket.IO events for cross-module synchronization.

### Local Storage Model

All user data is stored in the platform-specific `userData` directory, separate from application binaries:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%/MineControl OS/` |
| macOS | `~/Library/Application Support/MineControl OS/` |
| Linux | `~/.config/MineControl OS/` |

```
userData/
├── data/
│   ├── minecontrol.db     # SQLite database (single source of truth)
│   └── cache/             # API response cache
├── servers/
│   └── <server-slug>/
│       ├── server.jar
│       ├── server.properties
│       ├── eula.txt
│       ├── ops.json / whitelist.json / banned-players.json / banned-ips.json / usercache.json
│       ├── plugins/
│       ├── worlds/
│       ├── backups/
│       ├── logs/
│       └── config/
├── downloads/              # Temporary download cache
├── java/                   # Auto-detected/installed JDKs
├── playit/                 # Playit.gg agent files
├── temp/                   # Temporary extraction directory
├── .uninstall/             # Uninstall state files
├── .restored/              # Restore detection marker
└── .install-stamp/         # Installation timestamp
```

---

## Authentication Modes

MineControl OS supports two authentication modes:

### Online Mode (Premium)
```json
{ "online-mode": true, "enforce-secure-profile": true }
```
- Official Minecraft Java: ✓ Ready
- TLauncher / Offline: ✗ Blocked

### Offline Mode (Private / LAN / Cracked)
```json
{ "online-mode": false, "enforce-secure-profile": false }
```
- Official Minecraft Java: ✓ Ready
- TLauncher / Offline: ✓ Ready

**Important:** Offline mode does not verify usernames — only use with trusted players.

---

## Development

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd Mine-Control
npm install
npm run dev
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development mode (frontend + backend) |
| `npm run build` | Build frontend + backend for production |
| `npm run build:desktop` | Build full desktop application |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |

### Repository Structure

```
MineControl-OS/
├── src/               # React frontend (28 pages, 29 routes, 255 API methods)
│   ├── components/    # Reusable UI components
│   ├── hooks/         # React hooks (useAuth, useSocket, useActiveServer, useNotifications)
│   ├── lib/           # API client library
│   ├── pages/         # 28 page components (29 routes)
│   ├── App.tsx        # Root component with routing
│   └── main.tsx       # Entry point
├── server/            # Express + Socket.IO backend (25 routes, 21 services)
│   ├── routes/        # 25 route modules
│   ├── services/      # 21 services (Minecraft, backup, discord, etc.)
│   ├── middleware/     # Auth middleware, async handler
│   ├── activeServer.ts # Centralized active server singleton
│   ├── database.ts    # SQLite v12 with full migration history
│   ├── paths.ts       # Data directory resolution
│   └── index.ts       # Server entry point
├── electron/          # Electron main process
│   ├── main.ts        # Window management, IPC, auto-updater, system tray
│   ├── preload.ts     # Context bridge (deduplicated IPC listeners)
│   └── migration.ts   # Data migration from legacy paths
├── build/             # Build resources
├── scripts/           # Utility shell scripts
├── tests/             # Test files (future use)
├── systemd/           # Linux systemd service files
├── .github/           # CI/CD workflows and issue templates
├── package.json       # App metadata and dependencies
├── electron-builder.yml  # Desktop packaging configuration
├── vite.config.ts     # Vite bundler configuration
├── tsconfig*.json     # TypeScript configurations (client, server, electron)
└── tailwind.config.js # Tailwind CSS configuration
```

---

## FAQ

**Q: Do I need port forwarding?**  
A: Not for localhost or LAN play. For internet play, use Playit.gg (no port forwarding required) or traditional port forwarding.

**Q: Which Minecraft versions are supported?**  
A: All versions supported by Paper, Fabric, NeoForge, or Vanilla (1.16.5 through latest). Versions fetched from official APIs.

**Q: Can I run multiple servers at once?**  
A: Only one at a time per MineControl OS instance. You can create multiple servers and switch between them.

**Q: Is my data safe during updates?**  
A: Yes. User data stores separately from application binaries in `%APPDATA%/MineControl OS`. Updates only replace application files.

**Q: How do I uninstall?**  
A: Go to the **Uninstall** page (or Settings → Danger Zone) for two options: **Keep Data** (app binaries only) or **Delete Everything** (servers, worlds, backups, preferences). Auto-detects previous installations with one-click restore.

**Q: Can I use this on Linux?**  
A: Yes — supported via AppImage and deb packages.

---

## Troubleshooting

### Server won't start
- Check Java 17+ is installed
- Check port 25565 is not in use
- Check the Console tab for error messages
- Use the Compatibility Checker to validate settings

### Can't connect from another computer
- Verify server is running (Dashboard shows green "Online")
- Check Connection tab for correct LAN IP
- Ensure Windows Firewall allows port 25565
- Try `localhost:25565` on the hosting machine first

### Update check fails
- Requires internet access to reach GitHub
- If GitHub is unreachable, download manually from the [Releases page](https://github.com/Harsha240105/Mine-Control/releases)
- Auto-updater only checks releases with installer assets (`.exe`, `.dmg`, `.AppImage`)

### Data not persisting
- Verify data exists in `%APPDATA%/MineControl OS/` (Windows) or `~/Library/Application Support/MineControl OS/` (macOS)
- The database is never deleted or recreated during updates

---

## Persistence Model

| Data | Storage |
|------|---------|
| Servers | `servers` table |
| Active server | `server_config` + `activeServer.ts` singleton |
| Settings | `server_config` table |
| Players | `players` table |
| Worlds | `worlds` table + filesystem |
| Plugins/Mods/Shaders/Packs | table + filesystem |
| Backups | `backups` table + ZIP files |
| Console history | `logs/` on disk |
| Chat logs | `chat_log` table |
| UI state | `ui_state` table + localStorage |
| Feedback | `feedback_tickets` table |
| Schedules | `schedules` table |
| Notifications | `notifications` table |
| Audit log | `audit_log` table |
| System stats | `system_stats` table |
| Discord/Playit config | `server_config` table |
| Uninstall history | `uninstall_history` table |
| Restore detection | `restore_detection` table |
| Guide/Privacy/Update prefs | Dedicated schema tables (v9–v12) |

All data survives application restarts, software updates, and (where applicable) power failure recovery.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
