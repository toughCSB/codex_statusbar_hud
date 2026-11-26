'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');const {inspectGit}=require('./git-info.cjs');
test('git summary uses committed branch changes and ignores uncommitted work',async()=>{
 const root=fs.mkdtempSync(path.join(__dirname,'test-git-'));
 const run=(...a)=>execFileSync('git',a,{cwd:root,stdio:'ignore',windowsHide:true,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'}});
 try{
  run('init','-b','main');run('config','user.email','fixture@example.invalid');run('config','user.name','Fixture');
  fs.writeFileSync(path.join(root,'a.txt'),'first\n');run('add','a.txt');run('commit','-m','fixture');
  fs.appendFileSync(path.join(root,'a.txt'),'uncommitted\n');
  assert.deepEqual(await inspectGit(root),{branch:'main',summary:'✓'});
  run('checkout','-b','test-branch');run('add','a.txt');run('commit','-m','fixture change');
  assert.deepEqual(await inspectGit(root),{branch:'test-branch',summary:'+1 -0'});
 }finally{
  // The fixture path is created exclusively below this test directory.
  const resolved=path.resolve(root),parent=path.resolve(__dirname);
  if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('test-git-'))throw new Error('unsafe cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
