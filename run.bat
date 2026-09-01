@echo off
title Cord Player
cd /d "%~dp0"
echo ========================================================
echo   Starting Cord Player (Music & Podcasts Edition)
echo ========================================================
python -m pip install -r requirements.txt
python main.py
