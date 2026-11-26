'use strict';
// Prototype only: multiplex optional HUD metadata through a temporary terminal-title override,
// while forwarding the user's original title and all unrelated terminal sequences unchanged.
const prefix=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{1,12}(?:\.\.\.)?$/i;
const model=/^(.*?)\s+(default|none|minimal|low|medium|high|xhigh|max|ultra|persistent)(?:\s+(fast|priority|flex))?$/i;
function parseMetadata(title){
 const items=title.split(' | ');if(items.length<4)return null;
 const notice=items[0]==='[ ! ] Action Required'||items[0]==='[ . ] Action Required'?items.shift():null;
 const first=items[0],hasId=prefix.test(first);if(!hasId&&!model.test(first))return null;
 const candidates=[];
 for(let boundary=hasId?2:1;boundary<items.length-1;boundary++){
  if(items[boundary]!=='codex'||!(items[boundary+1]==='codex'||items[boundary+1].startsWith('codex ')))continue;
  for(let index=boundary-1;index>=(hasId?2:0);index--){
   const m=model.exec(items[index]);if(!m)continue;
   const rest=items.slice(index+1,boundary);
   if(rest.every(s=>['Ready','Working','Thinking','Waiting','Starting'].includes(s)||/^Context\s+\d{1,3}%\s+used$/i.test(s)||/^weekly\s+\d{1,3}%\s+left$/i.test(s)||/^Tasks\s+\d+\/\d+$/i.test(s)))candidates.push({boundary,index,m});
   break;
  }
 }
 if(candidates.length!==1)return null;
 const {boundary,index,m}=candidates[0],tailFirst=items[boundary+1].startsWith('codex ')?items[boundary+1].slice(6):'';
 const sessionPrefix=hasId?first.replace(/\.\.\.$/,''):null;
 const full=hasId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(items[1])&&items[1].toLowerCase().startsWith(sessionPrefix.toLowerCase())?items[1]:null;
 const meta={sessionPrefix,sessionId:full,model:m[1],effort:m[2],fast:m[3]?.toLowerCase()==='fast',status:null,contextPercent:null,weeklyRemaining:null,badge:null};
 for(const s of items.slice(index+1,boundary)){
  if(['Ready','Working','Thinking','Waiting','Starting'].includes(s))meta.status=s;
  let x=/^Context\s+(\d{1,3})%\s+used$/i.exec(s);if(x&&Number(x[1])<=100)meta.contextPercent=Number(x[1]);
  x=/^weekly\s+(\d{1,3})%\s+left$/i.exec(s);if(x&&Number(x[1])<=100)meta.weeklyRemaining=Number(x[1]);
  if(/^Tasks\s+\d+\/\d+$/i.test(s))meta.badge=`✦ ${s}`;
 }
 let tail=items.slice(boundary+2).join(' | ');if(tailFirst)tail=tailFirst+(tail?' | '+tail:'');
 if(notice)tail=notice+(tail?' | '+tail:'');
 return {meta,originalTitle:tail};
}
class TitleFilter{
 constructor(onMetadata=()=>{},onOtherTitle=()=>{}){this.onMetadata=onMetadata;this.onOtherTitle=onOtherTitle;this.state='normal';this.pending='';}
 feed(text){let output='';
  for(const c of text){const n=c.codePointAt(0);
   if((n===0x18||n===0x1a)&&(this.state==='osc'||this.state==='osc-escape')){output+=this.pending+c;this.pending='';this.state='normal';continue;}
   if(this.state==='normal'){
    if(c==='\x1b'){this.pending=c;this.state='escape';}else output+=c;
   }else if(this.state==='escape'){
    if(c===']'){this.pending+=c;this.state='osc';}
    else {output+=this.pending+c;this.pending='';this.state=c==='['?'csi':'PX^_'.includes(c)?'string':n>=0x20&&n<=0x2f?'escape-intermediate':'normal';}
   }else if(this.state==='escape-intermediate'){
    output+=c;if(n>=0x30&&n<=0x7e)this.state='normal';
   }else if(this.state==='csi'){
    if(c==='\x1b'){this.pending=c;this.state='escape';}else{output+=c;if(n>=0x40&&n<=0x7e)this.state='normal';}
   }else if(this.state==='string'){
    output+=c;if(n===0x9c)this.state='normal';else if(c==='\x1b')this.state='string-escape';
   }else if(this.state==='string-escape'){
    output+=c;if(c==='\\')this.state='normal';else if(c!=='\x1b')this.state='string';
   }else if(this.state==='osc'){
    this.pending+=c;if(c==='\x07'||n===0x9c){output+=this.finish(c);this.state='normal';}
    else if(c==='\x1b')this.state='osc-escape';
    else if(this.pending.length>1024*1024){output+=this.pending;this.pending='';this.state='osc-pass';}
   }else if(this.state==='osc-escape'){
    this.pending+=c;if(c==='\\'){output+=this.finish('\x1b\\');this.state='normal';}else if(c!=='\x1b')this.state='osc';
   }else if(this.state==='osc-pass'){
    output+=c;if(c==='\x07'||n===0x9c)this.state='normal';else if(c==='\x1b')this.state='osc-pass-escape';
   }else if(this.state==='osc-pass-escape'){
    output+=c;if(c==='\\')this.state='normal';else if(c!=='\x1b')this.state='osc-pass';
   }
  }
  return output;
 }
 finish(ending){
  const raw=this.pending;this.pending='';const body=raw.slice(2,raw.length-ending.length),m=/^(0|2);([\s\S]*)$/.exec(body);
  if(!m)return raw;const parsed=parseMetadata(m[2]);if(!parsed){try{this.onOtherTitle(m[2]);}catch{}return raw;}
  try{this.onMetadata(parsed.meta);}catch{}
  return parsed.originalTitle?`\x1b]${m[1]};${parsed.originalTitle}${ending}`:'';
 }
 flush(){const result=this.pending;this.pending='';this.state='normal';return result;}
}
module.exports={TitleFilter,parseMetadata};
