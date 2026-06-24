#!/bin/bash
set -euo pipefail

MC_DIR="/opt/minecraft/server"
MC_LOGS="/opt/minecraft/logs"
PID_FILE="${MC_DIR}/.pid"
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
