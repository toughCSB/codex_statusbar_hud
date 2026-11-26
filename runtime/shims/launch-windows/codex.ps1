$ErrorActionPreference='Stop'
$launcher=Join-Path $env:LOCALAPPDATA 'CodexHudIntegration\current\codex-launcher.cjs'
if(-not (Test-Path -LiteralPath $launcher -PathType Leaf)){Write-Error 'Codex HUD launcher is missing.';exit 1}
& node.exe $launcher @args
exit $LASTEXITCODE
