'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {prependUserPath,appendProfile,profileConflict,knownHomeProfile,BEGIN}=require('./install-config.cjs');
test('the dedicated PATH entry moves first without reordering or deleting other entries',()=>{
 const value=prependUserPath('C:\\A;C:\\B;C:\\hud;C:\\C','C:\\HUD');assert.equal(value,'C:\\HUD;C:\\A;C:\\B;C:\\C');assert.equal(prependUserPath(value,'C:\\HUD'),value);
});
test('existing user-defined codex commands are detected without modifying them',()=>{
 assert.equal(profileConflict(Buffer.from('function global:codex { original }\n'),'win32'),true);
 assert.equal(profileConflict(Buffer.from('alias codex="original"\n'),'darwin'),true);
 assert.equal(profileConflict(Buffer.from('# function codex { disabled }\n'),'win32'),false);
});
test('only the inspected HOME legacy function is eligible for its clipboard-compatible adapter',()=>{
 const home=Buffer.from('function codex {\n    & "$env:USERPROFILE\\.codex\\local\\codex-launch.ps1" @args\n}\n');
 assert.equal(knownHomeProfile(home,'win32'),true);
 assert.equal(knownHomeProfile(Buffer.concat([home,Buffer.from('function codex { other }\n')]),'win32'),false);
 assert.equal(knownHomeProfile(Buffer.from('function codex { & "other.ps1" @args }\n'),'win32'),false);
});
test('a UTF-16LE Windows profile keeps every original byte and is idempotent',()=>{
 const original=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('Write-Output "기존"\r\n','utf16le')]);const first=appendProfile(original,'win32');
 assert.equal(first.changed,true);assert.ok(first.bytes.subarray(0,original.length).equals(original));assert.equal(appendProfile(first.bytes,'win32').changed,false);
});
test('a UTF-8 zsh profile stays unchanged and ambiguous markers are refused',()=>{
 const original=Buffer.from('export PATH="$HOME/bin:$PATH"\n');const first=appendProfile(original,'darwin');assert.ok(first.bytes.subarray(0,original.length).equals(original));assert.equal(appendProfile(first.bytes,'darwin').changed,false);
 assert.throws(()=>appendProfile(Buffer.from(`${BEGIN}\nuser modified\n`),'darwin'),/preserved/i);
 assert.throws(()=>appendProfile(Buffer.from([0xff,0xfe,0x01]),'win32'),/encoding/i);
});
