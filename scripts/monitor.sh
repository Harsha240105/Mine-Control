#!/bin/bash
set -euo pipefail

MC_DIR="/opt/minecraft/server"
PID_FILE="${MC_DIR}/.pid"
LOG_FILE="/opt/minecraft/logs/monitor.log"
WEBHOOK_URL=""   # Optional: webhook URL for alerts (Discord/Slack)

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${LOG_FILE}"
}

send_alert() {
  log "ALERT: $*"
  if [ -n "${WEBHOOK_URL}" ]; then
    curl -s -H "Content-Type: application/json" \
      -d "{\"content\": \"🚨 Minecraft Alert: $*\"}" \
      "${WEBHOOK_URL}" 2>/dev/null || true
  fi
}

if [ -f "${PID_FILE}" ]; then
  PID=$(cat "${PID_FILE}")
  if ! kill -0 "${PID}" 2>/dev/null; then
    send_alert "Process not running (PID ${PID}). Attempting restart..."
    sudo systemctl restart minecraft.service
    exit 1
  fi
else
  log "ALERT: No PID file found at ${PID_FILE}"
  if ! systemctl is-active --quiet minecraft.service; then
    log "Server not running via systemd either. Attempting start..."
    sudo systemctl start minecraft.service 2>/dev/null || true
  fi
  exit 1
fi

MEM_USAGE=$(free -m | awk '/^Mem:/ {printf "%.1f", $3/$2 * 100}')
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | cut -d, -f1 | tr -d ' ')

log "OK | Memory: ${MEM_USAGE}% | Load: ${LOAD_AVG}"

if (( $(echo "${MEM_USAGE} > 90" | bc -l) )); then
  send_alert "High memory usage: ${MEM_USAGE}%"
fi

RESTART_COUNT=$(journalctl -u minecraft.service --since "1 hour ago" | grep -c "Started Minecraft" || true)
if [ "${RESTART_COUNT}" -gt 5 ]; then
  send_alert "Server restarted ${RESTART_COUNT}x in the last hour! Possible crash loop."
fi

exit 0
