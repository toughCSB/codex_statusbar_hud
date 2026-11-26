'use strict';
const valueFlags=new Set(['-c','--config','-m','--model','-p','--profile','-s','--sandbox','-a','--ask-for-approval','-C','--cd','--add-dir','-i','--image','--enable','--disable','--local-provider','--remote','--remote-auth-token-env']);
const switches=new Set(['--oss','--approve-for-me','--yolo','--dangerously-bypass-approvals-and-sandbox','--dangerously-bypass-hook-trust','--worktree','--search','--no-alt-screen','--no-daemon','--strict-config']);
const noninteractive=new Set(['exec','e','review','login','logout','mcp','plugin','app-server','remote-control','app','completion','doctor','sandbox','debug','apply','a','queue','archive','delete','migrate-rollouts','migrate-nfs-db','unarchive','cloud','exec-server','features','help']);
const interactiveCommands=new Set(['agents','resume','fork']);
const hudConfig='tui.status_line=["session-id","model-with-reasoning","permissions","run-state","context-used","context-window-size","weekly-limit","task-progress","pull-request-number"]';
function scan(args){
 let remote=false;
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--')return {command:null,remote,explicitEnd:true};
  if(arg==='--help'||arg==='-h'||arg==='--version'||arg==='-V')return {command:null,remote,help:true};
  if(arg.startsWith('--')&&arg.includes('=')){const name=arg.slice(0,arg.indexOf('='));if(!valueFlags.has(name))return {command:null,remote,unknown:true};if(name==='--remote'||name==='--remote-auth-token-env')remote=true;continue;}
  if(valueFlags.has(arg)){if(i+1>=args.length)return {command:null,remote,unknown:true};if(arg==='--remote'||arg==='--remote-auth-token-env')remote=true;i++;continue;}
  if(switches.has(arg))continue;if(arg.startsWith('-'))return {command:null,remote,unknown:true};
  return {command:arg,remote,index:i};
 }
 return {command:null,remote};
}
function parseHelp(text){
 const lines=String(text).replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/),start=lines.findIndex(line=>line.trim()==='Commands:');
 if(start<0)return null;const commands=new Set();
 for(const line of lines.slice(start+1)){if(line&&/^\S/.test(line))break;const m=/^\s{2}([a-z][a-z0-9-]*)\s{2,}/.exec(line);if(m)commands.add(m[1]);}
 return commands.has('update')&&commands.has('resume')&&commands.has('exec')?commands:null;
}
function plan(args,{ttyIn=true,ttyOut=true,commands=null,helpVerified=true}={}){
 args=[...args];if(args.length===1&&args[0]==='update')return {kind:'updater',args:[]};
 const s=scan(args);
 if(s.command==='update'){
  if(args.slice(s.index+1).some(x=>x==='--help'||x==='-h'))return {kind:'direct',args};
  return {kind:'reject',reason:'Use codex update without extra options; no update was started.'};
 }
 const discoveredDirect=commands?.has(s.command)&&!interactiveCommands.has(s.command);
 const direct=s.help||s.unknown||s.remote||noninteractive.has(s.command)||discoveredDirect||!ttyIn||!ttyOut||!helpVerified;
 if(direct)return {kind:'direct',args};
 if(s.command&&noninteractive.has(s.command))return {kind:'direct',args};
 // Any other first word is a user prompt unless it is an explicit interactive subcommand.
 return {kind:'hud',args:['-c',hudConfig,...args],resuming:interactiveCommands.has(s.command)&&s.command!=='agents'};
}
module.exports={plan,scan,hudConfig,parseHelp};
