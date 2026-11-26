'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const args=process.argv.slice(2),isUpdate=args.length===3&&args[0]==='install'&&args[1]==='-g'&&args[2]==='@openai/codex';
let executable,childArgs;
if(isUpdate){
 if(!process.env.SystemRoot||!process.env.CODEX_HUD_UPDATE_SCRIPT||!fs.existsSync(process.env.CODEX_HUD_UPDATE_SCRIPT)){console.error('Codex safe updater is unavailable.');process.exit(1);}
 executable=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');childArgs=['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',process.env.CODEX_HUD_UPDATE_SCRIPT];
}else{
 executable=process.env.CODEX_HUD_REAL_NODE;const npmCli=process.env.CODEX_HUD_NPM_CLI;
 if(!executable||!npmCli||!fs.existsSync(executable)||!fs.existsSync(npmCli)){console.error('The original npm CLI is unavailable.');process.exit(1);}
 childArgs=[npmCli,...args];
}
const child=spawn(executable,childArgs,{env:process.env,stdio:'inherit',windowsHide:true});
const signals=['SIGINT','SIGTERM','SIGHUP'];
for(const signal of signals)process.on(signal,()=>{try{if(!child.killed)child.kill(signal);}catch{}});
child.on('error',()=>{process.exitCode=1;});child.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?130:1);});
