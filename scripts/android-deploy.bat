@echo off
rem Runs android-deploy.sh through Git's own bash.exe, not whatever "bash"
rem happens to resolve to on PATH (cmd.exe often finds the Windows/WSL bash
rem shim first, which doesn't support the script's `set -o pipefail`).
title Unreleased — Android Deploy
cd /d "%~dp0\.."

set "GIT_BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%GIT_BASH%" (
  echo Git bash.exe not found at "%GIT_BASH%".
  echo Edit this file's GIT_BASH path if Git is installed somewhere else.
  pause
  exit /b 1
)

"%GIT_BASH%" scripts/android-deploy.sh %*
