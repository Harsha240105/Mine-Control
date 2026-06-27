# MineControl OS

> A self-hosted Minecraft Server Management Platform with a polished desktop experience.

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows Installer"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/releases">
    <img src="https://img.shields.io/badge/Latest_v1.0.47-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License"/>
  </a>
</p>

---

## Overview

MineControl OS is a fully offline, desktop-first Minecraft server manager. It wraps Paper, Fabric, NeoForge, and Vanilla servers into a clean Electron app — no cloud dependency, no third-party hosting, just your machine running your server.

### Three Connection Modes

**Mode 1 — Same Laptop**  
MineControl OS + Minecraft on one PC. Connect with `localhost:25565`.

**Mode 2 — Two Laptops (LAN)**  
Laptop A runs MineControl OS, Laptop B runs Minecraft. Connect using the auto-detected LAN IP (e.g. `192.168.x.x:25565`).

**Mode 3 — Internet**  
MineControl OS + Playit.gg tunnel or port forwarding. Friends connect using your Playit domain or public IP.

The app automatically detects which mode you're in and recommends the correct connection address.

---

## Features

### Server Management
- Create, import, and switch between multiple servers
- One-click start / stop / restart with proper state machine
- Auto-restart on crash (max 3 attempts)
- Port conflict detection and orphan process cleanup
- EULA auto-accept
- Java pre-check with auto-detection

### Software Support
- PaperMC — Latest builds via PaperMC API
- Fabric — Latest loader + API versions
- NeoForge — Latest recommended builds
- Vanilla — Official Mojang releases
- Auto-download server jars on creation

### Connection & Networking
- **Same Laptop** — `localhost:25565`
- **LAN** — Auto-detected LAN IP, firewall auto-config
- **Internet** — Playit.gg tunnel setup and monitoring
- Connection Wizard auto-detects all methods
- Minecraft protocol ping for live status verification
- Windows Firewall auto-configuration

### Player Management
- Real-time online player tracking
- Role-based access (Owner / Admin / Moderator / Member / Guest)
- Ban / Kick / Mute / Temp-Ban
- Whitelist control
- Chat log with search
- Deep player analytics (health, inventory, stats, advancements)

### World Management
- Create worlds with custom seed, gamemode, difficulty
- Clone existing worlds
- Download / Export worlds as `.zip`
- Import worlds from other servers

### Backups
- Local-only (no cloud dependency)
- Auto-backup on configurable interval (default: every hour)
- Manual one-click backup
- Restore to any backup point
- Optional encryption

### Plugins & Mods
- One-click install popular plugins (LuckPerms, EssentialsX, WorldEdit, etc.)
- Custom install by URL or `.jar` file
- Enable / Disable without removing
- Modrinth marketplace search and install

### Compatibility
- **Official Minecraft Java** — Full support
- **TLauncher / Offline Launchers** — Supported in Offline Mode
- **Bedrock (Java + Bedrock mode)** — Geyser + Floodgate auto-setup
- **Cross-version** — ViaVersion / ViaBackwards auto-setup
- Compatibility Manager with launcher-specific status indicators

### Monitoring
- Live Dashboard with CPU, RAM, TPS, player count
- 30-minute performance charts
- Real-time console with log levels and search
- Live player cards (health, location, ping, gamemode)
- Connection quality indicators

### Security
- JWT authentication
- Password management
- Audit log for admin actions
- Two uninstall options (keep data or complete removal)

---

## Installation

### Requirements

| Component | Requirement |
|-----------|-------------|
| OS | Windows 10/11 (x64), macOS (Intel/Apple Silicon), Linux (x64) |
| RAM | 2 GB minimum (server RAM is configurable) |
| Storage | 500 MB for app + variable for servers/worlds |
| Java | Java 17+ (auto-detected; downloaded if missing) |

### Download

