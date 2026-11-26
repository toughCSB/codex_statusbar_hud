'use strict';
const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const {inspect,apply}=require('./installer-core.cjs');const {createAdapter}=require('./win-path-adapter.cjs');const {manifest,codeFiles}=require('./stage-bundle.cjs');const fs=require('node:fs');
function windowsProfiles(env=process.env,run=spawnSync){
 if(!env.SystemRoot)throw new Error('Windows system directory is unavailable.');
 const powershell=path.join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const script='[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @($PROFILE.CurrentUserAllHosts,$PROFILE.CurrentUserCurrentHost) | ConvertTo-Json -Compress';
 const encoded=Buffer.from(script,'utf16le').toString('base64');const paths=[];
 for(const shell of [powershell,'pwsh.exe']){
  const r=run(shell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{env,encoding:'utf8',timeout:8000,windowsHide:true});
  if(r.error||r.status!==0)throw new Error(`Cannot determine the user profiles for ${path.basename(shell)}.`);
  let values;try{values=JSON.parse(r.stdout.trim());}catch{throw new Error('PowerShell profile paths could not be verified.');}
  if(!Array.isArray(values)||values.some(x=>typeof x!=='string'||!path.isAbsolute(x)))throw new Error('Invalid PowerShell profile path.');paths.push(...values);
 }
 return paths;
}
function targetRoot(platform,env=process.env,home=os.homedir()){
 if(platform==='win32'){if(!env.LOCALAPPDATA)throw new Error('Windows local application directory is unavailable.');return path.join(env.LOCALAPPDATA,'CodexHudIntegration');}
 if(platform==='darwin')return path.join(home,'.local','share','codex-hud-integration');
 throw new Error(`Unsupported platform: ${platform}`);
}
function planDigest(plan){
 const source=codeFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(plan.sourceRoot,file))).digest('hex')]);
 const description={platform:plan.platform,finalRoot:plan.finalRoot,profiles:plan.profiles.map(p=>({file:p.file,exists:p.exists,sourceHash:p.sourceHash,changed:p.changed})),oldPathHash:plan.oldPath?crypto.createHash('sha256').update(JSON.stringify(plan.oldPath)).digest('hex'):null,dependencies:manifest.dependencies,source};
 return crypto.createHash('sha256').update(JSON.stringify(description)).digest('hex');
}
async function makePlan({platform=process.platform,env=process.env,home=os.homedir(),sourceRoot=__dirname,profilePaths,pathAdapter}={}){
 const root=targetRoot(platform,env,home);
 const profiles=profilePaths??(platform==='win32'?windowsProfiles(env):[path.join(home,'.zprofile'),path.join(home,'.zshrc')]);
 const adapter=platform==='win32'?(pathAdapter??createAdapter(path.join(sourceRoot,'win-user-path.ps1'),env)):null;
 const plan=await inspect({sourceRoot,finalRoot:root,profilePaths:profiles,platform,pathAdapter:adapter});
 return {plan,adapter,digest:planDigest(plan)};
}
function summary({plan,digest}){
 return {platform:plan.platform,arch:process.arch,root:plan.finalRoot,bin:plan.bin,profiles:plan.profiles.map(p=>({path:p.file,exists:p.exists,willChange:p.changed,originalBytes:p.original.length})),userPathWillChange:Boolean(plan.oldPath&&plan.oldPath.value!==plan.newPath.value),dependencies:manifest.dependencies,planDigest:digest};
}
async function main(args=process.argv.slice(2)){
 const mode=args[0]??'--plan';if(mode!=='--plan'&&mode!=='--apply')throw new Error('Use --plan or --apply <plan digest>.');
 const prepared=await makePlan();
 if(mode==='--plan'){console.log(JSON.stringify(summary(prepared),null,2));return 0;}
 if(!args[1]||args[1]!==prepared.digest)throw new Error('The inspected installation plan changed; nothing was installed.');
 const result=await apply(prepared.plan,{pathAdapter:prepared.adapter});console.log(JSON.stringify({installed:true,...result},null,2));return 0;
}
module.exports={windowsProfiles,targetRoot,planDigest,makePlan,summary,main};
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(`HUD installation: ${error.message}`);process.exitCode=1;});
