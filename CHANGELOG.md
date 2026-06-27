# Changelog

All notable changes to MineControl OS are documented here.

---

## v1.0.47 — Repository Organization & Universal Java Launcher Compatibility

- Repository restructured with standard open-source files: LICENSE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- Added GitHub issue templates (bug report, feature request) and pull request template
- Cleaned up unused files: removed old specs, temp task files, unused test scripts, IDE settings
- Removed 110 unused npm packages including `@react-three/drei`, `chokidar`, `express-rate-limit`, `systeminformation`, and others
- README completely rewritten with comprehensive sections: features, installation, connection modes, authentication modes, FAQ, troubleshooting, architecture, and roadmap
- Launcher Compatibility section added to Compatibility Manager showing which launchers work in each join mode
- Updated auto-updater error handling with contextual messages for network errors, rate limiting, and missing assets
- Added `GH_TOKEN` support from env var or config file for authenticated GitHub API access

## v1.0.46 — Persistent Data Architecture & Safe Update System

- Data directory separation: app binaries and user data now stored separately (userData = AppData/Roaming/MineControl OS)
- Automatic migration from old install-dir data to persistent userData directory
- Safe schema migrations via schema_version table, never recreates DB
- Auto-updater backs up minecontrol.db + settings.json before each update
- Two-mode uninstall: app-only preserves all data, complete removal wipes everything
- electron-builder configured with `deleteAppDataOnUninstall: false`
- Settings page: Uninstall App and Complete Removal buttons in Danger Zone

## v1.0.45 — Local Data Persistence & Storage

- UI State Persistence Engine with `ui_state` database table and `/api/ui/state` endpoints
- Last active page restoration on login (saves to localStorage + server)
- Sidebar collapsed/expanded state persists in localStorage
- Console filter level and auto-scroll preference persist in localStorage
- Server state persisted to database on every transition; auto-reset to stopped on restart

## v1.0.44 — Universal Multiplayer Connection System

- Connection Wizard Page with auto-detection of all connection methods
- Connection Manager redesigned with three scenario tabs
- Auto-Detection Engine for local/LAN/public IP/Playit tunnel/firewall status
- Minecraft Server Status Ping via real protocol handshake
- Comprehensive Server Validation endpoint
- Dashboard connection mode indicator with quality dot

## v1.0.43 — Server Connectivity Fix & Windows Firewall Auto-Configuration

- Dynamic `enforce-secure-profile` synced with `online-mode`
- Offline mode toggle sync via Compatibility Manager
- Server settings API now writes `enforce-secure-profile`
- Windows Firewall auto-configuration with one-click rule addition
- Misconfiguration warning for mismatched security settings

## v1.0.42 — Feedback Center, Privacy & Security, Universal Compatibility Manager

- Feedback Center for bug reports and feature requests with GitHub integration
- Privacy Settings page with data collection controls and log management
- Compatibility Manager for server software version switching
- Server Logs viewer and download from Privacy page

## v1.0.41 — Complete Local-First Stability, Persistence & Multiplayer Repair

- Server Library landing page with create/search/import
- Deep Player Analytics from .dat and .json files
- TPS parsing from console output
- Server status persistence in database
- Backend auto-recovery via Electron health monitoring
- API health endpoint for frontend polling
- Connection verification with TCP port tests
- Playit tunnel status monitoring
- Server config file management (ops/whitelist/bans/usercache)
- Data directory standardization under MineControl OS folder

## v1.0.40 — Backend Communication Repair

- Fixed player routes ordering bug (404 on /banned)
- Socket.IO reconnection with exponential backoff
- Fixed Playit.gg tunnel click-jacking
- Fixed Plugins Marketplace search bug
- API request timeouts (15s)
- Backend stability improvements

## v1.0.38 — Complete State Machine Rewrite

- Proper 5-state lifecycle (STOPPED → STARTING → RUNNING → STOPPING → FAILED)
- Automatic Java Runtime Resolution from .class files
- Pre-flight validation before starting (jar, EULA, port)
- Dashboard handles all server states

## v1.0.51 — Architecture Audit & Critical Fixes Release

