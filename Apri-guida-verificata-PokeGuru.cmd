@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-guide-demo.ps1" -ValidatedGuide
if errorlevel 1 pause
