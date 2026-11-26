'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const {stageBundle,verifyBundle}=require('./stage-bundle.cjs');const {prepareProfile,applyProfile,rollbackProfile}=require('./install-profile.cjs');const {prependUserPath}=require('./install-config.cjs');const {findRealNpm,windowsNpm}=require('./npm-shim.cjs');
const fsp=fs.promises;
async function publishStage(stage,destination,{platform=process.platform,rename=(a,b)=>fsp.rename(a,b),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 // The completed Windows PTY smoke process can briefly retain the stage directory.
 // Wait for that handle to close; never terminate an existing user process.
 for(let attempt=0;;attempt++)try{return await rename(stage,destination);}catch(error){
  if(platform!=='win32'||!['EBUSY','EPERM','EACCES'].includes(error.code)||attempt>=5)throw error;
  await pause(200);
 }
}
function run(executable,args,{env,cwd,timeout=180000}={}){
 return new Promise(resolve=>{let child;try{child=spawn(executable,args,{env,cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});}catch{return resolve(1);}
  child.stdout.resume();child.stderr.resume();let done=false;const timer=setTimeout(()=>{try{child.kill();}catch{}finish(1);},timeout);
  function finish(code){if(done)return;done=true;clearTimeout(timer);resolve(code);}
  child.on('error',()=>finish(1));child.on('exit',code=>finish(code??1));
 });
}
async function installDependencies(stage,{platform,env}){
 const shim=path.join(stage,'shims',platform==='win32'?'windows':'unix'),npm=findRealNpm(env,shim,platform);
 if(!npm)throw new Error('The original npm executable was not found.');
 const args=['install','--prefix',stage,'--ignore-scripts','--no-audit','--no-fund','--registry','https://registry.npmjs.org'];
 let executable=npm,command=args;
 if(platform==='win32'){const resolved=windowsNpm(npm,env);if(!resolved)throw new Error('The original npm CLI could not be resolved safely.');executable=resolved.node;command=[resolved.cli,...args];}
 if(await run(executable,command,{env,cwd:stage})!==0)throw new Error('HUD dependencies could not be staged; user settings were not changed.');
}
async function validateDependencies(stage,{env}){
 if(await run(process.execPath,[path.join(stage,'smoke-bundle.cjs')],{env,cwd:stage,timeout:20000})!==0)throw new Error('The platform-specific HUD dependency smoke test failed.');
}
async function safeCleanupStage(stage,parent){
 const base=await fsp.realpath(parent),target=await fsp.realpath(stage),rel=path.relative(base,target);
 if(!rel||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!path.basename(target).startsWith('.codex-hud-stage-'))throw new Error('Unsafe staging cleanup.');
 await fsp.rm(target,{recursive:true,force:true});
}
async function inspect({sourceRoot,finalRoot,profilePaths,platform,pathAdapter}){
 if(!['win32','darwin'].includes(platform))throw new Error('Unsupported installation platform.');
 if(fs.existsSync(finalRoot))throw new Error('The integration directory already exists; it was preserved.');
 const profiles=[],seen=new Set();for(const file of profilePaths){const key=platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);if(seen.has(key))continue;seen.add(key);profiles.push(await prepareProfile(file,platform));}
 const oldPath=platform==='win32'?await pathAdapter.read():null;
 const bin=path.join(finalRoot,'current','bin'),newPath=oldPath?{exists:true,kind:oldPath.exists?oldPath.kind:'ExpandString',value:prependUserPath(oldPath.value,bin)}:null;
 return {sourceRoot,finalRoot,platform,profiles,oldPath,newPath,bin};
}
async function apply(plan,{env=process.env,pathAdapter,prepareDependencies=installDependencies,checkDependencies=validateDependencies}={}){
 const parent=path.dirname(plan.finalRoot);await fsp.mkdir(parent,{recursive:true});
 const stage=path.join(parent,`.codex-hud-stage-${crypto.randomUUID()}`),applied=[];let published=false,pathChanged=false,pathBroadcast=null;
 try{
  await stageBundle({sourceRoot:plan.sourceRoot,destination:stage,platform:plan.platform});
  await prepareDependencies(stage,{platform:plan.platform,env});await verifyBundle(stage,plan.platform);await checkDependencies(stage,{platform:plan.platform,env});
  // The root is exclusively created; an existing user directory is never replaced.
  await fsp.mkdir(plan.finalRoot,{recursive:false});published=true;
  await publishStage(stage,path.join(plan.finalRoot,'current'),{platform:plan.platform});
  const backups=path.join(plan.finalRoot,'backups');await fsp.mkdir(backups,{recursive:false});
  if(plan.oldPath)await fsp.writeFile(path.join(backups,'user-path.json'),JSON.stringify({original:plan.oldPath,installed:plan.newPath},null,2),{flag:'wx',mode:0o600});
  for(const p of plan.profiles)applied.push(await applyProfile(p,backups));
  if(plan.oldPath){
   const same=(a,b)=>a.exists===b.exists&&a.kind===b.kind&&a.value===b.value;
   try{const appliedPath=await pathAdapter.apply(plan.oldPath,plan.newPath);pathBroadcast=appliedPath?.broadcast??null;pathChanged=true;const observed=await pathAdapter.read();if(!same(observed,plan.newPath))throw new Error('User PATH verification failed');}
   catch(error){
    try{const observed=await pathAdapter.read();if(same(observed,plan.newPath))pathChanged=true;else if(same(observed,plan.oldPath))pathChanged=false;else {pathChanged=false;error=new Error(`${error.message}; PATH changed independently and was preserved`);}}
    catch{error=new Error(`${error.message}; current PATH could not be verified`);}
    throw error;
   }
  }
  const result={format:1,platform:plan.platform,installedAt:new Date().toISOString(),bin:plan.bin,profiles:applied.map(x=>({file:x.file,changed:x.applied,backup:x.backup})),pathChanged,pathBroadcast};
  await fsp.writeFile(path.join(plan.finalRoot,'installation.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  return result;
 }catch(error){
  const rollback=[];
  if(pathChanged)try{await pathAdapter.restore(plan.newPath,plan.oldPath);}catch(e){rollback.push(`PATH: ${e.message}`);}
  for(const profile of applied.reverse())try{await rollbackProfile(profile);}catch(e){rollback.push(`profile: ${e.message}`);}
  const note=published?` Installation files and backups were preserved at ${plan.finalRoot}.`:'';
  throw new Error(`${error.message}.${note}${rollback.length?` Rollback needs attention: ${rollback.join('; ')}`:''}`);
 }finally{
  if(fs.existsSync(stage))await safeCleanupStage(stage,parent).catch(()=>{});
 }
}
module.exports={inspect,apply,installDependencies,validateDependencies,safeCleanupStage,publishStage};
