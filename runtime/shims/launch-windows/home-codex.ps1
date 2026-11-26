# HOME's existing image paste helper remains scoped to this invocation.
$ErrorActionPreference='Stop'
$launcher=Join-Path $env:LOCALAPPDATA 'CodexHudIntegration\current\codex-launcher.cjs'
if(-not (Test-Path -LiteralPath $launcher -PathType Leaf)){throw 'Codex HUD launcher is missing.'}
$originalArgs=@($args)
$interactive=-not ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected)
$informational=@($originalArgs | Where-Object {$_ -in @('--help','-h','--version','-V')}).Count -gt 0
if($informational){$interactive=$false}
$nonInteractive=@('update','exec','e','review','mcp','mcp-server','app-server','completion','sandbox','debug','apply','a','cloud','features','login','logout','help','setup','plugin','plugins','fork-server','exec-server','agents','remote-control','app','doctor','queue','archive','delete','migrate-rollouts','unarchive')
$valueOptions=@('-c','--config','-C','--cd','-m','--model','-p','--profile','-i','--image','-s','--sandbox','-a','--ask-for-approval','--add-dir','--enable','--disable','--local-provider','--remote','--remote-cert','--remote-auth-token-env')
for($i=0;$i -lt $originalArgs.Count;$i++){
 $arg=[string]$originalArgs[$i];if($arg -eq '--'){break};if($arg -in $valueOptions){$i++;continue};if($arg.StartsWith('-')){continue};if($arg -in $nonInteractive){$interactive=$false};break
}
$scope=$null;$bridge=$null;$oldTitle=$null;$oldKeep=$env:CODEX_HUD_KEEP_TITLE;$oldModules=$env:PSModulePath
try{
 $env:PSModulePath=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\Modules')+';'+$oldModules
 if($interactive){
  $oldTitle=[Console]::Title;[Console]::Title='Codex - '+(Split-Path -Leaf (Get-Location).Path);$env:CODEX_HUD_KEEP_TITLE='1'
  $scopeDir=Join-Path $env:USERPROFILE '.codex\tmp\clipboard-bridge';New-Item -ItemType Directory -Path $scopeDir -Force | Out-Null
  $scope=Join-Path $scopeDir ([Guid]::NewGuid().ToString()+'.scope');[IO.File]::WriteAllText($scope,[string]$PID)
  if($env:HERDR_ENV -eq '1'){[IO.File]::WriteAllText([IO.Path]::ChangeExtension($scope,'.json'),'{"herdr":true}')}
  $pythonw=Join-Path $env:LOCALAPPDATA 'Programs\Python\Python314\pythonw.exe';$bridgeScript=Join-Path $env:USERPROFILE '.codex\local\clipboard-bridge.py'
  $bridge=Start-Process -FilePath $pythonw -ArgumentList @(('"'+$bridgeScript+'"'),[string]$PID,('"'+$scope+'"')) -WindowStyle Hidden -PassThru
  $ready=[IO.Path]::ChangeExtension($scope,'.ready');$deadline=[DateTime]::UtcNow.AddSeconds(3)
  while(-not (Test-Path -LiteralPath $ready) -and -not $bridge.HasExited -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 50}
  if(-not (Test-Path -LiteralPath $ready)){throw 'Codex Ctrl+V image paste helper could not start.'}
 }
 $launchArgs=@($originalArgs)
 if(-not ($launchArgs.Count -eq 1 -and $launchArgs[0] -eq 'update') -and '--no-daemon' -notin $launchArgs){$launchArgs=@('--no-daemon')+$launchArgs}
 & node.exe $launcher @launchArgs;$code=$LASTEXITCODE
}finally{
 if($scope){Remove-Item -LiteralPath $scope -ErrorAction SilentlyContinue;Remove-Item -LiteralPath ([IO.Path]::ChangeExtension($scope,'.json')) -ErrorAction SilentlyContinue
  if($bridge -and -not $bridge.HasExited){if(-not $bridge.WaitForExit(1500)){$bridge.Kill();$bridge.WaitForExit()}}}
 if($null -ne $oldTitle){[Console]::Title=$oldTitle}
 $env:CODEX_HUD_KEEP_TITLE=$oldKeep;$env:PSModulePath=$oldModules
}
exit $code