### Critical Bug Fixes
- **schedules.ts auth bypass**: POST/PUT/DELETE routes for server schedules were completely broken — missing `authMiddleware` caused all requests to fail with 401. Fixed by adding proper auth middleware and permission checks.
- **feedback.ts unauthenticated routes**: GET `/:id` and POST `/:id/vote` had no authentication middleware, allowing anyone to view tickets and vote. Both routes now require authentication.
- **Player auto-register crash**: When a new player joined, `uuid = ''` was inserted into the `players` table, violating the UNIQUE constraint on the second unknown player. Now generates a proper UUID if none is available from the game server.
- **Discord voice channel mismatch**: The Discord service looked up voice channel data using key `discordVoiceUrl`, but the settings route stores it as `discordVoiceChannelId`. Aligned both to use `discordVoiceChannelId`.
- **Race condition on server startup**: The `server:started` event listener was registered after the `doneTimeout` was set, but the process was already spawned. If the server printed "Done" between spawn and listener registration, the timeout would never be cleared, causing a false failure after 120s. Now registers the listener before the timeout.

### Security Improvements
- **Default owner password**: Removed hardcoded `OXK@6126` from source code. Now read from `DEFAULT_OWNER_PASSWORD` env var, defaults to `minecontrol` with a startup warning.
- **JWT secret**: Default fallback now logs a warning at startup recommending users set `JWT_SECRET` env var.
- **builds.ts permission gap**: POST `/api/builds` route was missing `requirePermission`, allowing any authenticated user to create build tags. Now requires `world.manage`.
- **CGNAT detection fixed**: Previously only checked `firstOctet === 100`, which would miss CGNAT addresses (range is 100.64.0.0/10). Now correctly checks second octet (64–127).

### Persistence & Route Fixes
- **privacy.ts hardcoded count**: `tickets_count` was hardcoded to `0` instead of querying the `feedback_tickets` table. Now uses a proper COUNT query.
- **import.ts routes mounted**: The import server routes (analyze, execute, supported-formats) were never mounted in index.ts. Now mounted at `/api/import`.
- **Duplicate `/api/server` prefix**: Analytics routes were mounted at `/api/server`, conflicting with the server status routes. Moved to `/api/analytics`.
- **Scheduler restart delay**: Scheduled restart tasks now wait 1 second between `stop` and `start` to prevent port-release race conditions, matching the behavior of the manual restart route.

### Electron Improvements
- **Tray icon**: Replaced invisible `nativeImage.createEmpty()` with app icon from `public/logo.png` (falls back to empty if file missing).
- **Update backup cleanup**: `cleanupOldBackups()` is now called after each update backup creation, keeping the last 5 backups and pruning older ones.
- **Removed dead variable**: Removed unused `serverModule` variable from auto-recovery code.

### Build & Release
- Version bumped to 1.0.51

## v1.0.50 — Bug Fixes & Polish Release

### Bug Fixes
- **Servers.tsx version dropdown**: Fixed `[object Object]` rendering in the version dropdown caused by storing API objects in a `string[]` array. Version keys, values, and display text now properly use `v.version`.
- **NeoForge server creation**: Fixed download source mapping — NeoForge servers were incorrectly downloading Forge jars because both `forge` and `neoforge` were mapped to the same `downloadSource`. They now use separate sources.
- **Backup directory resolution**: `BACKUP_DIR` and `WORLDS_DIR` in `BackupService` are now resolved lazily via getter functions instead of at module import time, preventing incorrect paths when no server is active.
- **Console log key collision**: Log entries now use a monotonically incrementing counter instead of `Date.now() + Math.random()` for unique IDs, eliminating React key collision warnings.
- **Removed unused `WelcomeWrapper` component**: Cleaned up dead code in `App.tsx`.

### Improvements
- **NeoForge support in UI**: NeoForge added as a distinct option in the Create Server software dropdown (cyan styling).

### Build & Release
- Version bumped to 1.0.50

## v1.0.49 — Complete Architecture Audit, Integration & Production Readiness

### Architecture Audit & Dependency Repair
- Full codebase audit: every Express route, Socket.IO event, SQLite query, IPC handler, and frontend dependency mapped and verified
- Server Library endpoint now returns per-server `worldName`, `worldSize`, `lastPlayed`, `playerCount`
- Auto-backup cron only runs when the active server has `autoBackup` enabled
- Backups filtered by active server's `server_id` (no more cross-server backup pollution)
- Delete server fully cleans: cascades through backups, worlds, chat logs, schedules, notifications, then removes the on-disk directory; auto-selects next available server
- Server startup auto-detects Java version from `.class` files and resolves compatible JDK

