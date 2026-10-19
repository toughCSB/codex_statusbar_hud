#requires -Version 7.0
param([switch]$Plan,[switch]$TestOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$sourceRoot=Join-Path $projectRoot 'codex/codex-rs'
$targetRoot=Join-Path $env:USERPROFILE '.codex-hud-target'
$cargoArgs=if($TestOnly){@('test','-p','codex-tui','--lib','rainbow','--','--nocapture')}else{@('build','-p','codex-cli')}
if($Plan){[ordered]@{cwd=$sourceRoot;program='cargo';arguments=$cargoArgs;target=$targetRoot;normalize='project SQL source only';installAutomatically=$false;toolchain='existing installed default'}|ConvertTo-Json -Depth 6;exit 0}
$installedToolchain=((& rustup toolchain list|Where-Object{$_ -match 'default'}|Select-Object -First 1) -split ' ')[0]
if(!$installedToolchain){throw 'Installed default Rust toolchain not found; do not install tools automatically'}
$env:RUSTUP_TOOLCHAIN=$installedToolchain
$env:CARGO_TARGET_DIR=$targetRoot
$env:CARGO_BUILD_JOBS='4'
$env:CARGO_PROFILE_DEV_DEBUG='0'
$artifacts=Join-Path $projectRoot 'artifacts'
$logs=Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $artifacts,$logs -Force|Out-Null
& node (Join-Path $PSScriptRoot 'normalize-windows-migrations.mjs') (Join-Path $sourceRoot 'state')
if($LASTEXITCODE -ne 0){throw 'Project SQL normalization failed'}
Push-Location $sourceRoot
try{& cargo @cargoArgs 2>&1|Tee-Object -FilePath (Join-Path $logs ('native-'+(Get-Date -Format yyyyMMdd-HHmmss)+'.log'));if($LASTEXITCODE -ne 0){throw ('Cargo failed: '+$LASTEXITCODE)}}finally{Pop-Location}
if(!$TestOnly){& node (Join-Path $PSScriptRoot 'build-migration-manifest.mjs') (Join-Path $sourceRoot 'state') (Join-Path $artifacts 'migration-checksums.json') (Join-Path $targetRoot 'debug/codex.exe');if($LASTEXITCODE -ne 0){throw 'Manifest generation failed'}}
