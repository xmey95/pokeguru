@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-guide-demo.ps1" -AppTrial
if errorlevel 1 pause
