# API Reference

## Overview

MineControl OS provides a REST API via Express (port 3001) and a real-time API via Socket.IO. All routes except login require JWT authentication via the `Authorization: Bearer <token>` header.

### Base URL

```
http://localhost:3001/api
```

### Authentication

Obtain a token:
```
POST /api/auth/login
{ "username": "owner", "password": "your-password" }
→ { "token": "jwt...", "user": { ... } }
```

All subsequent requests include:
```
Authorization: Bearer <token>
```

---

## Route Index (25 modules)

| Prefix | Module | File |
|--------|--------|------|
| `/api/auth` | Authentication | `routes/auth.ts` |
| `/api/server` | Server lifecycle | `routes/server.ts` |
| `/api/servers` | Server library | `routes/servers.ts` |
| `/api/players` | Player management | `routes/players.ts` |
| `/api/worlds` | World management | `routes/worlds.ts` |
| `/api/plugins` | Plugin management | `routes/plugins.ts` |
| `/api/mods` | Mod management | `routes/mods.ts` |
| `/api/shaderpacks` | Shader management | `routes/shaderpacks.ts` |
| `/api/resourcepacks` | Resource pack management | `routes/resourcepacks.ts` |
| `/api/backups` | Backup system | `routes/backup.ts` |
| `/api/import` | Server import | `routes/import.ts` |
| `/api/software` | Software versions | `routes/software.ts` |
| `/api/builds` | Build tags | `routes/builds.ts` |
| `/api/feedback` | Feedback & issues | `routes/feedback.ts` |
| `/api/github` | GitHub integration | `routes/github.ts` |
| `/api/settings` | Server settings | `routes/settings.ts` |
| `/api/permissions` | Permission management | `routes/permissions.ts` |
| `/api/network` | Network diagnostics | `routes/network.ts` |
| `/api/analytics` | Analytics | `routes/analytics.ts` |
| `/api/guide` | Knowledge center | `routes/guide.ts` |
| `/api/backup-settings` | Backup configuration | `routes/backup-settings.ts` |
| `/api/schedules` | Task scheduling | `routes/schedules.ts` |
| `/api/notification` | Notifications | `routes/notification.ts` |
| `/api/privacy` | Privacy & security | `routes/privacy.ts` |
| `/api/ui` | UI state persistence | `routes/ui.ts` |
| `/api/update` | Application updates | `routes/update.ts` |
| `/api/uninstall` | Uninstall | `routes/uninstall.ts` |

---

## Key Endpoints

### Server Lifecycle

#### `GET /api/server/status`
Returns current server status, uptime, player count, TPS, and memory usage.

#### `POST /api/server/start`
Starts the Minecraft server. Pre-flight validates Java, jar, port, and EULA.

#### `POST /api/server/stop`
Stops the server gracefully with `stop` command, forces after timeout.

#### `POST /api/server/restart`
Stops then starts with a 1-second delay for port release.

#### `GET /api/server/console?lines=100`
Returns last N lines of server console output.

#### `POST /api/server/console`
Sends a command to the server console.
```json
{ "command": "say Hello" }
```

#### `GET /api/server/properties`
Returns parsed `server.properties` as JSON.

#### `PUT /api/server/properties`
Updates `server.properties` and persists to DB.
```json
{ "key": "difficulty", "value": "hard" }
```

#### `GET /api/server/versions?source=paper`
Returns available versions for the given software source.

#### `GET /api/server/crash-logs`
Returns latest crash report contents (up to 3 files).

### Server Library

#### `GET /api/servers`
Returns all servers with world info.

#### `POST /api/servers`
Creates a new server.
```json
{ "name": "My Server", "software": "paper", "version": "1.21.1", "port": 25565 }
```

#### `DELETE /api/servers/:id`
Deletes server, cascades through backups/worlds/chat/schedules/notifications.

#### `PUT /api/servers/:id/select`
Sets the given server as the active server.

### Player Management

#### `GET /api/players`
Returns all players with enrichment data.

#### `GET /api/players/:id`
Returns single player with full details.

#### `GET /api/players/pending`
Returns pending approval players.

#### `POST /api/players/:id/approve`
Approves a pending player.

#### `DELETE /api/players/:id`
Kicks and bans the player.

#### `GET /api/players/banned`
Returns banned players list.

### Backup System

#### `GET /api/backups`
Lists all backups for the active server.

#### `POST /api/backups`
Creates a backup of all worlds (ZIP, level 9 compression).

#### `POST /api/backups/:id/restore`
Restores a backup with pre-restore safety backup.

#### `DELETE /api/backups/:id`
Deletes a backup file and record.

#### `GET /api/backups/stats`
Returns backup statistics (count, total size, last backup).

#### `GET /api/backups/settings`
Returns backup configuration.

