'use strict';
// Tracks control-sequence boundaries without altering the child stream.
// A composited frame must never be inserted in the middle of an escape sequence
// or a DEC synchronized output frame (?2026h .. ?2026l).
class FrameBoundary {
 constructor(){this.state='normal';this.cursorSaved=false;this.syncOutput=false;this.syncSince=0;this.csi='';}
 feed(text,now=Date.now()){
  for(const ch of text){
   const n=ch.codePointAt(0);
   if(n===0x18||n===0x1a){this.state='normal';continue;}
   if(this.state==='normal'){
    if(n===0x1b)this.state='escape';else if(n===0x9b){this.state='csi';this.csi='';}else if(n===0x9d)this.state='osc';else if([0x90,0x98,0x9e,0x9f].includes(n))this.state='string';
   }else if(this.state==='escape'){
    if(ch==='['){this.state='csi';this.csi='';}else if(ch===']')this.state='osc';else if('PX^_'.includes(ch))this.state='string';else if(n>=0x20&&n<=0x2f)this.state='escape-intermediate';else {
     if(ch==='7')this.cursorSaved=true;
     else if(ch==='8')this.cursorSaved=false;
     else if(ch==='c'){this.cursorSaved=false;this.syncOutput=false;this.syncSince=0;}
     this.state='normal';
    }
   }else if(this.state==='escape-intermediate'){
    if(n>=0x30&&n<=0x7e)this.state='normal';else if(n<0x20||n>0x2f)this.state='normal';
   }else if(this.state==='csi'){
    if(n>=0x40&&n<=0x7e){
     if(ch==='s'&&this.csi==='')this.cursorSaved=true;
     else if(ch==='u'&&this.csi==='')this.cursorSaved=false;
     else if(ch==='h'&&this.csi==='?1048')this.cursorSaved=true;
     else if(ch==='l'&&this.csi==='?1048')this.cursorSaved=false;
     else if(ch==='h'&&this.csi==='?2026'){this.syncOutput=true;this.syncSince=now;}
     else if(ch==='l'&&this.csi==='?2026'){this.syncOutput=false;this.syncSince=0;}
     else if((ch==='h'||ch==='l')&&this.csi==='?1049'){this.cursorSaved=false;this.syncOutput=false;this.syncSince=0;}
     this.state='normal';this.csi='';
    }
    else if(n===0x1b){this.state='escape';this.csi='';}else if(this.csi.length<64)this.csi+=ch;
   }else if(this.state==='osc'||this.state==='string'){
    if(n===0x9c||(this.state==='osc'&&n===7))this.state='normal';else if(n===0x1b)this.state=this.state==='osc'?'osc-escape':'string-escape';
   }else if(this.state==='osc-escape'||this.state==='string-escape'){
    if(ch==='\\')this.state='normal';else if(n!==0x1b)this.state=this.state==='osc-escape'?'osc':'string';
   }
  }
  return this.state==='normal';
 }
 get safe(){return this.state==='normal';}
 inSync(now=Date.now(),maxMs=500){return this.syncOutput&&now-this.syncSince<maxMs;}
}
module.exports={FrameBoundary};
