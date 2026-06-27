# 🎮 Mine-Control OS

An automated, local desktop management ecosystem for Minecraft server runtimes, featuring an Aternos-inspired management workflow.

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases">
    <img src="https://img.shields.io/badge/Latest_v1.0.40-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release"/>
  </a>
</p>

---

## 📊 Project Completion Summary
*This section is dynamically updated by the development team after every feature sprint.*

* **Overall Progress:** 94% Completed
* **Current Sprint Phase:** Phase 3 (Core Stabilization & UX Overhaul)
* **Target Deadline:** July 10, 2026
* **Last Updated:** June 27, 2026

### ✅ Completed Features
- [x] Initial Electron window configuration wrapper.
- [x] Base Node.js Express server framework setup.
- [x] Server creation dashboard overhauled into a multi-step Aternos-style wizard.
- [x] The Ghost Server Bug fixed: Database now populates and triggers a state update via real API calls.
- [x] Deletion Constraint Fault fixed: SQLite `ON DELETE CASCADE` applied.
- [x] **Zero-State Server Fix**: Dashboard dynamically redirects to wizard when zero servers are present.
- [x] **Dynamic Version APIs**: Replaced mock data with real-time Mojang/PaperMC API version fetching.
- [x] **CRUD Capabilities UI**: Settings tab now supports renaming, online-mode premium toggles, and deletion.
- [x] **Scheduler Crash Patch**: Fixed fatal UI crash during scheduler unboxing.
- [x] **Deep Player Analytics**: Engine to parse `.dat` and `.json` files for rich user analytics and player inventory tracking.
- [x] **Aternos Dashboard Overhaul**: Live animated Speedometers for hardware metrics and a Connected Players panel.
- [x] **Safe App Environment Fix**: Resolved unhandled `ReferenceError: Cpu is not defined` crash on launch. Implemented `ErrorBoundary` for application-wide crash resilience and updated software tab data maps to resolve `mojangVersions` errors.

### ⏳ Current Focus / Active Task
- Cross-platform testing for Electron builds and auto-updater.
- Plugin marketplace integration with Hangar and Modrinth.

### ❌ Known Bugs & Active Blockers
*(No active blockers! Backend communication, Socket.IO, route ordering, and Playit.gg tunnel UX fixed in v1.0.40.)*

---

## 🛠 Target Core Architecture

### 1. Frontend Layer
- **Framework:** React 18, TypeScript, Vite, Tailwind CSS
- **State Management:** Isolated Context Providers for Socket connections and telemetry tracking.

### 2. Backend Layer
- **Runtime:** Node.js, Express, Socket.IO
- **Database:** SQLite via `better-sqlite3` (Prepared statements enforced)
- **Process Lifecycle:** Native `child_process.spawn` for intercepting PaperMC, Fabric, and Forge jar streams.

### 3. Desktop Application Environment
- **Container:** Electron 28 with strict `contextIsolation: true` and secure whitelisted IPC preload bridges.
- **Resource Boundary:** Configured for low-overhead operation to guarantee stable development testing alongside heavy local Java instances.

---

## 📥 Download

Latest version: **v1.0.40** — [Auto-updates from within the app]

