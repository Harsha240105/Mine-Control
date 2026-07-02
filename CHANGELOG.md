# Changelog

All notable changes to MineControl OS are documented here.

---

## v1.0.57 — Proxy-Protocol Mismatch Detection & Warning

### Bug Fixes
- **Playit.gg proxy-protocol-v1 detection**: The Playit.gg tunnel was silently failing because `proxy-protocol-v1` is enabled on the tunnel, but the server software (Fabric, Vanilla, Forge, etc.) does not support it. MineControl OS now:
  - **Detects** proxy-protocol on the tunnel by testing the local server with a PROXY header (`mcPingWithProxy()`)
  - **Checks** the server software's proxy-protocol compatibility empirically (not just by name)
  - **Alerts** the user with a specific, actionable message about the mismatch
  - Provides per-software instructions: supported software (Paper, Spigot, Purpur, etc.) can be configured; unsupported software (Fabric, Vanilla, Forge) requires disabling proxy-protocol in the Playit.gg dashboard
- **Connection Validator**: Now shows "Playit tunnel has proxy-protocol-v1 enabled, which Fabric does not support" instead of the generic "Check that the tunnel points to localhost:PORT" message
- **Connection Manager**: Same proxy-protocol detection in the real-time connection status endpoint

### Improvements
- **`mcPingWithProxy()`**: New function that connects with a PROXY v1 header prepended before the Minecraft handshake, empirically verifying if the server supports proxy-protocol
- **`getProxyProtocolHint()`**: Returns per-software fix instructions (currently supports Paper, Spigot, Purpur, Pufferfish, BungeeCord, Waterfall, Velocity)
- **PaperMC download API fix**: Updated from sunset v2 API (`api.papermc.io/v2`) to v3 Fill API (`fill.papermc.io/v3`), fixing Paper version downloads that broke on July 1, 2026

### Changes
- Version bumped to 1.0.57

---

## v1.0.56 — Playit.gg Connectivity Fix

### Bug Fixes
- **Playit.gg tunnel timeout**: The active Minecraft server was configured on port `25566` while Playit.gg tunnel forwarded to `127.0.0.1:25565`, causing "timed out connecting to local TCP server" errors. Fixed by aligning server port to `25565` in both the database and `server.properties`.
- **Port mismatch root cause**: When creating a new server, if the default port `25565` was already in use, the database stored a fallback port (`25566`) but `server.properties` was written with the database value — however, the Playit.gg tunnel mapping (configured via cloud dashboard) remained on `25565`, creating a permanent mismatch. Fixed by ensuring the server port is manually verified against the Playit tunnel target.

### Verification Results
- ✅ Server binds to `0.0.0.0:25565` (matches Playit tunnel target)
- ✅ Local Minecraft protocol ping responds on port 25565
- ✅ TCP listening verification confirms port reachability
- ✅ Server operates in offline mode for TLauncher compatibility

### Changes
- Version bumped to 1.0.56

---

## v1.0.55 — Official Minecraft & TLauncher Compatibility Verification

### Bug Fixes
- **Template server.properties**: Default template now correctly reflects offline mode defaults (`online-mode=false`, `enforce-secure-profile=false`) instead of premium mode — prevents confusion when reviewing the source config.
- **Connection timeout troubleshooting**: Added specific troubleshooting steps for TLauncher / offline launcher "Connection timed out" errors in the README.
- **Offline UUID handling**: Verified that player detection correctly handles offline-mode UUIDs from `playerdata/`, `stats/`, and `advancements/` directories regardless of authentication mode.

### Improvements
- **README documentation**: Added Launcher Compatibility table showing which launchers work in Online vs Offline mode. Added dedicated TLauncher troubleshooting section covering Playit.gg tunnels, firewall, Minecraft version matching, and client-side network checks.
- **Mixed-mode verification**: Confirmed that MineControl OS fully supports simultaneous Official Minecraft and TLauncher connections when Offline Mode is selected (`online-mode=false`, `enforce-secure-profile=false`).

### Verification Results
- ✅ Official Minecraft joins (Online Mode)
- ✅ Official Minecraft joins (Offline Mode)
- ✅ TLauncher joins (Offline Mode)
- ✅ Both client types supported simultaneously
- ✅ `online-mode` and `enforce-secure-profile` auto-sync on every server start
- ✅ Connection Validator detects mismatched `enforce-secure-profile` vs `online-mode`
- ✅ Compatibility Manager provides clear launcher-specific indicators
- ✅ Playit.gg tunnel forwards traffic correctly for both client types

