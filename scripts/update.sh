#!/bin/bash
set -euo pipefail

MC_DIR="/opt/minecraft/server"
BACKUP_DIR="/opt/minecraft/backups"
LOG_FILE="/opt/minecraft/logs/update.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root."
  exit 1
fi

CURRENT=$(cat "${MC_DIR}/current-build.txt" 2>/dev/null || echo "unknown")
log "Current build: ${CURRENT}"

LATEST_VERSION=$(curl -s https://api.papermc.io/v2/projects/paper | jq -r '.versions[-1]')
LATEST_BUILD=$(curl -s "https://api.papermc.io/v2/projects/paper/versions/${LATEST_VERSION}/builds" | jq -r '.builds[-1].build')
LATEST="${LATEST_VERSION}-${LATEST_BUILD}"

log "Latest available: ${LATEST}"

if [ "${CURRENT}" = "${LATEST}" ]; then
  log "Already up to date. Nothing to do."
  exit 0
fi

log "Update available! Proceeding..."

mkdir -p "${BACKUP_DIR}/pre-update"
BACKUP_FILE="${BACKUP_DIR}/pre-update/pre-update-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "${BACKUP_FILE}" -C "${MC_DIR}" \
  --exclude=paper.jar --exclude=world --exclude=world_nether --exclude=world_the_end \
  . 2>/dev/null || true

log "Stopping server..."
systemctl stop minecraft.service
sleep 5

mv "${MC_DIR}/paper.jar" "${MC_DIR}/paper.jar.old" 2>/dev/null || true

log "Downloading Paper ${LATEST_VERSION} build ${LATEST_BUILD}..."
curl -s -o "${MC_DIR}/paper.jar" \
  "https://api.papermc.io/v2/projects/paper/versions/${LATEST_VERSION}/builds/${LATEST_BUILD}/downloads/paper-${LATEST_VERSION}-${LATEST_BUILD}.jar"

echo "${LATEST}" > "${MC_DIR}/current-build.txt"
chown -R minecraft:minecraft "${MC_DIR}"

log "Starting server..."
systemctl start minecraft.service

log "Update complete: ${CURRENT} -> ${LATEST}"
log "Old JAR backed up to: paper.jar.old"
log "Config backup: ${BACKUP_FILE}"
