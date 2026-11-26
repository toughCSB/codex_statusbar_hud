'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {replacePackage,update,lockFile,releaseLock}=require('./mac-updater.cjs');const {resolveOfficial}=require('./codex-install.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(__dirname,'test-mac-update-'));t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-mac-update-'))throw Error('unsafe cleanup');fs.rmSync(p,{recursive:true,force:true});});return root;}
function makePackage(root,version){const p=path.join(root,'lib','node_modules','@openai','codex'),platform=path.join(p,'node_modules','@openai','codex-darwin-arm64'),bin=path.join(platform,'vendor','aarch64-apple-darwin','bin');fs.mkdirSync(bin,{recursive:true});fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({name:'@openai/codex',version}));fs.writeFileSync(path.join(platform,'package.json'),JSON.stringify({name:'@openai/codex',version:`${version}-darwin-arm64`,os:['darwin'],cpu:['arm64']}));fs.writeFileSync(path.join(bin,'codex'),version);fs.writeFileSync(path.join(bin,'codex-code-mode-host'),version);return p;}
test('transaction restores the old package when post-swap validation fails',async t=>{
 const root=fixture(t),live=path.join(root,'live'),staged=path.join(root,'stage'),backup=path.join(root,'backup');fs.mkdirSync(live);fs.mkdirSync(staged);fs.writeFileSync(path.join(live,'version'),'old');fs.writeFileSync(path.join(staged,'version'),'new');
 await assert.rejects(replacePackage({live,staged,backup,validate:async p=>{if(p===live)throw Error('fixture verification failed');}}),/verification failed/);
 assert.equal(fs.readFileSync(path.join(live,'version'),'utf8'),'old');assert.equal(fs.readFileSync(path.join(backup+'.failed-new','version'),'utf8'),'new');
});
test('user-local macOS update stages, verifies, swaps and retains the old package',async t=>{
 const root=fixture(t),prefix=path.join(root,'.local');fs.mkdirSync(prefix,{recursive:true});const live=makePackage(prefix,'0.163.0');
 const install=resolveOfficial({packageRoot:live,platform:'darwin',arch:'arm64'});
 const runCommand=async(_command,args)=>{if(args[0]==='view')return {code:0,output:'"0.164.0"'};if(args[0]==='install'){makePackage(args[args.indexOf('--prefix')+1],'0.164.0');return {code:0,output:''};}throw Error('unexpected command');};
 const patched=[];const code=await update({install,prefix,env:process.env,userHome:root,platform:'darwin',arch:'arm64',runCommand,checkVersion:async()=>true,patchEntry:async p=>{patched.push(p);}});
 assert.equal(code,0);assert.equal(JSON.parse(fs.readFileSync(path.join(live,'package.json'))).version,'0.164.0');
 assert.ok(patched.length>=2);assert.equal(patched.at(-1),live,'the published package retains the HUD npm entry');
 const parent=path.dirname(live),backups=fs.readdirSync(parent).filter(x=>x.startsWith('.codex-hud-backup-0.163.0-'));assert.equal(backups.length,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(parent,backups[0],'package.json'))).version,'0.163.0');
});
test('active update locks are not replaced or deleted',async t=>{
 const root=fixture(t),dir=path.join(root,'update.lock');const lock=await lockFile(dir);
 try{await assert.rejects(lockFile(dir),/running|safely recovered/i);assert.ok(fs.existsSync(path.join(dir,'owner.json')));}
 finally{await releaseLock(lock);}
 assert.equal(fs.existsSync(dir),false);
});
test('a verified stale lock is archived and an unexpected lock remains untouched',async t=>{
 const root=fixture(t),dir=path.join(root,'update.lock');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'owner.json'),JSON.stringify({pid:2147483647,createdAt:Date.now()-60000,token:'old'}));
 const lock=await lockFile(dir);assert.ok(fs.readdirSync(root).some(x=>x.startsWith('update.lock.stale-')));await releaseLock(lock);
 fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'owner.json'),JSON.stringify({pid:2147483647,createdAt:Date.now()-60000,token:'old'}));fs.writeFileSync(path.join(dir,'user-file'),'preserve');
 await assert.rejects(lockFile(dir),/unexpected files/i);assert.equal(fs.readFileSync(path.join(dir,'user-file'),'utf8'),'preserve');
});
test('a package prefix outside the user home is rejected before changes',async t=>{
 const root=fixture(t),home=path.join(root,'home'),outside=path.join(root,'outside');fs.mkdirSync(home);fs.mkdirSync(outside);
 await assert.rejects(update({install:{packageRoot:'unused'},prefix:outside,userHome:home,platform:'darwin',arch:'arm64'}),/outside the user account/i);
 assert.deepEqual(fs.readdirSync(home),[]);
});
