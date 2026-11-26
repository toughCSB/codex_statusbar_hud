'use strict';
// Observe Codex's own palette query and its reply. Never remove or alter input.
class TerminalBackground{
 constructor(onLight=()=>{}){this.onLight=onLight;this.out='';this.input='';this.until=0;}
 noteOutput(data,now=Date.now()){
  const s=this.out+data;if(s.includes('\x1b]11;?')){this.until=now+2000;this.input='';}this.out=s.slice(-6);
 }
 noteInput(data,now=Date.now()){
  if(!this.until||now>this.until){this.input='';this.until=0;return;}
  this.input=(this.input+data).slice(-512);
  if(this.input.includes('\x1b[200~')){this.until=0;this.input='';return;}
  const m=/\x1b\]11;rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})(?:\x07|\x1b\\)/i.exec(this.input);
  if(!m)return;const rgb=m.slice(1).map(x=>parseInt(x,16)*255/(16**x.length-1));
  this.until=0;this.input='';this.onLight(0.299*rgb[0]+0.587*rgb[1]+0.114*rgb[2]>128);
 }
}
module.exports={TerminalBackground};
