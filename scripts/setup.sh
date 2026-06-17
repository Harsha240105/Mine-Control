#!/bin/bash
# MineControl OS - Linux/macOS Setup
set -e

echo "============================================"
echo "   MineControl OS - Setup"
echo "============================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Install it from https://nodejs.org/ or use your package manager"
    exit 1
fi
echo "[OK] Node.js: $(node --version)"

# Check for Java
if ! command -v java &> /dev/null; then
    echo "[WARN] Java not found. Install Java 17+ from https://adoptium.net/"
else
    echo "[OK] Java: $(java -version 2>&1 | head -n 1)"
fi

echo ""
echo "[1/4] Installing npm dependencies..."
npm install

echo ""
echo "[2/4] Creating data directories..."
mkdir -p minecraft/plugins minecraft/worlds minecraft/backups minecraft/logs data

echo ""
echo "[3/4] Checking for PaperMC..."
if [ ! -f "minecraft/server.jar" ]; then
    echo "[WARN] server.jar not found in minecraft/"
    echo "Download it: curl -L -o minecraft/server.jar https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/latest/downloads/paper-1.21.1-latest.jar"
else
    echo "[OK] server.jar found"
fi

echo ""
echo "[4/4] Building project..."
npx tsc --noEmit 2>/dev/null || echo "[WARN] TypeScript check had issues (non-blocking)"

echo ""
echo "============================================"
echo "  Setup complete!"
echo ""
echo "  Start: npm run dev"
echo "  Open:  http://localhost:3001"
echo "  Login: owner / minecraft"
echo "============================================"
