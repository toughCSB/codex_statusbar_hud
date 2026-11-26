'use strict';
const {execFile}=require('node:child_process');
function git(cwd,args,signal){
 if(signal?.aborted)return Promise.resolve(null);
 return new Promise(resolve=>execFile('git',args,{cwd,signal,windowsHide:true,timeout:3000,maxBuffer:1024*1024,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'}},(error,stdout)=>resolve(error?null:stdout.trim())));
}
async function inspectGit(cwd,signal){
 const branch=await git(cwd,['branch','--show-current'],signal);if(!branch)return {branch:null,summary:null};
 const remotes=(await git(cwd,['remote'],signal)??'').split(/\r?\n/).filter(Boolean);remotes.sort((a,b)=>a==='origin'?-1:b==='origin'?1:0);
 let target=null;
 for(const remote of remotes){
  const ref=await git(cwd,['symbolic-ref','--quiet',`refs/remotes/${remote}/HEAD`],signal);
  if(ref?.startsWith(`refs/remotes/${remote}/`) && await git(cwd,['show-ref','--verify','--quiet',ref],signal)!==null){target=ref;break;}
 }
 if(!target)for(const name of ['main','master']){const ref=`refs/heads/${name}`;if(await git(cwd,['show-ref','--verify','--quiet',ref],signal)!==null){target=ref;break;}}
 if(!target)return {branch,summary:null};
 const base=await git(cwd,['merge-base','HEAD',target],signal);if(!base||!/^[0-9a-f]{40,64}$/i.test(base))return {branch,summary:null};
 const stats=await git(cwd,['diff','--no-ext-diff','--no-textconv','--numstat',`${base}..HEAD`],signal);if(stats===null)return {branch,summary:null};
 let add=0,del=0;for(const line of stats.split(/\r?\n/)){const [a,d]=line.split('\t');if(/^\d+$/.test(a??''))add+=Number(a);if(/^\d+$/.test(d??''))del+=Number(d);}
 return {branch,summary:add===0&&del===0?'✓':`+${add} -${del}`};
}
module.exports={inspectGit};
