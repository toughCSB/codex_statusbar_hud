import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
if(!process.argv[2])throw new Error('Project state source path is required');
const root=path.resolve(process.argv[2]);
let changed=0;
for(const d of await fs.readdir(root,{withFileTypes:true})){
 if(!d.isDirectory()||!d.name.includes('migration')) continue;
 for(const f of await fs.readdir(path.join(root,d.name))){
  if(!f.endsWith('.sql')) continue;
  const filename=path.join(root,d.name,f);
  const text=await fs.readFile(filename,'utf8');
  const crlf=text.replaceAll('\r\n','\n').replaceAll('\n','\r\n');
  if(text!==crlf){await fs.writeFile(filename,crlf);changed++;}
 }
}
const lib=path.join(root,'src/lib.rs');
if(changed){const now=new Date();await fs.utimes(lib,now,now);}
console.log(JSON.stringify({changedSqlSourceFiles:changed,databaseModified:false}));
