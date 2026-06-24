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
      if ! kill -0 "${PID}" 2>/dev/null; then
        echo "Server stopped gracefully."
        break
      fi
      sleep 1
    done
    if kill -0 "${PID}" 2>/dev/null; then
      echo "Force killing..."
      kill -9 "${PID}" 2>/dev/null || true
    fi
  fi
fi

echo "Server process ended."
