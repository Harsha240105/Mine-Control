# MineControl OS

> A self-hosted, desktop-first Minecraft Server Management Platform. No cloud dependency, no third-party hosting — just your machine, your server.

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases">
    <img src="https://img.shields.io/badge/v1.1.4-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License"/>
  </a>
</p>

---

## End-to-End Project Summary

MineControl OS has evolved into a robust, self-hosted Minecraft Server Management Platform. Recent updates include:
- **UI Enhancements**: Fixed a critical Chrome-specific layout bug where the sidebar's invisible SVG bounding box intercepted clicks on the main page (e.g., Discord Save Configuration button) by restructuring `pointer-events-none` on the SVG wrapper and `pointer-events-auto` strictly on the painted SVG path. Truncated long sidebar labels and reduced expansion distance for better UX.
- **Discord Integration**: Robust handling of bot tokens with masked frontend inputs preventing accidental overrides during partial updates, and automatic socket-based status reporting.
- **Software Downloads**: Upgraded infrastructure using robust websocket progress tracking, PowerShell chunked extraction, and `Expand-Archive` support on Windows for Java/server downloads.
- **System Stability**: Prevented false positives during GitHub feedback requests and properly isolated API rate-limiting endpoints.

**Recent Updates (v1.1.4 & v1.1.5):**
- **Updater Fix:** Resolved an issue where a version mismatch in `package.json` prevented the GitHub Actions workflow from attaching installer assets to the release, fixing the "No updates available yet" error for users.
- **E2E Testing:** Added comprehensive end-to-end testing with Playwright to ensure robust UI interactions.
- Improved Sidebar UI responsiveness by fixing SVG hit-boxes.
- Enhanced Java and Server Software Downloader with a real-time progress indicator directly in the UI and native PowerShell extraction on Windows to prevent file locking issues.
- Fixed Discord Bot Token edge cases during configuration re-saves.
- Improved GitHub Token sync with automatic fallback mapping.

In essence, MineControl OS removes the need for terminal usage or manual file edits, providing an intuitive, premium, self-hosted experience.

---

## Features

### One-Click Server Creation
Create a fully configured Minecraft server in one click — no manual downloads, no config editing, no terminal. Choose from Paper, Fabric, NeoForge, Forge, Quilt, Purpur, Vanilla, Spigot, Folia, Velocity, Waterfall, or BungeeCord. The app auto-downloads the correct server jar, generates `server.properties`, accepts EULA, creates a unique world seed, and starts the server.

### Automatic Java Manager
Auto-detects installed Java runtimes across your system. If Java 17+ is missing, downloads and configures a compatible JDK automatically — no manual installation required.

### Performance Tuning
Auto-generates optimal JVM flags based on your system's CPU cores and available RAM. Choose from four presets (Aikar's, Aggressive, Low-Memory, Vanilla) or write custom flags. View-distance and simulation-distance are calculated automatically. One-click YML optimization for Paper, Bukkit, Spigot, Pufferfish, and Purpur configurations.

### Security & Access Control
Two-factor authentication (TOTP) via authenticator apps with recovery codes. IP whitelist for per-server access control. Account lockout after 5 failed login attempts. Role-based permissions (Owner, Admin, Moderator, Member). Session management with token-based JWT authentication.

### Multi-Server Isolation
Create and switch between multiple servers with complete isolation — worlds, players, backups, plugins, mods, resource packs, Discord config, scheduler tasks, and chat logs are all separated per server. No cross-server data leakage.

### Plugin, Mod, Shader & Resource Pack Management
Search and install from Modrinth, Hangar, SpigotMC, CurseForge, and BukkitDev. One-click enable/disable, version compatibility checking, and removal.

### World Management
Create, clone, rename, delete, repair, and optimize worlds. Import/export worlds as ZIP with full NBT metadata. Directory traversal protection on all file operations.