| Platform | Download |
|----------|----------|
| Windows 10/11 (x64) | [Download Installer](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Intel) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Apple Silicon) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| Linux | [Download AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js, no separate backend. **Install and run.**

---

## 🚀 Features

### v1.0.24 — New in this release
- **Missing Dependencies Fix** — Properly saved `prismarine-nbt` and `react-gauge-chart` to package.json to resolve Rollup build failures on GitHub Actions runner.
- **TypeScript Build Fixes** — Resolved strict compilation errors preventing successful production builds of the backend analytics server.
- **CI Build Fix** — Downgraded Node.js to v20 LTS in GitHub Actions to fix better-sqlite3 native build failures during app packaging.
- **Deep Player Analytics Engine** — Extracts and visualizes raw NBT (`.dat`) and `.json` player data into a clean UI (Inventory, Health, Location, Statistics).
- **Speedometer Dashboard** — An Aternos-style hardware UI overhaul replacing standard charts with elegant animated gauges and a live Connected Players panel.
- **Robust Server Deletion** — Re-engineered database relations with `ON DELETE CASCADE` preventing any UI ghosting or database lock crashes.

### v1.0.19 — Previous release
- **Massive UX Overhaul** — Entire creation flow was redesigned to mirror Aternos-style wizards with centralized creation/import points.
- **Critical Bug Fixes** — Fixed the "Ghost Server" bug where created servers didn't show up in the UI, and the server deletion constraints bug by adding ON DELETE CASCADE cascades to the SQLite database.
- **Settings Menu Purge** — Removed Version Selection and Connection Mode from Settings, shifting these configurations natively into the Creation Wizard.
- **Task Scheduler** — Automate server commands, backups, and state changes with a full `node-cron` system and a dedicated UI tab.
- **Modrinth Marketplace Integration** — Search, browse, and install server plugins directly from Modrinth within the app.
- **Java Runtime Detector** — Automatically scans your system (Windows/macOS/Linux) to find and list all installed Java versions.
- **Aikar's JVM Flags** — Automatically applies highly optimized garbage collection flags for maximum performance on Paper and Purpur servers.
- **In-App Notifications** — Real-time event notifications (player joins, crashes, backups) stored in a new database-backed panel.
- **Release & Documentation Refresh** — All version strings, badges, and docs aligned to v1.0.24.
- **CI/CD Ready** — GitHub Actions `release.yml` automatically builds Windows, macOS, and Linux binaries on every new tag.

### Server Control
- **Start / Stop / Restart** — One-click server control from the Dashboard.
- **Auto-restart on crash** — Automatically recovers from crashes (max 3 attempts).
- **Port conflict detection** — Auto-detects if port 25565 is in use and kills orphaned Java processes.
- **EULA auto-accept** — Accepts Minecraft EULA automatically.
- **Java pre-check** — Validates Java installation before starting.
- **Version auto-download** — Switch PaperMC versions without manual downloads.
- **Multi-server library** — Create, switch between, and delete multiple server instances.

### Player Management
- **Role-based access** — Owner / Admin / Moderator / Trusted Member / Member / Guest.
- **Player tracking** — Online/offline status, join/leave history, real-time coordinates.
- **Ban / Kick / Mute / Temp-Ban** — Full moderation toolkit.
- **Whitelist** — Control who can join.
- **Chat log** — Message history with search.

### Connection Modes
- **Cracked Mode** — TLauncher / any launcher, no Mojang account needed.
- **Premium Mode** — Official Minecraft accounts only.
- **Playit.gg Tunnel** — No port forwarding required. Works behind CGNAT.
- **Switch with one click** — Toggle in Settings, restart server.

### Monitoring
- **Live Dashboard** — CPU, RAM (MC + System), TPS, Disk, Player count.
- **30-min charts** — System resources and performance trends.
- **Real-time Console** — See server output as it happens.
- **Real-Time Player Cards** — Username, world, coordinates, health, ping, gamemode.
- **Live Events Feed** — Join, leave, death, and chat events.

### World Management
- **Create worlds** — Custom seed, gamemode, difficulty.
- **Clone worlds** — Duplicate existing worlds.
- **Download / Upload** — Transfer worlds as `.zip` files.
- **World seed setting** — Configure in Settings.

### Backups
- **Local-only** — All backups stored on your machine (no cloud).
- **Auto-backup** — Configurable interval (default: every hour).
- **Manual backup** — One-click backup creation.
- **Restore** — Roll back to any backup point.
- **Encryption** — Optional backup encryption.

### Plugins
- **One-click install** — Quick-install popular plugins (LuckPerms, EssentialsX, WorldEdit, Vault, etc.).
- **Custom install** — Add any plugin by URL or `.jar` file.
- **Enable / Disable** — Toggle plugins without removing them.

### Desktop App
- **Installable** — Windows, macOS, Linux native builds.
- **Auto-update** — App updates itself from GitHub releases.
- **System tray** — Minimize to tray, background operation.

### Security
- **JWT authentication** — Token-based login.
- **Role-based permissions** — Granular access control.
- **Password management** — Change your password from Settings.
- **Audit log** — Track all admin actions.

---

## 🎮 How to Connect

### You (on the same laptop):
1. Launch the app → click **Start Server**.
2. Wait for the server to be **Online**.
3. Open **Minecraft** → **Multiplayer** → **Add Server**.
4. Address: **`localhost:25565`**
5. Click **Join Server**.

### Friend via Playit.gg (Recommended - No Port Forwarding):
1. Go to **Connection** tab in MineControl OS.
2. Set up Playit.gg tunnel (see Settings).
3. Share your Playit.gg DNS address (e.g. `minecontrol.playit.gg`).
4. Friend connects using that address — no router configuration needed.
5. Works even if your ISP uses CGNAT (Jio, Airtel, BSNL).

### Friend via Public IP (Requires Port Forwarding):
1. Share your **Public IP** from the Connection page.
2. Set up port forwarding on your router: TCP 25565 → your laptop.
3. Friend connects using your public IP.

### Same WiFi (LAN):
- No port forwarding needed.
- Friends connect using your **LAN IP** shown on the Connection page.

---

## ⚙️ Configuration

| Setting | Location | Description |
|---------|----------|-------------|
| Server Version | Settings | Paper 1.20.1 through latest |
| Playit.gg Token | Settings | Tunnel token from playit.gg |
| Playit.gg DNS | Settings | Your custom tunnel address |
| Server Name (MOTD) | Settings | Message shown in server list |
| Connection Mode | Settings | Cracked / Premium / Playit.gg |
| World Seed | Settings | Seed for new world generation |
| Max Players | Settings | Player slot limit |
| Difficulty | Settings | Peaceful / Easy / Normal / Hard |
| Gamemode | Settings | Survival / Creative / Adventure / Spectator |
| PvP | Settings | Toggle player combat |
| Server Port | Settings | Default: 25565 |
| View Distance | Settings | Chunks loaded per player |
| Min / Max RAM | Settings | Java heap allocation |
| Whitelist | Settings | Only allowed players can join |
| Auto Backup | Settings | Automatic world backups |
| Map Plugin | Settings | BlueMap / Dynmap configuration |

---

## 🛠 Dev Quick Start

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd Mine-Control
npm install
npm run dev
```

### Default Login
| Username | Password |
|----------|----------|
| `owner` | `OXK@6126` |

### Access
- **Web UI:** http://localhost:5173 (dev) or http://localhost:3001 (production)
- **API:** http://localhost:3001/api
- **Minecraft Server:** `localhost:25565`

---

## 🏗 Project Structure

```
Mine-Control/
├── .github/workflows/   # CI/CD release pipeline
├── electron/            # Electron desktop app
│   ├── main.ts          # Main process (window, tray, menus, auto-updater)
│   └── preload.ts       # Context bridge for IPC
├── server/              # Express.js backend
│   ├── index.ts         # Entry point (Express + Socket.IO)
│   ├── routes/          # API route handlers
│   │   ├── auth.ts      # Login, password change
│   │   ├── server.ts    # Status, start/stop, config, versions, diagnostics, connection, events
│   │   ├── players.ts   # Player management, roles, whitelist
│   │   ├── worlds.ts    # World CRUD, clone, download/upload
│   │   ├── plugins.ts   # Plugin management
│   │   ├── backup.ts    # Backup create/restore/delete
│   │   ├── claims.ts    # Land claim system
│   │   ├── builds.ts    # Build tagging system
│   │   └── github.ts    # Bug reports & feature requests
│   ├── services/
│   │   ├── minecraftServer.ts  # Java process manager, version management, diagnostics
│   │   └── backup.ts           # Backup engine
│   ├── middleware/
│   │   └── auth.ts      # JWT + role-based permissions
│   ├── database.ts      # SQLite schema + seed
│   └── paths.ts         # Path resolution helpers
├── src/                 # React frontend
│   ├── pages/           # Route-level page components
│   │   ├── Dashboard.tsx
│   │   ├── Connection.tsx
│   │   ├── Console.tsx
│   │   ├── Players.tsx
│   │   ├── Worlds.tsx
│   │   ├── MapView.tsx
│   │   ├── Plugins.tsx
│   │   ├── Backups.tsx
│   │   ├── Diagnostics.tsx
│   │   ├── Guide.tsx
│   │   ├── GitHub.tsx
│   │   ├── Settings.tsx
│   │   ├── Servers.tsx
│   │   ├── Compatibility.tsx
│   │   └── Import.tsx
│   ├── components/      # Reusable components
│   │   ├── Layout.tsx
│   │   ├── UpdateBanner.tsx
│   │   └── NotificationPanel.tsx
│   ├── hooks/           # React hooks + contexts
│   │   ├── useAuth.tsx
│   │   ├── useSocket.ts
│   │   └── useNotifications.ts
│   └── lib/
│       └── api.ts       # Typed API client
├── minecraft/           # Server runtime directory
│   ├── server.jar       # PaperMC (version selectable)
│   ├── plugins/         # Server plugins
│   ├── worlds/          # World data
│   ├── backups/         # Local backups
│   └── logs/            # Server logs
├── package.json         # Root package + npm scripts
├── electron-builder.yml # Packaging config
├── tailwind.config.js   # Tailwind theme
└── README.md            # This file
```

---

## 📡 API Overview

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/auth/login` | None | Login, get JWT |
| GET | `/api/server/status` | auth | Status + system resources |
| POST | `/api/server/start` | server.start | Start Minecraft server |
| POST | `/api/server/stop` | server.stop | Stop server |
| POST | `/api/server/restart` | server.restart | Restart server |
| GET | `/api/server/versions` | auth | List available PaperMC versions |
| POST | `/api/server/version` | server.start | Download and switch Paper version |
| POST | `/api/server/gamemode` | server.start | Switch survival/creative/adventure/spectator |
| GET | `/api/server/connection` | auth | Local, LAN, Public IP, Playit.gg info |
| GET | `/api/server/diagnostics` | auth | Firewall, port binding, CGNAT checks |
| POST | `/api/server/health-check` | auth | Full connectivity test |
| GET | `/api/server/properties` | auth | Read server.properties |
| PUT | `/api/server/properties` | server.start | Update server.properties |
| GET | `/api/server/config` | auth | Read app config (SQLite) |
| PUT | `/api/server/config` | server.start | Update app config |
| POST | `/api/server/command` | console.send | Send console command |
| GET | `/api/server/logs` | console.read | Get server logs |
| GET | `/api/players` | auth | List all players |
| GET | `/api/backups` | auth | List backups |
| GET | `/api/plugins` | auth | List plugins |
| GET | `/api/worlds` | auth | List worlds |
| GET | `/api/claims` | auth | List land claims |
| POST | `/api/claims` | world.manage | Create a claim |
| DELETE | `/api/claims/:id` | world.manage | Delete a claim |
| GET | `/api/builds` | auth | List build tags |
| POST | `/api/builds` | auth | Create a build tag |
| DELETE | `/api/builds/:id` | world.manage | Delete a build tag |
| POST | `/api/github/bug-report` | auth | Submit bug report |
| POST | `/api/github/feature-request` | auth | Submit feature request |
| GET | `/api/github/issues` | auth | List all reports |

---

## 🧩 One-Click Plugins

Available from the Plugins page:
- **LuckPerms** — Advanced permissions
- **EssentialsX** — Essential commands
- **WorldEdit** — In-game world editing
- **Vault** — Economy/permissions API
- **ClearLag** — Lag reduction
- **CoreProtect** — Block logging and rollback
- **BlueMap** — 3D world map viewer
- **Dynmap** — Google-maps-style world map

---

## 🔄 Auto-Update

The app checks GitHub for new releases on startup. When an update is found:
1. A banner appears: "Update vX.X.X available".
2. Click **Download** → progress bar appears.
3. Click **Restart & Update** → app installs and relaunches.
4. No manual uninstall/reinstall needed.

---

## 📋 Release History

### v1.0.40 — Backend Communication Repair
- **Fixed `/api/players/banned` returning 404** — Route ordering bug fixed: moved `/banned`, `/chat`, and `/roles` routes before the `/:id` catch-all route in `players.ts`. Also added missing `temp-ban` route.
- **Socket.IO Reconnection & Error Handling** — Frontend `useSocket` hook now logs connection errors, implements exponential backoff reconnection, and exposes error state. Server-side Socket.IO now logs engine errors and emits `players:update`, `server:update`, and `console:update` events.
- **Fixed Playit.gg Tunnel Click-Jacking** — Removed click-to-toggle from the entire Playit.gg card, keeping toggle only on the chevron button. Added `stopPropagation` on the config panel so clicking input fields or Save button no longer closes the panel.
- **Fixed Plugins Marketplace Search** — Fixed response destructuring bug where `{ data }` was expected but Modrinth API returns `{ hits }`.
- **API Request Timeouts** — Added 15-second AbortController timeout to all API requests to prevent infinite loading states.
- **Backend Stability** — Socket.IO server now properly handles connection errors with logging. Added `players:update` and `server:update` socket events for real-time telemetry.
- **Dashboard Error State** — Dashboard now shows a clear "Backend Unavailable" message with retry button when server cannot be reached, instead of infinite spinner.
- **Updated documentation and version badges** for v1.0.40 release.

### v1.0.38
- **Complete State Machine Rewrite** — The Minecraft server process manager (`minecraftServer.ts`) has been fully rewritten with a proper 5-state lifecycle (`STOPPED → STARTING → RUNNING → STOPPING → STOPPED`, with `FAILED` for error states). All old boolean `this.running`/`this.starting` flags have been removed. State transitions are now atomic, emit `server:state` events via Socket.IO, and are reflected in real-time on the Dashboard.
- **Automatic Java Runtime Resolution** — `resolveJava()` scans the server jar's `.class` files to determine the required Java version, then checks the configured path. If it's absent or too old, it auto-selects a compatible JDK from all installed runtimes (via `JavaDetector.scan()`). If none is found, the error message lists every installed JDK with versions and direct download links.
- **Pre-Flight Validation Before Starting** — `validatePreFlight()` checks jar existence (with download-in-progress wait), EULA auto-accept, and port availability (with auto-kill of orphaned Java processes) **before** the server enters the STARTING state. This ensures the Dashboard never gets stuck at "Starting..." when validation fails.
- **Dashboard Handles All States** — The status indicator now shows the correct color and text for all 5 states: green "Online" (running), yellow pulsing "Starting..." / "Stopping...", red "Failed", and gray "Offline". The Dashboard subscribes to `server:state` Socket.IO events for instant UI updates.
- **Child Process Error Handling** — When the Java process exits with a non-zero code, the state transitions to `FAILED` and the error message is captured. Crash logs are preserved. The close handler correctly defers to a graceful `stop()` when already in the STOPPING state, preventing race conditions.
- **Server Status API Enhancement** — The `/api/server/status` endpoint now includes the `state` field (one of `stopped`, `starting`, `running`, `stopping`, `failed`) alongside the existing `running`/`starting` booleans, enabling the frontend to distinguish between "stopped", "failed", and other states.
- **Fixed Dashboard crash on null status** — When `/api/server/status` returns a 500 error (e.g., broken `require` path for package.json), the Dashboard no longer crashes with `Cannot read properties of null (reading 'onlinePlayers')`. Added a null-status guard that shows "Unable to connect to server. Retrying..." instead of crashing. All null guards changed from `!== null` (which fails for `undefined`) to `!= null` (which catches both).
- **Fixed production `package.json` path resolution** — The `/api/server/status` endpoint used `require('../../package.json')` which resolves to `dist/package.json` in the production ASAR bundle, causing a 500 error. Added a try-catch fallback chain that works in both development (`tsx watch`) and production (Electron ASAR) environments.
- **Null-safe Dashboard rendering** — All computed values (`cpuPercent`, `ramPercent`, `sysRamPercent`, `diskPercent`) now use optional chaining with `??` fallbacks, so they never crash when `status` is `null` or partially initialized.

### v1.0.36
- **Automatic Java Version Detection** — `minecraftServer.start()` now scans all installed JDKs via `JavaDetector.scan()` when the configured Java is too old. If the server jar requires Java 25+ (class version 69.0) but the default `java` on PATH is only Java 21, MineControl will automatically find a compatible JDK among installed runtimes and use it. If none is found, the error message lists every installed JDK with versions and provides direct download links.
- **Dashboard "Connecting..." State** — Dashboard now shows a spinner with "Connecting to server..." on initial load, instead of immediately rendering placeholder values. Once the first `/api/server/status` response arrives, real data is shown. If an error occurs during startup, the RepairFlow appears immediately.
- **Error Propagation Fix** — `POST /api/server/start` now awaits the `minecraftServer.start()` promise directly, so pre-check failures (missing jar, incompatible Java) return an HTTP 400 with the error message instead of being silently swallowed by `catch()`. Combined with the Socket.IO `server:error` handler fix, start errors always reach the frontend.
- **Socket.IO Error Handler Fix** — The Dashboard's `server:error` listener no longer filters out errors when `status.starting` is true. Start-time errors (Java mismatch, port conflicts) now display the RepairFlow instead of being hidden.
- **Enhanced Diagnostics** — The `/api/server/diagnostics` endpoint now runs `JavaDetector.scan()` to list all installed JDKs, compares their versions against the required Java version detected from the server jar's class files, and reports exactly which version is needed vs. what's available. The health-check endpoint also reports detailed Java status.
- **useSocket Hook Enhancement** — The `useSocket` hook now exposes an `on<T>(event, handler)` method that returns an unsubscribe function, enabling cleaner subscription management in components.
- **Null-Safe Dashboard Rendering** — Replaced all `||` fallback operators (which masked null/offline values) with `??` nullish coalescing, ensuring the Dashboard never shows "20.0 TPS", "0 GB RAM", or "0/4 players" when the server is offline.

### v1.0.35
- **Atomic Server Provisioning** — Server creation now downloads the jar BEFORE creating the database record. If the download fails, no orphaned server record is created and the directory is cleaned up. The wizard sends all data in a single API call.
- **Forge 404 Fix** — Forge download now returns "This Forge version is unavailable. Choose another version." when a version has no matching build in the Forge API, instead of a cryptic error.
- **Dashboard Offline State** — Dashboard now shows "Server Offline" / "Not yet started" instead of fake zero values for CPU, RAM, TPS, and Players when the server is not running. The version display shows "Not configured" when no version is selected.
- **Global JSON Error Handler** — Added JSON parse error middleware for malformed request bodies and an API 404 handler that returns `application/json` for unknown API routes. Existing global error handler now respects `err.status` for proper HTTP status codes.
- **Software Installation Badges** — Software page now shows granular badges per version: "Active" (currently in use), "Downloaded" (on disk but not active), and "Install" button. Software type cards show "Active", "Downloaded", "Not Installed", or "Popular" as appropriate.
- **Plugin Install Progress** — Plugin install buttons now show a spinner and "Downloading..." text during installation, with disabled state to prevent duplicate clicks. Works for both popular plugins and Modrinth marketplace.
- **Plugin Directory Resolution** — Fixed `plugins.ts` to resolve the plugins directory at request time instead of module load time, ensuring plugins are always installed to the correct server directory when switching between servers.
- **Expanded Diagnostics** — Added 8 new diagnostic checks: World Data, server.properties, Disk Space, Java Memory, Folder Permissions, Download Cache, Minecraft Version, and Server Software Type detection. All checks now include detailed messages.
- **Download Service Refactor** — Extracted all download functions into a shared `server/services/download.ts` module, eliminating code duplication between `server.ts` and `servers.ts`. The module exports type-safe functions for Paper, Fabric, Purpur, Forge, and Vanilla downloads.
- **Startup Jar Validation** — Improved `minecraftServer.start()` error message to show the exact missing jar filename and suggest running a Repair or downloading from the Software page, instead of hardcoding "PaperMC server jar".

### v1.0.34
- **Dashboard Live Stats Reliability** — Fixed CPU seeding to use a 100ms delay (not same-tick) so the first dashboard load shows real CPU, not NaN. Removed outer try-catch that silently killed all stats. Switched disk detection from deprecated `wmic` to PowerShell `Get-CimInstance`. Changed `\|\|` to `??` for CPU fallback to preserve legitimate zero values.
- **Plugin Download Fixes** — Replaced Safe Sources external links (`<a target="_blank">`) with info cards so users stop downloading plugins to their browser's Downloads folder. Fixed the Modrinth Marketplace "View / Install" button to actually download via the backend API. Fixed hardcoded "60s" timeout message to show the actual 120s timeout.
- **Settings Save Reliability** — `handleSave()` no longer fails entirely when `server.properties` doesn't exist (pre-first-start state); gracefully skips the properties write instead. Button text changed from "Save & Restart Server" to "Save Settings".
- **viewDistance Persistence** — `getConfig()` now returns `viewDistance` from the database, so the Settings page loads your saved value instead of always falling back to 10.
- **Java Version Detection** — `detectRequiredJava()` now scans ALL `.class` files in the jar and returns the highest class version, catching Fabric bundles where the main class is Java 21-compatible but `net/minecraft/bundler/Main` requires Java 25.
- **Wizard Download Errors** — The silent `catch {}` around the server jar download in the wizard now shows an error toast when the download fails, instead of silently showing "Server Ready!" with no jar.
- **Dashboard Software Badge** — Dashboard now shows the software source (Paper, Fabric, Purpur, etc.) alongside the Minecraft version in the connection info section.
- **Multi-Server Management** — Server cards on the Servers page now have a delete button for quick deletion. The server list dropdown in the sidebar already supports switching between servers.

### v1.0.33
- **Java Version Validation** — Server jar is now scanned for its class file version before starting. If the jar requires a newer Java (e.g. Java 25+ for Minecraft 1.21.11), a clear error is shown with the required version and a download link to Adoptium.
- **Plugin Download Fix** — Fixed variable shadowing bug where the `https.get` callback parameter shadowed the Express response object, causing plugin downloads to silently fail and hang the frontend.
- **Dashboard Server Name** — Dashboard now shows the wizard-configured server name even before the first server start, falling back to the `servers` database table when the runtime config is empty.
- **Dashboard CPU on First Load** — Seeded the CPU stats baseline so the Dashboard shows real CPU usage on the very first page load, instead of 0% until the 5-second tick fires.
- **Fabric Version Filtering** — Fabric version list now only shows Minecraft game versions (e.g. 1.21.11), excluding Fabric Loader version entries (e.g. 26.2) that were previously mixed in.
- **Fabric Download Reliability** — Changed Fabric download to use the game-version-specific loader endpoint, ensuring the installed loader is compatible with the selected Minecraft version.
- **View Distance Cap Raised** — Settings view distance input now supports values up to 128 (was capped at 32).
- **Discord Field Cleanup** — Removed the spurious Voice Chat Invite Link field from Discord settings, leaving only Bot Token, Chat Channel ID, and Voice Channel ID.

### v1.0.32
- **Wizard Version Filtering** — Server creation wizard now correctly filters versions by selected software type (Paper, Fabric, Purpur, Forge, Vanilla, etc.) instead of showing all versions regardless of selection.
- **Live Dashboard Telemetry** — Dashboard now shows live CPU usage from `os.cpus()` even when the Minecraft server is offline, eliminating 0% CPU / 0GB RAM / 0GB DISK readings.
- **Auto-Download on Creation** — Server jar is now automatically downloaded immediately after the wizard creates a server, eliminating the "Server jar not found" error on first start.
- **Discord Voice Channel ID** — Added separate Voice Channel ID field alongside Chat Channel ID in Discord settings, enabling independent chat and voice channel configuration.
- **Download Timeout Increased** — Increased download timeout from 60s to 120s for server jars and plugins, preventing timeout failures on slow connections.
- **Path Import Cleanup** — Replaced dynamic `require('path')` calls with static imports in server creation route.

### v1.0.31
- **Path Resolution Fix** — Fixed `resolveMinecraftDir()` to prefer the active server directory over the `MINECRAFT_DIR` env var, resolving the "Server jar not found" error when starting servers on Windows.
- **Forge Download Support** — Added `downloadForgeVersion()` handler for automatic Forge server jar downloads via the Forge maven repository.
- **Software Catalog Unlocked** — All software types (NeoForge, Quilt, Bedrock, Pocketmine-MP) are now enabled and ready for selection, removing all "Coming Soon" placeholders.
- **Plugin Download Reliability** — Fixed Modrinth plugin version selection to prefer `release` type versions over potentially unstable builds.
- **Dashboard Telemetry** — Added Windows disk usage fallback via `wmic` when `systeminformation` fails, ensuring dashboard shows live hardware specs (CPU, RAM, DISK) without zeros.
- **Version Source Mapping** — Fixed `/api/server/version` to correctly save the software source name (PaperMC, Fabric, Purpur, Forge, Mojang) instead of always defaulting to "PaperMC" or "Mojang".

### v1.0.17
- **Import Existing Server UI** — Easily import existing Minecraft servers from ZIP files or uncompressed folders.
- **GitHub Release Automation** — Full CI/CD pipeline with GitHub Actions for Windows, macOS, and Linux builds.
- **In-App Auto-Updater UI** — One-click update installation.
- **Beginner's Guide Tab** — Step-by-step guide covering start server, versions, plugins, map, connection, and modes.
- **GitHub Community Hub** — Submit bug reports and feature requests from within the app.
- **Land Claim System** — Track player claims and boundaries.
- **Build Tagging System** — Tag buildings and locations (house, base, farm, spawn, shop).
- **Live World Map Tab** — Embedded BlueMap/Dynmap viewer.
- **Server Diagnostics Tab** — Configuration checks, port binding analysis, CGNAT detection.
- **Connection Manager Tab** — Localhost, LAN, Public IP, and Playit.gg addresses.
- **Game Mode Quick Switch** — Survival / Creative / Adventure / Spectator toggles.
- **Minecraft Version Selector** — PaperMC versions from 1.20.1 through latest.
- **Codebase Cleanup** — Removed stale duplicate directories.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express, Socket.IO |
| Database | SQLite (better-sqlite3) |
| Desktop | Electron 28, electron-builder, electron-updater |
| Minecraft | PaperMC (version selectable: 1.20.1 - latest) |
| Tunneling | Playit.gg |
| World Maps | BlueMap / Dynmap |

---

## 📄 Specification

For the full Software Requirements Specification and Product Requirements Document, see [`SPECIFICATION-v1.0.17.md`](./SPECIFICATION-v1.0.17.md).

---

## License

MIT

---

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20from%20GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/>
  </a>
  <br/>
  <sub>100% Free. No paid tiers. No subscriptions. Self-hosted on your hardware.</sub>
</p>

## Changelog

### v1.0.25
- **Bug Fixes**: Fixed jar download race condition, resolved plugin download 404s, synchronized dashboard server name, and optimized background performance.
- **New Features**: Added Aternos-style Software tab for seamless version hot-swapping.
- **Discord Integration**: Complete integration to sync game chat, logs, and events to Discord.

### v1.0.26
- **Hotfix**: Fixed global React Error Boundary and Discord Bot safe initialization to prevent black screens.

### v1.0.27
- **Deadlock Fixes**: Resolved infinite loading on login and async execution of server start to prevent Express hangs.
- **Performance**: Optimized dashboard gauges with React.memo() to prevent full-app UI lag.
- **Software**: Fabric metadata parsing integrated into the backend versions API.
- **UI**: Added Import Server button and dynamic app version display.

### v1.0.29
- **Stability**: Refactored server launch sequence with strict Java 21+, Port availability, and EULA validations.
- **Repair Flow**: Introduced a dedicated UI to seamlessly handle and resolve startup errors (RepairFlow).
- **Discord Settings**: Added dedicated Discord configuration UI for easily modifying the bot token and channel ID.
- **Forge Integration**: Expanded server software versions to fetch and support Forge dynamically.
- **Import Scanning**: Import flow now scans existing files to automatically detect `server.properties` and EULA acceptance.
- **Reliability**: Implemented magic-byte verification on downloads to prevent JAR corruption, and added timeout fallbacks.

### v1.0.30
- **Modrinth Transition**: Replaced broken Hangar endpoints with Modrinth API for seamless plugin downloads.
- **UI Optimization**: Memoized the Dashboard telemetry pipeline to eliminate lag spikes during continuous updates.
- **Discord Voice Link**: Added Discord Voice Invite Link appending to Server Start messages.
- **Purpur & Expanded Catalog**: Fully integrated Purpur API fetching and prepared placeholders for Bedrock, Pocketmine, NeoForge, and Quilt.
- **Portable Executable Pathing**: Fixed roaming AppData issue by forcing the server structure directly into the executable installation path.

### v1.0.32
- **Wizard Version Filtering**: Wizard now filters versions by selected software type.
- **Live Dashboard Telemetry**: CPU/RAM/DISK now show live OS stats when server is offline.
- **Auto-Download on Creation**: Server jar auto-downloaded after wizard finishes.
- **Discord Voice Channel ID**: Added separate voice channel ID field in Discord settings.
- **Download Timeout Increased**: 60s → 120s for jars and plugins.

### v1.0.31
- **Path Resolution Fix**: Fixed resolveMinecraftDir() to prefer the active server directory, fixing "Server jar not found" errors.
- **Forge Download Support**: Added downloadForgeVersion() for automatic Forge server jar downloads.
- **Software Catalog Unlocked**: All software types enabled (NeoForge, Quilt, Bedrock, Pocketmine-MP), no more "Coming Soon".
- **Plugin Download Reliability**: Modrinth version selection now prefers release builds.
- **Dashboard Telemetry**: Windows disk fallback via wmic when systeminformation fails; no more zeros.
- **Version Source Mapping**: /api/server/version correctly saves the software source name.
