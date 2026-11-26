'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
test('POSIX npm shim only redirects the native Codex update action',t=>{
 if(process.platform==='win32'){t.skip('POSIX shell test');return;}
 const root=fs.mkdtempSync(path.join(__dirname,'test-unix-npm-')),fakeNpm=path.join(root,'npm'),fakeNode=path.join(root,'node');
 fs.writeFileSync(fakeNpm,'#!/bin/sh\nprintf "REAL:%s\\n" "$*"\nexit 23\n',{mode:0o755});fs.writeFileSync(fakeNode,'#!/bin/sh\nprintf "SAFE:%s\\n" "$*"\nexit 37\n',{mode:0o755});
 t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-unix-npm-'))throw Error('unsafe cleanup');fs.unlinkSync(fakeNpm);fs.unlinkSync(fakeNode);fs.rmdirSync(root);});
 const env={...process.env,CODEX_HUD_REAL_NPM:fakeNpm,CODEX_HUD_NODE:fakeNode,CODEX_HUD_LAUNCHER:'fixture-launcher'},shim=path.join(__dirname,'shims','unix','npm');
 let r=spawnSync('/bin/sh',[shim,'install','-g','@openai/codex'],{env,encoding:'utf8'});assert.equal(r.status,37);assert.match(r.stdout,/SAFE:fixture-launcher update/);
 r=spawnSync('/bin/sh',[shim,'install','--global','@openai/codex','--prefix','fixture'],{env,encoding:'utf8'});assert.equal(r.status,23);assert.match(r.stdout,/REAL:install --global/);
});
