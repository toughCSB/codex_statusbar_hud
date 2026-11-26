'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const begin='// CODEX_HUD_NPM_ENTRY_BEGIN',end='// CODEX_HUD_NPM_ENTRY_END';
const anchor='const codexPackageRoot = realpathSync(path.join(__dirname, ".."));';
const block=[begin,
'// Cover npm shims and direct npm entry launches, including shells with an old PATH.',
'const __hudRuntime = process.platform === "win32"',
'  ? path.join(process.env.LOCALAPPDATA || path.join(require("node:os").homedir(), "AppData", "Local"), "CodexHudIntegration", "current")',
'  : path.join(require("node:os").homedir(), ".local", "share", "codex-hud-integration", "current");',
'const __hudLauncher = path.join(__hudRuntime, "codex-launcher.cjs");',
'if (existsSync(__hudLauncher)) {',
'  try {',
'    const __hudCode = await require(__hudLauncher).main(process.argv.slice(2), { packageRoot: codexPackageRoot });',
'    if (__hudCode !== null) process.exit(Number.isInteger(__hudCode) ? __hudCode : 1);',
'    // The interactive host owns its lifetime and exits after flushing the PTY.',
'    await new Promise(() => {});',
'  } catch (__hudError) {',
'    console.error("Codex HUD: " + __hudError.message);',
'    process.exit(1);',
'  }',
'} else if (process.stdin.isTTY && process.stdout.isTTY) {',
'  console.error("Codex HUD runtime is missing; starting official Codex without the HUD.");',
'}',end].join('\n');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function patchEntry(original){
 const normalized=original.replace(/\r\n/g,'\n');
 if(normalized.includes(begin)||normalized.includes(end)){
  const a=normalized.indexOf(begin),b=normalized.indexOf(end);
  if(a<0||b<a||normalized.slice(a,b+end.length)!==block)throw Error('Existing npm entry bridge differs; it was preserved');
  return original;
 }
 if(original.split(anchor).length!==2)throw Error('Unrecognized official npm launcher; no file was changed');
 const eol=original.includes('\r\n')?'\r\n':'\n';return original.replace(anchor,anchor+eol+block.replace(/\n/g,eol));
}
function entryReady(source){try{return source.includes(begin)&&patchEntry(source)===source;}catch{return false;}}
async function installBridge(packageRoot,backupRoot){
 const fsp=fs.promises,root=await fsp.realpath(packageRoot),target=path.join(root,'bin','codex.js');
 const stat=await fsp.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Npm entry is not an ordinary file');
 const pkgBytes=await fsp.readFile(path.join(root,'package.json')),pkg=JSON.parse(pkgBytes);
 if(pkg.name!=='@openai/codex'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version))throw Error('Unrecognized Codex package');
 const before=await fsp.readFile(target),updated=Buffer.from(patchEntry(before.toString('utf8')));
 if(before.equals(updated))return {updated:false,entry:target,version:pkg.version,sha256:digest(before)};
 const backup=path.join(backupRoot,'npm-entry-'+crypto.randomUUID());await fsp.mkdir(backup,{recursive:true});
 await fsp.writeFile(path.join(backup,'codex.js'),before,{flag:'wx'});await fsp.writeFile(path.join(backup,'package.json'),pkgBytes,{flag:'wx'});
 const staged=path.join(root,'bin','.codex-hud-entry-'+crypto.randomUUID()+'.mjs');let changed=false;
 try{
  await fsp.writeFile(staged,updated,{flag:'wx',mode:stat.mode&0o777});
  const check=spawnSync(process.execPath,['--check',staged],{encoding:'utf8',timeout:10000,windowsHide:true});if(check.status!==0)throw Error('Npm entry syntax check failed: '+check.stderr);
  if(digest(await fsp.readFile(target))!==digest(before)||digest(await fsp.readFile(path.join(root,'package.json')))!==digest(pkgBytes))throw Error('Codex package changed during preparation');
  await fsp.rename(staged,target);changed=true;
  if(digest(await fsp.readFile(target))!==digest(updated))throw Error('Npm entry write verification failed');
  return {updated:true,entry:target,version:pkg.version,sha256:digest(updated),backup};
 }catch(error){
  if(changed&&digest(await fsp.readFile(target))===digest(updated))await fsp.writeFile(target,before);
  throw error;
 }finally{await fsp.rm(staged,{force:true});}
}
module.exports={patchEntry,entryReady,installBridge,begin,end};
if(require.main===module)installBridge(path.resolve(process.argv[2]),path.resolve(process.argv[3])).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
