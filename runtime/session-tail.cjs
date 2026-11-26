'use strict';
const fs=require('node:fs');const path=require('node:path');
const MAX_LINE=4*1024*1024,TAIL_BYTES=8*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
function readUsage(payload,previous,eventTime=null){
 const info=payload?.info,total=info?.total_token_usage,last=info?.last_token_usage;
 if(!total||![total.input_tokens,total.cached_input_tokens,total.output_tokens,total.total_tokens].every(validNumber))return previous;
 let week=previous?.weeklyPercent??null,weekAt=previous?.weeklyAt??null;const limits=payload.rate_limits;
 if(limits&&(!limits.limit_id||limits.limit_id==='codex'))for(const w of [limits.primary,limits.secondary]){
   if(w?.window_minutes===10080&&validNumber(w.used_percent)){week=Math.min(w.used_percent,100);weekAt=Number.isFinite(eventTime)?eventTime:null;break;}
 }
 const window=validNumber(info.model_context_window)?info.model_context_window:null;
 const lastTotal=validNumber(last?.total_tokens)?last.total_tokens:null;
 let contextPercent=null;if(window>12000&&lastTotal!==null){const available=window-12000,used=Math.max(0,lastTotal-12000);contextPercent=100-Math.round(Math.max(0,Math.min(100,(available-used)*100/available)));}
 return {input:total.input_tokens,cached:total.cached_input_tokens,output:total.output_tokens,total:total.total_tokens,window,contextPercent,weeklyPercent:week,weeklyAt:weekAt};
}
function applyEvent(state,line){
 let record;try{record=JSON.parse(line);}catch{return;}
 const p=record?.payload;if(!p||typeof p!=='object')return;
 if(record.type==='session_meta'){
  const id=p.id??p.session_id;if(typeof id!=='string'||id.toLowerCase()!==state.id.toLowerCase()){state.rejected=true;state.verified=false;return;}
  state.verified=true;if(typeof p.cwd==='string')state.cwd=p.cwd;return;
 }
 if(!state.verified||state.rejected)return;
 if(record.type==='turn_context'){
  if(typeof p.cwd==='string')state.cwd=p.cwd;if(typeof p.model==='string')state.model=p.model;
  const effort=p.collaboration_mode?.settings?.reasoning_effort;if(typeof effort==='string')state.effort=effort;
  if(p.permission_profile?.type==='disabled')state.permissions='Full Access';
  else {const kind=p.sandbox_policy?.type;state.permissions=({'read-only':'Read Only','workspace-write':'Workspace','danger-full-access':'Full Access'})[kind]??null;}
 }else if(record.type==='event_msg'){
  if(p.type==='token_count')state.usage=readUsage(p,state.usage,typeof record.timestamp==='string'?Date.parse(record.timestamp):null);
  else if(p.type==='task_started')state.status='Working';
  else if(p.type==='task_complete')state.status='Ready';
 }
}
class SessionTail{
 constructor(file,id){if(!uuid.test(id)||!path.basename(file).toLowerCase().endsWith(`${id.toLowerCase()}.jsonl`))throw new Error('Invalid session identity');this.file=file;this.id=id;this.reset();}
 reset(){this.state={id:this.id,verified:false,rejected:false,cwd:null,model:null,effort:null,permissions:null,status:null,usage:null};this.handle=null;this.pos=0;this.pending=Buffer.alloc(0);this.skip=false;this.identity=null;}
 async open(){
  this.handle=await fs.promises.open(this.file,'r');const stat=await this.handle.stat();this.identity={dev:stat.dev,ino:stat.ino};
  const max=Math.min(stat.size,MAX_LINE),buffer=Buffer.alloc(max);if(max)await this.handle.read(buffer,0,max,0);
  const index=buffer.indexOf(10);if(index<0){await this.close();return false;}
  applyEvent(this.state,buffer.subarray(0,index).toString('utf8'));if(!this.state.verified||this.state.rejected){await this.close();return false;}
  const headerEnd=index+1;this.pos=Math.max(headerEnd,stat.size-TAIL_BYTES);this.skip=this.pos>headerEnd;return true;
 }
 async poll(budget=128*1024){
  try{
   if(!this.handle&&!(await this.open()))return false;
   const stat=await fs.promises.stat(this.file);
   if(stat.size<this.pos||stat.dev!==this.identity.dev||stat.ino!==this.identity.ino){await this.close();this.reset();return false;}
   let changed=false;
   while(budget>0&&this.pos<stat.size){const length=Math.min(budget,stat.size-this.pos,65536),buffer=Buffer.alloc(length),{bytesRead}=await this.handle.read(buffer,0,length,this.pos);if(!bytesRead)break;
    this.pos+=bytesRead;budget-=bytesRead;const data=Buffer.concat([this.pending,buffer.subarray(0,bytesRead)]);let start=0;
    for(let i=0;i<data.length;i++)if(data[i]===10){if(!this.skip&&i-start<=MAX_LINE){applyEvent(this.state,data.subarray(start,i).toString('utf8'));changed=true;}this.skip=false;start=i+1;}
    this.pending=data.subarray(start);if(this.pending.length>MAX_LINE){this.pending=Buffer.alloc(0);this.skip=true;}
   }
   return changed;
  }catch(error){if(error.code==='ENOENT'||error.code==='EACCES'||error.code==='EBUSY'){await this.close();return false;}throw error;}
 }
 async close(){if(this.handle){const handle=this.handle;this.handle=null;await handle.close().catch(()=>{});}}
}
async function findSession(root,id){
 if(!uuid.test(id))return null;let matches=[];
 // Codex's current UUIDv7 identifies the creation date; look only in adjacent date folders.
 // This keeps a new, not-yet-persisted session from repeatedly scanning every old conversation.
 if(id[14]==='7'){
  const millis=Number.parseInt(id.replaceAll('-','').slice(0,12),16),date=new Date(millis),folders=new Set();
  if(Number.isFinite(date.valueOf())&&date.getUTCFullYear()>=2000&&date.getUTCFullYear()<=2100){
   // Archived Codex sessions can be stored directly in this root.
   folders.add(root);
   for(const offset of [-86400000,0,86400000]){const d=new Date(millis+offset),pad=n=>String(n).padStart(2,'0');folders.add(path.join(root,String(d.getUTCFullYear()),pad(d.getUTCMonth()+1),pad(d.getUTCDate())));}
   for(const folder of folders){let entries;try{entries=await fs.promises.readdir(folder,{withFileTypes:true});}catch(e){if(['ENOENT','EACCES','ENOTDIR'].includes(e.code))continue;throw e;}
    for(const entry of entries)if(entry.isFile()&&entry.name.toLowerCase().endsWith(`${id.toLowerCase()}.jsonl`)){matches.push(path.join(folder,entry.name));if(matches.length>1)return null;}
   }
   return matches.length===1?matches[0]:null;
  }
 }
 const pending=[root];
 while(pending.length){const folder=pending.pop();let entries;try{entries=await fs.promises.readdir(folder,{withFileTypes:true});}catch(e){if(['ENOENT','EACCES','ENOTDIR'].includes(e.code))continue;throw e;}
  for(const entry of entries){const candidate=path.join(folder,entry.name);if(entry.isDirectory())pending.push(candidate);else if(entry.isFile()&&entry.name.toLowerCase().endsWith(`${id.toLowerCase()}.jsonl`)){matches.push(candidate);if(matches.length>1)return null;}}
 }
 return matches.length===1?matches[0]:null;
}
async function findSessionByPrefix(root,prefix){
 if(typeof prefix!=='string'||prefix.length<24||prefix.length>36||!/^[0-9a-f-]+$/i.test(prefix)||prefix[14]!=='7')return null;
 const millis=Number.parseInt(prefix.replaceAll('-','').slice(0,12),16),date=new Date(millis),folders=new Set([root]);
 if(!Number.isFinite(date.valueOf())||date.getUTCFullYear()<2000||date.getUTCFullYear()>2100)return null;
 for(const offset of [-86400000,0,86400000]){const d=new Date(millis+offset),pad=n=>String(n).padStart(2,'0');folders.add(path.join(root,String(d.getUTCFullYear()),pad(d.getUTCMonth()+1),pad(d.getUTCDate())));}
 const matches=[];
 for(const folder of folders){let entries;try{entries=await fs.promises.readdir(folder,{withFileTypes:true});}catch(e){if(['ENOENT','EACCES','ENOTDIR'].includes(e.code))continue;throw e;}
  for(const entry of entries){
   const m=/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(entry.name);
   if(entry.isFile()&&m&&m[1].toLowerCase().startsWith(prefix.toLowerCase())){matches.push({file:path.join(folder,entry.name),id:m[1]});if(matches.length>1)return null;}
  }
 }
 return matches.length===1?matches[0]:null;
}
module.exports={SessionTail,findSession,findSessionByPrefix,readUsage,applyEvent};
