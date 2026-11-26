'use strict';
const path=require('node:path');const {spawnSync}=require('node:child_process');
function createAdapter(script,env=process.env,run=spawnSync){
 if(!env.SystemRoot)throw new Error('Windows system directory is unavailable.');
 const powershell=path.join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 function call(mode,expected,desired){
  const args=['-NoLogo','-NoProfile','-NonInteractive','-File',script,'-Mode',mode];
  if(expected)args.push('-ExpectedBase64',Buffer.from(JSON.stringify(expected),'utf8').toString('base64'));
  if(desired)args.push('-DesiredBase64',Buffer.from(JSON.stringify(desired),'utf8').toString('base64'));
  const result=run(powershell,args,{env,encoding:'utf8',timeout:12000,windowsHide:true});
  if(result.error||result.status!==0)throw new Error('User PATH operation failed; existing settings were preserved where possible.');
  try{return JSON.parse(Buffer.from(result.stdout.trim(),'base64').toString('utf8'));}catch{throw new Error('User PATH response was invalid.');}
 }
 return {read:async()=>call('read'),apply:async(expected,desired)=>call('apply',expected,desired),restore:async(expected,desired)=>call('restore',expected,desired)};
}
module.exports={createAdapter};
