'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawn,spawnSync}=require('node:child_process');
const {resolveOfficial}=require('./codex-install.cjs');const {packageRoot}=require('./platform-paths.cjs');
const fsp=fs.promises;
function inside(parent,child){const rel=path.relative(parent,child);return Boolean(rel)&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
async function safeRemoveStage(stage,root){const base=await fsp.realpath(root),target=await fsp.realpath(stage);if(!inside(base,target)||!path.basename(target).startsWith('update-stage-'))throw new Error('Unsafe update staging cleanup.');await fsp.rm(target,{recursive:true,force:true});}
async function replacePackage({live,staged,backup,validate}){
 const [oldStat,newStat]=await Promise.all([fsp.lstat(live),fsp.lstat(staged)]);
 if(!oldStat.isDirectory()||oldStat.isSymbolicLink()||!newStat.isDirectory()||newStat.isSymbolicLink()||oldStat.dev!==newStat.dev)throw new Error('Update directories are not ordinary directories on the same filesystem.');
 if(fs.existsSync(backup))throw new Error('Backup path already exists; nothing was changed.');
 await validate(staged);
 const current=await fsp.lstat(live);if(current.dev!==oldStat.dev||current.ino!==oldStat.ino)throw new Error('Codex changed during staging; nothing was changed.');
 let movedOld=false,movedNew=false;
 try{
  await fsp.rename(live,backup);movedOld=true;await fsp.rename(staged,live);movedNew=true;await validate(live);
  return {backup};
 }catch(error){
  try{
   if(movedNew){const now=await fsp.lstat(live);if(now.dev!==newStat.dev||now.ino!==newStat.ino)throw new Error('The installed directory changed during rollback.');
    const quarantine=`${backup}.failed-new`;if(fs.existsSync(quarantine))throw new Error('Rollback quarantine already exists.');await fsp.rename(live,quarantine);}
   if(movedOld){if(fs.existsSync(live))throw new Error('The original install path is occupied.');await fsp.rename(backup,live);}
  }catch(rollback){throw new Error(`Update failed and automatic rollback needs attention: ${rollback.message}. Previous package is preserved at ${backup}.`);}
  throw error;
 }
}
function run(command,args,{env,cwd,timeoutMs=120000}={}){
 return new Promise(resolve=>{
  let child;try{child=spawn(command,args,{env,cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});}catch{return resolve({code:1,output:''});}
  let output='',done=false;child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{if(output.length<1024*1024)output+=s;});child.stderr.resume();
  const timer=setTimeout(()=>{try{child.kill();}catch{}finish(1);},timeoutMs);
  function finish(code){if(done)return;done=true;clearTimeout(timer);resolve({code,output});}
  child.on('error',()=>finish(1));child.on('exit',code=>finish(code??1));
 });
}
async function lockFile(dir){
 for(let attempt=0;attempt<2;attempt++){
  try{
   await fsp.mkdir(dir,{mode:0o700});const token=crypto.randomUUID();
   try{await fsp.writeFile(path.join(dir,'owner.json'),JSON.stringify({pid:process.pid,createdAt:Date.now(),token}),{flag:'wx',mode:0o600});return {dir,token};}
   catch(error){await fsp.rmdir(dir).catch(()=>{});throw error;}
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   const recovery=path.join(dir,'recovery');let recoveryCreated=false,moved=false;
   try{
    const entry=await fsp.lstat(dir);if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error('Update lock is not a managed directory.');
    await fsp.mkdir(recovery,{mode:0o700});recoveryCreated=true;
    const names=(await fsp.readdir(dir)).sort();if(names.join('|')!=='owner.json|recovery')throw new Error('Update lock contains unexpected files and was preserved.');
    const owner=JSON.parse(await fsp.readFile(path.join(dir,'owner.json'),'utf8'));
    if(!Number.isInteger(owner.pid)||owner.pid<=0||!Number.isFinite(owner.createdAt)||Date.now()-owner.createdAt<30000)throw new Error('Another Codex update is running.');
    let alive=true;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)throw new Error('Another Codex update is running.');
    const stale=`${dir}.stale-${crypto.randomUUID()}`;await fsp.rename(dir,stale);moved=true;
   }catch(error){throw new Error(`Codex update lock could not be safely recovered: ${error.message}`);}
   finally{if(recoveryCreated&&!moved)await fsp.rmdir(recovery).catch(()=>{});}
  }
 }
 throw new Error('Another Codex update is running.');
}
async function releaseLock(lock){
 try{const owner=JSON.parse(await fsp.readFile(path.join(lock.dir,'owner.json'),'utf8'));const names=await fsp.readdir(lock.dir);
  if(owner.pid===process.pid&&owner.token===lock.token&&names.length===1&&names[0]==='owner.json'){await fsp.unlink(path.join(lock.dir,'owner.json'));await fsp.rmdir(lock.dir);}
 }catch{}
}
async function update({install,prefix,env=process.env,userHome,platform=process.platform,arch=process.arch,runCommand=run,checkVersion,patchEntry=require('./npm-entry.cjs').installBridge}){
 if(platform!=='darwin')throw new Error('This updater is for macOS.');
 if(!prefix||!userHome)throw new Error('User npm prefix is unavailable.');
 const home=await fsp.realpath(userHome),prefixReal=await fsp.realpath(prefix);
 if(!inside(home,prefixReal))throw new Error('The npm prefix is outside the user account; no administrator changes were attempted.');
 const nominal=packageRoot(prefixReal,'darwin'),live=await fsp.realpath(nominal);
 if(live!==nominal||live!==install.packageRoot)throw new Error('The npm package path is not an ordinary user-owned installation.');
 const appRoot=path.join(home,'.local','share','codex-hud-integration'),stagingRoot=path.join(appRoot,'update-staging');await fsp.mkdir(stagingRoot,{recursive:true});
 const lockPath=path.join(appRoot,'update.lock');let lock=null,stage=null;
 try{
  lock=await lockFile(lockPath);
  const view=await runCommand('npm',['view','@openai/codex','version','--json'],{env,cwd:home,timeoutMs:30000});
  if(view.code!==0)throw new Error('Cannot check the official Codex release; the existing installation is unchanged.');
  let version;try{version=JSON.parse(view.output);}catch{throw new Error('The release response was invalid; the existing installation is unchanged.');}
  if(Array.isArray(version)&&version.length===1)version=version[0];
  if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('The official release version was invalid.');
  if(version===install.version){await patchEntry(live,path.join(appRoot,'backups'));console.log(`Codex ${version} is already current.`);return 0;}
  stage=await fsp.mkdtemp(path.join(stagingRoot,'update-stage-'));
  const installed=await runCommand('npm',['install','--global',`@openai/codex@${version}`,'--prefix',stage,'--ignore-scripts','--no-audit','--no-fund'],{env,cwd:home,timeoutMs:180000});
  if(installed.code!==0)throw new Error('The new official release could not be staged; the existing installation is unchanged.');
  const staged=packageRoot(stage,'darwin');
  const verify=async root=>{
   const candidate=resolveOfficial({packageRoot:root,platform,arch});if(candidate.version!==version)throw new Error('The staged package version does not match.');
   const ok=checkVersion?await checkVersion(candidate.executable,version):(()=>{const r=spawnSync(candidate.executable,['--version'],{env,encoding:'utf8',timeout:5000});return !r.error&&r.status===0&&r.stdout.trim()===`codex-cli ${version}`;})();
   if(!ok)throw new Error('The staged official executable did not pass its version check.');
   await patchEntry(root,path.join(appRoot,'backups'));
  };
  const backup=path.join(path.dirname(live),`.codex-hud-backup-${install.version}-${crypto.randomUUID()}`);
  await replacePackage({live,staged,backup,validate:verify});console.log(`Codex ${install.version} -> ${version} updated. Existing sessions and the previous package were preserved.`);return 0;
 }catch(error){console.error(`Codex update: ${error.message}`);return 1;}
 finally{
  if(stage&&fs.existsSync(stage))await safeRemoveStage(stage,stagingRoot).catch(()=>{});
  if(lock)await releaseLock(lock);
 }
}
module.exports={update,replacePackage,inside,lockFile,releaseLock};
