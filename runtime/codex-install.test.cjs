'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {resolveOfficial,managedEnv}=require('./codex-install.cjs');
test('official executable and companion are resolved from the matching package version',t=>{
 const root=fs.mkdtempSync(path.join(__dirname,'test-install-')),pkg=path.join(root,'node_modules','@openai','codex'),platform=path.join(pkg,'node_modules','@openai','codex-win32-x64'),bin=path.join(platform,'vendor','x86_64-pc-windows-msvc','bin');
 fs.mkdirSync(bin,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.164.0'}));
 const writeVersion=v=>fs.writeFileSync(path.join(platform,'package.json'),JSON.stringify({name:'@openai/codex',version:v,os:['win32'],cpu:['x64']}));
 writeVersion('0.164.0-win32-x64');fs.writeFileSync(path.join(bin,'codex.exe'),'fixture');fs.writeFileSync(path.join(bin,'codex-code-mode-host.exe'),'fixture');
 t.after(()=>{const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(__dirname)||!path.basename(resolved).startsWith('test-install-'))throw Error('unsafe cleanup');fs.rmSync(resolved,{recursive:true,force:true});});
 const value=resolveOfficial({packageRoot:pkg,platform:'win32',arch:'x64'});assert.equal(value.version,'0.164.0');assert.equal(value.executable,path.join(bin,'codex.exe'));
 writeVersion('0.163.0-win32-x64');assert.throws(()=>resolveOfficial({packageRoot:pkg,platform:'win32',arch:'x64'}),/does not match/i);
 writeVersion('0.164.0-win32-x64');fs.unlinkSync(path.join(bin,'codex-code-mode-host.exe'));assert.throws(()=>resolveOfficial({packageRoot:pkg,platform:'win32',arch:'x64'}),/missing/i);
});
test('managed marker changes are restricted to the child environment',()=>{
 const parent={CODEX_MANAGED_BY_BUN:'1',OTHER:'keep'},child=managedEnv('C:\\fixture',parent);
 assert.equal(child.CODEX_MANAGED_BY_NPM,'1');assert.equal(child.CODEX_MANAGED_BY_BUN,undefined);assert.equal(parent.CODEX_MANAGED_BY_BUN,'1');assert.equal(child.OTHER,'keep');
});
test('macOS ARM64 resolves its matching official binary and code-mode companion',t=>{
 const root=fs.mkdtempSync(path.join(__dirname,'test-install-')),pkg=path.join(root,'node_modules','@openai','codex'),platform=path.join(pkg,'node_modules','@openai','codex-darwin-arm64'),bin=path.join(platform,'vendor','aarch64-apple-darwin','bin');
 fs.mkdirSync(bin,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.164.0'}));fs.writeFileSync(path.join(platform,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.164.0-darwin-arm64',os:['darwin'],cpu:['arm64']}));
 fs.writeFileSync(path.join(bin,'codex'),'fixture');fs.writeFileSync(path.join(bin,'codex-code-mode-host'),'fixture');
 t.after(()=>{const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(__dirname)||!path.basename(resolved).startsWith('test-install-'))throw Error('unsafe cleanup');fs.rmSync(resolved,{recursive:true,force:true});});
 const value=resolveOfficial({packageRoot:pkg,platform:'darwin',arch:'arm64'});assert.equal(value.executable,path.join(bin,'codex'));assert.equal(value.host,path.join(bin,'codex-code-mode-host'));
});
