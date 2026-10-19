#requires -Version 7.0
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$tools=[ordered]@{}
foreach($name in @('node','cargo','rustc','git')){$command=Get-Command $name -ErrorAction SilentlyContinue;if(!$command){throw ('Missing existing tool: '+$name)};$tools[$name]=$command.Source}
foreach($name in @('README.md','docs/OPERATIONS.md','codex/codex-rs/Cargo.toml','patches/native-source-manifest.json')){if(!(Test-Path -LiteralPath (Join-Path $projectRoot $name))){throw ('Missing project file: '+$name)}}
$manifest=[IO.File]::ReadAllText((Join-Path $projectRoot 'patches/native-source-manifest.json'))|ConvertFrom-Json
$count=0
$differences=@()
foreach($item in $manifest.PSObject.Properties){$filename=Join-Path $projectRoot ('codex/'+$item.Name);$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $filename).Hash.ToLowerInvariant();if($actual -ne $item.Value){$differences+=,$item.Name};$count++}
foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.mjs'){& node --check $file.FullName;if($LASTEXITCODE -ne 0){throw ('JavaScript syntax failed: '+$file.Name)}}
foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1'){$parseErrors=$null;$tokens=$null;[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$parseErrors)|Out-Null;if($parseErrors.Count){throw ($parseErrors|Out-String)}}
$installedRoot=Join-Path $env:USERPROFILE '.local/share/codex-native-hud/0.163.0'
$installationPath=Join-Path $installedRoot 'installation.json'
$installation=if(Test-Path -LiteralPath $installationPath){[IO.File]::ReadAllText($installationPath)|ConvertFrom-Json}else{$null}
$homeTask=Get-ScheduledTask -TaskName 'CodexHUD-HOME-20261019-2100' -ErrorAction SilentlyContinue
[ordered]@{status=if($differences.Count){'source-manifest-mismatch'}else{'project-ready'};projectRoot=$projectRoot;tools=$tools;baselineSourceFiles=$count;baselineMatches=($differences.Count -eq 0);changedSourceFiles=$differences;scriptSyntax='passed';installedBinaryExists=($null -ne $installation -and (Test-Path -LiteralPath $installation.executable));launcherPatched=($null -ne $installation -and (Test-Path -LiteralPath $installation.launcherPath) -and [IO.File]::ReadAllText($installation.launcherPath).Contains('Codex native rainbow HUD 0.163.0'));homeTaskState=if($homeTask){[string]$homeTask.State}else{'absent'};visualStatus='requires-live-terminal-verification';sourceModified=$false;installationModified=$false;databaseModified=$false}|ConvertTo-Json -Depth 8
if($differences.Count){exit 1}
