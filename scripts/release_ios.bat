@echo off
title Unreleased — iOS Release
cd /d "%~dp0\.."
python scripts\python\release_ios.py %*
