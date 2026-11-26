'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {npmPrefix,packageRoot,samePath}=require('./platform-paths.cjs');
test('Windows and macOS resolve their own npm layout without changing the environment',()=>{
 const env={APPDATA:path.resolve('fixture-appdata')},win=npmPrefix({platform:'win32',env});assert.equal(packageRoot(win,'win32'),path.join(win,'node_modules','@openai','codex'));
 const mac=path.resolve('fixture-home'),prefix=npmPrefix({platform:'darwin',env,run:()=>({status:0,stdout:mac+'\n'})});assert.equal(packageRoot(prefix,'darwin'),path.join(mac,'lib','node_modules','@openai','codex'));assert.equal(env.APPDATA,path.resolve('fixture-appdata'));
});
test('a missing or invalid npm prefix fails safely',()=>{
 assert.throws(()=>npmPrefix({platform:'darwin',run:()=>({status:1,stdout:''})}),/Cannot determine/);
 assert.throws(()=>npmPrefix({platform:'linux'}),/Unsupported/);
});
