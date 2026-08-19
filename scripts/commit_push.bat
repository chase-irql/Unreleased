@echo off
title Unreleased — Commit ^& Push
cd /d "%~dp0\.."
python scripts\python\commit_push.py
