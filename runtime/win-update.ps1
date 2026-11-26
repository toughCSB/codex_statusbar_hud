[CmdletBinding()]
param(
    [ValidatePattern('^(latest|[0-9]+\.[0-9]+\.[0-9]+)$')]
    [string]$Version = 'latest',
    [switch]$ForceReinstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$lock = $null
$stageRoot = $null
$backup = $null
$livePackage = $null
$swapped = $false
$completed = $false

function Get-PackageVersion([string]$Root) {
    return (Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
}

function Get-NativePath([string]$Root) {
    $arch = (& node.exe -p 'process.arch').Trim()
    if ($LASTEXITCODE -ne 0 -or $arch -notin @('x64', 'arm64')) {
        throw 'Cannot determine supported Windows Node architecture.'
    }
    $triple = if ($arch -eq 'x64') { 'x86_64-pc-windows-msvc' } else { 'aarch64-pc-windows-msvc' }
    $binary = Join-Path $Root "node_modules\@openai\codex-win32-$arch\vendor\$triple\bin\codex.exe"
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "Missing native executable: $binary" }
    $codeModeHost = Join-Path (Split-Path $binary -Parent) 'codex-code-mode-host.exe'
    if (-not (Test-Path -LiteralPath $codeModeHost -PathType Leaf)) { throw "Missing native code-mode host: $codeModeHost" }
    return $binary
}

function Assert-Version([string]$Command, [string]$Expected) {
    $output = @(& $Command --version 2>&1)
    if ($LASTEXITCODE -ne 0 -or ($output -join "`n").Trim() -ne "codex-cli $Expected") {
        throw "Version verification failed for $Command : $($output -join ' ')"
    }
}

function Test-LiveInstall([string]$Prefix, [string]$Expected) {
    $package = Join-Path $Prefix 'node_modules\@openai\codex'
    if ((Get-PackageVersion $package) -ne $Expected) { throw 'Live package metadata mismatch.' }
    Assert-Version (Get-NativePath $package) $Expected
    $entryRepair = Join-Path $PSScriptRoot 'npm-entry.cjs'
    & node.exe $entryRepair $package (Join-Path (Split-Path $PSScriptRoot -Parent) 'backups')
    if ($LASTEXITCODE -ne 0) { throw 'Codex HUD npm entry repair failed.' }
    Assert-Version (Join-Path $Prefix 'codex.cmd') $Expected
    $freshShell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $escapedWrapper = (Join-Path $Prefix 'codex.cmd').Replace("'", "''")
    $shellCode = "& '$escapedWrapper' --version; exit `$LASTEXITCODE"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($shellCode))
    $freshOutput = @(& $freshShell -NoLogo -NoProfile -EncodedCommand $encoded 2>&1)
    if ($LASTEXITCODE -ne 0 -or ($freshOutput -join "`n").Trim() -ne "codex-cli $Expected") {
        throw "Fresh PowerShell verification failed: $($freshOutput -join ' ')"
    }
    $listed = @(& npm.cmd list --global '@openai/codex' --depth=0 --json --prefix $Prefix)
    if ($LASTEXITCODE -ne 0) { throw 'npm package listing failed.' }
    $listing = $listed -join "`n" | ConvertFrom-Json
    if ($listing.dependencies.'@openai/codex'.version -ne $Expected) { throw 'npm version mismatch.' }
}

