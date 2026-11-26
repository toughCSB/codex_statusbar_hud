'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {ensureSnapshot,fingerprint}=require('./runtime-snapshot.cjs');
test('immutable linked runtime preserves the old executable and helper after a package swap',async t=>{
 const root=fs.mkdtempSync(path.join(__dirname,'test-runtime-')),vendor=path.join(root,'vendor'),bin=path.join(vendor,'bin'),cache=path.join(root,'cache');fs.mkdirSync(bin,{recursive:true});
 const exe=path.join(bin,'codex.exe'),host=path.join(bin,'codex-code-mode-host.exe');fs.writeFileSync(exe,'old executable');fs.writeFileSync(host,'old helper');fs.mkdirSync(path.join(vendor,'한글'),{recursive:true});fs.writeFileSync(path.join(vendor,'한글','resource.dat'),'resource');
 t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-runtime-'))throw Error('unsafe cleanup');fs.rmSync(p,{recursive:true,force:true});});
 const install={version:'0.163.0',vendorRoot:vendor,executable:exe,host};
 const [a,b]=await Promise.all([ensureSnapshot({install,runtimeRoot:cache,platform:'win32',arch:'x64'}),ensureSnapshot({install,runtimeRoot:cache,platform:'win32',arch:'x64'})]);
 assert.equal(a.root,b.root);assert.equal(fs.statSync(a.executable).ino,fs.statSync(exe).ino);assert.equal(fs.readFileSync(a.host,'utf8'),'old helper');
 fs.renameSync(vendor,path.join(root,'vendor-old'));fs.mkdirSync(bin,{recursive:true});fs.writeFileSync(exe,'new executable');fs.writeFileSync(host,'new helper');
 const next=await ensureSnapshot({install:{...install,version:'0.164.0'},runtimeRoot:cache,platform:'win32',arch:'x64'});
 assert.equal(fs.readFileSync(a.executable,'utf8'),'old executable');assert.equal(fs.readFileSync(a.host,'utf8'),'old helper');assert.equal(fs.readFileSync(next.executable,'utf8'),'new executable');
 assert.ok(fs.readdirSync(cache).every(x=>!x.startsWith('.staging-')));
});
test('an unexpected existing snapshot is preserved and rejected',async t=>{
 const root=fs.mkdtempSync(path.join(__dirname,'test-runtime-')),vendor=path.join(root,'vendor'),bin=path.join(vendor,'bin'),cache=path.join(root,'cache');fs.mkdirSync(bin,{recursive:true});fs.mkdirSync(cache);
 const exe=path.join(bin,'codex.exe'),host=path.join(bin,'codex-code-mode-host.exe');fs.writeFileSync(exe,'fixture');fs.writeFileSync(host,'fixture');
 t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-runtime-'))throw Error('unsafe cleanup');fs.rmSync(p,{recursive:true,force:true});});
 const install={version:'0.164.0',vendorRoot:vendor,executable:exe,host},key=fingerprint(install,fs.statSync(exe),'win32','x64'),target=path.join(cache,`0.164.0-win32-x64-${key}`);
 fs.mkdirSync(target);fs.writeFileSync(path.join(target,'user-file'),'preserve');
 await assert.rejects(ensureSnapshot({install,runtimeRoot:cache,platform:'win32',arch:'x64'}),/preserved/i);assert.equal(fs.readFileSync(path.join(target,'user-file'),'utf8'),'preserve');
});
