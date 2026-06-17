# MineControl OS - API Documentation

Base URL: `http://localhost:3001/api`
All endpoints require `Authorization: Bearer <token>` header except `/auth/login`.

## Authentication

### POST /auth/login
Login and receive JWT token.

Request:
```json
{ "username": "owner", "password": "minecraft" }
```
Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "uuid", "username": "owner", "role": "Owner" }
}
```

### POST /auth/logout
Invalidate current session.

### GET /auth/me
Get current user info.

### POST /auth/change-password
Change password.
```json
{ "currentPassword": "old", "newPassword": "new" }
```

## Server Management

### GET /server/status
Get server status, stats, and metrics.

### POST /server/start
Start the Minecraft server. Requires `server.start` permission.

### POST /server/stop
Stop the Minecraft server. Requires `server.stop` permission.

### POST /server/restart
Restart the Minecraft server. Requires `server.restart` permission.

### POST /server/command
Send a console command.
```json
{ "command": "say Hello" }
```
Requires `console.send` permission.

### GET /server/logs?limit=100&offset=0
Get server logs. Requires `console.read` permission.

### GET /server/logs/search?q=error
Search server logs.

### GET /server/config
Get server configuration.

### PUT /server/config
Update server configuration.

### GET /server/stats/history?minutes=30
Get historical performance stats.

### GET /server/audit-log?limit=50
Get audit log entries.

## Player Management

### GET /players
List all players.

### GET /players/:id
Get player by ID or username.

### POST /players
Add a player.
```json
{ "username": "Player1", "uuid": "uuid", "role": "Member" }
```

### PUT /players/:id
Update player (role, muted, notes).

### DELETE /players/:id
Delete a player.

### POST /players/:id/ban
Ban a player. Requires `player.ban`.
```json
{ "reason": "Griefing" }
```

### POST /players/:id/unban
Unban a player. Requires `player.unban`.

### POST /players/:id/kick
Kick a player. Requires `player.kick`.

### POST /players/:id/mute
Mute a player. Requires `player.mute`.

### POST /players/:id/unmute
Unmute a player. Requires `player.mute`.

### GET /players/whitelist/all
Get whitelist entries.

### POST /players/whitelist
Add to whitelist.
```json
{ "username": "Player1", "uuid": "optional-uuid" }
```

### DELETE /players/whitelist/:username
Remove from whitelist.

### GET /players/banned
Get banned players list.

### GET /players/chat?limit=50
Get chat log.

### GET /players/roles
Get all roles with permissions.

### PUT /players/roles/:name
Update role permissions/color/level.

## World Management

### GET /worlds
List all worlds.

### POST /worlds
Create world.
```json
{ "name": "new-world", "seed": "12345", "gamemode": "survival", "difficulty": "normal" }
```

### DELETE /worlds/:name
Delete world.

### POST /worlds/:name/clone
Clone world.
```json
{ "newName": "world-copy" }
```

### GET /worlds/:name/download
Download world as ZIP.

### POST /worlds/upload
Upload world.
```json
{ "filePath": "/path/to/world.zip", "worldName": "uploaded-world" }
```

## Plugin Management

### GET /plugins
List all plugins.

### POST /plugins/install
Install plugin.
```json
{ "name": "MyPlugin", "downloadUrl": "https://example.com/plugin.jar" }
```

### DELETE /plugins/:name
Remove plugin.

### POST /plugins/:name/toggle
Enable/disable plugin.

## Backup Management

### GET /backups
List all backups.

### POST /backups/create
Create backup.
```json
{ "name": "Pre-Update", "encrypted": false }
```

### POST /backups/restore/:id
Restore backup.

### DELETE /backups/:id
Delete backup.

## Error Responses

All endpoints return errors in this format:
```json
{ "error": "Description of what went wrong" }
```

HTTP Status Codes:
- 200: Success
- 400: Bad request
- 401: Unauthorized
- 403: Forbidden (insufficient permissions)
- 404: Not found
- 429: Rate limited
- 500: Internal server error
