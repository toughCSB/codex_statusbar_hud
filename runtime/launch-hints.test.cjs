'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {hints,workingCwd}=require('./launch-hints.cjs');
test('only safe explicit per-process hints are used before the command or prompt',()=>{
 assert.deepEqual(hints(['--yolo','resume','id']),{permission:'Full Access',window:null,uncertain:false});
 assert.deepEqual(hints(['-s','danger-full-access','-c','model_context_window=1000000','resume','id']),{permission:'Full Access',window:1000000,uncertain:false});
 assert.deepEqual(hints(['hello','--sandbox','danger-full-access']),{permission:null,window:null,uncertain:false});
 assert.equal(hints(['-p','profile']).uncertain,true);assert.equal(hints(['-c','permissions.custom=1']).uncertain,true);
});
test('working directory hints do not reinterpret prompt text or unknown worktree locations',()=>{
 const base=process.cwd();assert.equal(workingCwd(['-C','child','resume','id'],base),path.resolve(base,'child'));
 assert.equal(workingCwd(['hello','--cd','elsewhere'],base),base);assert.equal(workingCwd(['--worktree'],base),null);
});
