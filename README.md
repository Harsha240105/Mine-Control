# MineControl OS

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://discord.com/invite/gKghAS2RVW">
    <img src="https://img.shields.io/badge/Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases">
    <img src="https://img.shields.io/badge/Latest_v1.0.8-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release"/>
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

Latest version: **v1.0.8** — [Auto-updates from within the app]

| Platform | Download |
|----------|----------|
| Windows 10/11 (x64) | [Download Installer](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Intel) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Apple Silicon) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| Linux | [Download AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js, no separate backend. **Install and run.**

---

## 🚀 Features

### Server Control
- **Start / Stop / Restart** — One-click server control from the Dashboard
- **Auto-restart on crash** — Automatically recovers from crashes (max 3 attempts)
- **Port conflict detection** — Auto-detects if port 25565 is in use and kills orphaned Java processes
- **EULA auto-accept** — Accepts Minecraft EULA automatically
- **Java pre-check** — Validates Java installation before starting

### Player Management
- **Role-based access** — Owner / Admin / Moderator / Trusted Member / Member / Guest
- **Player tracking** — Online/offline status, join/leave history
- **Ban / Kick / Mute** — Full moderation toolkit
- **Whitelist** — Control who can join
- **Chat log** — Message history with search

### Connection Modes
- **Cracked Mode** — TLauncher / any launcher, no Mojang account needed
- **Premium Mode** — Official Minecraft accounts only
- **Switch with one click** — Toggle in Settings, restart server

### Monitoring
- **Live Dashboard** — CPU, RAM (MC + System), TPS, Disk, Player count
- **30-min charts** — System resources and performance trends
- **Real-time Console** — See server output as it happens
- **Server Connection Info** — Shows localhost and public IP right on the Dashboard

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
- **3D Model Viewer** — Animated Steve walk cycle preview

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
3. Open **Minecraft 1.21.1** → **Multiplayer** → **Add Server**
4. Address: **`localhost:25565`**
5. Click **Join Server**

### Friend with TLauncher (Cracked):
1. In the app → **Settings** → set **Connection Mode** to **Cracked (TLauncher)**
2. Click **Save & Restart Server**
3. Give friend your **Public IP** (shown on Dashboard)
4. Friend opens TLauncher → selects **1.21.1** → **Multiplayer** → Add your IP
5. Requires **port forwarding** on your router (TCP 25565 → your laptop's local IP)

### Friend with Official Minecraft (Premium):
1. In the app → **Settings** → set **Connection Mode** to **Premium (Official)**
2. Click **Save & Restart Server**
3. Give friend your **Public IP** (shown on Dashboard)
4. Friend opens Minecraft 1.21.1 → **Multiplayer** → Add your IP
5. Requires **port forwarding** on your router (TCP 25565 → your laptop's local IP)

### Same WiFi (LAN):
- No port forwarding needed
- Find your **local IP** (`ipconfig` on Windows, `ifconfig` on Mac/Linux)
- Friends connect using that IP instead of `localhost`

### Port Forwarding Guide:
1. Find your local IP: `ipconfig` → `IPv4 Address` (e.g., `192.168.1.100`)
2. Open router admin (usually `http://192.168.1.1`)
3. Find **Port Forwarding** or **Virtual Server**
4. Add rule: External Port `25565` → Internal IP `192.168.1.100` → Internal Port `25565` → TCP
5. Save and restart router if needed
6. Your public IP is shown on the app's Dashboard

---

## ⚙️ Configuration

| Setting | Location | Description |
|---------|----------|-------------|
| Server Name (MOTD) | Settings | Message shown in server list |
| Connection Mode | Settings | Cracked (TLauncher) or Premium (Official) |
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
| Java Path | minecraftServer.ts `getConfig()` | Path to Java executable |

---

## 🛠 Dev Quick Start

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd MineControlOS
npm install
npm run dev
```

Download PaperMC server jar:
```bash
curl -L -o minecraft/server.jar https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/133/downloads/paper-1.21.1-133.jar
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
│   ├── routes/        # API routes
│   │   ├── auth.ts    # Login, password change
│   │   ├── server.ts  # Status, start/stop, config, properties, logs
│   │   ├── players.ts # Player management, roles, whitelist
│   │   ├── worlds.ts  # World CRUD, clone, download/upload
│   │   ├── plugins.ts # Plugin management
│   │   └── backup.ts  # Backup create/restore/delete
│   ├── services/
│   │   ├── minecraftServer.ts  # Java process manager
│   │   └── backup.ts           # Backup engine
│   ├── middleware/
│   │   └── auth.ts    # JWT + role-based permissions
│   └── database.ts    # SQLite schema + seed
├── src/               # React frontend
│   ├── pages/
│   │   ├── Dashboard.tsx  # Server status, charts, connection info
│   │   ├── Console.tsx    # Live terminal
│   │   ├── Players.tsx    # Player list, roles, bans
│   │   ├── Worlds.tsx     # World management
│   │   ├── Plugins.tsx    # Plugin browser
│   │   ├── Backups.tsx    # Backup manager
│   │   ├── Models.tsx     # 3D Steve viewer
│   │   └── Settings.tsx   # All config + connection mode
│   ├── components/
│   │   ├── Layout.tsx      # App shell, sidebar, header
│   │   ├── UpdateBanner.tsx  # Auto-update UI
│   │   ├── NotificationPanel.tsx  # Notification drawer
│   │   └── ModelViewer/    # Three.js components
│   ├── hooks/
│   │   ├── useAuth.tsx     # Auth context
│   │   ├── useSocket.ts    # Socket.IO connection
│   │   └── useNotifications.ts  # Toast + notification state
│   └── lib/
│       └── api.ts          # Typed API client
├── minecraft/         # Server runtime directory
│   ├── server.jar     # PaperMC 1.21.1
│   ├── plugins/       # Server plugins
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

---

## 🧩 One-Click Plugins

Available from the Plugins page:
- **LuckPerms** — Advanced permissions
- **EssentialsX** — Essential commands
- **WorldEdit** — In-game world editing
- **Vault** — Economy/permissions API
- **ClearLag** — Lag reduction
- **CoreProtect** — Block logging and rollback

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
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Three.js |
| Backend | Node.js, Express, Socket.IO |
| Database | SQLite (better-sqlite3) |
| Desktop | Electron 28, electron-builder, electron-updater |
| Minecraft | PaperMC 1.21.1 |
| 3D | React Three Fiber, Three.js |

---

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
  <br/>
  <sub>100% Free. No paid tiers. No subscriptions. Self-hosted on your hardware.</sub>
</p>
