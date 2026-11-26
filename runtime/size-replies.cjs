'use strict';
// Fixture-stage terminal-size response multiplexer. Never consumes bracketed paste.
const marker='\x1b[8;',beginPaste='\x1b[200~',endPaste='\x1b[201~';
class SizeReplies{
 constructor(onParentSize=()=>{}){this.queue=[];this.pending='';this.paste=false;this.recent='';this.outputTail='';this.onParentSize=onParentSize;}
 noteChildOutput(data,now=Date.now()){
  const joined=this.outputTail+data;let pos=0;
  while((pos=joined.indexOf('\x1b[18t',pos))>=0){if(this.queue.length<32)this.queue.push({owner:'child',at:now});pos+=5;}
  this.outputTail=joined.slice(-4);
 }
 noteParentQuery(now=Date.now()){if(this.queue.length>=32)return false;this.queue.push({owner:'parent',at:now});return true;}
 feed(input){let output='';
  for(const c of input){
   this.recent=(this.recent+c).slice(-endPaste.length);
   if(this.paste){output+=c;if(this.recent.endsWith(endPaste))this.paste=false;continue;}
   if(!this.pending){if(c==='\x1b'&&this.queue.length)this.pending=c;else output+=c;}
   else{
    this.pending+=c;
    if(!marker.startsWith(this.pending)&&!this.pending.startsWith(marker)){
      const last=this.pending.at(-1),prior=this.pending.slice(0,-1);output+=prior;this.pending='';
      if(last==='\x1b'&&this.queue.length)this.pending=last;else output+=last;
    }else if(this.pending.startsWith(marker)){
      if(c==='t'){
       const match=/^\x1b\[8;(\d{1,4});(\d{1,4})t$/.exec(this.pending),entry=this.queue.shift();
       if(match&&entry){const rows=Number(match[1]),cols=Number(match[2]);if(rows>=8&&rows<=9999&&cols>=20&&cols<=9999){if(entry.owner==='parent')this.onParentSize(rows,cols);else output+=this.pending;}else output+=this.pending;}
       else output+=this.pending;this.pending='';
      }else if((c<'0'||c>'9')&&c!==';' || this.pending.length>20){output+=this.pending;this.pending='';}
    }
   }
   if(this.recent.endsWith(beginPaste))this.paste=true;
  }
  return output;
 }
 expire(now=Date.now(),timeout=1000){
  while(this.queue.length&&now-this.queue[0].at>timeout)this.queue.shift();
  if(!this.queue.length&&this.pending){const x=this.pending;this.pending='';return x;}return '';
 }
 flush(){const out=this.pending;this.pending='';this.queue=[];return out;}
}
module.exports={SizeReplies};