#### `POST /api/backups/settings`
Updates backup settings.

### Import System

#### `POST /api/import/analyze`
Analyzes a server directory or ZIP for import viability.
```json
{ "path": "C:/Servers/MyServer" }
```
or
```json
{ "path": "C:/Downloads/server-backup.zip" }
```

#### `POST /api/import/execute`
Imports the server into MineControl OS.
```json
{ "path": "C:/Servers/MyServer", "name": "My Server" }
```

#### `GET /api/import/supported-formats`
Returns list of supported server software for import detection.

### World Management

#### `GET /api/worlds`
Lists worlds for the active server.

#### `POST /api/worlds`
Creates a new world.

#### `DELETE /api/worlds/:worldName`
Deletes a world.

#### `POST /api/worlds/import`
Imports a world from ZIP upload.

#### `GET /api/worlds/:worldName/export`
Exports world as ZIP download.

### Software Versions

#### `GET /api/software/versions`
Returns available versions grouped by software source.

#### `GET /api/software/sources`
Returns configured download sources.

### Feedback & Issues

#### `GET /api/feedback`
Lists feedback tickets with filtering (type, status, search, sort, priority, date range, pagination).

#### `POST /api/feedback`
Creates a feedback ticket with automatic diagnostics.
```json
{ "summary": "...", "description": "...", "issue_type": "bug", "priority": "normal" }
```

#### `GET /api/feedback/counts`
Returns ticket counts grouped by type and status.

#### `GET /api/feedback/stats`
Returns dashboard statistics (recent tickets, pending syncs, resolved/crash counts).

#### `GET /api/feedback/sync-queue`
Returns pending sync queue items.

#### `POST /api/feedback/sync`
Processes the sync queue (attempts to sync to issue tracker).

#### `PUT /api/feedback/:id/status`
Updates ticket status.
```json
{ "status": "in_review", "note": "Investigating" }
```

#### `PUT /api/feedback/:id/priority`
Updates ticket priority.

#### `PUT /api/feedback/:id/notes`
Updates developer notes (maintainer-only).

#### `POST /api/feedback/:id/sync`
Manually marks a ticket as synced with tracker URL.

#### `GET /api/feedback/tracker-config`
Gets issue tracker configuration for a server.

#### `POST /api/feedback/tracker-config`
Saves issue tracker configuration.
```json
{ "server_id": "...", "provider": "github", "repository": "user/repo", "api_token": "ghp_...", "enabled": true, "auto_sync": true }
```

### GitHub Integration

#### `POST /api/github/bug-report`
Submits a bug report to local DB (not actual GitHub issue creation).

#### `POST /api/github/feature-request`
Submits a feature request to local DB.

#### `GET /api/github/issues`
Lists all locally stored GitHub issues.

### Settings

#### `GET /api/settings`
Returns all server settings.

#### `PUT /api/settings`
Updates server settings.

### Network

#### `GET /api/network`
Returns network diagnostics (local IP, LAN IP, public IP, firewall status).

#### `POST /api/network/firewall/add`
Adds Windows Firewall rule.

#### `POST /api/network/firewall/remove`
Removes Windows Firewall rule.

#### `POST /api/network/validate`
Runs full 12-step connection validation.

### Analytics

#### `GET /api/analytics`
Returns player analytics data (playtime, sessions, activity).

#### `GET /api/analytics/system`
Returns system resource usage (CPU, RAM).

### Update

#### `GET /api/update/check`
Checks for application updates.

#### `POST /api/update/install`
Downloads and installs the latest update.

### Privacy

#### `GET /api/privacy/data`
Returns all user data locations and sizes.

#### `DELETE /api/privacy/logs`
Clears all log files.

#### `GET /api/privacy/export`
Exports all user data as JSON.

---

## Socket.IO Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `server:start` | `{}` | Start the server |
| `server:stop` | `{}` | Stop the server |
| `server:restart` | `{}` | Restart the server |
| `server:command` | `{ command: string }` | Send console command |
| `players:refresh` | `{}` | Refresh player list |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `server:status` | `{ status, ... }` | Server status change |
| `server:console` | `{ line: string }` | New console output line |
| `server:done` | `{ time: string }` | Server fully started |
| `players:update` | `players[]` | Player list update |
| `players:join` | `{ player }` | Player joined |
| `players:leave` | `{ player }` | Player left |
| `chat:message` | `{ message }` | In-game chat message |
| `backup:start` | `{}` | Backup started |
| `backup:complete` | `{ id, size }` | Backup finished |
| `backup:error` | `{ error }` | Backup failed |
| `feedback:update` | `{}` | Feedback data changed |
| `feedback:created` | `{ ticket }` | New feedback ticket |
| `feedback:synced` | `{ ticketId }` | Ticket synced to tracker |

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
