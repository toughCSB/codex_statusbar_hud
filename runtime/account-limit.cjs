'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const {samePath}=require('./platform-paths.cjs');
function accountId(home){try{const data=JSON.parse(fs.readFileSync(path.join(home,'auth.json'),'utf8'));return typeof data.tokens?.account_id==='string'?data.tokens.account_id:null;}catch{return null;}}
function exactWeek(result,expected){
 if(!expected||result?.accountId!==expected)return null;
 const limits=result?.rateLimitsByLimitId?.codex??result?.rateLimits;
 for(const w of [limits?.primary,limits?.secondary])if(w?.windowDurationMins===10080&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0)return Math.min(w.usedPercent,100);
 return null;
}
function beginRead({exe,cwd,home,env=process.env,spawnFn=spawn,timeoutMs=20000,includeWeek=true,includeSkills=false,includeConfig=false,threadId=null,skillsDelayMs=5000,onWeek=()=>{},onSkills=()=>{},onConfig=()=>{},onCost=()=>{}}){
 const initial=accountId(home);let child=null,done=false,timer,skillTimer,resolveResult,weekPending=Boolean(initial&&includeWeek),costPending=Boolean(initial&&threadId),skillsPending=includeSkills,configPending=includeConfig,weekValue=null;
 const promise=new Promise(resolve=>{resolveResult=resolve;});
 function finish(value){
  if(done)return;done=true;clearTimeout(timer);clearTimeout(skillTimer);
  if(!child||child.exitCode!==null){resolveResult(value);return;}
  const grace=setTimeout(()=>{try{child.kill();}catch{}resolveResult(value);},2000);
  child.once('exit',()=>{clearTimeout(grace);resolveResult(value);});
  try{child.stdin.end();}catch{}
 }
 if(!weekPending&&!costPending&&!includeSkills&&!includeConfig){finish(null);return {promise,cancel:()=>finish(null)};}
 try{child=spawnFn(exe,['-c','notify=[]','app-server'],{cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true});}catch{finish(null);return {promise,cancel:()=>finish(null)};}
 let buffer='';child.stderr?.resume();child.stdin.on('error',()=>finish(null));child.stdout.setEncoding('utf8');
 const send=o=>{try{child.stdin.write(JSON.stringify(o)+'\n');}catch{finish(null);}};
 child.stdout.on('data',chunk=>{
  buffer+=chunk;if(buffer.length>1_000_000){finish(null);return;}
  for(;;){let i=buffer.indexOf('\n');if(i<0)break;const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let msg;try{msg=JSON.parse(line)}catch{continue;}
   if(msg.id===1){if(msg.error){finish(null);return;}send({method:'initialized',params:{}});if(weekPending)send({id:2,method:'account/rateLimits/read'});if(skillsPending)send({id:3,method:'skills/list',params:{cwds:[cwd],forceReload:true}});if(configPending)send({id:5,method:'config/read',params:{cwd}});if(costPending)send({id:6,method:'account/usage/read',params:{threadId}});}
   else if(msg.id===2){const latest=accountId(home);weekValue=!msg.error&&initial===latest?exactWeek(msg.result,initial):null;weekPending=false;try{onWeek(weekValue);}catch{}if(!skillsPending&&!configPending&&!costPending){finish(weekValue);return;}}
   else if(msg.id===3){
    if(msg.error){skillsPending=false;if(!weekPending&&!configPending&&!costPending){finish(weekValue);return;}}
    else skillTimer=setTimeout(()=>send({id:4,method:'skills/list',params:{cwds:[cwd],forceReload:true}}),skillsDelayMs);
   } else if(msg.id===4){
    const data=msg.result?.data;
    if(Array.isArray(data)){
     const entries=data.filter(x=>typeof x.cwd==='string'&&samePath(x.cwd,cwd));
     if(entries.length===1&&Array.isArray(entries[0].skills))try{onSkills(entries[0].skills.length);}catch{}
    }
    skillsPending=false;if(!weekPending&&!configPending&&!costPending){finish(weekValue);return;}
   } else if(msg.id===5){
    const config=msg.result?.config;
    if(config&&typeof config==='object'){
     const title=config.tui?.terminal_title;
     const value={contextWindow:Number.isFinite(config.model_context_window)&&config.model_context_window>0?config.model_context_window:null,
       sandboxMode:typeof config.sandbox_mode==='string'?config.sandbox_mode:null,
       customPermissions:Boolean(config.permissions||config.default_permissions),networkAccess:Boolean(config.sandbox_workspace_write?.network_access),
       titleItems:Array.isArray(title)&&title.every(x=>typeof x==='string')?title:null,
       theme:typeof config.tui?.theme==='string'?config.tui.theme:null};
     try{onConfig(value);}catch{}
    }
    configPending=false;if(!weekPending&&!skillsPending&&!costPending){finish(weekValue);return;}
   } else if(msg.id===6){
    const usage=msg.result?.threadUsage,amount=usage?.estimatedUsageUsdMicros;
    const value=!msg.error&&initial===accountId(home)&&typeof usage?.threadId==='string'&&usage.threadId.toLowerCase()===threadId.toLowerCase()&&Number.isSafeInteger(amount)&&amount>=0?amount:null;
    costPending=false;try{onCost(value);}catch{}if(!weekPending&&!skillsPending&&!configPending){finish(weekValue);return;}
   }
  }
 });
 child.on('error',()=>finish(null));child.on('exit',()=>finish(null));timer=setTimeout(()=>finish(null),timeoutMs);
 send({id:1,method:'initialize',params:{clientInfo:{name:'native_hud',version:'1.0.0'},capabilities:{experimentalApi:true}}});
 return {promise,cancel:()=>finish(null)};
}
module.exports={accountId,exactWeek,beginRead};
