'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {windowsProfiles,targetRoot}=require('./installer-cli.cjs');
test('Windows profile discovery uses no profile scripts and keeps all discovered targets',()=>{
 const expected=[path.resolve('fixture-a.ps1'),path.resolve('fixture-b.ps1')];let calls=0;
 const list=windowsProfiles({SystemRoot:path.resolve('fixture-windows')},(_exe,args)=>{calls++;assert.ok(args.includes('-NoProfile'));return {status:0,stdout:JSON.stringify(expected)};});
 assert.equal(calls,2);assert.deepEqual(list,[...expected,...expected]);
});
test('platform-specific user installation roots are deterministic',()=>{
 assert.equal(targetRoot('win32',{LOCALAPPDATA:path.resolve('fixture-local')}),path.join(path.resolve('fixture-local'),'CodexHudIntegration'));
 assert.equal(targetRoot('darwin',{},path.resolve('fixture-home')),path.join(path.resolve('fixture-home'),'.local','share','codex-hud-integration'));
 assert.throws(()=>targetRoot('linux'),/Unsupported/);
});
