import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
const root=path.resolve(process.argv[2]);
const migrations={};
for(const file of await fs.readdir(path.join(root,'migrations'))){
  if(!file.endsWith('.sql'))continue;
  const version=String(Number(file.split('_')[0]));
  migrations[version]=crypto.createHash('sha384').update(await fs.readFile(path.join(root,'migrations',file))).digest('hex');
}
const hash=crypto.createHash('sha256');
for await(const chunk of createReadStream(path.resolve(process.argv[4])))hash.update(chunk);
await fs.writeFile(path.resolve(process.argv[3]),JSON.stringify({version:'0.163.0',platform:process.platform,arch:process.arch,binaryHash:hash.digest('hex'),migrations},null,2));
console.log(JSON.stringify({migrationSourceCount:Object.keys(migrations).length,platform:process.platform}));
