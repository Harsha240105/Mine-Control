# MineControl OS

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases">
    <img src="https://img.shields.io/badge/Latest_v1.0.13-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release"/>
  </a>
</p>

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&duration=3000&pause=500&color=00FF41&center=true&vCenter=true&width=500&lines=MineControl+OS;Self-hosted+Minecraft+Server+Manager;Start+%E2%80%A2+Monitor+%E2%80%A2+Manage;100%25+Free+No+Paid+Tiers;Download+the+desktop+app+now!" alt="Typing SVG"/>
  </a>
</p>

> **100% Free Self-Hosted Minecraft Server Management Platform** — No paid tiers, no subscriptions. Run on your own laptop.

---

## 📥 Download

Latest version: **v1.0.13** — [Auto-updates from within the app]

| Platform | Download |
|----------|----------|
| Windows 10/11 (x64) | [Download Installer](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Intel) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Apple Silicon) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| Linux | [Download AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js, no separate backend. **Install and run.**

---

## 🚀 Features

### v1.0.13 — New in this release
- **Beginner's Guide Tab** — Step-by-step guide explaining everything: start server, change versions, add plugins, use map, share join link, premium/cracked modes, and more.
- **GitHub Community Hub** — Submit bug reports and feature requests directly from the app with image/video attachments up to 25MB/100MB.
- **Land Claim System** — Track player claims and boundaries from the app with full database support.
- **Build Tagging System** — Players can tag buildings and locations (house, base, farm, spawn, shop). View all tagged locations in the app.
- **In-App Bug Reporting** — Attach logs, screenshots (up to 25MB), and videos (up to 100MB) to bug reports.
- **In-App Feature Requests** — Submit and track feature requests with status tracking (open/accepted/delayed/completed).
- **Live World Map Tab** — Embedded BlueMap/Dynmap viewer with plugin selector and port configuration.
- **Server Diagnostics Tab** — Full configuration checks, port binding analysis, CGNAT detection, one-click health check.
- **Connection Manager Tab** — Dedicated page with localhost, LAN, Public IP, and Playit.gg addresses with one-click copy.
- **Game Mode Quick Switch** — One-click toggle between Survival, Creative, Adventure, and Spectator modes.
- **Minecraft Version Selector** — Browse and switch PaperMC versions (1.20.1 through latest) with auto-download.
- **Codebase Cleanup** — Removed stale duplicate directories (MineControlOS/, dashboard/), reduced clutter.

### Server Control
- **Start / Stop / Restart** — One-click server control from the Dashboard
- **Auto-restart on crash** — Automatically recovers from crashes (max 3 attempts)
- **Port conflict detection** — Auto-detects if port 25565 is in use and kills orphaned Java processes
- **EULA auto-accept** — Accepts Minecraft EULA automatically
- **Java pre-check** — Validates Java installation before starting
- **Version auto-download** — Switch PaperMC versions without manual downloads

### Player Management
- **Role-based access** — Owner / Admin / Moderator / Trusted Member / Member / Guest
- **Player tracking** — Online/offline status, join/leave history, real-time coordinates
- **Ban / Kick / Mute / Temp-Ban** — Full moderation toolkit
- **Whitelist** — Control who can join
- **Chat log** — Message history with search

### Connection Modes
- **Cracked Mode** — TLauncher / any launcher, no Mojang account needed
- **Premium Mode** — Official Minecraft accounts only
- **Playit.gg Tunnel** — No port forwarding required. Works behind CGNAT
- **Switch with one click** — Toggle in Settings, restart server

### Monitoring
- **Live Dashboard** — CPU, RAM (MC + System), TPS, Disk, Player count
- **30-min charts** — System resources and performance trends
- **Real-time Console** — See server output as it happens
- **Real-Time Player Cards** — Username, world, coordinates, health, ping, gamemode
- **Live Events Feed** — Join, leave, death, and chat events

### World Management
- **Create worlds** — Custom seed, gamemode, difficulty
- **Clone worlds** — Duplicate existing worlds
- **Download / Upload** — Transfer worlds as `.zip` files
- **World seed setting** — Configure in Settings

### Backups
- **Local-only** — All backups stored on your machine (no cloud)
- **Auto-backup** — Configurable interval (default: every hour)
- **Manual backup** — One-click backup creation
- **Restore** — Roll back to any backup point
- **Encryption** — Optional backup encryption

### Plugins
- **One-click install** — Quick-install popular plugins (LuckPerms, EssentialsX, WorldEdit, Vault, etc.)
- **Custom install** — Add any plugin by URL or `.jar` file
- **Enable / Disable** — Toggle plugins without removing them

### Desktop App
- **Installable** — Windows, macOS, Linux native builds
- **Auto-update** — App updates itself from GitHub releases
- **System tray** — Minimize to tray, background operation

### Security
- **JWT authentication** — Token-based login
- **Role-based permissions** — Granular access control
- **Password management** — Change your password from Settings
- **Audit log** — Track all admin actions

---

## 🎮 How to Connect

### You (on the same laptop):
1. Launch the app → click **Start Server**
2. Wait for server to be **Online**
3. Open **Minecraft** → **Multiplayer** → **Add Server**
4. Address: **`localhost:25565`**
5. Click **Join Server**

### Friend via Playit.gg (Recommended - No Port Forwarding):
1. Go to **Connection** tab in MineControl OS
2. Set up Playit.gg tunnel (see Settings)
3. Share your Playit.gg DNS address (e.g. `minecontrol.playit.gg`)
4. Friend connects using that address — no router configuration needed
5. Works even if your ISP uses CGNAT (Jio, Airtel, BSNL)

### Friend via Public IP (Requires Port Forwarding):
1. Share your **Public IP** from the Connection page
2. Set up port forwarding on your router: TCP 25565 → your laptop
3. Friend connects using your public IP

### Same WiFi (LAN):
- No port forwarding needed
- Friends connect using your **LAN IP** shown on the Connection page

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

### Login
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
MineControlOS/
├── electron/          # Electron desktop app
│   ├── main.ts        # Main process (window, tray, menus, auto-updater)
│   └── preload.ts     # Context bridge for IPC
├── server/            # Express.js backend
│   ├── index.ts       # Entry point (Express + Socket.IO)
│   ├── routes/
│   │   ├── auth.ts    # Login, password change
│   │   ├── server.ts  # Status, start/stop, config, versions, diagnostics, connection, events
│   │   ├── players.ts # Player management, roles, whitelist
│   │   ├── worlds.ts  # World CRUD, clone, download/upload
│   │   ├── plugins.ts # Plugin management
│   │   ├── backup.ts  # Backup create/restore/delete
│   │   ├── claims.ts  # Land claim system
│   │   ├── builds.ts  # Build tagging system
│   │   └── github.ts  # Bug reports & feature requests
│   ├── services/
│   │   ├── minecraftServer.ts  # Java process manager, version management, diagnostics
│   │   └── backup.ts           # Backup engine
│   ├── middleware/
│   │   └── auth.ts    # JWT + role-based permissions
│   └── database.ts    # SQLite schema + seed
├── src/               # React frontend
│   ├── pages/
│   │   ├── Dashboard.tsx     # Server status, charts, player tracking, events
│   │   ├── Connection.tsx    # Connection manager with copy buttons
│   │   ├── Console.tsx       # Live terminal
│   │   ├── Players.tsx       # Player list, roles, bans
│   │   ├── Worlds.tsx        # World management
│   │   ├── MapView.tsx       # Live world map (BlueMap/Dynmap)
│   │   ├── Plugins.tsx       # Plugin browser
│   │   ├── Backups.tsx       # Backup manager
│   │   ├── Diagnostics.tsx   # Server diagnostics + health check
│   │   ├── Guide.tsx         # Beginner's guide
│   │   ├── GitHub.tsx        # Bug reports & feature requests
│   │   └── Settings.tsx      # All config + version selector + Playit.gg
│   ├── components/
│   │   ├── Layout.tsx        # App shell, sidebar, header
│   │   ├── UpdateBanner.tsx  # Auto-update UI
│   │   └── NotificationPanel.tsx  # Notification drawer
│   ├── hooks/
│   │   ├── useAuth.tsx     # Auth context
│   │   ├── useSocket.ts    # Socket.IO connection
│   │   └── useNotifications.ts  # Toast + notification state
│   └── lib/
│       └── api.ts          # Typed API client
├── minecraft/         # Server runtime directory
│   ├── server.jar     # PaperMC (version selectable)
│   ├── plugins/       # Server plugins (BlueMap/Dynmap, etc.)
│   ├── worlds/        # World data
│   ├── backups/       # Local backups
│   └── logs/          # Server logs
└── data/              # SQLite database
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
1. A banner appears: "Update vX.X.X available"
2. Click **Download** → progress bar appears
3. Click **Restart & Update** → app installs and relaunches
4. No manual uninstall/reinstall needed

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
