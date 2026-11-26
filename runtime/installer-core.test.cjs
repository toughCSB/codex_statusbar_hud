'use strict';
const publishTest=require('node:test');
publishTest('publication tolerates a transient Windows PTY directory handle and preserves a persistent failure',async()=>{
 const assert=require('node:assert/strict');const {publishStage}=require('./installer-core.cjs');
 let calls=0;const actual=[];
 await publishStage('stage','current',{platform:'win32',rename:async(a,b)=>{if(++calls===1)throw Object.assign(Error('smoke handle closing'),{code:'EBUSY'});actual.push([a,b]);},pause:async()=>{}});
 assert.deepEqual(actual,[['stage','current']]);assert.equal(calls,2);
 calls=0;await assert.rejects(publishStage('stage','current',{platform:'win32',rename:async()=>{calls++;throw Object.assign(Error('still locked'),{code:'EBUSY'});},pause:async()=>{}}),/still locked/);assert.equal(calls,6);
});
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {inspect,apply}=require('./installer-core.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(__dirname,'test-integrator-'));t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-integrator-'))throw Error('unsafe cleanup');fs.rmSync(p,{recursive:true,force:true});});return root;}
function adapter(){let current={exists:true,kind:'ExpandString',value:'C:\\Existing;C:\\Tools'};return {read:async()=>({...current}),apply:async(expected,next)=>{assert.deepEqual(current,expected);current={...next};},restore:async(expected,old)=>{assert.deepEqual(current,expected);current={...old};}};}
const noDeps=async()=>{};
test('Windows integration publishes only after staging and preserves the original profile backup',async t=>{
 const root=fixture(t),profile=path.join(root,'profile.ps1'),original='Write-Output "기존"\r\n';fs.writeFileSync(profile,original);const env=adapter();
 const plan=await inspect({sourceRoot:__dirname,finalRoot:path.join(root,'CodexHudIntegration'),profilePaths:[profile],platform:'win32',pathAdapter:env});
 const result=await apply(plan,{pathAdapter:env,prepareDependencies:noDeps,checkDependencies:noDeps});
 assert.equal(result.pathChanged,true);assert.ok(fs.existsSync(path.join(plan.finalRoot,'current','bin','codex.cmd')));assert.equal(fs.readFileSync(result.profiles[0].backup,'utf8'),original);assert.ok((await env.read()).value.startsWith(plan.bin+';'));
});
test('a PATH failure after writing it restores the exact prior value and profile',async t=>{
 const root=fixture(t),profile=path.join(root,'profile.ps1'),original='original\r\n';fs.writeFileSync(profile,original);const base=adapter();
 const broken={...base,apply:async(a,b)=>{await base.apply(a,b);throw Error('fixture failure after write');}};
 const plan=await inspect({sourceRoot:__dirname,finalRoot:path.join(root,'CodexHudIntegration'),profilePaths:[profile],platform:'win32',pathAdapter:broken});
 await assert.rejects(apply(plan,{pathAdapter:broken,prepareDependencies:noDeps,checkDependencies:noDeps}),/fixture failure/);
 assert.equal(fs.readFileSync(profile,'utf8'),original);assert.deepEqual(await base.read(),plan.oldPath);assert.ok(fs.existsSync(path.join(plan.finalRoot,'backups')));
});
test('a user profile edit during staging is never overwritten',async t=>{
 const root=fixture(t),profile=path.join(root,'.zshrc');fs.writeFileSync(profile,'original\n');const plan=await inspect({sourceRoot:__dirname,finalRoot:path.join(root,'app'),profilePaths:[profile],platform:'darwin'});
 await assert.rejects(apply(plan,{prepareDependencies:async()=>fs.appendFileSync(profile,'user edit\n'),checkDependencies:noDeps}),/changed/);
 assert.equal(fs.readFileSync(profile,'utf8'),'original\nuser edit\n');
});
