@echo off
title Download PaperMC
echo Downloading latest PaperMC 1.21.1...
echo.

powershell -Command "& {
    $response = Invoke-RestMethod -Uri 'https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/latest'
    $build = $response.build
    $fileName = $response.downloads.application.name
    $url = 'https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/' + $build + '/downloads/' + $fileName
    Write-Host 'Downloading build #'$build'...'
    Invoke-WebRequest -Uri $url -OutFile 'minecraft\server.jar'
    Write-Host '[OK] Downloaded:' $fileName
}"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Download failed
    echo Please download manually from https://papermc.io/downloads
) else (
    echo [OK] server.jar ready in minecraft\ directory
)

pause
