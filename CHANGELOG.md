# Changelog

All notable changes to MineControl OS are documented here.

---

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
