'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const fsp=fs.promises;
function fingerprint(install,stat,platform,arch){return crypto.createHash('sha256').update([install.version,platform,arch,stat.dev,stat.ino,stat.size,stat.mtimeMs].join('|')).digest('hex').slice(0,20);}
async function removeOwnStage(stage,root){
 const parent=await fsp.realpath(root),resolved=await fsp.realpath(stage),rel=path.relative(parent,resolved);
 if(!rel||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!path.basename(resolved).startsWith('.staging-'))throw new Error('Unsafe runtime staging cleanup.');
 await fsp.rm(resolved,{recursive:true,force:true});
}
async function linkTree(source,dest){
 let files=0;
 async function walk(src,dst){
  await fsp.mkdir(dst,{recursive:true});const entries=await fsp.readdir(src,{withFileTypes:true});
  for(const entry of entries){const a=path.join(src,entry.name),b=path.join(dst,entry.name);
   if(entry.isSymbolicLink())throw new Error('A vendor symlink requires an explicit compatibility review.');
   if(entry.isDirectory())await walk(a,b);
   else if(entry.isFile()){
    const before=await fsp.stat(a);await fsp.link(a,b);const [after,linked]=await Promise.all([fsp.stat(a),fsp.stat(b)]);
    if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.dev!==linked.dev||after.ino!==linked.ino)throw new Error('Official vendor file changed during snapshot.');
    files++;
   }else throw new Error('Unsupported vendor file type.');
  }
 }
 await walk(source,dest);return files;
}
async function ensureSnapshot({install,runtimeRoot,platform=process.platform,arch=process.arch}){
 if(!install.vendorRoot||!install.executable||!install.host)throw new Error('Incomplete official installation.');
 await fsp.mkdir(runtimeRoot,{recursive:true});const root=await fsp.realpath(runtimeRoot),stat=await fsp.stat(install.executable),key=fingerprint(install,stat,platform,arch);
 const name=`${install.version}-${platform}-${arch}-${key}`,target=path.join(root,name),manifestPath=path.join(target,'manifest.json');
 const ext=platform==='win32'?'.exe':'',exe=path.join(target,'vendor','bin',`codex${ext}`),host=path.join(target,'vendor','bin',`codex-code-mode-host${ext}`);
 async function validate(){
  try{const m=JSON.parse(await fsp.readFile(manifestPath,'utf8'));if(m.version!==install.version||m.fingerprint!==key||m.platform!==platform||m.arch!==arch||!Number.isInteger(m.files)||m.files<2)return false;
   const [a,b,sourceHost]=await Promise.all([fsp.stat(exe),fsp.stat(host),fsp.stat(install.host)]);
   return a.isFile()&&b.isFile()&&a.dev===stat.dev&&a.ino===stat.ino&&a.size===stat.size&&b.dev===sourceHost.dev&&b.ino===sourceHost.ino&&b.size===sourceHost.size;}catch{return false;}
 }
 if(await validate())return {executable:exe,host,root:target,created:false};
 if(fs.existsSync(target))throw new Error('Existing runtime snapshot failed verification; it was preserved.');
 const stage=await fsp.mkdtemp(path.join(root,'.staging-'));
 try{
  const files=await linkTree(install.vendorRoot,path.join(stage,'vendor'));
  const after=await fsp.stat(install.executable);if(fingerprint(install,after,platform,arch)!==key)throw new Error('Official Codex changed during snapshot.');
  const manifest={version:install.version,fingerprint:key,platform,arch,files};await fsp.writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest),{flag:'wx'});
  try{await fsp.rename(stage,target);}catch(error){if(!['EEXIST','ENOTEMPTY','EPERM'].includes(error.code)||!(await validate()))throw error;}
  if(!(await validate()))throw new Error('Runtime snapshot failed verification.');
  return {executable:exe,host,root:target,created:true};
 } finally {if(fs.existsSync(stage))await removeOwnStage(stage,root);}
}
module.exports={ensureSnapshot,linkTree,fingerprint};