### Bug Fixes
- **Version dropdown fix**: Servers.tsx now correctly filters `availableVersions` by software source (PaperMC, Purpur, Fabric, Forge, Mojang, NeoForge) matching the backend response format
- **mcDirSize unit fix**: Both Servers.tsx and Dashboard.tsx now display MC directory size in MB consistently
- **World download auth**: Worlds page now downloads via fetch with Bearer token instead of unauthenticated `<a>` tag
- **Feedback diagnostics**: Fixed log directory path to use `resolveMinecraftDir()` instead of `process.cwd()`, so crash reports and server logs are collected from the correct server directory
- **Delete server guard**: Backend now auto-selects first remaining server after deletion; no orphaned `active_server_id`
- **Software download**: Default timeout increased from 120s to 300s; plugin download timeout also increased
- **Null/empty state handling**: All fetch catch blocks now log warnings; no more silent `catch {}` on critical data loads
- **`osVersion` in diagnostics**: Uses `os.type()` + `os.release()` instead of app version

### Persistence & Electron Integration
- All user data paths use `resolveMinecraftDir()` for consistent per-server file layout
- Server state (STARTING/RUNNING/STOPPED/FAILED) persisted to `servers.status` column on every transition
- UI state (sidebar collapse, last page) persists via `localStorage` + backend `/api/ui` endpoints
- Application updates never touch user data (configured in `electron-builder.yml` with `deleteAppDataOnUninstall: false`)

### Build & Release
- Version bumped to 1.0.49
- All TypeScript compilations (server, electron, client) pass with zero errors
- Vite production build verified

## v1.0.48 — Complete System Integration, Workflow & Stability

### Critical Bug Fixes
- **Feedback System**: UI now sends correct `{ type, message, title }` format matching server expectations; server accepts `general` type and `message` alias for `description`; diagnostics auto-collect real crash reports, server logs, firewall status, and Minecraft dir info
- **Uninstaller Path**: Fixed `path.dirname(path.dirname(exePath))` → `path.dirname(exePath)` so the uninstaller is found at `C:\Program Files\MineControl OS\` instead of `C:\Program Files\`
- **Server Startup**: State immediately transitions to STARTING before pre-flight validation so the UI reflects progress; done-detection uses regex matching for locale-independent `Done (XXs)! For help` patterns; added 120-second done-timeout to prevent infinite STARTING state on corrupted jars
- **Diagnostics**: `osVersion` field now returns actual OS version (`Windows NT 10.0`) instead of app version

### Software Download Improvements
- **NeoForge support**: Added `downloadNeoForgeVersion()` using the NeoForge API (`api.neoforged.net/v1`)
- **Auto-retry**: Downloads automatically retry up to 3 times with exponential backoff (1s, 2s, 4s) on failure
- **Clear error messages**: HTTP status codes include the URL in error output for easier debugging
- **Cache clear**: Added `clearCache()` function to reset in-memory version caches

### Plugin Manager Fixes
- Plugins now immediately refresh after install (removed arbitrary 3-second timeout)
- User message explicitly says "Restart the server for it to take effect"
- Modrinth marketplace installs also refresh immediately

### Backup System Fixes
- Added `GET /backups/settings` and `POST /backups/settings` endpoints (UI was calling these but they didn't exist)
- Backup records now include `server_id` foreign key for multi-server support

### API Enhancements
- Added `GET /server/crash-logs` endpoint returning latest crash report contents (up to 3 files, 5000 chars each)
- Added `api.getCrashLogs()` to frontend API library

### World Import/Export
- World upload now supports proper multipart file upload via `multer` (1 GB limit)
- All world endpoints sanitize path names to prevent directory traversal (`sanitizeWorldName`)
- World records now include `server_id` foreign key on create/upload/clone

### Build & Release
- Version bumped to 1.0.48
- All TypeScript compilations (server, electron, client) pass with zero errors
- Vite production build succeeds (848 KB JS, 60 KB CSS)

## Earlier Versions

See the [GitHub Releases](https://github.com/Harsha240105/Mine-Control/releases) for the complete history.
