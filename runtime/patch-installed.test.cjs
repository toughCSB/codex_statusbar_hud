'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {stageBundle,verifyBundle}=require('./stage-bundle.cjs'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
test('patch preserves backups, updates the manifest, and refuses a changed installation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-patch-test-'));try{
  fs.mkdirSync(path.join(root,'backups'));await stageBundle({sourceRoot:__dirname,destination:path.join(root,'current'),platform:process.platform==='darwin'?'darwin':'win32'});
  const target=path.join(root,'current','hud-bootstrap.cjs'),manifest=path.join(root,'current','bundle-manifest.json'),source=path.join(__dirname,'hud-bootstrap.cjs');
  const old=Buffer.from("'use strict';\n// old fixture\n");fs.writeFileSync(target,old);const info=JSON.parse(fs.readFileSync(manifest));info.files['hud-bootstrap.cjs']=hash(old);fs.writeFileSync(manifest,JSON.stringify(info,null,2)+'\n');
  const args=[path.join(__dirname,'patch-installed.cjs'),root,source,hash(old),hash(fs.readFileSync(source))];
  const ok=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(ok.status,0,ok.stderr);await verifyBundle(path.join(root,'current'),process.platform==='darwin'?'darwin':'win32');
  assert.equal(fs.readdirSync(path.join(root,'backups')).length,2);const second=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(second.status,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
