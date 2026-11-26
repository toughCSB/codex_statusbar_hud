'use strict';
const {accountId,beginRead}=require('./account-limit.cjs');
function bootstrap({exe,cwd,home,env=process.env,begin=beginRead,configWaitMs=2000}){
 const state={account:accountId(home),epoch:Date.now(),week:null,skills:null,config:null,request:null,onChange:null};
 let resolveConfig;const configReady=new Promise(resolve=>{resolveConfig=resolve;});let resolved=false;
 const settle=()=>{if(!resolved){resolved=true;resolveConfig(state.config);}};
 const changed=()=>{try{state.onChange?.();}catch{}};
 state.request=begin({exe,cwd,home,env,includeSkills:true,includeConfig:true,
  onWeek:value=>{state.week=value;changed();},
  onSkills:value=>{state.skills=value;changed();},
  onConfig:value=>{state.config=value;settle();changed();}});
 state.request.promise.finally(settle);
 const timeout=setTimeout(settle,configWaitMs);configReady.finally(()=>clearTimeout(timeout));
 return {state,configReady};
}
function titleChannel(args,config,version){
 // Do not pin the integration to one Codex release: keep the official title
 // items and attempt the same metadata channel on newer semantic versions.
 // Unrecognized title sequences remain pass-through in TitleFilter.
 if(!config||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))return null;
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--'||!arg.startsWith('-'))break;
  if(arg==='-p'||arg==='--profile'||arg.startsWith('--profile='))return null;
  if(arg==='-c'||arg==='--config'){const v=args[++i]??'';if(/^\s*tui\.terminal_title\s*=/.test(v))return null;}
  else if(arg.startsWith('--config=')&&/^\s*tui\.terminal_title\s*=/.test(arg.slice(9)))return null;
  else if(['-m','--model','-s','--sandbox','-a','--ask-for-approval','-C','--cd','--add-dir','-i','--image','--enable','--disable','--local-provider','--remote','--remote-auth-token-env'].includes(arg))i++;
 }
 const original=config.titleItems??['activity','thread-name','project-name'];
 if(!Array.isArray(original)||original.some(x=>typeof x!=='string'||x.length>128))return null;
 const metadata=['session-id','thread-title','model-with-reasoning','run-state','context-used','weekly-limit','task-progress','app-name','app-name'];
 return `tui.terminal_title=${JSON.stringify([...metadata,...original])}`;
}
module.exports={bootstrap,titleChannel};
