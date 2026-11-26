'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');const {patchEntry,entryReady,installBridge}=require('./npm-entry.cjs');
const original=`#!/usr/bin/env node
import {existsSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const codexPackageRoot = realpathSync(path.join(__dirname, ".."));
console.log(JSON.stringify({route:'stock',args:process.argv.slice(2)}));process.exitCode=23;
`;
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-entry-test-')),pkg=path.join(root,'pkg'),local=path.join(root,'local'),home=path.join(root,'home');
 t.after(()=>{const real=fs.realpathSync(root);assert.equal(path.dirname(real),fs.realpathSync(os.tmpdir()));assert.match(path.basename(real),/^hud-entry-test-/);fs.rmSync(real,{recursive:true,force:true});});
 fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.166.0',type:'module'}));
 const entry=path.join(pkg,'bin','codex.js');fs.writeFileSync(entry,original);
 const runtime=process.platform==='win32'?path.join(local,'CodexHudIntegration/current'):path.join(home,'.local/share/codex-hud-integration/current');
 fs.mkdirSync(runtime,{recursive:true});
 const env={...process.env,LOCALAPPDATA:local,HOME:home};
 return {root,pkg,entry,runtime,env,run:args=>spawnSync(process.execPath,[entry,...args],{env,encoding:'utf8',timeout:10000,windowsHide:true})};
}
test('an npm-only launch with no HUD directory in PATH reaches the HUD with unchanged Unicode arguments',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.runtime,'codex-launcher.cjs'),"exports.main=async(args,options)=>{console.log(JSON.stringify({route:'hud',args,root:options.packageRoot}));return 37;};");
 assert.equal(f.run(['resume','한글 경로']).status,23,'the original entry reproduces the bypass');
 const installed=await installBridge(f.pkg,path.join(f.root,'backups'));assert.equal(installed.updated,true);assert.equal(fs.readFileSync(path.join(installed.backup,'codex.js'),'utf8'),original);
 const args=['--yolo','resume','한글 경로','literal $(value)'];const result=f.run(args);
 assert.equal(result.status,37,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.route,'hud');assert.deepEqual(value.args,args);assert.equal(value.root,fs.realpathSync(f.pkg));
 assert.equal((await installBridge(f.pkg,path.join(f.root,'backups'))).updated,false);
});
test('an interactive host returning null cannot fall through and launch a second stock UI',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.runtime,'codex-launcher.cjs'),"exports.main=async()=>{console.log('HOST_ONLY');setTimeout(()=>process.exit(41),30);return null;};");
 await installBridge(f.pkg,path.join(f.root,'backups'));const result=f.run([]);assert.equal(result.status,41,result.stderr);assert.equal(result.stdout.trim(),'HOST_ONLY');
});
test('missing HUD files retain official informational/noninteractive entry behavior',async t=>{
 const f=fixture(t);await installBridge(f.pkg,path.join(f.root,'backups'));const result=f.run(['--version']);assert.equal(result.status,23,result.stderr);assert.equal(JSON.parse(result.stdout).route,'stock');
});
test('unknown or independently modified launcher code is rejected without changing it',()=>{
 assert.throws(()=>patchEntry('unknown official entry'),/Unrecognized/);
 const patched=patchEntry(original);assert.equal(entryReady(patched),true);assert.equal(patchEntry(patched),patched);
 assert.equal(entryReady(patched.replace('const __hudRuntime','const __otherRuntime')),false);
 assert.throws(()=>patchEntry(patched.replace('const __hudRuntime','const __otherRuntime')),/preserved/);
});
