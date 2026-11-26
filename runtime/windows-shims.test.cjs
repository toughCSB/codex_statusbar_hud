'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
test('PowerShell, cmd and Git Bash shims preserve Unicode arguments and exit codes',t=>{
 if(process.platform!=='win32'){t.skip('Windows shell test');return;}
 const root=fs.mkdtempSync(path.join(__dirname,'test shim 한글 ')),base=path.join(root,'CodexHudIntegration'),app=path.join(base,'current');fs.mkdirSync(app,{recursive:true});
 const launcher=path.join(app,'codex-launcher.cjs');fs.writeFileSync(launcher,'process.stdout.write(JSON.stringify(process.argv.slice(2)));process.exit(31);');
 t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test shim 한글 '))throw Error('unsafe cleanup');fs.unlinkSync(launcher);fs.rmdirSync(app);fs.rmdirSync(base);fs.rmdirSync(root);});
 const dir=path.join(__dirname,'shims','launch-windows'),env={...process.env,LOCALAPPDATA:root};
 let r=spawnSync('pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(dir,'codex.ps1'),'resume','한글 경로'],{env,encoding:'utf8',windowsHide:true});
 assert.equal(r.status,31,r.stderr);assert.deepEqual(JSON.parse(r.stdout),['resume','한글 경로']);
 const shim=path.join(dir,'codex.cmd');r=spawnSync(process.env.ComSpec,['/d','/s','/c',`""${shim}" resume "한글 경로""`],{env,encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true});
 assert.equal(r.status,31,r.stderr);assert.deepEqual(JSON.parse(r.stdout),['resume','한글 경로']);
 const bash='C:\\Program Files\\Git\\bin\\bash.exe';if(fs.existsSync(bash)){
  r=spawnSync(bash,[path.join(dir,'codex'),'resume','한글 경로'],{env,encoding:'utf8',windowsHide:true});
  assert.equal(r.status,31,r.stderr);assert.deepEqual(JSON.parse(r.stdout),['resume','한글 경로']);
 }
});
