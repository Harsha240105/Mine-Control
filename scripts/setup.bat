@echo off
title MineControl OS Setup
echo ============================================
echo    MineControl OS - Windows Setup
echo ============================================
echo.

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found: 
node --version

REM Check for Java
where java >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Java not found in PATH
    echo Make sure Java 17+ is installed
) else (
    echo [OK] Java found:
    java -version 2>&1 | findstr "version"
)

echo.
echo [1/4] Installing npm dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo [OK] Dependencies installed

echo.
echo [2/4] Creating data directories...
if not exist "minecraft\plugins" mkdir minecraft\plugins
if not exist "minecraft\worlds" mkdir minecraft\worlds
if not exist "minecraft\backups" mkdir minecraft\backups
if not exist "minecraft\logs" mkdir minecraft\logs
if not exist "data" mkdir data
echo [OK] Directories created

echo.
echo [3/4] Checking for PaperMC server jar...
if not exist "minecraft\server.jar" (
    echo [WARN] server.jar not found in minecraft\
    echo.
    echo You need to download PaperMC manually:
    echo 1. Go to https://papermc.io/downloads
    echo 2. Download the latest PaperMC jar
    echo 3. Rename it to server.jar
    echo 4. Place it in the minecraft\ directory
    echo.
    echo Alternatively, run: scripts\download-paper.bat
) else (
    echo [OK] server.jar found
)

echo.
echo [4/4] Setup complete!
echo.
echo ============================================
echo    To start MineControl OS:
echo    npm run dev
echo.
echo    Open http://localhost:3001
echo    Login: owner / minecraft
echo ============================================
echo.
pause
