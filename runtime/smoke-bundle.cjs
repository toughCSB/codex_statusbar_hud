'use strict';
const fs=require('node:fs');const path=require('node:path');
function pkg(name){return JSON.parse(fs.readFileSync(path.join(__dirname,'node_modules',...name.split('/'),'package.json'),'utf8'));}
const platformPackage=`@lydell/node-pty-${process.platform}-${process.arch}`;
if(pkg('@xterm/headless').version!=='6.0.0'||pkg('@lydell/node-pty').version!=='1.1.0'||pkg(platformPackage).version!=='1.1.0')throw new Error('Installed HUD dependency versions do not match.');
const {Terminal}=require('@xterm/headless'),pty=require('@lydell/node-pty');
const term=new Terminal({cols:40,rows:10,allowProposedApi:true});let seen='',done=false;
const child=pty.spawn(process.execPath,['-e','process.stdout.write("HUD_PTY_SMOKE_OK")'],{name:'xterm-256color',cols:40,rows:10,cwd:__dirname,env:process.env});
const timer=setTimeout(()=>finish(1),10000);
function finish(code){if(done)return;done=true;clearTimeout(timer);try{child.destroy()}catch{};term.dispose();process.stdout.write(code===0?'HUD_BUNDLE_SMOKE_OK\n':'HUD_BUNDLE_SMOKE_FAILED\n',()=>process.exit(code));}
child.onData(data=>{seen+=data;term.write(data);});
child.onExit(({exitCode})=>finish(exitCode===0&&seen.includes('HUD_PTY_SMOKE_OK')?0:1));
