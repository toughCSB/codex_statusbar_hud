'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');const {findRealNpm,windowsNpm,childEnv}=require('./npm-shim.cjs');
test('only the native Codex update action is redirected; all other npm arguments pass through',t=>{
 if(process.platform!=='win32'){t.skip('Windows npm shim test');return;}
 const shim=path.join(__dirname,'shims','windows','npm.cmd'),updater=path.join(__dirname,'fake-npm-update.ps1');
 const env={...process.env,CODEX_HUD_NODE:process.execPath,CODEX_HUD_NPM_INTERCEPTOR:path.join(__dirname,'npm-interceptor.cjs'),CODEX_HUD_REAL_NODE:process.execPath,CODEX_HUD_NPM_CLI:path.join(__dirname,'fake-npm-cli.cjs'),CODEX_HUD_UPDATE_SCRIPT:updater};
 const run=tail=>spawnSync(process.env.ComSpec,['/d','/s','/c',`""${shim}" ${tail}"`],{env,encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true});
 let r=run('install -g @openai/codex');assert.equal(r.status,37,r.stderr+r.stdout);assert.match(r.stdout,/SAFE_UPDATER_FIXTURE/);
 r=run('install --global @openai/codex --prefix fixture');assert.equal(r.status,23);assert.deepEqual(JSON.parse(r.stdout),['install','--global','@openai/codex','--prefix','fixture']);
 r=run('view @openai/codex version');assert.equal(r.status,23);assert.deepEqual(JSON.parse(r.stdout),['view','@openai/codex','version']);
 r=run('install -g @openai/codex ""');assert.equal(r.status,23,r.stderr+r.stdout);assert.deepEqual(JSON.parse(r.stdout),['install','-g','@openai/codex','']);
});
test('only the child PATH receives the temporary npm shim',()=>{
 const key=process.platform==='win32'?'Path':'PATH',env={[key]:process.env[key]??process.env.PATH??''};
 const before=env[key],shim=path.resolve(__dirname,'shims',process.platform==='win32'?'windows':'unix');
 const real=findRealNpm(env,shim);assert.ok(real);const child=childEnv(env,shim,real,'fixture-update','fixture-launcher');
 assert.equal(env[key],before);assert.ok(child[key].startsWith(shim+path.delimiter));assert.equal(child.CODEX_HUD_REAL_NPM,real);
});
test('the discovered Windows npm CLI reports the same version as its original wrapper',t=>{
 if(process.platform!=='win32'){t.skip('Windows npm wrapper test');return;}
 const shim=path.join(__dirname,'shims','windows'),real=findRealNpm(process.env,shim),info=windowsNpm(real,process.env);assert.ok(real);assert.ok(info);
 const direct=spawnSync(info.node,[info.cli,'--version'],{encoding:'utf8',windowsHide:true});
 const wrapped=spawnSync(process.env.ComSpec,['/d','/s','/c',`""${real}" --version"`],{encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true});
 assert.equal(direct.status,0,direct.stderr);assert.equal(wrapped.status,0,wrapped.stderr);assert.equal(direct.stdout.trim(),wrapped.stdout.trim());
});
