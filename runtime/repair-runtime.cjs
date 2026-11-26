'use strict';
// Repair only the installed HUD modules, with checksummed backups and rollback.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const fsp=fs.promises,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const modules=['launch-plan.cjs','launch-hints.cjs','hud-host.cjs','terminal-io.cjs','footer-surface.cjs','hud-status.cjs','hud-render.cjs','vt-frame.cjs','stage-bundle.cjs','install-profile.cjs','installer-core.cjs','npm-entry.cjs','win-update.ps1','mac-updater.cjs','codex-launcher.cjs'];
async function repair(root,source){
 const current=path.join(root,'current'),manifest=path.join(current,'bundle-manifest.json');
 await require(path.join(current,'stage-bundle.cjs')).verifyBundle(current,process.platform);
 const original=await fsp.readFile(manifest),metadata=JSON.parse(original),before=new Map(),replacement=new Map();
 for(const name of modules){
  const target=path.join(current,name);let data=null;
  try{const stat=await fsp.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Non-regular installed module');data=await fsp.readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(data&&hash(data)!==metadata.files[name]||!data&&metadata.files[name])throw Error('Installed module changed: '+name);
  const bytes=await fsp.readFile(path.join(source,name));
  if(name.endsWith('.cjs')){const syntax=spawnSync(process.execPath,['--check',path.join(source,name)],{encoding:'utf8',timeout:10000,windowsHide:true});if(syntax.status!==0)throw Error('Replacement syntax failed: '+name);}
  before.set(name,data);replacement.set(name,bytes);metadata.files[name]=hash(bytes);
 }
 const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
 const backup=path.join(root,'backups',`repair-${stamp}-${crypto.randomUUID()}`);await fsp.mkdir(backup,{recursive:false});
 await fsp.writeFile(path.join(backup,'bundle-manifest.json'),original,{flag:'wx'});
 for(const [name,data] of before)if(data)await fsp.writeFile(path.join(backup,name),data,{flag:'wx'});
 const changed=[];let manifestChanged=false;
 try {
  for(const [name,bytes] of replacement){
   const target=path.join(current,name),temp=target+'.repair-'+process.pid;
   const previous=before.get(name);if(previous&&hash(await fsp.readFile(target))!==hash(previous))throw Error('Concurrent module edit: '+name);
   await fsp.writeFile(temp,bytes,{flag:'wx'});await fsp.rename(temp,target);changed.push(name);
  }
  const temp=manifest+'.repair-'+process.pid;await fsp.writeFile(temp,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});await fsp.rename(temp,manifest);manifestChanged=true;
  await require(path.join(source,'stage-bundle.cjs')).verifyBundle(current,process.platform);
  const smoke=spawnSync(process.execPath,[path.join(current,'smoke-bundle.cjs')],{encoding:'utf8',timeout:30000,windowsHide:true});if(smoke.status!==0)throw Error('Installed dependency smoke test failed: '+smoke.stderr);
  const paths=require(path.join(current,'platform-paths.cjs'));
  const officialRoot=paths.packageRoot(paths.npmPrefix({platform:process.platform,env:process.env}),process.platform);
  const entry=await require(path.join(source,'npm-entry.cjs')).installBridge(officialRoot,path.join(root,'backups'));
  return {repaired:true,backup,entry,modules:Object.fromEntries([...replacement].map(([name,data])=>[name,hash(data)])),configModified:false,authModified:false,databaseModified:false,vendorBinaryModified:false};
 } catch(error){
  const errors=[];
  for(const name of changed.reverse())try{const target=path.join(current,name);if(hash(await fsp.readFile(target))!==hash(replacement.get(name)))throw Error('Concurrent edit preserved: '+name);const old=before.get(name);if(old)await fsp.writeFile(target,old);else await fsp.unlink(target);}catch(e){errors.push(e.message);}
  if(manifestChanged)try{await fsp.writeFile(manifest,original);}catch(e){errors.push(e.message);}
  if(errors.length)throw Error(error.message+'; rollback needs attention: '+errors.join('; '));throw error;
 }
}
module.exports={repair,modules};
if(require.main===module)repair(path.resolve(process.argv[2]),path.resolve(process.argv[3])).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
