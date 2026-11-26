'use strict';
const BEGIN='# CODEX_HUD_INTEGRATION_BEGIN',END='# CODEX_HUD_INTEGRATION_END';
const windowsBlock=[BEGIN,'& {',"    $hudIntegrationBin = Join-Path $env:LOCALAPPDATA 'CodexHudIntegration\\current\\bin'","    if (Test-Path -LiteralPath (Join-Path $hudIntegrationBin 'codex.cmd')) {",'        $hudPathParts = @($env:Path -split \';\' | Where-Object { $_.TrimEnd(\'\\\') -ine $hudIntegrationBin.TrimEnd(\'\\\') })',"        $env:Path = (@($hudIntegrationBin) + $hudPathParts) -join ';'",'    }','}',"if ((Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.codex\\local\\codex-launch.ps1')) -and (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.codex\\local\\clipboard-bridge.py')) -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexHudIntegration\\current\\bin\\home-codex.ps1'))) {","    function global:codex { & (Join-Path $env:LOCALAPPDATA 'CodexHudIntegration\\current\\bin\\home-codex.ps1') @args }",'}',END].join('\r\n');
const unixBlock=[BEGIN,'if [ -x "$HOME/.local/share/codex-hud-integration/current/bin/codex" ]; then','  path=("$HOME/.local/share/codex-hud-integration/current/bin" "${(@)path:#$HOME/.local/share/codex-hud-integration/current/bin}")','  export PATH','fi',END].join('\n');
function prependUserPath(current,target){
 if(typeof target!=='string'||!target||target.includes(';'))throw new Error('Invalid integration PATH directory.');
 const norm=s=>s.trim().replace(/[\\/]+$/,'').replaceAll('/','\\').toLowerCase();
 const parts=typeof current==='string'&&current.length?current.split(';'):[];
 return [target,...parts.filter(x=>norm(x)!==norm(target))].join(';');
}
function decodeProfile(original){
 if(!Buffer.isBuffer(original))throw new Error('Profile input must be bytes.');
 let encoding='utf8',offset=0;
 if(original.length>=2&&original[0]===0xff&&original[1]===0xfe){encoding='utf16le';offset=2;}
 else if(original.length>=2&&original[0]===0xfe&&original[1]===0xff)throw new Error('Unsupported UTF-16 big-endian profile; it was preserved.');
 else if(original.length>=3&&original[0]===0xef&&original[1]===0xbb&&original[2]===0xbf)offset=3;
 let text;try{text=new TextDecoder(encoding==='utf16le'?'utf-16le':'utf-8',{fatal:true}).decode(original.subarray(offset));}catch{throw new Error('Profile encoding is not safely recognized; it was preserved.');}
 return {text,encoding};
}
function profileConflict(original,platform){
 const {text}=decodeProfile(original);
 if(platform==='win32')return /^\s*(?:function\s+(?:global:)?codex\b|(?:set-alias|new-alias)\s+(?:-name\s+)?['"]?codex['"]?\b)/im.test(text);
 if(platform==='darwin')return /^\s*(?:alias\s+codex\s*=|function\s+codex\b|codex\s*\(\s*\))/m.test(text);
 throw new Error('Unsupported shell platform.');
}
function knownHomeProfile(original,platform){
 if(platform!=='win32')return false;const {text}=decodeProfile(original);
 const re=/^\s*function\s+(?:global:)?codex\s*\{\s*&\s*["']\$env:USERPROFILE\\\.codex\\local\\codex-launch\.ps1["']\s+@args\s*\}/im;
 const match=re.exec(text);if(!match)return false;
 return !profileConflict(Buffer.from(text.slice(0,match.index)+text.slice(match.index+match[0].length),'utf8'),platform);
}
function appendProfile(original,platform){
 const {text,encoding}=decodeProfile(original);
 const begin=text.indexOf(BEGIN),end=text.indexOf(END),block=platform==='win32'?windowsBlock:platform==='darwin'?unixBlock:null;if(!block)throw new Error('Unsupported shell platform.');
 if(begin>=0||end>=0){if(begin>=0&&end>begin&&text.slice(begin,end+END.length).replace(/\r\n/g,'\n')===block.replace(/\r\n/g,'\n'))return {changed:false,bytes:original};throw new Error('An existing HUD profile block differs; it was preserved.');}
 const newline=text.includes('\r\n')?'\r\n':platform==='win32'?'\r\n':'\n';
 const prefix=text.length&&!/[\r\n]$/.test(text)?newline:'';
 const suffix=prefix+block.replace(/\r?\n/g,newline)+newline;
 return {changed:true,bytes:Buffer.concat([original,Buffer.from(suffix,encoding)])};
}
module.exports={prependUserPath,appendProfile,profileConflict,knownHomeProfile,windowsBlock,unixBlock,BEGIN,END};
