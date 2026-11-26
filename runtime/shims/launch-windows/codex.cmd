@echo off
node.exe "%LOCALAPPDATA%\CodexHudIntegration\current\codex-launcher.cjs" %*
exit /b %errorlevel%
