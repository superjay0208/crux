@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set "ARGS="
if /i "%1"=="--desktop" set "ARGS=--desktop"
if /i "%1"=="--stop" set "ARGS=--stop"
if /i "%1"=="--no-open" set "ARGS=--no-open"

rem Node resolution order (docs/09 J1.2): a runtime bundled inside this folder, the shared
rem portable copy this dev checkout currently uses, then whatever "node" resolves to on PATH.
set "NODE_EXE=%~dp0game\tools\node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%~dp0..\tools\node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

"%NODE_EXE%" --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: No Node.js runtime found.
    echo Looked for a bundled runtime under "game\tools\node\node.exe" and "..\tools\node\node.exe",
    echo and for "node" on PATH. Install Node.js from https://nodejs.org, or restore one of those
    echo folders, then run this again.
    pause
    exit /b 1
)

pushd "%~dp0game"
"%NODE_EXE%" scripts\launch.mjs %ARGS%
set "EXITCODE=%ERRORLEVEL%"
popd

if not "%EXITCODE%"=="0" (
    echo.
    echo Crux failed to launch. See the message above.
    pause
)

exit /b %EXITCODE%