| Platform | Download |
|----------|----------|
| Windows 10/11 (x64) | [Download Installer](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Intel) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| macOS (Apple Silicon) | [Download DMG](https://github.com/Harsha240105/Mine-Control/releases/latest) |
| Linux | [Download AppImage](https://github.com/Harsha240105/Mine-Control/releases/latest) |

The desktop app bundles everything — no Node.js, no separate backend. **Install and run.**

### Quick Start

1. **Install** the app using the installer for your platform
2. **Launch** MineControl OS
3. **Create a server** — Choose Paper, Fabric, NeoForge, or Vanilla
4. **Start** the server — The app downloads the server jar and configures everything
5. **Connect** — Open Minecraft and connect using the address shown in the app

---

## Creating a Server

1. Click **Create New Server** on the Server Library page
2. Choose a **Name** for your server
3. Select **Software** (Paper, Fabric, NeoForge, or Vanilla)
4. Select **Version** (auto-fetched from official APIs)
5. Configure **RAM** (min/max), **Gamemode**, **Difficulty**, **Seed**
6. Click **Create** — The server is created and configured automatically

## Importing a Server

1. Click **Import Server** on the Server Library page
2. Select the server directory containing `server.jar`
3. The app detects existing configuration and imports it
4. Your worlds, plugins, and settings are preserved

## Playit.gg Setup

1. Go to **Settings** → **Playit.gg**
2. Enter your Playit.gg tunnel token
3. Click **Save** — The app starts the Playit agent automatically
4. Share your Playit.gg DNS address (shown on the Connection page)

## LAN Hosting

1. Start your server in MineControl OS
2. Go to **Connection** → **Local Network** tab
3. The app shows your LAN IP address (e.g. `192.168.1.100:25565`)
4. Share this address with friends on the same Wi-Fi/LAN
5. No port forwarding required

## Localhost Hosting

1. Start your server
2. Open Minecraft → Multiplayer → Add Server
3. Address: `localhost:25565`
4. Click Join Server

---

## Authentication Modes

MineControl OS supports two authentication modes that determine which launchers can connect.

### Online Mode (Authenticated)

```json
{
  "online-mode": true,
  "enforce-secure-profile": true
}
```

| Client | Status |
|--------|--------|
| Official Minecraft Java | ✓ Ready |
| TLauncher / Offline | ✗ Blocked |

Select **Premium Only** in the Compatibility Manager. Intended for public servers where account verification matters.

### Offline Mode (Private / LAN / Cracked)

```json
{
  "online-mode": false,
  "enforce-secure-profile": false
}
```

| Client | Status |
|--------|--------|
| Official Minecraft Java | ✓ Ready |
| TLauncher / Offline | ✓ Ready |

Select **Offline / Non-Premium** in the Compatibility Manager. Intended for private LAN servers and testing. **Important:** Offline mode does not verify usernames — only use with trusted players.

---

## Backups

- Go to **Backups** tab
- Click **Create Backup** for a manual backup
- Auto-backups run every hour (configurable in Settings)
- Click **Restore** to roll back to any backup point
- Backups are stored locally in your servers directory

## Plugins

- Go to **Plugins** tab
- Browse the marketplace or install by URL/`.jar`
- Toggle plugins on/off without removing them
- Supported marketplaces: Modrinth

## Mods

- Install mods through the Plugins tab (for Fabric/NeoForge servers)
- Modrinth integration for search and install

---

## FAQ

**Q: Do I need port forwarding?**  
A: Not for localhost or LAN play. For internet play, you can use Playit.gg (no port forwarding required) or traditional port forwarding.

**Q: Which Minecraft versions are supported?**  
A: All versions that Paper, Fabric, NeoForge, or Vanilla support (1.16.5 through latest). The app fetches available versions from official APIs.

**Q: Can I run multiple servers at once?**  
A: Yes, but only one at a time per MineControl OS instance. You can create multiple servers and switch between them.

**Q: Is my data safe during updates?**  
A: Yes. User data (servers, worlds, databases) is stored separately from application binaries in `%APPDATA%/MineControl OS`. Updates only replace the application files.

**Q: How do I uninstall?**  
A: Go to Settings → Danger Zone for two options: **Uninstall App** (keeps your servers and data) or **Complete Removal** (deletes everything).

**Q: Can I use this on Linux?**  
A: Yes, Linux is supported via AppImage and deb packages.

---

## Troubleshooting

### Server won't start
- Check that Java 17+ is installed
- Check the port (25565) is not in use by another process
- Check the Console tab for error messages
- Use the Compatibility Checker to validate settings

### Can't connect from another computer
- Make sure the server is running (Dashboard shows green "Online")
- Check the Connection tab for the correct LAN IP
- Make sure Windows Firewall allows port 25565 (use the "Add Firewall Rule" button)
- Try connecting with `localhost:25565` on the hosting machine first

### Update check fails
- The update checker requires internet access to reach GitHub
- If GitHub is unreachable, the app shows a meaningful error message
- The auto-updater only looks for releases with installer assets (`.exe`, `.dmg`, `.AppImage`)
- You can always download the latest version manually from the [Releases page](https://github.com/Harsha240105/Mine-Control/releases)

### Data not persisting after update
- Verify your data exists in `%APPDATA%/MineControl OS/` (Windows) or `~/Library/Application Support/MineControl OS/` (macOS)
- If you installed a pre-v1.0.46 version and upgraded, the app auto-migrates data on first launch
- The database is never deleted or recreated during updates

---

## Project

### Repository Owner

**Harshavardhan H S** — Creator, Lead Developer, Maintainer

MineControl OS is a solo-maintained project. There are no external contributors at this time.

### Repository Structure

```
MineControl-OS/
├── client/          # React frontend source (via src/)
├── server/          # Express + Socket.IO backend
├── electron/        # Electron main process
├── docs/            # Documentation
│   ├── screenshots/
│   ├── architecture/
│   ├── installation/
│   └── faq/
├── scripts/         # Utility scripts
├── tests/           # Test files
├── build/           # Build resources
├── assets/          # Application assets
├── installer/       # Installer configuration
└── .github/         # CI/CD and issue templates
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
| `npm test` | Run tests |

### Architecture

```
┌────────────────────────────────────┐
│          Electron Window           │
│  ┌──────────────────────────────┐  │
│  │     React Frontend (Vite)    │  │
│  │     Tailwind CSS Styling     │  │
│  └──────────┬───────────────────┘  │
│             │ HTTP + Socket.IO     │
│  ┌──────────▼───────────────────┐  │
│  │   Express + Socket.IO API   │  │
│  │   Minecraft Process Manager │  │
│  │   SQLite (better-sqlite3)   │  │
│  └──────────────────────────────┘  │
│             │ spawn                │
│  ┌──────────▼───────────────────┐  │
│  │   Minecraft Java Process    │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

### Data Storage

All user data is stored separately from application binaries:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%/MineControl OS/` |
| macOS | `~/Library/Application Support/MineControl OS/` |
| Linux | `~/.config/MineControl OS/` |

This ensures updates never touch user data. The uninstaller's "Keep Data" option works because the uninstaller only removes the application directory.

---

## Roadmap

- [x] Server creation and management
- [x] Multiple server software support (Paper, Fabric, NeoForge, Vanilla)
- [x] Real-time console and player tracking
- [x] Plugin/mod marketplace integration
- [x] Connection Wizard with auto-detection
- [x] Windows Firewall auto-configuration
- [x] Bedrock support via Geyser/Floodgate
- [x] Cross-version support via ViaVersion
- [x] Backup and restore system
- [x] Persistent data architecture (v1.0.46)
- [x] Universal Java Launcher Compatibility (v1.0.47)
- [ ] Plugin marketplace expansion (Hangar)
- [ ] Advanced automation (conditional scheduling)
- [ ] Performance profiler integration (Spark)
- [ ] Multi-language support

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ by Harshavardhan H S</sub>
</p>
