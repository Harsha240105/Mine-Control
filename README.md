# MineControl OS

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://discord.com/invite/gKghAS2RVW">
    <img src="https://img.shields.io/badge/Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"/>
  </a>
</p>

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&duration=3000&pause=500&color=00FF41&center=true&vCenter=true&width=500&lines=MineControl+OS;Self-hosted+Minecraft+Server+Manager;Start+%E2%80%A2+Monitor+%E2%80%A2+Manage;Download+the+desktop+app+now!" alt="Typing SVG"/>
  </a>
</p>

> Self-hosted Minecraft server management platform with web dashboard, desktop app, and real-time monitoring.

## Download

| Platform | Download |
|----------|----------|
| Windows 10/11 | [MineControl OS-Setup-1.0.0-x64.exe](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Intel) | [MineControl OS-1.0.0-x64.dmg](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Apple Silicon) | [MineControl OS-1.0.0-arm64.dmg](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| Linux | [MineControl OS-1.0.0-x64.AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js or separate backend needed. Install and run.

## Features

- **Full Server Control** — Start, stop, restart your PaperMC server from the dashboard or system tray
- **Live Console** — Real-time command-line interface with log searching and filtering
- **Player Management** — Track players, manage roles (Owner/Admin/Moderator/Member), ban/kick/mute
- **World Manager** — Create, clone, download, and upload Minecraft worlds
- **Plugin Manager** — Install/remove/enable/disable plugins, quick-install popular ones
- **Backup System** — Auto and manual backups with encryption, local storage
- **Real-Time Monitoring** — CPU, RAM (MC + system), TPS, disk usage, player count
- **Notification System** — Alerts for player joins/leaves, server events, crashes
- **Resource Dashboard** — Charts for system resources and performance over 30 minutes
- **3D Model Viewer** — Preview the Steve avatar with walking animation (Three.js)
- **Electron Desktop App** — Installable native app for Windows, macOS, and Linux

## Quick Start (from source)

### Prerequisites

- **Java 17 or 21** — [Download](https://adoptium.net/)
- **Node.js 18+** — [Download](https://nodejs.org/)
- **8GB+ RAM** recommended

### Build

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd MineControlOS
npm install
curl -L -o minecraft/server.jar https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/133/downloads/paper-1.21.1-133.jar
npm run dev
```

### Login

| Username | Password |
|----------|----------|
| `owner`  | `minecraft` |

**Change the password immediately after first login!**

### Access

- **Web UI:** http://localhost:5173 (dev) or http://localhost:3001 (production)
- **API:** http://localhost:3001/api
- **Minecraft Server:** `localhost:25565`

## How Players Connect

### Start the server from the Dashboard

1. Open the web UI → **Dashboard**
2. Click the **green power button** in the sidebar to start the Minecraft server
3. Wait for the console to show `Done! For help, type "help"` — the server is ready

### Friends on the same network (LAN)

1. Both computers on the same WiFi or Ethernet
2. Friend opens Minecraft → **Multiplayer** → **Add Server**
3. Enter your **local IP** (e.g., `192.168.1.100`) (find it with `ipconfig` on Windows)
4. Port is `25565` (default) — set in your router if changed

### Friends with official Minecraft launcher (premium) — over internet

1. **Port-forward** port `25565` on your router (TCP protocol)
2. Find your **local IP** via `ipconfig` → `IPv4 Address`
3. Log into your router admin panel (usually `http://192.168.1.1`)
4. Port Forwarding → Add rule: External `25565` → Internal IP (your local IP) → Internal `25565` → TCP
5. Give friends your **public IP** (search "what is my IP" on Google)
6. They add a server in Minecraft with that IP

### Friends with TLauncher / cracked launcher

1. In Settings → set **Online Mode** to `false`
2. **Restart** the Minecraft server
3. Friends connect using your local or public IP the same way
4. **Warning:** Less secure — anyone can join with any username. Use whitelist in Settings.

### Stopping the server

- Click the **red power-off button** in the sidebar
- The server sends `save-all`, then `stop`, and frees all RAM/CPU
- The close handler properly cleans up: clears stats monitoring, closes log streams, nullifies the process
- Force-kill fallback applies if the server doesn't stop within 15 seconds

## Desktop App (Build from source)

### Windows

```bash
npm run build:desktop:win
# Output: dist/release/MineControl OS-Setup-1.0.0-x64.exe
```

### macOS

```bash
npm run build:desktop:mac
# Output: dist/release/MineControl OS-1.0.0-x64.dmg
```

### Linux

```bash
npm run build:desktop:linux
# Output: dist/release/MineControl OS-1.0.0-x64.AppImage
```

### Development

```bash
npm run dev:electron
```

## Project Structure

```
MineControlOS/
├── electron/          # Electron desktop app
│   ├── main.ts        # Main process (window, tray, menus)
│   └── preload.ts     # Context bridge for IPC
├── server/            # Express.js backend
│   ├── index.ts       # Entry point
│   ├── routes/        # API routes (auth, server, players, worlds, plugins, backups)
│   ├── services/      # Minecraft server manager, backup service
│   ├── middleware/     # JWT auth, role-based permissions
│   └── database.ts    # SQLite schema and connection
├── src/               # React frontend (Vite + TypeScript)
│   ├── pages/         # Dashboard, Players, Console, Worlds, Plugins, Backups, Settings
│   ├── components/    # Layout, NotificationPanel
│   ├── hooks/         # useAuth, useSocket, useNotifications
│   └── lib/           # API client
├── minecraft/         # Minecraft server directory
│   ├── server.jar     # PaperMC server jar
│   ├── plugins/       # Server plugins
│   ├── worlds/        # World data
│   └── backups/       # Local backups
├── data/              # SQLite database
└── public/            # Static assets
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express, Socket.IO |
| Database | SQLite (better-sqlite3) |
| Desktop | Electron, electron-builder |
| Minecraft | PaperMC 1.21.1 |

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/server/status` | Server status + system resources |
| POST | `/api/server/start` | Start server |
| POST | `/api/server/stop` | Stop server |
| POST | `/api/server/restart` | Restart server |
| GET | `/api/server/logs` | Get logs |
| POST | `/api/server/command` | Send command |
| GET | `/api/players` | List players |
| GET | `/api/backups` | List backups |
| GET | `/api/plugins` | List plugins |
| GET | `/api/worlds` | List worlds |

## Plugins

Popular plugins can be installed from the Plugins page with one click:

- **LuckPerms** — Advanced permissions system
- **EssentialsX** — Essential server commands
- **WorldEdit** — In-game world editing
- **Vault** — Economy/permissions API
- **ClearLag** — Lag reduction
- **CoreProtect** — Block logging and rollback

To add custom plugins, either:
1. Use the **Install Plugin** form with a download URL
2. Drop `.jar` files into `minecraft/plugins/` and restart the server

## Maps / Worlds

- **Create** new worlds with custom seed, gamemode, and difficulty
- **Clone** existing worlds
- **Download** worlds as `.zip` files
- **Upload** world `.zip` files
- Worlds are stored in `minecraft/worlds/`

## Configuration

Edit server settings from the Settings page:
- Server name (MOTD), max players, difficulty, gamemode
- PvP on/off, whitelist, auto-restart, auto-backup
- Port, view distance, RAM allocation
- Java path and JAR file

## Development

```bash
# Run both server and client with hot reload
npm run dev

# Run only server
npm run dev:server

# Run only client
npm run dev:client

# Build for production
npm run build

# Type check
npm run typecheck
```

## License

MIT

---

<p align="center">
  <a href="https://discord.com/invite/gKghAS2RVW">
    <img src="https://img.shields.io/badge/Join_our_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20from%20GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/>
  </a>
</p>