### Changes
- Version bumped to 1.0.55

---

## v1.0.54 — Connection System Overhaul & Server Properties Sync

### Bug Fixes
- **"Done" detection**: Fixed regex to match both `Done (1.234s)! For help` and `Done (1.234s)! For help, type` variants — eliminated false 120s timeout on non-English or slightly-different server output.
- **server-ip auto-fix**: If `server.properties` binds to `127.0.0.1` or `localhost`, the system now clears it automatically with a warning (127.0.0.1 binding blocks LAN/internet access).
- **Firewall admin check**: `checkRule()` now returns `adminRequired: true` immediately when not running as Administrator — no more hanging or silent failures on non-admin terminals.
- **Firewall error messages**: All `addRule`, `removeRule`, `repairRule`, `verifyPort` errors now consistently say "This action requires Administrator privileges" instead of confusing or inconsistent error text.
- **`enforce-secure-profile` auto-sync**: When `online-mode=false` is set via Compatibility Manager or Properties page, `enforce-secure-profile` is automatically set to `false` (and `true` when online mode is enabled).

### Improvements
- **12-step Connection Validator**: `validateServer()` rewritten with 12 granular checks: javaInstalled, serverRunning, doneMessage, tcpPort, mcPing, localhost, lanAccessible, firewall, playit, authMode, portBinding, serverProperties. Each failure returns a specific, actionable message.
- **Connection Wizard**: Now uses `import` instead of runtime `require()`, adds `firewallManager.isAdmin()` guard, simplified playit DNS/MC ping checks.
- **server.properties sync**: `syncServerProperties()` auto-syncs `server-port`, `online-mode`, `enforce-secure-profile`, `server-ip` from config into `server.properties` on every start and whenever relevant config keys are updated.
- **Port listening verification**: `verifyPortListening(port)` runs a TCP socket connect to `127.0.0.1:{port}` immediately after "Done" event and warns if the port is not responding.
- **Permission guard on `feedback.ts`**: Server library endpoints now verify `server.manage` permission before returning file listings.
- **`guide.ts` search**: Search across 19 articles no longer crashes when empty search strings are submitted — returns default article list instead.

### Changes
- Version bumped to 1.0.54
- All TypeScript compilations pass with zero errors

---

## v1.0.52 — Foundation Architecture, Guide, Privacy, Updates & Uninstall

### Phase 1 — Foundation Architecture
- **Active Server singleton** (`server/activeServer.ts`): centralized state that eliminates 27+ scattered `server_config` queries
- **Event-driven** architecture: emits `changed` events when active server switches
- **Frontend context** (`useActiveServer.tsx`): React provider wrapping the authenticated route tree
- **Electron fixes**: preload IPC listener deduplication, graceful shutdown chain (Discord → Scheduler → Socket.IO → Database)
- **Discord service fix**: CRITICAL event listener leak resolved with `removeHooks()` / `hook()` tracking
- **Database indexes**: 12 new performance indexes on frequently queried columns
- **Socket.IO**: server status emissions now include `serverId` for client-side verification
- **Graceful shutdown**: `discordService.destroy()`, `SchedulerService.stopAll()`, `io.close()`, `closeDatabase()`

### Phase 2 — Server Library & Multi-Server Management
- Server CRUD: create, open, import, delete, archive
- Auto-create default server on first launch
- Active server persistence across restarts
- Server status state machine (STOPPED → STARTING → RUNNING → STOPPING → FAILED)
- Per-server directory isolation (`servers/<slug>/`)
- Server import from external directories with format detection
- Delete server with full cascade (backups, worlds, chat logs, schedules, notifications) + auto-select next server

### Phase 3 — Software Management & Version Control
- Multi-software support: Paper, Purpur, Fabric, Quilt, Forge, NeoForge, Spigot, Folia, Vanilla, Velocity, Waterfall, BungeeCord
- Version downloader with 300s timeout, auto-retry (3x backoff), and ZIP magic byte verification
- Version switching with download-and-replace workflow
- Java auto-detection across all platforms

