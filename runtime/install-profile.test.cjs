'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {prepareProfile,applyProfile,rollbackProfile}=require('./install-profile.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(__dirname,'test-profile-'));t.after(()=>{const p=path.resolve(root);if(path.dirname(p)!==path.resolve(__dirname)||!path.basename(p).startsWith('test-profile-'))throw Error('unsafe cleanup');fs.rmSync(p,{recursive:true,force:true});});return root;}
test('a previously installed exact HUD block can be inspected again without changing the profile',async t=>{
 const root=fixture(t),file=path.join(root,'profile.ps1');
 const {windowsBlock}=require('./install-config.cjs');const original=Buffer.from('existing settings\r\n'+windowsBlock+'\r\n');
 fs.writeFileSync(file,original);const plan=await prepareProfile(file,'win32');
 assert.equal(plan.changed,false);assert.ok(plan.original.equals(original));
 fs.appendFileSync(file,'function codex { user-command }\r\n');
 await assert.rejects(prepareProfile(file,'win32'),/unrecognized codex command/);
});
test('profile append preserves original bytes, creates a backup and rolls back exactly',async t=>{
 const root=fixture(t),file=path.join(root,'profile.ps1'),original=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('기존 설정\r\n','utf16le')]);fs.writeFileSync(file,original);
 const p=await prepareProfile(file,'win32'),a=await applyProfile(p,path.join(root,'backups'));assert.ok(fs.readFileSync(file).subarray(0,original.length).equals(original));assert.ok(fs.readFileSync(a.backup).equals(original));
 await rollbackProfile(a);assert.ok(fs.readFileSync(file).equals(original));
});
test('a user edit made after preflight or after apply is never overwritten',async t=>{
 const root=fixture(t),file=path.join(root,'.zshrc');fs.writeFileSync(file,'original\n');const p=await prepareProfile(file,'darwin');fs.appendFileSync(file,'user edit\n');
 await assert.rejects(applyProfile(p,path.join(root,'backups')),/changed/);assert.match(fs.readFileSync(file,'utf8'),/user edit/);
 const q=await prepareProfile(file,'darwin'),a=await applyProfile(q,path.join(root,'backups'));fs.appendFileSync(file,'later edit\n');await assert.rejects(rollbackProfile(a),/preserved/);assert.match(fs.readFileSync(file,'utf8'),/later edit/);
});
test('a newly created profile can be removed only when its content is unchanged',async t=>{
 const root=fixture(t),file=path.join(root,'new','profile.ps1'),p=await prepareProfile(file,'win32'),a=await applyProfile(p,path.join(root,'backups'));
 assert.equal(fs.existsSync(file),true);await rollbackProfile(a);assert.equal(fs.existsSync(file),false);
});
