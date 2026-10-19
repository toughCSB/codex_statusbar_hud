import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./install-native.mjs', import.meta.url));
const platformNames = {
  'win32-x64':['x86_64-pc-windows-msvc','codex-win32-x64','codex.exe','codex-code-mode-host.exe'],
  'win32-arm64':['aarch64-pc-windows-msvc','codex-win32-arm64','codex.exe','codex-code-mode-host.exe'],
  'darwin-x64':['x86_64-apple-darwin','codex-darwin-x64','codex','codex-code-mode-host'],
  'darwin-arm64':['aarch64-apple-darwin','codex-darwin-arm64','codex','codex-code-mode-host'],
  'linux-x64':['x86_64-unknown-linux-musl','codex-linux-x64','codex','codex-code-mode-host'],
  'linux-arm64':['aarch64-unknown-linux-musl','codex-linux-arm64','codex','codex-code-mode-host'],
};
const platform = platformNames[`${process.platform}-${process.arch}`];
const actualPackageRoot = process.platform === 'win32'
  ? path.join(process.env.APPDATA ?? '', 'npm/node_modules/@openai/codex')
  : path.join(os.homedir(), '.local/lib/node_modules/@openai/codex');

test('installer refuses missing companion before mutation, then installs and skips matching companion',
  {skip: !platform && 'unsupported platform'}, async t => {
    const [triple, optionalName, binaryName, hostName] = platform;
    const actualBinary = path.join(actualPackageRoot,'node_modules/@openai',optionalName,'vendor',triple,'bin',binaryName);
    try { await fs.access(actualBinary); }
    catch { t.skip('0.163.0 official vendor binary is unavailable'); return; }
    const temp = await fs.mkdtemp(path.join(os.tmpdir(),'codex-native-installer-test-'));
    t.after(async () => {
      assert.equal(path.dirname(temp),os.tmpdir());
      await fs.rm(temp,{recursive:true,force:true});
    });
    const packageRoot = path.join(temp,'package');
    const vendorBin = path.join(packageRoot,'node_modules/@openai',optionalName,'vendor',triple,'bin');
    const managedHome = path.join(temp,'home');
    const fakeCodexHome = path.join(temp,'codex-home');
    const manifestPath = path.join(temp,'manifest.json');
    await fs.mkdir(vendorBin,{recursive:true});
    await fs.mkdir(path.join(packageRoot,'bin'),{recursive:true});
    await fs.mkdir(managedHome,{recursive:true});
    await fs.mkdir(fakeCodexHome,{recursive:true});
    await fs.link(actualBinary,path.join(vendorBin,binaryName));
    await fs.writeFile(path.join(packageRoot,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.163.0',type:'module'}));
    const optionalPackagePath = path.join(packageRoot,'node_modules/@openai',optionalName,'package.json');
    const optionalPackage = {name:'@openai/codex',version:`0.163.0-${process.platform}-${process.arch}`,
      os:[process.platform],cpu:[process.arch]};
    await fs.writeFile(optionalPackagePath,JSON.stringify(optionalPackage));
    await fs.writeFile(path.join(packageRoot,'node_modules/@openai',optionalName,'vendor',triple,'codex-package.json'),JSON.stringify({
      version:'0.163.0',target:triple}));
    const originalLauncher = 'import { spawn } from "node:child_process";\nimport { existsSync } from "fs";\nimport path from "path";\nconst findCodexExecutable = () => "unused";\nconst binaryPath = findCodexExecutable();\nconst child = spawn(binaryPath, process.argv.slice(2), {stdio:"inherit"});\n';
    const launcherPath = path.join(packageRoot,'bin/codex.js');
    await fs.writeFile(launcherPath,originalLauncher);
    const sourceHash = crypto.createHash('sha256').update(await fs.readFile(actualBinary)).digest('hex');
    await fs.writeFile(manifestPath,JSON.stringify({version:'0.163.0',platform:process.platform,arch:process.arch,
      binaryHash:sourceHash,migrations:{}}));
    const env = {...process.env, HOME:managedHome, USERPROFILE:managedHome, CODEX_HOME:fakeCodexHome};
    const run = (...extra) => spawnSync(process.execPath,['--no-warnings',script,'--package-root',packageRoot,
      '--binary',actualBinary,'--migration-manifest',manifestPath,...extra],{encoding:'utf8',env,timeout:120000});
    const managedBin = path.join(managedHome,'.local/share/codex-native-hud/0.163.0/bin');
    await fs.writeFile(optionalPackagePath,JSON.stringify({...optionalPackage,version:'0.162.0-'+process.platform+'-'+process.arch}));
    const wrongVersion = run('--apply');
    assert.notEqual(wrongVersion.status,0);
    assert.match(wrongVersion.stderr,/Platform npm package does not match/);
    await assert.rejects(fs.access(managedBin),{code:'ENOENT'});
    await fs.writeFile(optionalPackagePath,JSON.stringify(optionalPackage));
    const missing = run('--apply');
    assert.notEqual(missing.status,0);
    assert.match(missing.stderr,/Required Codex companion is missing/);
    await assert.rejects(fs.access(managedBin),{code:'ENOENT'});
    assert.equal(await fs.readFile(launcherPath,'utf8'),originalLauncher);

    const hostSource = path.join(vendorBin,hostName);
    await fs.writeFile(hostSource,'test companion executable bytes');
    const dryRun = run();
    assert.equal(dryRun.status,0,dryRun.stderr);
    const dryPlan = JSON.parse(dryRun.stdout);
    assert.equal(dryPlan.companions.find(file => file.name === hostName)?.action,'install');
    await assert.rejects(fs.access(managedBin),{code:'ENOENT'});

    const installed = run('--apply');
    assert.equal(installed.status,0,installed.stderr);
    assert.equal(await fs.readFile(path.join(managedBin,hostName),'utf8'),'test companion executable bytes');
    assert.notEqual(await fs.readFile(launcherPath,'utf8'),originalLauncher);
    const repeat = run();
    assert.equal(repeat.status,0,repeat.stderr);
    assert.equal(JSON.parse(repeat.stdout).companions.find(file => file.name === hostName)?.action,'skip');
  });
