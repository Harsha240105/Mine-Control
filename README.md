# MineControl OS

**Your Minecraft server, one click away.**

No terminal. No config files. No cloud dependency. Install the app, click Create, and play.

<p align="center">
  <a href="https://github.com/Harsha240105/Mine-Control/releases/latest">
    <img src="https://img.shields.io/badge/Download%20v1.1.5-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Latest"/>
  </a>
  <a href="https://github.com/Harsha240105/Mine-Control/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License"/>
  </a>
</p>

---

## What It Does

MineControl OS is a desktop app that manages your Minecraft server end-to-end. It handles downloads, configuration, backups, mods, players, and even Discord integration — so you never have to touch a terminal.

| Feature | What You Get |
|---------|-------------|
| **One-Click Server** | Pick Paper, Fabric, NeoForge, Vanilla, or 8 others. Jar downloads automatically. |
| **Auto Java** | Detects Java 17+ or downloads it for you. |
| **Performance Tuning** | One-click JVM presets (Aikar's, Aggressive, Low-Memory) tuned to your hardware. |
| **Mods & Plugins** | Search Modrinth, SpigotMC, CurseForge, Hangar — install with one click. |
| **Worlds** | Create, clone, import/export ZIPs, repair, optimize. |
| **Backups** | Scheduled, compressed, integrity-checked. Export and restore anytime. |
| **Player Management** | Ban, kick, mute, whitelist, OP — auto-detected from server data. |
| **Discord Bot** | Server status notifications, chat bridge, rich presence. |
| **Security** | 2FA, IP whitelist, role-based access, account lockout. |
| **Multi-Server** | Run multiple servers with full isolation — worlds, plugins, backups all separate. |
| **Connection Manager** | Auto-detects localhost/LAN. Playit.gg tunneling support. Windows Firewall rules. |
| **Auto-Updates** | In-app updates with pre-update backups. |

---

## Install (2 minutes)

### Requirements

| | Minimum |
|---|---|
| **OS** | Windows 10/11, macOS, or Linux |
| **RAM** | 2 GB (server RAM is separate) |
| **Storage** | 500 MB for app + space for your servers |

### Download

Go to **[Releases](https://github.com/Harsha240105/Mine-Control/releases/latest)** and download the installer for your platform:

| Platform | File |
|----------|------|
| Windows 10/11 | `MineControl-OS-Setup-1.1.5-x64.exe` |
| macOS (Intel + Apple Silicon) | `MineControl OS-1.1.5.dmg` |
| Linux | `MineControl OS-1.1.5-x64.AppImage` or `.deb` |

Run the installer. No Node.js, no Java, no extra setup needed — everything is bundled.

### First Launch

1. Open MineControl OS
2. Click **Create Server**
3. Pick a server type (Paper is the best default)
4. Click **Create** — the app downloads everything
5. Click **Start**
6. Open Minecraft, connect to `localhost:25565`

That's it. Your server is running.

---

## For Developers

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd Mine-Control
npm install
npm run dev          # starts Vite + backend on :5173/:3001
```

### Build Commands

| Command | What it does |
|---------|-------------|
| `npm run build` | Compile frontend + backend |
| `npm run build:desktop:win` | Build Windows installer |
| `npm run build:desktop:mac` | Build macOS DMG |
| `npm run build:desktop:linux` | Build Linux AppImage/deb |
| `npm run typecheck` | TypeScript type checking |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 28 |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Express 4 + Socket.IO |
| Database | SQLite (better-sqlite3, WAL mode) |
| Discord | discord.js 14 |
| Packaging | electron-builder |

---

## Where Your Data Lives

All servers, worlds, and backups are stored in your OS user data folder — never deleted on uninstall unless you choose to:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%/MineControl OS/` |
| macOS | `~/Library/Application Support/MineControl OS/` |
| Linux | `~/.config/MineControl OS/` |

---

## FAQ

**Do I need port forwarding?**
No — for localhost/LAN play, nothing extra is needed. For internet play, use Playit.gg (built-in) or port forwarding.

**Can I run multiple servers at once?**
One at a time per app instance. You can create unlimited servers and switch between them.

**Will updates delete my data?**
No. Your data is stored separately. Updates only replace app files.

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
