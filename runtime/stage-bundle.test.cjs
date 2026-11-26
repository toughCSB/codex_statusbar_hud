'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {stageBundle,verifyBundle,manifest}=require('./stage-bundle.cjs');
test('a standalone bundle contains pinned dependencies and refuses altered code',async t=>{
 const base=fs.mkdtempSync(path.join(__dirname,'test-bundle-')),stage=path.join(base,'bundle');
 t.after(()=>{const p=path.resolve(base);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-bundle-'))throw Error('unsafe cleanup');fs.rmSync(p,{recursive:true,force:true});});
 const m=await stageBundle({sourceRoot:__dirname,destination:stage,platform:'win32'});assert.equal(m.version,'1.0.0');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stage,'package.json'))).dependencies,manifest.dependencies);
 assert.ok(fs.existsSync(path.join(stage,'bin','codex.cmd')));await verifyBundle(stage,'win32');fs.appendFileSync(path.join(stage,'hud-host.cjs'),'\nchanged');await assert.rejects(verifyBundle(stage,'win32'),/verification failed/i);
});
