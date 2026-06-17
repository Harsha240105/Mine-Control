# MineControl OS - Installation Guide

## Prerequisites

- **Java 17 or 21** (JDK) - [Download](https://adoptium.net/)
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Git** (optional) - [Download](https://git-scm.com/)
- **8GB+ RAM** recommended
- **5GB+ free disk space**

## Quick Install (Windows)

1. **Clone or download MineControl OS**
```bash
git clone https://github.com/yourusername/MineControlOS.git
cd MineControlOS
```

2. **Run the setup script**
```bash
# Windows
scripts\setup.bat
```

3. **Download PaperMC server jar**
```bash
# Download PaperMC 1.21.1
curl -L -o minecraft/server.jar https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/latest/downloads/paper-1.21.1-latest.jar
```

4. **Start the application**
```bash
npm run dev
```

5. **Open browser**
Navigate to `http://localhost:3001`
Login with username: `owner`, password: `minecraft`

## Manual Install

### 1. Install Dependencies
```bash
npm install
```

### 2. Install TypeScript globally (if needed)
```bash
npm install -g typescript tsx
```

### 3. Configure the server
Edit settings through the web UI after first login.

### 4. Download PaperMC
Place the PaperMC server jar in `minecraft/server.jar`.

### 5. Build for production
```bash
npm run build
```

### 6. Start the server
```bash
npm start
```

### 7. (Optional) Start with Electron
```bash
npm run start:electron
```

## First Time Setup

1. Open `http://localhost:3001`
2. Login with default credentials: `owner` / `minecraft`
3. Go to **Settings** to configure:
   - Server MOTD
   - Max players (set to 4)
   - RAM allocation (min 2G, max 8G)
   - Difficulty and gamemode
4. Go to **Players** and add yourself to the whitelist
5. Go to **Dashboard** and click **Start Server**
6. Once the server shows "Online", you can join from Minecraft

## Installing PaperMC

### Automatic download:
```bash
# Download latest PaperMC 1.21.1 build
node scripts/download-paper.js
```

### Manual download:
1. Go to https://papermc.io/downloads
2. Download the latest PaperMC jar for your desired version
3. Rename it to `server.jar` and place in the `minecraft/` directory

## Installing Plugins

Place `.jar` files in `minecraft/plugins/` directory, then restart the server.

### Recommended plugins:
- **LuckPerms** - Permission management
- **EssentialsX** - Essential commands
- **WorldEdit** - World editing
- **CoreProtect** - Block logging
- **ClearLag** - Performance optimization

## Default Login

- **Username:** `owner`
- **Password:** `minecraft`

**IMPORTANT:** Change the default password immediately after first login!

## Project Structure

```
MineControlOS/
├── server/          # Backend API
├── src/             # Frontend React app
├── electron/        # Desktop app
├── minecraft/       # Minecraft server files
│   ├── plugins/     # Place .jar files here
│   ├── worlds/      # World data
│   ├── backups/     # Backup archives
│   └── logs/        # Server logs
├── scripts/         # Utility scripts
└── docs/            # Documentation
```
