'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const fsp=fs.promises;
const codeFiles=['codex-launcher.cjs','npm-entry.cjs','codex-install.cjs','launch-plan.cjs','launch-hints.cjs','hud-bootstrap.cjs','hud-host.cjs','terminal-io.cjs','footer-surface.cjs','hud-render.cjs','hud-status.cjs','session-tail.cjs','account-limit.cjs','git-info.cjs','vt-frame.cjs','title-filter.cjs','size-replies.cjs','terminal-background.cjs','platform-paths.cjs','runtime-snapshot.cjs','mac-updater.cjs','npm-shim.cjs','npm-interceptor.cjs','win-update.ps1','win-user-path.ps1','win-path-adapter.cjs','smoke-bundle.cjs','install-config.cjs','install-profile.cjs','installer-core.cjs','installer-cli.cjs','stage-bundle.cjs','licenses/xterm-LICENSE.txt','shims/windows/npm.cmd','shims/unix/npm','shims/launch-windows/codex.ps1','shims/launch-windows/codex.cmd','shims/launch-windows/codex','shims/launch-windows/home-codex.ps1','shims/launch-unix/codex'];
const manifest={name:'codex-hud-integration',version:'1.0.0',private:true,dependencies:{'@xterm/headless':'6.0.0','@lydell/node-pty':'1.1.0'}};
async function stageBundle({sourceRoot,destination,platform=process.platform}){
 if(!['win32','darwin'].includes(platform))throw new Error('Unsupported installation platform.');
 await fsp.mkdir(destination,{recursive:false});const hashes={};
 async function copy(relative,target=relative){
  const source=path.join(sourceRoot,relative),dest=path.join(destination,target);const stat=await fsp.lstat(source);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error(`Source is not a regular file: ${relative}`);
  await fsp.mkdir(path.dirname(dest),{recursive:true});await fsp.copyFile(source,dest,fs.constants.COPYFILE_EXCL);
  hashes[target]=crypto.createHash('sha256').update(await fsp.readFile(dest)).digest('hex');
 }
 for(const file of codeFiles)await copy(file);
 if(platform==='win32')for(const name of ['codex.ps1','codex.cmd','codex','home-codex.ps1'])await copy(`shims/launch-windows/${name}`,`bin/${name}`);
 else {await copy('shims/launch-unix/codex','bin/codex');await fsp.chmod(path.join(destination,'bin','codex'),0o755);await fsp.chmod(path.join(destination,'shims','unix','npm'),0o755);}
 await fsp.writeFile(path.join(destination,'package.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const metadata={format:1,platform,version:manifest.version,files:hashes};await fsp.writeFile(path.join(destination,'bundle-manifest.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 return metadata;
}
async function verifyBundle(root,platform=process.platform){
 const metadata=JSON.parse(await fsp.readFile(path.join(root,'bundle-manifest.json'),'utf8'));
 if(metadata.format!==1||metadata.platform!==platform||metadata.version!==manifest.version)throw new Error('Bundle metadata does not match.');
 const expected=[...codeFiles,...(platform==='win32'?['bin/codex.ps1','bin/codex.cmd','bin/codex','bin/home-codex.ps1']:['bin/codex'])].sort();
 if(JSON.stringify(Object.keys(metadata.files??{}).sort())!==JSON.stringify(expected))throw new Error('Bundle manifest file list does not match.');
 for(const [relative,expected] of Object.entries(metadata.files??{})){
  const normalized=path.normalize(relative);if(path.isAbsolute(normalized)||normalized==='..'||normalized.startsWith('..'+path.sep))throw new Error('Unsafe bundle manifest path.');
  const file=path.join(root,normalized),stat=await fsp.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Bundle file is not regular.');
  const actual=crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex');if(actual!==expected)throw new Error(`Bundle verification failed: ${relative}`);
 }
 const pkg=JSON.parse(await fsp.readFile(path.join(root,'package.json'),'utf8'));
 if(JSON.stringify(pkg.dependencies)!==JSON.stringify(manifest.dependencies))throw new Error('Bundle dependencies changed.');
 return metadata;
}
module.exports={stageBundle,verifyBundle,manifest,codeFiles};