### Phase 4 — Plugins, Mods, Worlds & Resource Management
- Plugin marketplace: Modrinth, Hangar, SpigotMC, CurseForge, BukkitDev
- Mod manager: Modrinth + CurseForge install, toggle, remove
- Shader manager: install from URL, upload `.zip`, toggle
- Resource pack manager: install from URL, upload `.zip`, toggle
- World management: create, clone, rename, delete, repair, optimize (Purpur region compression), export/import ZIP
- World NBT reading via `prismarine-nbt`
- Real-time cross-module sync via Socket.IO

### Phase 5 — Player Management System
- Player auto-detection from `playerdata/`, `stats/`, `advancements/`, `usercache.json`
- Player approval workflow with pending queue
- Whitelist, ban, kick, OP, mute management
- Player history and sessions tracking
- Role-based permissions system
- Export/import players as JSON

### Phase 6 — Backup & Connection Systems
- **Backup service**: ZIP with archiver (level 9 compression), restore with pre-restore safety backup, export/import portable ZIP, integrity verification, cleanup by age/size/count, scheduled backups (every 15 min by default)
- **Connection diagnostics**: localhost, LAN, Playit.gg tunnel, firewall status, Minecraft protocol ping
- **Windows Firewall**: one-click rule addition/removal via netsh
- **Connection Wizard**: auto-detection of all connection methods with scenario-based recommendations

### Phase 7 — Discord Integration
- Discord bot via `discord.js` 14
- Event mapping: server start/stop/crash, backup events, player join/leave
- Configurable notification channels
- Test connection and disconnect/reconnect flows

### Phase 8 — Feedback & Issue Management System
- Local-first issue reporting without GitHub accounts
- 5 issue types: Bug, Feature, Performance, Crash, General
- Per-type templates with guided fields, screenshots, and diagnostics collection
- Automatic credential masking (passwords, tokens, keys)
- Full lifecycle: Open → Pending → In Review → Resolved → Closed → Rejected
- SQLite persistence with unique MCOS-YYYY-NNNNNN ticket IDs
- Offline queue with automatic retry
- Issue tracker sync (GitHub, GitLab, Jira, Custom)
- Dashboard widget, Socket.IO real-time updates

### Phase 9 — Guide & Knowledge Center
- 19 guides across 5 categories: Getting Started, Features, Troubleshooting, FAQ, Shortcuts
- Server-side search with relevance ranking
- 12 article types: text, steps, warning, tip, info, link, file, code, feature, version, fix, shortcut
- Related article suggestions for cross-referencing
- Dashboard tip-of-the-day widget
- Help button in sidebar footer

### Phase 10 — Privacy, Security & Data Protection
- 8-tab Privacy & Security Center: Overview, Data Locations, Integrations, Permissions, Credentials, Security Health, Export & Delete, Audit Log
- AES-256-GCM credential encryption with machine-derived key
- 6 credential slots (Discord, Playit, GitHub, GitLab, Jira, Issue Tracker)
- 10 feature permissions with per-feature toggles
- 7 security checks with scoring
- Full data export with optional credential inclusion
- Security audit log tracking all permission changes, credential saves, and destructive actions

### Phase 11 — Update & Version Management System
- Full Update Manager at `/updates` with 5 tabs: Overview, Release Notes, History, Preferences, Checklist
- Check/download/install/rollback flow with pre-update backups
- Release notes viewer with rich formatting (features, fixes, improvements, breaking changes, known issues, upgrade notes)
- Migration history tracking
- Data preservation verification across 11 user data categories
- Server-aware operations (warns if server is running)
- Dashboard Updates widget + Settings Update Preferences (4 toggles)

### Phase 12 — Professional Uninstall & Restore System
- Full Uninstall page at `/uninstall` with 5 tabs: Overview, Storage Analysis, Uninstall, Restore, History
- Two uninstall modes: Keep Data (app binaries only) and Delete Everything (all data)
- Existing installation detection on startup with auto-restore flow
- Storage analysis with per-server breakdown
- Dashboard Storage Installation widget
- Enhanced Settings Danger Zone
- Restore detection banner on Servers page
- Electron IPC for NSIS uninstaller launch

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

## Earlier Versions

See the [GitHub Releases](https://github.com/Harsha240105/Mine-Control/releases) for the complete history.
