# Minecraft Java Server on Oracle Cloud Always Free Tier

## Complete Production Guide

> **Author:** Senior DevOps Engineer
> **Platform:** Oracle Cloud Infrastructure (OCI) Always Free Tier
> **Minecraft Version:** Latest Stable (1.21.x)
> **Java Version:** 21 LTS
> **OS:** Ubuntu 24.04 LTS
> **Last Updated:** June 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Oracle Cloud Infrastructure Setup](#2-oracle-cloud-infrastructure-setup)
3. [Server Provisioning](#3-server-provisioning)
4. [Minecraft Server Installation](#4-minecraft-server-installation)
5. [Server Configuration](#5-server-configuration)
6. [Performance Optimization](#6-performance-optimization)
7. [Security Hardening](#7-security-hardening)
8. [Automation & systemd Services](#8-automation--systemd-services)
9. [Backup & Recovery](#9-backup--recovery)
10. [Advanced Features](#10-advanced-features)
11. [Web Dashboard](#11-web-dashboard)
12. [Troubleshooting Guide](#12-troubleshooting-guide)
13. [FAQ](#13-faq)
14. [Security Checklist](#14-security-checklist)

---

## 1. Architecture Overview

### Network Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         INTERNET                                     │
└──────────┬──────────────────────────────┬────────────────────────────┘
           │                              │
           │ TCP 25565                    │ UDP 19132
           │ (Minecraft Java)             │ (Geyser Bedrock)
           ▼                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Oracle Cloud Infrastructure - Virtual Cloud Network (10.0.0.0/16)   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Internet Gateway (IG)                                         │  │
│  │  Routes: 0.0.0.0/0 -> IG                                      │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Public Subnet (10.0.1.0/24)                                   │  │
│  │                                                                │  │
│  │  ┌────────────────────────────────────────────────────────┐    │  │
│  │  │  Security List (minecraft-security-list)                │    │  │
│  │  │  Ingress:                                              │    │  │
│  │  │    - 0.0.0.0/0  TCP 22      (SSH)                     │    │  │
│  │  │    - 0.0.0.0/0  TCP 25565   (Minecraft Java)           │    │  │
│  │  │    - 0.0.0.0/0  UDP 19132   (Geyser Bedrock)           │    │  │
│  │  │    - 0.0.0.0/0  TCP 3000    (Dashboard - optional)     │    │  │
│  │  │  Egress: ALLOW ALL                                      │    │  │
│  │  └────────────────────────────────────────────────────────┘    │  │
│  │                                                                │  │
│  │  ┌────────────────────────────────────────────────────────┐    │  │
│  │  │  VM Instance (minecraft-server)                        │    │  │
│  │  │  Shape: VM.Standard.A1.Flex (4 OCPU, 24 GB RAM)        │    │  │
│  │  │  OS:   Ubuntu 24.04 LTS (aarch64)                      │    │  │
│  │  │  Boot: 100 GB Block Volume                              │    │  │
│  │  │  IP:   Public + Reserved Private                        │    │  │
│  │  │                                                         │    │  │
│  │  │  Minecraft Server (25565)   Web Dashboard (3000)       │    │  │
│  │  │  Backup Script (daily)      Monitor (every 5m)         │    │  │
│  │  └────────────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Crash Recovery Workflow

```
  mc-server process CRASHES
       |
       v
  systemd detects exit != 0
       |
       v
  Restart=on-failure, RestartSec=10s
       |
       v
  start.sh: check locks, clean stale files
       |
       v
  Launch JAR with JVM flags
       |
       v
  Server back online (~30s)
```

### Daily Backup Workflow

```
  03:00 UTC (systemd timer)
       |
       v
  backup.sh: save-all, save-off
       |
       v
  tar -czf world + configs
       |
       v
  Rotate: keep 7 daily + 4 weekly
       |
       v
  save-on, log completion
```

---

## 2. Oracle Cloud Infrastructure Setup

### 2.1 Create Oracle Cloud Account

1. Navigate to https://cloud.oracle.com
2. Click **Sign Up for Free Tier**
3. Fill in your details (country, cloud account name, home region)
4. Verify identity with credit card (free tier is never charged)
5. Wait for approval (minutes to 24 hours)

> **Home Region Tip:** Choose the closest region with ARM capacity. US West Phoenix, Canada Southeast, or Australia East often have better availability.

### 2.2 Create Virtual Cloud Network (VCN)

1. Console > Networking > Virtual Cloud Networks > **Start VCN Wizard** > **Create VCN with Internet Connectivity**
2. Configure:
   ```
   VCN Name: minecraft-vcn
   CIDR Block: 10.0.0.0/16
   Public Subnet CIDR: 10.0.1.0/24
   ```

### 2.3 Configure Security List Ingress Rules

| Source Type | Source CIDR | Protocol | Dest Port | Description |
|---|---|---|---|---|
| CIDR | 0.0.0.0/0 | TCP | 22 | SSH |
| CIDR | 0.0.0.0/0 | TCP | 25565 | Minecraft Java |
| CIDR | 0.0.0.0/0 | UDP | 19132 | Geyser Bedrock |
| CIDR | 0.0.0.0/0 | TCP | 3000 | Dashboard (optional) |
| CIDR | 0.0.0.0/0 | TCP | 8123 | Dynmap (optional) |

### 2.4 Create VM Instance

1. Console > Compute > Instances > **Create Instance**
2. Configure:
   - **Name:** `minecraft-server`
   - **Image:** Canonical Ubuntu 24.04 LTS (aarch64)
   - **Shape:** VM.Standard.A1.Flex (4 OCPU, 24 GB RAM)
   - **Networking:** `minecraft-vcn` public subnet, assign public IP
   - **SSH Keys:** Paste your public key
   - **Boot Volume:** 100 GB

### 2.5 Reserve Static Public IP

1. Console > Networking > IP Management > **Reserved Public IPs** > Name: `minecraft-static-ip`
2. Attach to your instance's VNIC

### 2.6 First SSH Connection

```bash
ssh -i ~/.ssh/oci_key ubuntu@<PUBLIC_IP>
uname -m  # Should show aarch64
```

---

## 3. Server Provisioning

### 3.1 System Update & Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget unzip zip ufw htop net-tools build-essential ntp fail2ban jq screen
sudo timedatectl set-timezone UTC
```

### 3.2 Install Java 21

```bash
sudo apt install -y openjdk-21-jdk-headless
java -version
# Expected: openjdk version "21.0.x" LTS
```

### 3.3 Create Minecraft User

```bash
sudo useradd -r -m -d /opt/minecraft -s /usr/sbin/nologin minecraft
sudo mkdir -p /opt/minecraft/{server,backups,scripts,logs}
sudo chown -R minecraft:minecraft /opt/minecraft
sudo chmod -R 750 /opt/minecraft
```

### 3.4 Configure Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 25565/tcp comment 'Minecraft Java'
sudo ufw allow 19132/udp comment 'Geyser Bedrock'
sudo ufw allow 3000/tcp comment 'Web Dashboard'
sudo ufw --force enable
sudo ufw status verbose
```

### 3.5 Configure Fail2ban

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 86400
EOF
sudo systemctl restart fail2ban
```

---

## 4. Minecraft Server Installation

### 4.1 Download PaperMC (Recommended)

```bash
cd /opt/minecraft/server
LATEST_VERSION=$(curl -s https://api.papermc.io/v2/projects/paper | jq -r '.versions[-1]')
LATEST_BUILD=$(curl -s "https://api.papermc.io/v2/projects/paper/versions/$LATEST_VERSION/builds" | jq -r '.builds[-1].build')
sudo -u minecraft curl -o paper.jar \
  "https://api.papermc.io/v2/projects/paper/versions/$LATEST_VERSION/builds/$LATEST_BUILD/downloads/paper-$LATEST_VERSION-$LATEST_BUILD.jar"
```

### 4.2 Accept EULA & First Launch

```bash
echo "eula=true" | sudo tee /opt/minecraft/server/eula.txt
sudo -u minecraft timeout 30 java -jar /opt/minecraft/server/paper.jar --nogui || true
```

---

## 5. Server Configuration

### 5.1 server.properties

```bash
sudo -u minecraft tee /opt/minecraft/server/server.properties > /dev/null << 'EOF'
server-port=25565
online-mode=true
max-players=20
network-compression-threshold=256
view-distance=8
simulation-distance=6
max-tick-time=60000
rate-limit=10
sync-chunk-writes=false
white-list=true
enforce-whitelist=true
spawn-protection=16
difficulty=hard
pvp=true
enable-command-block=false
enable-rcon=false
log-ips=true
EOF
```

### 5.2 Understanding online-mode

| Setting | Behavior | Security | Use Case |
|---------|----------|----------|----------|
| `online-mode=true` | Mojang/Microsoft auth required | Secure | Official accounts only |
| `online-mode=false` | No authentication | Insecure | Cracked launchers (TLauncher, etc.) |

**Security implications of `online-mode=false`:**
- Anyone can join using any username, including impersonating admins
- UUID spoofing: attackers can use your UUID and gain op status
- Bans are username-based only (trivially bypassed)
- Pirated launchers work without purchasing the game

**Recommendation:** Keep `online-mode=true`. For non-premium players, use GeyserMC + Floodgate (Bedrock players authenticate via Xbox Live without needing a Java Edition account).

### 5.3 How Non-Premium Launchers Connect

Launchers like TLauncher send a modified handshake packet that skips Mojang session server verification. With `online-mode=false`, the server accepts without validation. The player's UUID is derived from a hash of their username rather than from Mojang's servers.

With `online-mode=true`, the server verifies every connection against `sessionserver.mojang.com`. Non-premium launchers fail with "Failed to verify username!"

### 5.4 Whitelist & Operators

```bash
# In-game:
/whitelist add <username>
/whitelist remove <username>
/op <username>

# Direct files:
# /opt/minecraft/server/whitelist.json
# /opt/minecraft/server/ops.json
```

### 5.5 Paper Optimization Config

```yaml
# paper-global.yml key settings:
world-settings:
  default:
    entity-activation-range:
      animals: 24
      monsters: 32
      raiders: 48
      water: 12
      villagers: 16
    hopper:
      cooldown: 60
      disable-move-event: true
    redstone:
      pulse-cap: 20
    environment:
      optimize-explosions: true
async-chunks:
  enable: true
  threads: -1
player-auto-save:
  rate: 300
```

---

## 6. Performance Optimization

### 6.1 JVM Flags by RAM Tier

**Full A1 Flex (10G for Minecraft, 14G OS overhead):**
```bash
-Xms10G -Xmx10G -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
-XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions \
-XX:+DisableExplicitGC -XX:+AlwaysPreTouch \
-XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 \
-XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 \
-XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 \
-XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 \
-XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 \
-XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 \
-Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true
```

**Medium (5G for Minecraft):**
```bash
-Xms5G -Xmx5G -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
-XX:MaxGCPauseMillis=200 -XX:+DisableExplicitGC -XX:+AlwaysPreTouch \
-XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 \
-XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 \
-XX:InitiatingHeapOccupancyPercent=15 -XX:SurvivorRatio=32 \
-XX:MaxTenuringThreshold=1
```

### 6.2 Flag Explanations

| Flag | Purpose |
|------|---------|
| `-Xms` / `-Xmx` | Initial/max heap (must match to prevent resizing pauses) |
| `-XX:+UseG1GC` | Garbage-First collector (best for large heaps) |
| `-XX:+ParallelRefProcEnabled` | Parallelize reference processing |
| `-XX:+DisableExplicitGC` | Prevent System.gc() from plugins |
| `-XX:+AlwaysPreTouch` | Pre-allocate memory at startup |
| `-XX:MaxTenuringThreshold=1` | Promote objects from young gen ASAP |

### 6.3 World Pre-generation

```bash
sudo -u minecraft curl -o /opt/minecraft/server/plugins/Chunky.jar \
  "https://downloads.chunky.petrov.dev/chunky-1.4.10.jar"

# In-game:
# /chunky radius 5000
# /chunky start
# /chunky worldborder 10000
```

### 6.4 Lag Reduction Techniques

1. Pre-generate chunks to avoid exploration lag
2. Set world border to limit explored area
3. Reduce mob caps in paper config
4. Limit redstone pulse cap (20/sec)
5. Disable hopper minecarts if not needed
6. Schedule daily restart at low-traffic times
7. Use `/spark profiler --timeout 120` to find bottlenecks
8. Remove unused plugins
9. Keep view-distance 6-8, simulation-distance 4-6

---

## 7. Security Hardening

### 7.1 SSH Hardening

```bash
sudo tee /etc/ssh/sshd_config.d/hardening.conf > /dev/null << 'EOF'
PermitRootLogin no
PasswordAuthentication no
AllowUsers ubuntu
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sudo systemctl restart sshd
```

### 7.2 Automatic Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 7.3 File Permissions

```bash
sudo chmod -R 750 /opt/minecraft
sudo chmod -R 700 /opt/minecraft/server
sudo chown -R minecraft:minecraft /opt/minecraft
```

---

## 8. Automation & systemd Services

### 8.1 Start Script

```bash
sudo tee /opt/minecraft/scripts/start.sh > /dev/null << 'SCRIPT'
#!/bin/bash
set -euo pipefail
MC_DIR="/opt/minecraft/server"
MC_LOGS="/opt/minecraft/logs"
MEMORY="10G"

JAVA_FLAGS="-Xms${MEMORY} -Xmx${MEMORY} -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
  -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC \
  -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 \
  -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 \
  -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 \
  -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 \
  -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 \
  -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true"

rm -f "${MC_DIR}/.sessionlock"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
exec nice -n -5 ionice -c 1 -n 0 \
  java ${JAVA_FLAGS} -jar "${MC_DIR}/paper.jar" --nogui \
  2>&1 | tee "${MC_LOGS}/server-${TIMESTAMP}.log"
SCRIPT
sudo chmod +x /opt/minecraft/scripts/start.sh
sudo chown minecraft:minecraft /opt/minecraft/scripts/start.sh
```

### 8.2 Stop Script

```bash
sudo tee /opt/minecraft/scripts/stop.sh > /dev/null << 'SCRIPT'
#!/bin/bash
set -euo pipefail
MC_DIR="/opt/minecraft/server"
PID_FILE="${MC_DIR}/.pid"
if [ -f "${PID_FILE}" ]; then
  PID=$(cat "${PID_FILE}")
  if kill -0 "${PID}" 2>/dev/null; then
    echo "Stopping Minecraft server (PID: ${PID})..."
    kill -15 "${PID}"
    for i in $(seq 1 30); do
      if ! kill -0 "${PID}" 2>/dev/null; then echo "Stopped gracefully."; break; fi
      sleep 1
    done
    kill -9 "${PID}" 2>/dev/null || true
  fi
fi
echo "Server process ended."
SCRIPT
sudo chmod +x /opt/minecraft/scripts/stop.sh
sudo chown minecraft:minecraft /opt/minecraft/scripts/stop.sh
```

### 8.3 systemd Service

```bash
sudo tee /etc/systemd/system/minecraft.service > /dev/null << 'EOF'
[Unit]
Description=Minecraft Paper Server
After=network.target

[Service]
Type=simple
User=minecraft
Group=minecraft
WorkingDirectory=/opt/minecraft/server
ExecStart=/opt/minecraft/scripts/start.sh
ExecStop=/opt/minecraft/scripts/stop.sh
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536
PIDFile=/opt/minecraft/server/.pid

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minecraft.service
sudo systemctl start minecraft.service
sudo systemctl status minecraft.service
```

### 8.4 Monitoring Script

```bash
sudo tee /opt/minecraft/scripts/monitor.sh > /dev/null << 'SCRIPT'
#!/bin/bash
MC_DIR="/opt/minecraft/server"
PID_FILE="${MC_DIR}/.pid"
LOG="/opt/minecraft/logs/monitor.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${LOG}"; }

if [ -f "${PID_FILE}" ]; then
  PID=$(cat "${PID_FILE}")
  if ! kill -0 "${PID}" 2>/dev/null; then
    log "ALERT: Process not running. Restarting..."
    sudo systemctl restart minecraft.service
    exit 1
  fi
else
  log "ALERT: No PID file."
  sudo systemctl start minecraft.service 2>/dev/null || true
  exit 1
fi

MEM=$(free -m | awk '/^Mem:/ {printf "%.1f", $3/$2 * 100}')
log "OK | Memory: ${MEM}%"
if (( $(echo "${MEM} > 90" | bc -l) )); then
  log "ALERT: High memory: ${MEM}%"
fi
SCRIPT
sudo chmod +x /opt/minecraft/scripts/monitor.sh
(crontab -u minecraft -l 2>/dev/null; echo "*/5 * * * * /opt/minecraft/scripts/monitor.sh") | sudo crontab -u minecraft -
```

### 8.5 Update Script

```bash
sudo tee /opt/minecraft/scripts/update.sh > /dev/null << 'SCRIPT'
#!/bin/bash
MC_DIR="/opt/minecraft/server"
BACKUP_DIR="/opt/minecraft/backups"
LOG="/opt/minecraft/logs/update.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG}"; }

CURRENT=$(cat "${MC_DIR}/current-build.txt" 2>/dev/null || echo "unknown")
LATEST_VER=$(curl -s https://api.papermc.io/v2/projects/paper | jq -r '.versions[-1]')
LATEST_BUILD=$(curl -s "https://api.papermc.io/v2/projects/paper/versions/${LATEST_VER}/builds" | jq -r '.builds[-1].build')
LATEST="${LATEST_VER}-${LATEST_BUILD}"
[ "${CURRENT}" = "${LATEST}" ] && { log "Up to date."; exit 0; }

log "Updating to ${LATEST}..."
systemctl stop minecraft.service
mkdir -p "${BACKUP_DIR}"
tar -czf "${BACKUP_DIR}/pre-update-$(date +%Y%m%d-%H%M%S).tar.gz" -C "${MC_DIR}" --exclude=paper.jar --exclude=world* .
mv "${MC_DIR}/paper.jar" "${MC_DIR}/paper.jar.old"
curl -o "${MC_DIR}/paper.jar" "https://api.papermc.io/v2/projects/paper/versions/${LATEST_VER}/builds/${LATEST_BUILD}/downloads/paper-${LATEST_VER}-${LATEST_BUILD}.jar"
echo "${LATEST}" > "${MC_DIR}/current-build.txt"
chown -R minecraft:minecraft "${MC_DIR}"
systemctl start minecraft.service
log "Update complete: ${LATEST}"
SCRIPT
sudo chmod +x /opt/minecraft/scripts/update.sh
```

---

## 9. Backup & Recovery

### 9.1 Backup Script

```bash
sudo tee /opt/minecraft/scripts/backup.sh > /dev/null << 'SCRIPT'
#!/bin/bash
MC_DIR="/opt/minecraft/server"
BACKUP_DIR="/opt/minecraft/backups"
LOG="/opt/minecraft/logs/backup.log"
RETENTION=7
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG}"; }
do_backup() {
  local TYPE="${1:-daily}"
  local FILE="mc-${TYPE}-$(date +%Y%m%d-%H%M%S).tar.gz"
  log "Starting ${TYPE} backup..."
  systemctl is-active --quiet minecraft.service && echo "save-off" > /proc/*/fd/0 2>/dev/null || true
  tar -czf "${BACKUP_DIR}/${FILE}" -C "${MC_DIR}" world server.properties whitelist.json ops.json 2>/dev/null
  systemctl is-active --quiet minecraft.service && echo "save-on" > /proc/*/fd/0 2>/dev/null || true
  local SIZE=$(du -h "${BACKUP_DIR}/${FILE}" | cut -f1)
  log "Backup: ${FILE} (${SIZE})"
  find "${BACKUP_DIR}" -name "mc-${TYPE}-*" -mtime +${RETENTION} -delete
}
case "${1:-daily}" in daily|weekly|manual) do_backup "$1" ;; *) echo "Usage: $0 {daily|weekly|manual}"; exit 1 ;; esac
SCRIPT
sudo chmod +x /opt/minecraft/scripts/backup.sh
```

### 9.2 Backup Timer

```bash
sudo tee /etc/systemd/system/minecraft-backup.service > /dev/null << 'EOF'
[Unit]
Description=Minecraft Backups
[Service]
Type=oneshot
User=minecraft
ExecStart=/opt/minecraft/scripts/backup.sh daily
EOF

sudo tee /etc/systemd/system/minecraft-backup.timer > /dev/null << 'EOF'
[Unit]
Description=Daily Backup Timer
[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now minecraft-backup.timer
```

### 9.3 Restore Script

```bash
sudo tee /opt/minecraft/scripts/restore.sh > /dev/null << 'SCRIPT'
#!/bin/bash
MC_DIR="/opt/minecraft/server"
BACKUP_DIR="/opt/minecraft/backups"
[ "$(id -u)" -ne 0 ] && { echo "Run as root."; exit 1; }
BACKUPS=($(ls -1t "${BACKUP_DIR}"/*.tar.gz 2>/dev/null))
[ ${#BACKUPS[@]} -eq 0 ] && { echo "No backups."; exit 1; }
for i in "${!BACKUPS[@]}"; do echo "  $((i+1)). $(basename ${BACKUPS[$i]})"; done
read -p "Select (1-${#BACKUPS[@]}): " SEL
[[ "${SEL}" =~ ^[0-9]+$ ]] && [ "${SEL}" -ge 1 ] && [ "${SEL}" -le ${#BACKUPS[@]} ] || { echo "Invalid."; exit 1; }
read -p "Overwrite? (y/N): " CONFIRM; [[ ! "${CONFIRM}" =~ ^[yY] ]] && { echo "Cancelled."; exit 0; }
systemctl stop minecraft.service
tar -czf "${BACKUP_DIR}/pre-restore-$(date +%Y%m%d-%H%M%S).tar.gz" -C "${MC_DIR}" world 2>/dev/null
tar -xzf "${BACKUPS[$((SEL-1))]}" -C "${MC_DIR}"
chown -R minecraft:minecraft "${MC_DIR}"
systemctl start minecraft.service
echo "Restore complete."
SCRIPT
sudo chmod +x /opt/minecraft/scripts/restore.sh
```

---

## 10. Advanced Features

### 10.1 GeyserMC + Floodgate (Cross-Platform)

GeyserMC allows Bedrock players to join your Java server. Floodgate removes the need for a Java account.

```bash
cd /opt/minecraft/server/plugins
sudo -u minecraft curl -o Geyser-Spigot.jar \
  "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
sudo -u minecraft curl -o floodgate-spigot.jar \
  "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot"
sudo chown minecraft:minecraft *.jar
sudo systemctl restart minecraft.service
```

Geyser config (`plugins/Geyser-Spigot/config.yml`):
```yaml
bedrock:
  address: 0.0.0.0
  port: 19132
remote:
  address: auto
  port: auto
  auth-type: floodgate
```

### 10.2 LuckPerms Installation

```bash
sudo -u minecraft curl -o /opt/minecraft/server/plugins/LuckPerms.jar \
  "https://download.luckperms.net/latest/paper"
sudo systemctl restart minecraft.service

# In-game:
# /lp creategroup admin
# /lp group admin permission set *
# /lp user <player> parent set admin
```

### 10.3 EssentialsX Installation

```bash
BASE_URL="https://ci.ender.zone/job/EssentialsX"
for JAR in EssentialsX.jar EssentialsXChat.jar EssentialsXProtect.jar; do
  sudo -u minecraft curl -o "/opt/minecraft/server/plugins/${JAR}" \
    "${BASE_URL}/lastSuccessfulBuild/artifact/jars/${JAR}"
done
sudo systemctl restart minecraft.service
```

### 10.4 WorldEdit & Dynmap

```bash
sudo -u minecraft curl -o /opt/minecraft/server/plugins/WorldEdit.jar \
  "https://dev.bukkit.org/projects/worldedit/files/latest"
sudo -u minecraft curl -o /opt/minecraft/server/plugins/Dynmap.jar \
  "https://www.dynmap.org/download/paper"
sudo systemctl restart minecraft.service
# Dynmap web: http://<IP>:8123 (add OCI ingress rule TCP 8123)
```

### 10.5 PaperMC vs Vanilla

| Feature | Paper | Vanilla |
|---------|-------|---------|
| Async chunk loading | Yes | No |
| Hopper performance | 10x faster | Baseline |
| Anti-Xray | Built-in | None |
| Entity activation control | Configurable | Fixed |
| Plugin API | Bukkit+Paper | None |

---

## 11. Web Dashboard

### 11.1 File Structure

```
dashboard/
  package.json
  server/
    package.json
    index.js                     # Express + Socket.IO entry
    routes/
      auth.js                    # JWT login/register/logout
      api.js                     # REST: status, start, stop, restart, backup, logs
    middleware/
      auth.js                    # JWT verification
    services/
      mcControl.js               # Minecraft process controller
    socket/
      handler.js                 # Socket.IO events
    db/
      schema.sql                 # SQLite schema
      database.js                # SQLite connection
    setup.js                     # First-time admin creation
  client/
    package.json
    vite.config.js
    tailwind.config.js
    src/
      main.jsx
      App.jsx
      index.css                  # Tailwind styles
      context/
        ServerContext.jsx         # Global server state
      hooks/
        useSocket.js              # Socket.IO hook
      pages/
        Dashboard.jsx             # Main dashboard
        Logs.jsx                  # Console viewer
        Login.jsx                 # Auth page
      components/
        Layout/
          Layout.jsx / Sidebar.jsx / Header.jsx
        Dashboard/
          ServerStatusCard.jsx
          OnlinePlayers.jsx
          TPSCounter.jsx
          RAMChart.jsx
          CPUChart.jsx
          ActionButtons.jsx
```

### 11.2 Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin','moderator','viewer')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 11.3 API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/status` | JWT | Server running, TPS, CPU, RAM, players |
| GET | `/api/logs?lines=100` | JWT | Recent logs |
| POST | `/api/server/start` | JWT | Start server |
| POST | `/api/server/stop` | JWT | Stop server |
| POST | `/api/server/restart` | JWT | Restart server |
| POST | `/api/server/backup` | JWT | Trigger backup |
| POST | `/api/auth/login` | None | Get JWT token |

### 11.4 Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `server:status` | S->C | Running state change |
| `server:metrics` | S->C | CPU/RAM/TPS every 3s |
| `server:logs` | S->C | New log lines every 2s |
| `server:action:result` | S->C | Action result |
| `server:start/stop/restart` | C->S | Control actions |

### 11.5 Dashboard Deployment

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Create directory
sudo mkdir -p /opt/minecraft/dashboard/{server,client,data}
sudo chown -R minecraft:minecraft /opt/minecraft/dashboard

# Deploy dashboard files to /opt/minecraft/dashboard/ then:
cd /opt/minecraft/dashboard
sudo npm install && cd client && npm install && npm run build && cd ../server && npm install
sudo -u minecraft node setup.js  # Create admin user

# systemd service
sudo tee /etc/systemd/system/minecraft-dashboard.service > /dev/null << 'EOF'
[Unit]
Description=Minecraft Dashboard
After=network.target
[Service]
Type=simple
User=minecraft
WorkingDirectory=/opt/minecraft/dashboard/server
Environment=NODE_ENV=production PORT=3001 MC_DIR=/opt/minecraft/server
Environment=JWT_SECRET=$(openssl rand -base64 32)
Environment=DB_PATH=/opt/minecraft/dashboard/data/dashboard.db
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now minecraft-dashboard.service
```

### 11.6 Dashboard Screenshots (ASCII)

```
+--------------------------------------------------+
| [LOGO] MCServer  |  ONLINE  | TPS: 19.8 | 3/20  |
+--------------------------------------------------+
|          |                                        |
| Dashboard |  +--------+ +--------+ +--------+    |
| Players   |  | ONLINE | | TPS    | | RAM    |    |
| Console   |  | ACTIVE | | 19.8   | | 4.2GB  |    |
| Settings  |  +--------+ +--------+ +--------+    |
|          |  +--------+ +--------+                |
| Logout   |  | CPU    | | PLAYERS|                |
|          |  | 35%    | | 3 online|               |
|          |  +--------+ +--------+                |
|          |                                        |
|          | [START] [STOP] [RESTART] [BACKUP]     |
+--------------------------------------------------+
```

---

## 12. Troubleshooting Guide

| Symptom | Cause | Fix |
|---------|-------|-----|
| Server won't start, Java error | Wrong Java version | `sudo apt install openjdk-21-jdk-headless` |
| `Connection refused` | Server not running | `sudo systemctl status minecraft.service` |
| `Connection timed out` | Firewall blocking | Check UFW + OCI ingress rules for port 25565 |
| `Failed to verify username` | online-mode=true + non-premium | Use premium account or set online-mode=false |
| `Out of capacity` for A1 | ARM instances full | Try different AD/region, reduce OCPUs, wait 24h |
| High CPU / low TPS | JVM flags not applied | Use Aikar's flags from Section 6 |
| Lag when exploring | Chunks not pre-generated | Use Chunky plugin to pre-generate |

### Debugging Commands

```bash
ps aux | grep java
free -h
df -h /opt/minecraft
sudo netstat -tulpn | grep 25565
journalctl -u minecraft.service -n 50 -f
sudo ufw status verbose
```

---

## 13. FAQ

**Q1: How much does this cost?** $0. Oracle Always Free Tier.

**Q2: Can I run modded servers?** Yes, replace the Paper JAR.

**Q3: How many players?** 20-50 on full A1 Flex (4 OCPU/24GB).

**Q4: Is `online-mode=false` safe?** No. Use Geyser+Floodgate for non-premium.

**Q5: How do Bedrock players connect?** Install GeyserMC (UDP 19132), connect to `<IP>:19132`.

**Q6: What if the server crashes?** systemd auto-restarts (`Restart=on-failure`).

**Q7: How to update Minecraft?** `sudo /opt/minecraft/scripts/update.sh`

**Q8: Can I see my world in a browser?** Yes, Dynmap on port 8123.

**Q9: What if A1 shows "Out of capacity"?** Try different AD/region, reduce OCPUs, wait.

**Q10: Can I use a custom domain?** Yes, A record to your static IP.

**Q11: How to reset dashboard password?** Delete `dashboard.db` and re-run setup.

**Q12: How to check server TPS?** In-game: `/tick` (Paper) or dashboard gauge.

---

## 14. Security Checklist

### Network
- [ ] OCI Security List allows only required ports
- [ ] SSH key-based auth only
- [ ] UFW enabled, default deny inbound
- [ ] Fail2ban configured for SSH

### OS
- [ ] Automatic security updates enabled
- [ ] Root SSH login disabled
- [ ] Dedicated `minecraft` user
- [ ] Least privilege permissions (750/700)

### Minecraft
- [ ] `online-mode=true` (or Floodgate)
- [ ] Whitelist enabled
- [ ] RCON disabled or localhost-only
- [ ] Command blocks disabled in survival
- [ ] Rate-limit configured

### Backups
- [ ] Daily automated backups
- [ ] Retention policy (7 days)
- [ ] Restore tested

### Monitoring
- [ ] Health check every 5 minutes
- [ ] Crash detection + auto-restart

### Dashboard
- [ ] JWT authentication
- [ ] bcrypt password hashing
- [ ] CORS configured
- [ ] Parameterized SQL queries
- [ ] HTTPS for production (Nginx + Let's Encrypt)

---

## Appendix: One-Line Quick Setup

```bash
sudo apt update && sudo apt install -y curl wget jq openjdk-21-jdk-headless && \
sudo useradd -r -m -d /opt/minecraft -s /usr/sbin/nologin minecraft && \
sudo mkdir -p /opt/minecraft/{server,backups,scripts,logs} && \
sudo chown -R minecraft:minecraft /opt/minecraft && \
echo "eula=true" | sudo tee /opt/minecraft/server/eula.txt && \
VER=$(curl -s https://api.papermc.io/v2/projects/paper | jq -r '.versions[-1]') && \
BLD=$(curl -s "https://api.papermc.io/v2/projects/paper/versions/${VER}/builds" | jq -r '.builds[-1].build') && \
sudo -u minecraft curl -o /opt/minecraft/server/paper.jar \
  "https://api.papermc.io/v2/projects/paper/versions/${VER}/builds/${BLD}/downloads/paper-${VER}-${BLD}.jar" && \
echo "Paper $VER build $BLD installed."
```

## Appendix: Useful Commands

```bash
# Server
sudo systemctl start|stop|restart|status minecraft.service
journalctl -u minecraft.service -f
sudo /opt/minecraft/scripts/backup.sh manual
sudo /opt/minecraft/scripts/restore.sh
sudo /opt/minecraft/scripts/update.sh
```

---

*End of Guide. Your Oracle Cloud Free Tier Minecraft server is production-ready with automation, monitoring, backups, security, and a modern web dashboard.*
