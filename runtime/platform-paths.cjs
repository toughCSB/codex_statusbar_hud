'use strict';
const path=require('node:path');const {spawnSync}=require('node:child_process');
function npmPrefix({platform=process.platform,env=process.env,run=spawnSync}={}){
 if(platform==='win32'){if(!env.APPDATA)throw new Error('Windows npm directory is unavailable.');return path.join(env.APPDATA,'npm');}
 if(platform==='darwin'){
  const result=run('npm',['prefix','--global'],{env,encoding:'utf8',timeout:5000,windowsHide:true});
  const prefix=result.stdout?.trim();if(result.error||result.status!==0||!prefix||!path.isAbsolute(prefix))throw new Error('Cannot determine the user npm prefix.');
  return prefix;
 }
 throw new Error(`Unsupported platform: ${platform}`);
}
function packageRoot(prefix,platform=process.platform){return path.join(prefix,...(platform==='win32'?[]:['lib']),'node_modules','@openai','codex');}
function samePath(a,b,platform=process.platform){const x=path.resolve(a),y=path.resolve(b);return platform==='win32'?x.toLowerCase()===y.toLowerCase():x===y;}
module.exports={npmPrefix,packageRoot,samePath};
