[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('read','apply','restore')][string]$Mode,
 [string]$ExpectedBase64,
 [string]$DesiredBase64
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',($Mode -ne 'read'))
if($null -eq $key){throw 'The user environment registry key is unavailable.'}
try{
 $exists=@($key.GetValueNames()) -contains 'Path'
 $kind=if($exists){$key.GetValueKind('Path').ToString()}else{'Missing'}
 if($kind -notin @('Missing','String','ExpandString')){throw 'The existing user PATH has an unsupported type; it was preserved.'}
 $value=if($exists){[string]$key.GetValue('Path',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}else{''}
 $current=@{exists=$exists;kind=$kind;value=$value}
 if($Mode -eq 'read'){$json=$current|ConvertTo-Json -Compress;[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json));return}
 if(-not $ExpectedBase64 -or -not $DesiredBase64){throw 'Missing exact PATH preconditions.'}
 $expected=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ExpectedBase64))|ConvertFrom-Json
 $desired=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($DesiredBase64))|ConvertFrom-Json
 if($exists -ne [bool]$expected.exists -or $kind -cne [string]$expected.kind -or $value -cne [string]$expected.value){throw 'User PATH changed after inspection; it was preserved.'}
 if([bool]$desired.exists){
  if($desired.kind -notin @('String','ExpandString')){throw 'Invalid desired PATH type.'}
  if(([string]$desired.value).Length -gt 32760){throw 'The resulting user PATH is too long; it was preserved.'}
  $desiredKind=[Enum]::Parse([Microsoft.Win32.RegistryValueKind],[string]$desired.kind)
  $key.SetValue('Path',[string]$desired.value,$desiredKind)
 }else{$key.DeleteValue('Path',$false)}
 $broadcast=$false
 try{
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CodexHudEnvironmentBroadcast { [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, UIntPtr w, string l, uint flags, uint timeout, out UIntPtr result); }'
  $result=[UIntPtr]::Zero
  $sent=[CodexHudEnvironmentBroadcast]::SendMessageTimeout([IntPtr]0xffff,0x001A,[UIntPtr]::Zero,'Environment',2,3000,[ref]$result)
  $broadcast=$sent -ne [IntPtr]::Zero
 }catch{}
 $json=@{changed=$true;broadcast=$broadcast}|ConvertTo-Json -Compress
 [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}finally{$key.Dispose()}
