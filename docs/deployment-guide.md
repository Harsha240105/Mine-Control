# Deployment Guide

## End-User Installation

### Windows
1. Download the latest `.exe` installer from the [Releases page](https://github.com/Harsha240105/Mine-Control/releases)
2. Run the installer — no admin required (per-user install)
3. Launch MineControl OS from the Start Menu or Desktop shortcut
4. On first launch:
   - Default owner account is created automatically
   - Server library shows "Create Your First Server"
   - Choose software (Paper recommended), version, and port
   - Server downloads jar and starts automatically

### macOS
1. Download the `.dmg` file
2. Mount and drag to Applications
3. Launch — Gatekeeper may require right-click → Open on first launch

### Linux
1. Download the `.AppImage` or `.deb`
2. `chmod +x MineControl-OS-*.AppImage && ./MineControl-OS-*.AppImage`
3. Or: `sudo dpkg -i minecontrol-os_*.deb`

### Uninstall
- **Keep Data** (default): removes app binaries, preserves all servers/worlds/settings
- **Delete Everything**: complete removal including all user data
- Access via Settings → Danger Zone or Uninstall page

## Data Locations

| Platform | User Data Path |
|----------|---------------|
| Windows | `%APPDATA%/MineControl OS/` |
| macOS | `~/Library/Application Support/MineControl OS/` |
| Linux | `~/.config/MineControl OS/` |

Contents:
```
userData/
├── data/
│   ├── minecontrol.db     # All settings, players, worlds, backups metadata
│   └── cache/
├── servers/               # Individual server directories
├── downloads/             # Temporary download cache
├── java/                  # Auto-detected JDKs
├── playit/                # Playit.gg agent files
└── temp/                  # Temporary extraction directory
```

## Updating

### Automatic (Recommended)
- Dashboard checks for updates on startup
- Settings → Updates page: Check, Download, Install, Rollback
- Pre-update backup of database and settings is automatic

### Manual
1. Download latest installer from [Releases](https://github.com/Harsha240105/Mine-Control/releases)
2. Install over existing installation — data is preserved automatically
3. No manual migration needed

### Rollback
1. Go to Settings → Updates → History → select a previous version
2. Click "Rollback" — reinstalls the previous version from local cache
3. Database is automatically backed up before rollback

## Deployment for Developers

### Building the Installer

```bash
# 1. Build all TypeScript
npm run build

# 2. Rebuild native modules for Electron
npx electron-rebuild -f -w better-sqlite3

# 3. Package for your platform
npx electron-builder --win       # Windows .exe (NSIS)
npx electron-builder --mac       # macOS .dmg
npx electron-builder --linux     # Linux .AppImage + .deb

# Output in dist/release/
```

### CI/CD Pipeline

The `.github/workflows/release.yml` workflow:
1. Triggered on tags matching `v*`
2. Builds on Ubuntu, Windows, macOS
3. Runs `npm ci` → `build:server` → `build:client` → `build:electron`
4. Runs `electron-rebuild` + `electron-builder --publish always`
5. Uploads artifacts (`.exe`, `.dmg`, `.AppImage`, `.deb`)

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `JWT_SECRET` | No | `minecontrol` (warning logged) | JWT signing secret |
| `DEFAULT_OWNER_PASSWORD` | No | `minecontrol` | Initial owner password |
| `GH_TOKEN` | No | - | GitHub API token for authenticated requests |
| `PORT` | No | `3001` | Backend server port |

## Running Without Electron (Headless)

For advanced users who want to run the backend as a standalone service:

```bash
npm run build:server
node dist/server/index.js
```

The API will be available at `http://localhost:3001`. You'll need to:
- Set up authentication headers manually
- No GUI — all interaction via API calls
- Electron-specific features (auto-updater, file dialogs, system tray) will not work

## Known Limitations

- **Single server at a time**: Only one Minecraft server process per MineControl OS instance
- **Windows Firewall**: Rule management requires Administrator privileges
- **Playit.gg tunnels**: Proxy-protocol-v1 incompatibility detected with Fabric/Vanilla/Forge (Paper/Spigot/Purpur work with config)
- **Port conflicts**: If default port (25565) is in use, the system will attempt fallback ports
- **No web UI mode**: Currently desktop-only (web mode planned for v2.0)

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
