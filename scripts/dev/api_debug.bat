@echo off
title Unreleased — API Debug Console
cd /d "%~dp0\..\.."
cmd /k python scripts\dev\api_debug.py
