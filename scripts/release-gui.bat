@echo off
cd /d "%~dp0\.."
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw scripts\release_gui.py
) else (
    start "" python scripts\release_gui.py
)