try {
    $lock = [IO.File]::Open((Join-Path $PSScriptRoot 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $prefixOutput = @(& npm.cmd prefix --global)
    if ($LASTEXITCODE -ne 0 -or $prefixOutput.Count -ne 1) { throw 'Cannot determine global npm prefix.' }
    $prefix = [IO.Path]::GetFullPath($prefixOutput[0].Trim())
    $livePackage = Join-Path $prefix 'node_modules\@openai\codex'
    if (-not (Test-Path -LiteralPath $livePackage -PathType Container)) { throw 'Global Codex package was not found.' }
    if ((Get-Item -LiteralPath $livePackage -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'This updater only supports an ordinary npm package directory.'
    }
    $targetOutput = @(& npm.cmd view "@openai/codex@$Version" version --json)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve Codex release. Existing installation was left untouched.' }
    $target = $targetOutput -join "`n" | ConvertFrom-Json
    if ($target -is [array]) {
        if ($target.Count -ne 1) { throw 'Expected exactly one release version.' }
        $target = $target[0]
    }
    if ($target -isnot [string] -or $target -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Invalid release version.' }
    $current = Get-PackageVersion $livePackage
    Write-Host "Codex: $current -> $target"
    if ($current -eq $target -and -not $ForceReinstall) {
        try {
            Test-LiveInstall $prefix $target
            Write-Host "Already current and verified: codex-cli $target"
            $completed = $true
        } catch {
            Write-Warning 'Current installation failed verification; reinstalling through staging.'
        }
    }
    if (-not $completed) {
        $running = @(Get-CimInstance Win32_Process -Filter "Name='codex.exe'" |
            Select-Object ProcessId, CreationDate, ExecutablePath)
        $stageRoot = Join-Path $PSScriptRoot ('stage-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stageRoot | Out-Null
        Write-Host "Installing into separate staging directory: $stageRoot"
        & npm.cmd install --global "@openai/codex@$target" --prefix $stageRoot --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Staged install failed. Existing installation was left untouched.' }
        $stagedPackage = Join-Path $stageRoot 'node_modules\@openai\codex'
        if ((Get-PackageVersion $stagedPackage) -ne $target) { throw 'Staged package metadata mismatch.' }
        Assert-Version (Get-NativePath $stagedPackage) $target
        Assert-Version (Join-Path $stageRoot 'codex.cmd') $target
        # Preserve the exact previous package and shims; never stop a Codex process.
        $backup = Join-Path (Split-Path $livePackage -Parent) ('.codex-backup-' + $current + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID)
        foreach ($shim in @('codex', 'codex.cmd', 'codex.ps1')) {
            $existingShim = Join-Path $prefix $shim
            if (-not (Test-Path -LiteralPath $existingShim -PathType Leaf)) { throw "Missing npm shim: $existingShim" }
        }
        Write-Host "Keeping previous package at: $backup"
        [IO.Directory]::Move($livePackage, $backup)
        $swapped = $true
        [IO.Directory]::Move($stagedPackage, $livePackage)
        Test-LiveInstall $prefix $target
        $survivors = @(Get-CimInstance Win32_Process -Filter "Name='codex.exe'" |
            Select-Object ProcessId, CreationDate)
        $preserved = @($running | Where-Object {
            $before = $_
            @($survivors | Where-Object { $_.ProcessId -eq $before.ProcessId -and $_.CreationDate -eq $before.CreationDate }).Count -gt 0
        })
        $preservedIds = @($preserved | ForEach-Object { $_.ProcessId })
        $report = [ordered]@{
            timestamp = (Get-Date -Format o)
            previousVersion = $current
            installedVersion = $target
            prefix = $prefix
            backup = $backup
            checks = @('native executable', 'npm wrapper', 'fresh PowerShell', 'npm list')
            processesBefore = $running
            processesPreserved = $preservedIds
            processesNoLongerRunning = @($running | Where-Object { $_.ProcessId -notin $preservedIds } | ForEach-Object { $_.ProcessId })
        }
        $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'last-update.json') -Encoding UTF8
        $completed = $true
        Write-Host "Verified: codex-cli $target; existing Codex processes alive: $($preserved.Count)/$($running.Count)"
    }
} catch {
    $failure = $_
    if ($swapped -and -not $completed -and (Test-Path -LiteralPath $backup)) {
        try {
            if (Test-Path -LiteralPath $livePackage) {
                $failedPackage = "$livePackage.failed-$([Guid]::NewGuid().ToString('N'))"
                [IO.Directory]::Move($livePackage, $failedPackage)
            }
            [IO.Directory]::Move($backup, $livePackage)
            Write-Warning 'Restored the previous package after verification failed.'
        } catch {
            Write-Warning "Rollback needs attention. Preserved backup: $backup. Error: $_"
        }
    }
    Write-Error -Message $failure.ToString() -ErrorAction Continue
    exit 1
} finally {
    if ($null -ne $stageRoot -and $completed -and (Test-Path -LiteralPath $stageRoot)) {
        $resolvedStage = [IO.Path]::GetFullPath($stageRoot)
        $ownedPrefix = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\stage-'
        if ($resolvedStage.StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    if ($null -ne $lock) { $lock.Dispose() }
}
