#!/bin/bash
set -euo pipefail

MC_DIR="/opt/minecraft/server"
BACKUP_DIR="/opt/minecraft/backups"
LOG_FILE="/opt/minecraft/logs/backup.log"
RETENTION=7

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

do_backup() {
  local TYPE="${1:-daily}"
  local TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  local FILE="mc-${TYPE}-${TIMESTAMP}.tar.gz"

  log "Starting ${TYPE} backup..."

  if systemctl is-active --quiet minecraft.service; then
    echo "save-off" > /proc/*/fd/0 2>/dev/null || true
    sleep 1
  fi

  tar -czf "${BACKUP_DIR}/${FILE}" -C "${MC_DIR}" \
    world world_nether world_the_end \
    server.properties paper-global.yml bukkit.yml spigot.yml \
    whitelist.json ops.json permissions.yml 2>/dev/null || \
  tar -czf "${BACKUP_DIR}/${FILE}" -C "${MC_DIR}" \
    world server.properties whitelist.json ops.json 2>/dev/null

  if systemctl is-active --quiet minecraft.service; then
    echo "save-on" > /proc/*/fd/0 2>/dev/null || true
  fi

  local SIZE=$(du -h "${BACKUP_DIR}/${FILE}" | cut -f1)
  log "Backup complete: ${FILE} (${SIZE})"

  find "${BACKUP_DIR}" -name "mc-${TYPE}-*" -type f -mtime +${RETENTION} -delete
  local COUNT=$(find "${BACKUP_DIR}" -name "mc-${TYPE}-*" -type f | wc -l)
  log "Retained ${COUNT} ${TYPE} backups."
}

case "${1:-daily}" in
  daily|weekly|manual) do_backup "$1" ;;
  *) echo "Usage: $0 {daily|weekly|manual}"; exit 1 ;;
esac
