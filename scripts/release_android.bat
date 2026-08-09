@echo off
title Unreleased — Android Release
cd /d "%~dp0\.."
python scripts\python\release_android.py %*
