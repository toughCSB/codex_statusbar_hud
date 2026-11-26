'use strict';
// Update only this integration's known title-channel module with exact hashes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fsp=fs.promises,hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 const [root,source,oldHash,newHash]=process.argv.slice(2);
 if(!root||!source||!/^([0-9a-f]{64})$/.test(oldHash)||!/^([0-9a-f]{64})$/.test(newHash))throw Error('Invalid patch arguments');
 const current=path.join(root,'current'),target=path.join(current,'hud-bootstrap.cjs'),manifest=path.join(current,'bundle-manifest.json'),backup=path.join(root,'backups');
 for(const p of [current,target,manifest,source,backup]){const s=await fsp.lstat(p);if(s.isSymbolicLink())throw Error('A patch path is a symbolic link');}
 const [before,mBefore,replacement]=await Promise.all([fsp.readFile(target),fsp.readFile(manifest),fsp.readFile(source)]);
 if(hash(before)!==oldHash||hash(replacement)!==newHash)throw Error('The integration or replacement changed; nothing was modified');
 const data=JSON.parse(mBefore);if(data.files?.['hud-bootstrap.cjs']!==oldHash)throw Error('The bundle manifest changed; nothing was modified');
 data.files['hud-bootstrap.cjs']=newHash;const mAfter=Buffer.from(JSON.stringify(data,null,2)+'\n'),token=crypto.randomUUID();
 const targetBackup=path.join(backup,`hud-bootstrap-${token}.bak`),manifestBackup=path.join(backup,`manifest-${token}.bak`);
 await fsp.writeFile(targetBackup,before,{flag:'wx',mode:0o600});await fsp.writeFile(manifestBackup,mBefore,{flag:'wx',mode:0o600});
 const tmp=path.join(current,`.hud-bootstrap-${token}.tmp`),mtmp=path.join(current,`.bundle-manifest-${token}.tmp`);let changed=false;
 try{
  await fsp.writeFile(tmp,replacement,{flag:'wx'});await fsp.writeFile(mtmp,mAfter,{flag:'wx'});
  if(hash(await fsp.readFile(target))!==oldHash||hash(await fsp.readFile(manifest))!==hash(mBefore))throw Error('The integration changed during preparation');
  await fsp.rename(tmp,target);changed=true;await fsp.rename(mtmp,manifest);
  if(hash(await fsp.readFile(target))!==newHash||hash(await fsp.readFile(manifest))!==hash(mAfter))throw Error('Installed patch verification failed');
  await require(path.join(current,'stage-bundle.cjs')).verifyBundle(current,process.platform);
  console.log(JSON.stringify({updated:true,sha256:newHash,backup:targetBackup}));
 }catch(error){
  if(changed){try{if(hash(await fsp.readFile(target))===newHash){const restore=path.join(current,`.restore-${token}.tmp`);await fsp.writeFile(restore,before,{flag:'wx'});await fsp.rename(restore,target);}if(hash(await fsp.readFile(manifest))===hash(mAfter)){const restore=path.join(current,`.restore-manifest-${token}.tmp`);await fsp.writeFile(restore,mBefore,{flag:'wx'});await fsp.rename(restore,manifest);}}catch(rollback){throw Error(`Patch failed; automatic rollback needs attention: ${rollback.message}`);}}
  throw error;
 }finally{for(const p of [tmp,mtmp])await fsp.unlink(p).catch(()=>{});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
