'use strict';
const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const target={
 'win32-x64':['@openai/codex-win32-x64','x86_64-pc-windows-msvc'],
 'win32-arm64':['@openai/codex-win32-arm64','aarch64-pc-windows-msvc'],
 'darwin-arm64':['@openai/codex-darwin-arm64','aarch64-apple-darwin'],
 'darwin-x64':['@openai/codex-darwin-x64','x86_64-apple-darwin']
};
function resolveOfficial({packageRoot,platform=process.platform,arch=process.arch}){
 const selected=target[`${platform}-${arch}`];if(!selected)throw new Error(`Unsupported platform ${platform}/${arch}.`);
 const root=fs.realpathSync(packageRoot),metadataPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(metadataPath,'utf8').replace(/^\uFEFF/,''));
 if(pkg.name!=='@openai/codex'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version))throw new Error('Invalid official Codex package metadata.');
 const [packageName,triple]=selected,requirePackage=createRequire(metadataPath);let vendor;
 try{
  const platformJson=requirePackage.resolve(`${packageName}/package.json`),p=JSON.parse(fs.readFileSync(platformJson,'utf8').replace(/^\uFEFF/,''));
  if(p.version!==`${pkg.version}-${platform}-${arch}`||!p.os?.includes(platform)||!p.cpu?.includes(arch))throw new Error('Official platform package does not match the Codex version.');
  vendor=path.join(path.dirname(platformJson),'vendor',triple,'bin');
 }catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;vendor=path.join(root,'vendor',triple,'bin');}
 const ext=platform==='win32'?'.exe':'',executable=path.join(vendor,`codex${ext}`),host=path.join(vendor,`codex-code-mode-host${ext}`);
 if(!fs.existsSync(executable)||!fs.existsSync(host))throw new Error('Official Codex executable or its code-mode host is missing.');
 return {version:pkg.version,packageRoot:root,executable,host,vendorRoot:path.dirname(vendor)};
}
function managedEnv(packageRoot,env=process.env){
 const child={...env,CODEX_MANAGED_PACKAGE_ROOT:packageRoot};
 for(const k of ['CODEX_MANAGED_BY_NPM','CODEX_MANAGED_BY_BUN','CODEX_MANAGED_BY_PNPM','CODEX_MANAGED_BY_VITE_PLUS'])delete child[k];
 child.CODEX_MANAGED_BY_NPM='1';return child;
}
module.exports={resolveOfficial,managedEnv};
