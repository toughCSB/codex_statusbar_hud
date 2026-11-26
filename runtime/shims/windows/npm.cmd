@echo off
if not defined CODEX_HUD_NODE goto missing
if not defined CODEX_HUD_NPM_INTERCEPTOR goto missing
"%CODEX_HUD_NODE%" "%CODEX_HUD_NPM_INTERCEPTOR%" %*
exit /b %errorlevel%
:missing
echo Codex HUD could not locate the npm interceptor. 1>&2
exit /b 1
