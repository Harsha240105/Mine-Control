#!/bin/bash
set -euo pipefail

MC_DIR="/opt/minecraft/server"
BACKUP_DIR="/opt/minecraft/backups"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root."
  exit 1
fi

echo "=== Minecraft Backup Restore ==="

BACKUPS=($(ls -1t "${BACKUP_DIR}"/*.tar.gz 2>/dev/null))
if [ ${#BACKUPS[@]} -eq 0 ]; then
  echo "No backups found in ${BACKUP_DIR}."
  exit 1
fi

echo ""
echo "Available backups:"
for i in "${!BACKUPS[@]}"; do
  SIZE=$(du -h "${BACKUPS[$i]}" | cut -f1)
  echo "  $((i+1)). $(basename ${BACKUPS[$i]}) (${SIZE})"
done

echo ""
read -p "Select backup to restore (1-${#BACKUPS[@]}): " SELECTION

if ! [[ "${SELECTION}" =~ ^[0-9]+$ ]] || \
   [ "${SELECTION}" -lt 1 ] || \
   [ "${SELECTION}" -gt ${#BACKUPS[@]} ]; then
  echo "Invalid selection."
  exit 1
fi

SELECTED="${BACKUPS[$((SELECTION-1))]}"
echo "Selected: $(basename ${SELECTED})"

read -p "This will OVERWRITE current world data. Continue? (y/N): " CONFIRM
if [[ ! "${CONFIRM}" =~ ^[yY]$ ]]; then
  echo "Restoration cancelled."
  exit 0
fi

echo "Stopping server..."
systemctl stop minecraft.service
sleep 3

echo "Creating emergency pre-restore backup..."
tar -czf "${BACKUP_DIR}/pre-restore-$(date +%Y%m%d-%H%M%S).tar.gz" \
  -C "${MC_DIR}" world world_nether world_the_end 2>/dev/null || true

echo "Restoring from backup..."
tar -xzf "${SELECTED}" -C "${MC_DIR}"

echo "Fixing permissions..."
chown -R minecraft:minecraft "${MC_DIR}"

echo "Starting server..."
systemctl start minecraft.service

echo ""
echo "Restoration complete from: $(basename ${SELECTED})"