### Backup System
ZIP compression with integrity verification. Automatic pre-restore safety backups. Export/import portable backups. Scheduled backups with configurable interval. Cleanup by age, size, or count.

### Player Management
Auto-detection from playerdata, stats, advancements, and usercache.json. Role-based access. Ban, kick, mute, temp-ban, whitelist, and OP controls. Player history and session analytics.

### Discord Integration
Rich presence, server event notifications (start, stop, crash, backup, player join/leave), chat bridge between Discord and in-game chat, and command prefix configuration.

### Feedback & Issue Management
Local-first feedback system — no GitHub account required. Five issue types with guided templates and automatic diagnostics collection. Screenshot support with credential masking. Offline queue with auto-retry. Optional GitHub/GitLab/Jira integration.

### GitHub Synchronization
Two-way sync between in-app settings and a GitHub repository. Track configuration changes, rollback on errors, and maintain version history.

### Connection Manager
Connection Wizard with auto-detection for localhost, LAN, and Playit.gg tunneling. Minecraft protocol ping for live status verification. Windows Firewall one-click rule management. Compatibility Manager with launcher-specific indicators.

### Update System
Check, download, and install updates with pre-update backups. Rich release notes viewer. Migration history tracking. Data preservation across all updates.

### Aceternity-Inspired UI Components
The application now features premium, modern UI components including:
- **Evervault Cards:** Dynamic character-flipping hover effects for player management cards.
- **Floating Dock:** An Apple-style responsive dock for global navigation.
- **Text Flip Animation:** "OXK Pixel" branding with flipping text animation on the loading screen.

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
| Linux (x64) | [Download AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js, no separate backend, no manual setup.

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
│  │  ActiveServerContext | AuthContext | useSocket    │  │
│  │              │ HTTP (fetch) + Socket.IO            │  │
│  └──────────────┼────────────────────────────────────┘  │
│                 │                                       │
│  ┌──────────────▼────────────────────────────────────┐  │
│  │         Express + Socket.IO Backend               │  │
│  │  activeServer.ts (centralized singleton)          │  │
│  │  Express Router (30+ route modules)               │  │
│  │  Socket.IO (server state, players, chat, console) │  │
│  │  SQLite (better-sqlite3, WAL mode, v23 schema)   │  │
│  │  MinecraftServerManager (process management)      │  │
│  │              │ spawn                               │  │
│  │  ┌───────────▼─────────────────────────────────┐  │  │
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
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS 3 + Lucide React |
| Charts | Recharts |
| Backend | Express 4 + TypeScript |
| Real-time | Socket.IO 4 |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Encryption | AES-256-GCM (Node crypto) |
| 2FA | Speakeasy (TOTP) |
| Discord | discord.js 14 |
| Packaging | electron-builder 26 |

### Data Storage

All user data is stored separately from application binaries:

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
│       ├── plugins/
│       ├── worlds/
│       ├── backups/
│       ├── logs/
│       └── config/
├── java/                   # Auto-detected/installed JDKs
├── playit/                 # Playit.gg agent files
└── temp/                   # Temporary extraction directory
```

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
| `npm run build:desktop:win` | Build Windows installer |
| `npm run typecheck` | Run TypeScript type checking |

---

## FAQ

**Q: Do I need port forwarding?**
A: Not for localhost or LAN play. For internet play, use Playit.gg (no port forwarding required) or traditional port forwarding.

**Q: Which Minecraft versions are supported?**
A: All versions supported by Paper, Fabric, NeoForge, or Vanilla (1.16.5 through latest). Versions fetched from official APIs.

**Q: Can I run multiple servers at once?**
A: Only one at a time per MineControl OS instance. You can create multiple servers and switch between them.

**Q: Is my data safe during updates?**
A: Yes. User data is stored separately from application binaries in `%APPDATA%/MineControl OS`. Updates only replace application files.

**Q: How do I uninstall?**
A: Go to the Uninstall page for two options: Keep Data (app binaries only) or Delete Everything (servers, worlds, backups, preferences).

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
