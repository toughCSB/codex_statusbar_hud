'use strict';
// Read-only health check for the installed, update-compatible HUD runtime.
const path=require('node:path');const os=require('node:os');const fs=require('node:fs');
async function check(){
 const runtime=process.platform==='win32'
  ?path.join(process.env.LOCALAPPDATA,'CodexHudIntegration/current')
  :path.join(os.homedir(),'.local/share/codex-hud-integration/current');
 const {verifyBundle}=require(path.join(runtime,'stage-bundle.cjs'));
 await verifyBundle(runtime,process.platform);
 const paths=require(path.join(runtime,'platform-paths.cjs'));
 const {resolveOfficial,managedEnv}=require(path.join(runtime,'codex-install.cjs'));
 const {inspectRelease}=require(path.join(runtime,'codex-launcher.cjs'));
 const packageRoot=paths.packageRoot(paths.npmPrefix({platform:process.platform,env:process.env}),process.platform);
 const install=resolveOfficial({packageRoot,platform:process.platform,arch:process.arch});
 if(!inspectRelease(install,managedEnv(packageRoot,process.env)))throw Error('Official executable help/version could not be verified');
 const {entryReady}=require(path.join(runtime,'npm-entry.cjs'));
 if(!entryReady(fs.readFileSync(path.join(packageRoot,'bin','codex.js'),'utf8')))throw Error('The official npm entry bypasses the HUD');
 const {plan}=require(path.join(runtime,'launch-plan.cjs'));
 if(plan(['--yolo','resume','health-check']).kind!=='hud')throw Error('--yolo bypasses the HUD');
 const {findFooter}=require(path.join(runtime,'footer-surface.cjs'));
 const {parseStatus}=require(path.join(runtime,'hud-status.cjs'));
 const sample='00000000-0000-4000-8000-000000000001 · fixture medium · Full Access · Ready';
 const footer=findFooter({childRows:10,totalRows:13,getText:i=>i===2?sample:'',parseStatus});
 if(footer?.row!==2)throw Error('Inline status surface is unsupported');
 const wrapped=['00000000-0000-4000-','8000-000000000001 · GPT-6.2-','Astra xhigh fast · Full Access · Main [default]','  ← for agents · ? for shortcuts'];
 const wFooter=findFooter({childRows:10,totalRows:13,getText:i=>wrapped[i-6]??'',parseStatus});
 if(wFooter?.row!==6||wFooter.status?.model!=='GPT-6.2-Astra')throw Error('Wrapped status surface is unsupported');
 return {status:'ready',runtime,codexVersion:install.version,codeManifest:'verified',npmEntry:'hud',yolo:'hud',inlineFooter:'supported',wrappedFooter:'supported',readOnly:true};
}
module.exports={check};
if(require.main===module)check().then(x=>console.log(JSON.stringify(x,null,2))).catch(error=>{console.error(JSON.stringify({status:'broken',error:error.message,readOnly:true}));process.exitCode=1;});
