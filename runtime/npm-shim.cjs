'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
function pathKey(env){return Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';}
function findRealNpm(env,shimDir,platform=process.platform){
 const key=pathKey(env),entries=String(env[key]??'').split(path.delimiter),base=path.resolve(shimDir),needle=platform==='win32'?'npm.cmd':'npm';
 for(const entry of entries){
  if(!entry||!path.isAbsolute(entry))continue;
  const normalized=path.resolve(entry);if(platform==='win32'?normalized.toLowerCase()===base.toLowerCase():normalized===base)continue;
  const candidate=path.join(normalized,needle);try{const info=fs.statSync(candidate);if(info.isFile()){if(platform!=='win32')fs.accessSync(candidate,fs.constants.X_OK);return candidate;}}catch{}
 }
 return null;
}
function windowsNpm(realNpm,env,node=process.execPath){
 if(!realNpm)return null;const dir=path.dirname(realNpm),nearNode=path.join(dir,'node.exe'),runtime=fs.existsSync(nearNode)?nearNode:node;
 const prefixJs=path.join(dir,'node_modules','npm','bin','npm-prefix.js'),nearCli=path.join(dir,'node_modules','npm','bin','npm-cli.js');
 let cli=fs.existsSync(nearCli)?nearCli:null;
 if(fs.existsSync(prefixJs)){
  const probe=spawnSync(runtime,[prefixJs],{env,encoding:'utf8',timeout:5000,windowsHide:true});
  if(!probe.error&&probe.status===0&&probe.stdout.trim()){
   const globalCli=path.join(probe.stdout.trim(),'node_modules','npm','bin','npm-cli.js');if(fs.existsSync(globalCli))cli=globalCli;
  }
 }
 return cli?{node:runtime,cli}:null;
}
function childEnv(env,shimDir,realNpm,updateScript,launcher,node=process.execPath,npmInfo=null){
 const result={...env},key=pathKey(result);
 result[key]=shimDir+path.delimiter+(result[key]??'');
 result.CODEX_HUD_REAL_NPM=realNpm;result.CODEX_HUD_UPDATE_SCRIPT=updateScript;result.CODEX_HUD_LAUNCHER=launcher;result.CODEX_HUD_NODE=node;
 result.CODEX_HUD_NPM_INTERCEPTOR=path.join(path.dirname(launcher),'npm-interceptor.cjs');result.CODEX_HUD_REAL_NODE=npmInfo?.node??'';result.CODEX_HUD_NPM_CLI=npmInfo?.cli??'';
 return result;
}
module.exports={pathKey,findRealNpm,windowsNpm,childEnv};
