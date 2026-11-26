'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {appendProfile,profileConflict,knownHomeProfile,BEGIN,END}=require('./install-config.cjs');
const fsp=fs.promises,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function prepareProfile(file,platform){
 let stat=null,original=Buffer.alloc(0);
 try{stat=await fsp.lstat(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(stat){
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Profile is not an ordinary file; it was preserved.');
  try{original=await fsp.readFile(file);const again=await fsp.lstat(file);if(again.dev!==stat.dev||again.ino!==stat.ino||again.size!==stat.size||again.mtimeMs!==stat.mtimeMs)throw new Error('Profile changed during inspection.');}
  catch(error){if(error.code==='ENOENT')throw new Error('Profile changed during inspection; it was preserved.');throw error;}
 }
 const plan=appendProfile(original,platform);
 let inspected=original;
 if(!plan.changed){
  // appendProfile has already validated this exact integration-owned block.
  // Its own codex function is not an unrelated user override during recovery.
  let text=original[0]===0xff&&original[1]===0xfe?original.subarray(2).toString('utf16le'):original.toString('utf8');
  const begin=text.indexOf(BEGIN),end=text.indexOf(END);
  inspected=Buffer.from(text.slice(0,begin)+text.slice(end+END.length),'utf8');
 }
 if(profileConflict(inspected,platform)&&!knownHomeProfile(inspected,platform))throw new Error('The profile already defines an unrecognized codex command; it was preserved.');
 return {file,platform,exists:Boolean(stat),original,desired:plan.bytes,changed:plan.changed,sourceHash:hash(original),stat};
}
async function applyProfile(plan,backupRoot){
 if(!plan.changed)return {...plan,applied:false,backup:null};
 const current=await prepareProfile(plan.file,plan.platform);
 if(current.exists!==plan.exists||current.sourceHash!==plan.sourceHash||(plan.exists&&(current.stat.dev!==plan.stat.dev||current.stat.ino!==plan.stat.ino)))throw new Error('Profile changed after inspection; it was preserved.');
 await fsp.mkdir(backupRoot,{recursive:true});const backup=plan.exists?path.join(backupRoot,`profile-${crypto.randomUUID()}.bak`):null;
 if(backup)await fsp.writeFile(backup,plan.original,{flag:'wx',mode:0o600});
 let handle,writeStarted=false;
 try{
  if(plan.exists){
   const flags=fs.constants.O_RDWR|fs.constants.O_APPEND|(process.platform==='win32'?0:fs.constants.O_NOFOLLOW);
   handle=await fsp.open(plan.file,flags);const opened=await handle.stat();
   if(opened.dev!==plan.stat.dev||opened.ino!==plan.stat.ino||opened.size!==plan.stat.size||opened.mtimeMs!==plan.stat.mtimeMs)throw new Error('Profile changed before writing; it was preserved.');
   writeStarted=true;
   await handle.writeFile(plan.desired.subarray(plan.original.length));
  }
  else {await fsp.mkdir(path.dirname(plan.file),{recursive:true});handle=await fsp.open(plan.file,'wx+',0o600);writeStarted=true;await handle.writeFile(plan.desired);}
  await handle.sync();await handle.close();handle=null;
  const after=await fsp.readFile(plan.file);if(!after.equals(plan.desired))throw new Error('Profile changed during installation; it was preserved.');
  return {...plan,applied:true,backup,appliedStat:await fsp.lstat(plan.file)};
 }catch(error){
  if(handle&&writeStarted)try{
   const opened=await handle.stat(),after=Buffer.alloc(opened.size);await handle.read(after,0,after.length,0);
   const suffix=plan.desired.subarray(plan.original.length),actual=after.subarray(plan.original.length);
   if(after.subarray(0,plan.original.length).equals(plan.original)&&actual.length<=suffix.length&&actual.equals(suffix.subarray(0,actual.length)))await handle.truncate(plan.original.length);
  }catch{}
  if(handle)await handle.close().catch(()=>{});
  throw error;
 }
}
async function rollbackProfile(applied){
 if(!applied.applied)return;
 const flags=fs.constants.O_RDWR|(process.platform==='win32'?0:fs.constants.O_NOFOLLOW),handle=await fsp.open(applied.file,flags);
 try{
  const info=await handle.stat();if(info.dev!==applied.appliedStat.dev||info.ino!==applied.appliedStat.ino)throw new Error('Profile changed after installation; it was preserved.');
  const current=Buffer.alloc(info.size);await handle.read(current,0,current.length,0);if(!current.equals(applied.desired))throw new Error('Profile changed after installation; it was preserved.');
  if(applied.exists)await handle.truncate(applied.original.length);
 }finally{await handle.close();}
 if(!applied.exists){const latest=await fsp.lstat(applied.file);if(latest.dev!==applied.appliedStat.dev||latest.ino!==applied.appliedStat.ino)throw new Error('Profile changed after installation; it was preserved.');await fsp.unlink(applied.file);}
}
module.exports={prepareProfile,applyProfile,rollbackProfile};
