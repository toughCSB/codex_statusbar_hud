'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn,spawnSync}=require('node:child_process');
const {resolveOfficial,managedEnv}=require('./codex-install.cjs');const {plan,parseHelp}=require('./launch-plan.cjs');const {bootstrap,titleChannel}=require('./hud-bootstrap.cjs');
const {npmPrefix,packageRoot}=require('./platform-paths.cjs');
const {ensureSnapshot}=require('./runtime-snapshot.cjs');
const {workingCwd}=require('./launch-hints.cjs');
const {findRealNpm,windowsNpm,childEnv:withNpmShim}=require('./npm-shim.cjs');
function prefixForPackage(root,platform){
 const prefix=path.resolve(root,...Array(platform==='win32'?3:4).fill('..'));
 return path.resolve(packageRoot(prefix,platform))===path.resolve(root)?prefix:null;
}
function runChild(executable,args,env=process.env){
 return new Promise(resolve=>{
  let child;try{child=spawn(executable,args,{env,stdio:'inherit',windowsHide:true});}catch{resolve(1);return;}
  let settled=false;const signals=['SIGINT','SIGTERM','SIGHUP'];const handlers=new Map(signals.map(signal=>[signal,()=>{try{if(!child.killed)child.kill(signal);}catch{}}]));
  for(const [signal,handler] of handlers)process.on(signal,handler);
  const done=code=>{if(settled)return;settled=true;for(const [signal,handler] of handlers)process.off(signal,handler);resolve(code);};
  child.once('error',()=>done(1));child.once('exit',(code,signal)=>done(code??(signal==='SIGINT'?130:1)));
 });
}
function updaterPath(env=process.env){
 if(!env.SystemRoot||!env.LOCALAPPDATA)throw new Error('Windows user environment is incomplete.');
 const executable=path.join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const script=path.join(__dirname,'win-update.ps1');
 if(!fs.existsSync(executable)||!fs.existsSync(script))throw new Error('The existing session-preserving Codex updater is unavailable.');
 return {executable,args:['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',script]};
}
function inspectRelease(install,env,run=spawnSync){
 const version=run(install.executable,['--version'],{env,encoding:'utf8',timeout:5000,windowsHide:true});
 if(version.error||version.status!==0||version.stdout.trim()!==`codex-cli ${install.version}`)throw new Error('Installed Codex package and executable versions do not match.');
 const help=run(install.executable,['--help'],{env,encoding:'utf8',timeout:5000,windowsHide:true,maxBuffer:1024*1024});
 return help.error||help.status!==0?null:parseHelp(help.stdout);
}
async function main(args=process.argv.slice(2),options={}){
 const env=options.env??process.env,run=options.runChild??runChild,platform=options.platform??process.platform,arch=options.arch??process.arch;
 if(platform==='win32'&&args.length===1&&args[0]==='update'){
  const updater=(options.updaterPath??updaterPath)(env);return await run(updater.executable,updater.args,env);
 }
 const prefix=options.prefix??(options.packageRoot?prefixForPackage(options.packageRoot,platform):(options.npmPrefix??npmPrefix)({platform,env}));
 const root=options.packageRoot??packageRoot(prefix,platform);
 const install=(options.resolveOfficial??resolveOfficial)({packageRoot:root,platform,arch});
 const baseEnv=managedEnv(install.packageRoot,env),shimDir=path.join(__dirname,'shims',platform==='win32'?'windows':'unix');
 const realNpm=(options.findRealNpm??findRealNpm)(baseEnv,shimDir,platform);
 const npmInfo=platform==='win32'?(options.windowsNpm??windowsNpm)(realNpm,baseEnv):null;
 const safeNpmShim=platform==='win32'?Boolean(realNpm&&npmInfo):Boolean(realNpm);
 const childEnv=safeNpmShim?(options.prepareChildEnv??withNpmShim)(baseEnv,shimDir,realNpm,path.join(__dirname,'win-update.ps1'),__filename,process.execPath,npmInfo):baseEnv;
 const commands=(options.inspectRelease??inspectRelease)(install,childEnv);
 if(platform==='darwin'&&args.length===1&&args[0]==='update'){
  const updater=options.macUpdater??require('./mac-updater.cjs');return await updater.update({install,prefix,env:childEnv,userHome:os.homedir()});
 }
 const decision=plan(args,{ttyIn:options.ttyIn??process.stdin.isTTY,ttyOut:options.ttyOut??process.stdout.isTTY,commands,helpVerified:commands!==null});
 if(decision.kind==='reject'){console.error(`Codex: ${decision.reason}`);return 2;}
 async function stableExecutable(){
  const runtimeRoot=options.runtimeRoot??(platform==='win32'?path.join(env.LOCALAPPDATA,'CodexHudIntegration','runtimes'):path.join(os.homedir(),'.local','share','codex-hud-integration','runtimes'));
  const stable=await (options.ensureSnapshot??ensureSnapshot)({install,runtimeRoot,platform,arch});
  const check=(options.checkSnapshot??((target,expected)=>{const r=spawnSync(target,['--version'],{env:childEnv,encoding:'utf8',timeout:5000,windowsHide:true});return !r.error&&r.status===0&&r.stdout.trim()===`codex-cli ${expected}`;}));
  if(!check(stable.executable,install.version))throw new Error('The isolated official runtime failed version verification.');
  return stable.executable;
 }
 if(decision.kind==='direct'){
  const informational=args.some(x=>x==='--help'||x==='-h'||x==='--version'||x==='-V')||args[0]==='help';
  return await run(informational?install.executable:await stableExecutable(),decision.args,childEnv);
 }
 const stableExecutablePath=await stableExecutable();
 let host;
 try{host=(options.loadHost??(()=>require('./hud-host.cjs')))();}
 catch{console.error('Codex HUD 구성요소를 불러오지 못해 정식 Codex를 실행합니다.');return await run(stableExecutablePath,args,childEnv);}
 const cwd=options.cwd??process.cwd(),effectiveCwd=workingCwd(args,cwd),home=env.CODEX_HOME||path.join(os.homedir(),'.codex');
 const pending=(options.bootstrap??bootstrap)({exe:stableExecutablePath,cwd:effectiveCwd??cwd,home,env:childEnv});
 const config=await pending.configReady;
 // The HOME clipboard bridge intentionally keeps a task-scoped window title.
 // Still use the private title channel, but restore no native title items.
 const titleConfig=env.CODEX_HUD_KEEP_TITLE==='1'&&config?{...config,titleItems:[]}:config;
 const title=titleChannel(args,titleConfig,install.version);
 let hudArgs=title?[...decision.args.slice(0,2),'-c',title,...decision.args.slice(2)]:decision.args;
 if(!safeNpmShim){console.error('안전한 npm 경로를 찾지 못해 이번 실행에서 자동 업데이트 알림을 끕니다.');hudArgs=['-c','check_for_update_on_startup=false',...hudArgs];}
 try{host.runHost({exe:stableExecutablePath,args:hudArgs,useTitleMetadata:Boolean(title),bootstrap:pending.state,env:childEnv,cwd,effectiveCwd});return null;}
 catch(error){pending.state.request?.cancel();await pending.state.request?.promise;console.error(`Codex HUD를 시작하지 못해 정식 Codex를 실행합니다: ${error.message}`);return await run(stableExecutablePath,args,childEnv);}
}
module.exports={main,runChild,updaterPath,inspectRelease,prefixForPackage};
if(require.main===module)main().then(code=>{if(code!==null)process.exitCode=code;}).catch(error=>{console.error(`Codex: ${error.message}`);process.exitCode=1;});
