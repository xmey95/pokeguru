@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-guide-demo.ps1" -ValidatedGuide -ApprovedSource ".verify\app259-followups-20261108\third-valid\approved-source.json"
if errorlevel 1 pause
