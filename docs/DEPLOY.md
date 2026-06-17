# MineControl OS - Deployment Guide

## Local Network Play

### Step 1: Find your local IP
- **Windows:** `ipconfig` → IPv4 Address (e.g., 192.168.1.100)
- **macOS/Linux:** `ifconfig` or `ip addr`

### Step 2: Configure server
1. Open MineControl OS settings
2. Set server port (default: 25565)
3. Start the server

### Step 3: Connect from Minecraft
- Other computers on your network open Minecraft
- Multiplayer → Direct Connect → `192.168.1.100:25565`
- Replace with your actual IP address

## Public IP Play (Port Forwarding)

### ⚠️ WARNING: Security Implications
- Opening your server to the public internet exposes your computer
- Only do this if you understand the risks
- Always use a whitelist
- Keep your server software updated
- Consider using a firewall

### Step 1: Static IP (recommended)
Set a static IP on your host computer to avoid IP changes breaking port forwarding.

### Step 2: Port Forwarding
1. Open your router admin page (typically http://192.168.1.1)
2. Find Port Forwarding (varies by router brand)
3. Create a new rule:
   - **Name:** Minecraft Server
   - **Protocol:** TCP
   - **External Port:** 25565
   - **Internal Port:** 25565
   - **Internal IP:** Your computer's local IP (e.g., 192.168.1.100)
4. Save and apply

### Step 3: Find your public IP
- Visit https://whatismyipaddress.com/
- Share this IP with your friends

### Step 4: Connect from outside
- Minecraft → Multiplayer → Direct Connect
- `your.public.ip:25565`

## Oracle Cloud Deployment

### Prerequisites
- Oracle Cloud Free Tier account
- Ubuntu 22.04+ VM (ARM or x86)

### Step 1: Create VM Instance
1. Log into Oracle Cloud Console
2. Create a VM instance (VM.Standard.A1.Flex, 4 OCPUs, 24GB RAM - free tier eligible)
3. Choose Ubuntu 22.04+ as the OS
4. Open ports 25565 (TCP) in security list
5. SSH into the instance

### Step 2: Install prerequisites
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y openjdk-21-jdk nodejs npm curl git unzip
```

### Step 3: Deploy MineControl OS
```bash
git clone https://github.com/yourusername/MineControlOS.git
cd MineControlOS
npm install
npm run build
```

### Step 4: Download PaperMC
```bash
curl -L -o minecraft/server.jar https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/latest/downloads/paper-1.21.1-latest.jar
```

### Step 5: Configure for production
Edit the server config or use environment variables:
```bash
export PORT=3001
export JWT_SECRET="your-secure-random-secret"
export BACKUP_KEY="your-encryption-key"
```

### Step 6: Run with PM2 (recommended)
```bash
npm install -g pm2
pm2 start npm --name "minecontrol" -- start
pm2 save
pm2 startup
```

### Step 7: Set up firewall
```bash
sudo ufw allow 25565/tcp
sudo ufw allow 3001/tcp
sudo ufw enable
```

### Step 8: Access the panel
- Open `http://your.vm.public.ip:3001`
- Login with `owner` / `minecraft`
- **CHANGE THE PASSWORD IMMEDIATELY**

## How Players Connect

### Official Minecraft (Premium) Users
1. Must own a legitimate Minecraft account (Mojang/Microsoft)
2. Connect using their Minecraft username
3. Authentication is handled by Mojang/Microsoft servers
4. The server verifies session IDs with Mojang's auth servers
5. Premium users cannot spoof their UUID

### Non-Premium / Offline Mode
- **Not recommended for public servers**
- Any username can be used (no authentication)
- Players can impersonate others
- UUIDs can be spoofed
- Only use offline mode on trusted local networks

### Whitelist Setup
1. In MineControl OS, go to **Players** tab
2. Click **Add Player**
3. Enter the Minecraft username
4. The player is now whitelisted
5. Only whitelisted players can join (when whitelist is enabled)

### Authentication Flow (Premium)
```
Player Launches Minecraft
        │
        ▼
Mojang/Microsoft Login
        │
        ▼
Session ID Generated
        │
        ▼
Player Connects to Server
        │
        ▼
Server Verifies Session ID with Mojang
        │
        ▼
Whitelist Check (if enabled)
        │
        ▼
Player Joins the Game
```

## Security Checklist for Public Deployment

1. ✅ Change default password
2. ✅ Enable whitelist
3. ✅ Keep PaperMC updated
4. ✅ Use firewall (UFW/iptables)
5. ✅ Set JWT_SECRET to random string
6. ✅ Use HTTPS via reverse proxy (nginx/caddy)
7. ✅ Regular backups
8. ✅ Monitor logs for suspicious activity
9. ✅ Disable online-mode=false (unless local only)
10. ✅ Keep OS and software updated
