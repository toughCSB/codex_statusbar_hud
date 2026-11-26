'use strict';
const fs=require('node:fs');
const {Writable}=require('node:stream');

// tty.WriteStream is synchronous on POSIX. node-pty's Unix ReadStream also
// spins in uv_write when the child's input queue is full. Use async fd writes
// without changing descriptor flags shared with the terminal's reader.
class TerminalWriter extends Writable {
 constructor(fd,{write=fs.write,highWaterMark=65536}={}){
  super({highWaterMark});this.fd=fd;this.writeFd=write;this.retry=null;
 }
 _write(buffer,_encoding,done){
  let offset=0,settled=false;
  const complete=error=>{if(settled)return;settled=true;this.cancelWrite=null;done(error);};
  this.cancelWrite=complete;
  const attempt=()=>{
   if(this.destroyed){complete(new Error('Terminal writer closed'));return;}
   this.writeFd(this.fd,buffer,offset,buffer.length-offset,null,(error,written)=>{
    if(settled)return;
    if(error&&!['EAGAIN','EWOULDBLOCK','EINTR'].includes(error.code)){complete(error);return;}
    if(error||written===0){this.retry=setTimeout(()=>{this.retry=null;attempt();},5);return;}
    offset+=written;
    if(offset<buffer.length)attempt();else complete();
   });
  };
  attempt();
 }
 _destroy(error,done){if(this.retry){clearTimeout(this.retry);this.retry=null;}this.cancelWrite?.(error||new Error('Terminal writer closed'));done(error);}
}
const resetModes='\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1004l\x1b[?2004l\x1b[?2026l\x1b[0m\x1b[r\x1b[?25h';
module.exports={TerminalWriter,resetModes};
