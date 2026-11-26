'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {main,inspectRelease}=require('./codex-launcher.cjs');
const install={version:'0.164.0',packageRoot:'C:\\fixture\\codex',executable:'C:\\fixture\\codex.exe'};
const commands=new Set(['update','resume','fork','agents','exec','new-official-command']);
test('npm entry delegation retains the user-local macOS update prefix',async()=>{
 const path=require('node:path'),prefix=path.resolve('fixture-user-prefix'),root=path.join(prefix,'lib/node_modules/@openai/codex');let captured;
 const result=await main(['update'],{...base,platform:'darwin',packageRoot:root,resolveOfficial:()=>({...install,packageRoot:root}),macUpdater:{update:async value=>{captured=value;return 29;}}});
 assert.equal(result,29);assert.equal(captured.prefix,prefix);assert.equal(captured.install.packageRoot,root);
});
const base={env:{APPDATA:'C:\\fixture',LOCALAPPDATA:'C:\\fixture-local',CODEX_HOME:'C:\\fixture-home',CODEX_MANAGED_BY_BUN:'1'},platform:'win32',arch:'x64',ttyIn:true,ttyOut:true,cwd:'C:\\fixture-project',resolveOfficial:()=>install,inspectRelease:()=>commands,ensureSnapshot:async()=>({executable:install.executable}),checkSnapshot:()=>true,findRealNpm:()=> 'C:\\fixture\\npm.cmd',windowsNpm:()=>({node:'C:\\fixture\\node.exe',cli:'C:\\fixture\\npm-cli.js'})};
test('the exact update route reaches the approved staged updater without loading the HUD',async()=>{
 let called;const result=await main(['update'],{...base,updaterPath:()=>({executable:'updater',args:['safe']}),runChild:async(...a)=>(called=a,37),loadHost:()=>{throw Error('must not load');}});
 assert.equal(result,37);assert.equal(called[0],'updater');assert.deepEqual(called[1],['safe']);
});
test('ordinary interactive launch uses the verified official binary and preserves title configuration',async()=>{
 let captured;const request={promise:Promise.resolve(),cancel(){}};
 const result=await main(['resume','fixture-id'],{...base,bootstrap:()=>({state:{account:null,epoch:1,request},configReady:Promise.resolve({titleItems:['activity','thread-name','project-name']})}),loadHost:()=>({runHost:x=>{captured=x;}})});
 assert.equal(result,null);assert.equal(captured.exe,install.executable);assert.equal(captured.useTitleMetadata,true);assert.equal(captured.env.CODEX_MANAGED_BY_NPM,'1');assert.equal(captured.env.CODEX_MANAGED_BY_BUN,undefined);
 assert.ok(captured.args.some(x=>x.startsWith('tui.terminal_title=')));assert.deepEqual(captured.args.slice(-2),['resume','fixture-id']);
});
test('a new official noninteractive command never enters the HUD host',async()=>{
 let called;const result=await main(['new-official-command','hello'],{...base,runChild:async(...a)=>(called=a,9),loadHost:()=>{throw Error('must not load');}});
 assert.equal(result,9);assert.equal(called[0],install.executable);assert.deepEqual(called[1].slice(-2),['new-official-command','hello']);
});
test('package version mismatch stops before any live command',()=>{
 assert.throws(()=>inspectRelease(install,{},()=>({status:0,stdout:'codex-cli 0.163.0\n'})),/do not match/i);
});
test('future release retains the native title items through the metadata channel',async()=>{
 let captured;const future={...install,version:'0.166.0'};
 await main([],{...base,resolveOfficial:()=>future,bootstrap:()=>({state:{account:null,epoch:1,request:{promise:Promise.resolve(),cancel(){}}},configReady:Promise.resolve({titleItems:null})}),loadHost:()=>({runHost:x=>{captured=x;}})});
 assert.equal(captured.useTitleMetadata,true);assert.ok(captured.args.some(x=>x.startsWith('tui.terminal_title=')));
});
test('HOME clipboard integration leaves the existing static window title in place',async()=>{
 let captured;const request={promise:Promise.resolve(),cancel(){}};
 await main([],{...base,env:{...base.env,CODEX_HUD_KEEP_TITLE:'1'},bootstrap:()=>({state:{account:null,epoch:1,request},configReady:Promise.resolve({titleItems:['project-name']})}),loadHost:()=>({runHost:x=>{captured=x;}})});
 const option=captured.args.find(x=>x.startsWith('tui.terminal_title='));
 const items=JSON.parse(option.slice(option.indexOf('=')+1));assert.equal(items.at(-1),'app-name');assert.ok(!items.includes('project-name'));
});
