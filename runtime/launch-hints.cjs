'use strict';
const path=require('node:path');
const valueFlags=new Set(['-c','--config','-m','--model','-p','--profile','-s','--sandbox','-a','--ask-for-approval','-C','--cd','--add-dir','-i','--image','--enable','--disable','--local-provider','--remote','--remote-auth-token-env']);
function hints(args){
 let permission=null,window=null,uncertain=false;
 for(let i=0;i<args.length;i++){
  let arg=args[i];if(arg==='--'||!arg.startsWith('-'))break;
  if(arg==='--yolo'||arg==='--dangerously-bypass-approvals-and-sandbox'){permission='Full Access';continue;}
  if(arg==='--approve-for-me'){uncertain=true;continue;}
  let key=arg,val=null;if(arg.startsWith('--')&&arg.includes('=')){const idx=arg.indexOf('=');key=arg.slice(0,idx);val=arg.slice(idx+1);}
  if(valueFlags.has(key)){if(val===null){if(i+1>=args.length){uncertain=true;break;}val=args[++i];}
   if(key==='-p'||key==='--profile')uncertain=true;
   if(key==='-s'||key==='--sandbox')permission=val==='danger-full-access'?'Full Access':null;
   if(key==='-c'||key==='--config'){
    const m=/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(val);if(!m){uncertain=true;continue;}
    if(m[1]==='model_context_window'&&/^\d+$/.test(m[2]))window=Number(m[2]);
    if(m[1]==='sandbox_mode'){const v=m[2].replace(/^['"]|['"]$/g,'');permission=v==='danger-full-access'?'Full Access':null;}
    if(m[1].startsWith('permissions')||m[1]==='default_permissions'||m[1].startsWith('sandbox_workspace_write'))uncertain=true;
   }
  }
 }
 return {permission,window,uncertain};
}
function workingCwd(args,base){
 let cwd=base;
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--'||!arg.startsWith('-'))break;
  if(arg==='--worktree')return null;
  if(arg==='-C'||arg==='--cd'){if(i+1>=args.length)return null;cwd=path.resolve(base,args[++i]);continue;}
  if(arg.startsWith('--cd=')){cwd=path.resolve(base,arg.slice(5));continue;}
  if(valueFlags.has(arg)){i++;continue;}
 }
 return cwd;
}
module.exports={hints,workingCwd};
