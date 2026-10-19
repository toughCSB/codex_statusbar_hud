import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const packageRoot = args.includes('--package-root') ? option('--package-root') : path.join(
  process.platform === 'win32' ? process.env.APPDATA : path.join(os.homedir(), '.local/lib'),
  process.platform === 'win32' ? 'npm/node_modules/@openai/codex' : 'node_modules/@openai/codex');
const sourceBinary = args.includes('--binary') ? path.resolve(option('--binary')) : null;
if (!sourceBinary) throw new Error('--binary is required');
if (!args.includes('--migration-manifest')) throw new Error('--migration-manifest is required');
const migrationManifestPath=path.resolve(option('--migration-manifest'));
const migrationManifest=JSON.parse(await fs.readFile(migrationManifestPath,'utf8'));
if(migrationManifest.version!=='0.163.0'||migrationManifest.platform!==process.platform||migrationManifest.arch!==process.arch)throw new Error('Migration build manifest does not match this platform/version');
const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
if (pkg.version !== '0.163.0') throw new Error('Refusing to change a different Codex version: ' + pkg.version);
const targetByPlatform = {
  'win32-x64': ['x86_64-pc-windows-msvc', '@openai/codex-win32-x64'],
  'win32-arm64': ['aarch64-pc-windows-msvc', '@openai/codex-win32-arm64'],
  'darwin-x64': ['x86_64-apple-darwin', '@openai/codex-darwin-x64'],
  'darwin-arm64': ['aarch64-apple-darwin', '@openai/codex-darwin-arm64'],
  'linux-x64': ['x86_64-unknown-linux-musl', '@openai/codex-linux-x64'],
  'linux-arm64': ['aarch64-unknown-linux-musl', '@openai/codex-linux-arm64'],
};
const target = targetByPlatform[`${process.platform}-${process.arch}`];
if (!target) throw new Error('Unsupported installer platform/architecture');
const [targetTriple, platformPackage] = target;
const requireFromPackage = createRequire(path.join(path.resolve(packageRoot), 'package.json'));
let vendorRoot;
try {
  const platformPackagePath = requireFromPackage.resolve(`${platformPackage}/package.json`);
  const platformPkg = JSON.parse(await fs.readFile(platformPackagePath, 'utf8'));
  if (platformPkg.version !== `${pkg.version}-${process.platform}-${process.arch}` ||
      !platformPkg.os?.includes(process.platform) || !platformPkg.cpu?.includes(process.arch)) {
    throw new Error('Platform npm package does not match this Codex version/platform');
  }
  vendorRoot = path.join(path.dirname(platformPackagePath), 'vendor', targetTriple);
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  vendorRoot = path.join(packageRoot, 'vendor', targetTriple);
}
const vendorManifestPath = path.join(vendorRoot, 'codex-package.json');
try {
  const vendorManifest = JSON.parse(await fs.readFile(vendorManifestPath, 'utf8'));
  if (vendorManifest.version !== pkg.version || vendorManifest.target !== targetTriple) {
    throw new Error('Vendor bundle does not match this Codex version/platform');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // Older npm bundles have no codex-package.json; their parent package is version checked above.
}
const vendorBin = path.join(vendorRoot, 'bin');
const executableName = process.platform === 'win32' ? 'codex.exe' : 'codex';
const companionName = process.platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host';
const vendorVersion = spawnSync(path.join(vendorBin, executableName), ['--version'],
  {encoding:'utf8', windowsHide:true, timeout:30000});
if (vendorVersion.status !== 0 || !/^codex-cli 0\.163\.0\s*$/.test(vendorVersion.stdout)) {
  throw new Error('Vendor Codex executable version check failed: ' + vendorVersion.stdout + vendorVersion.stderr);
}
const vendorFiles = await fs.readdir(vendorBin, {withFileTypes:true});
const companionNames = vendorFiles.filter(entry => entry.isFile() &&
  entry.name.startsWith('codex-') &&
  (process.platform !== 'win32' || entry.name.endsWith('.exe'))).map(entry => entry.name).sort();
if (!companionNames.includes(companionName)) {
  throw new Error('Required Codex companion is missing from vendor bundle: ' + path.join(vendorBin, companionName));
}
const version = spawnSync(sourceBinary, ['--version'], {encoding:'utf8', windowsHide:true, timeout:30000});
if (version.status !== 0 || !/^codex-cli 0\.163\.0\s*$/.test(version.stdout)) {
  throw new Error('Native candidate version check failed: ' + version.stdout + version.stderr);
}
const statePath=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'state_5.sqlite');
let checkedMigrations=0;
try {
  await fs.access(statePath);
  const {DatabaseSync}=await import('node:sqlite');
  const database=new DatabaseSync(statePath,{readOnly:true});
  try {
    for(const row of database.prepare('SELECT version, checksum FROM _sqlx_migrations ORDER BY version').all()){
      if(migrationManifest.migrations[String(row.version)]!==Buffer.from(row.checksum).toString('hex')){
        throw new Error('Existing DB migration '+row.version+' differs from this build; refusing install without changing the DB');
      }
      checkedMigrations++;
    }
  } finally {database.close();}
} catch(error){if(error.code!=='ENOENT')throw error;}
const launcherPath = path.join(packageRoot, 'bin/codex.js');
const original = await fs.readFile(launcherPath, 'utf8');
const marker = '// Codex native rainbow HUD 0.163.0; no hooks or external panels.';
const binaryLine = 'const binaryPath = findCodexExecutable();';
const spawnLine = 'const child = spawn(binaryPath, process.argv.slice(2), {';
let candidate = original;
if (!original.includes(marker)) {
  for (const expected of [binaryLine,spawnLine]) {
    if (original.split(expected).length !== 2) throw new Error('Unexpected npm launcher; no files changed');
  }
  candidate = candidate.replace('import { spawn } from "node:child_process";',
    'import { spawn } from "node:child_process";\nimport { homedir as nativeHudHome } from "node:os";');
  candidate = candidate.replace(binaryLine, marker + '\n' +
    'const nativeHudBinary = path.join(nativeHudHome(), ".local/share/codex-native-hud/0.163.0/bin", process.platform === "win32" ? "codex.exe" : "codex");\n' +
    'const usingNativeHud = existsSync(nativeHudBinary);\n' +
    'const binaryPath = usingNativeHud ? nativeHudBinary : findCodexExecutable();\n' +
    'const nativeHudArgs = usingNativeHud ? ["-c", \'tui.status_line=["rainbow-hud"]\', ...process.argv.slice(2)] : process.argv.slice(2);');
  candidate = candidate.replace(spawnLine, 'const child = spawn(binaryPath, nativeHudArgs, {');
}
const managedRoot = path.join(os.homedir(), '.local/share/codex-native-hud/0.163.0');
const executable = path.join(managedRoot,'bin',executableName);
const fileDigest = async filename => {const hash=crypto.createHash('sha256');for await (const chunk of createReadStream(filename)) hash.update(chunk);return hash.digest('hex');};
const sourceHash = await fileDigest(sourceBinary);
if(migrationManifest.binaryHash!==sourceHash)throw new Error('Native artifact differs from the migration build manifest');
const companions = await Promise.all(companionNames.map(async name => {
  const source = path.join(vendorBin, name);
  const destination = path.join(managedRoot, 'bin', name);
  const sourceHash = await fileDigest(source);
  let installedHash = null;
  try { installedHash = await fileDigest(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return {name, source, destination, sourceHash, action: installedHash === sourceHash ? 'skip' : 'install'};
}));
const binaryFiles = [{name:executableName, source:sourceBinary, destination:executable, sourceHash,
  action:path.resolve(sourceBinary) === path.resolve(executable) ? 'skip' : 'install'}, ...companions];
const plan = {packageRoot, version:pkg.version, sourceBinary, sourceHash, executable,
  vendorBin, companions, launcherPath, launcherAlreadyPatched:original.includes(marker), configChanged:false,
  vendorBinaryChanged:false, launchesExtraWindow:false, checkedMigrations, databaseModified:false};
if (!args.includes('--apply')) {console.log(JSON.stringify(plan,null,2));process.exit(0);}
const backupRoot = path.join(managedRoot,'backups',new Date().toISOString().replaceAll(':','-'));
const stagedLauncher = path.join(os.tmpdir(),`codex-native-hud-check-${process.pid}.mjs`);
try {
  await fs.writeFile(stagedLauncher,candidate);
  const syntax = spawnSync(process.execPath,['--check',stagedLauncher],{encoding:'utf8',windowsHide:true});
  if (syntax.status !== 0) throw new Error('Launcher syntax check failed: '+syntax.stderr);
} finally { await fs.rm(stagedLauncher,{force:true}); }
await fs.mkdir(path.dirname(executable), {recursive:true});
await fs.mkdir(backupRoot,{recursive:true});
await fs.writeFile(path.join(backupRoot,'codex.js'),original);
const changedFiles = binaryFiles.filter(file => file.action === 'install');
const stagedFiles = [];
const installedFiles = [];
let launcherWritten = false;
const metadata = [];
try {
  for (const name of ['migration-checksums.json','installation.json']) {
    const destination = path.join(managedRoot,name);
    const backup = path.join(backupRoot,`${name}.before`);
    let existed = true;
    try { await fs.copyFile(destination,backup); }
    catch (error) { if (error.code !== 'ENOENT') throw error; existed = false; }
    metadata.push({destination,backup,existed,touched:false});
  }
  // Stage and verify every file before replacing any installed executable.
  for (const file of changedFiles) {
    const staged = file.destination + `.new-${process.pid}`;
    await fs.copyFile(file.source,staged);
    stagedFiles.push(staged);
    await fs.chmod(staged,0o755);
    if (await fileDigest(staged) !== file.sourceHash) throw new Error('Binary copy hash mismatch: '+file.name);
    file.staged = staged;
    try {
      await fs.copyFile(file.destination,path.join(backupRoot,file.name));
      file.hadPrevious = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; file.hadPrevious = false; }
  }
  for (const file of changedFiles) {
    try {
      await fs.rename(file.staged,file.destination);
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM','EACCES','EBUSY'].includes(error.code) || !file.hadPrevious) throw error;
      // Windows allows a running executable to be moved, even when it cannot be overwritten.
      await fs.rename(file.destination,path.join(backupRoot,`${file.name}.running`));
      try { await fs.rename(file.staged,file.destination); }
      catch (replaceError) {
        await fs.rename(path.join(backupRoot,`${file.name}.running`),file.destination);
        throw replaceError;
      }
    }
    installedFiles.push(file);
  }
  await fs.writeFile(launcherPath,candidate);
  launcherWritten = true;
  if(migrationManifestPath!==path.resolve(managedRoot,'migration-checksums.json')) {
    metadata[0].touched = true;
    await fs.copyFile(migrationManifestPath,metadata[0].destination);
  }
  const result={...plan,backupRoot,installedAt:new Date().toISOString()};
  metadata[1].touched = true;
  await fs.writeFile(metadata[1].destination,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  const rollbackErrors = [];
  const restore = async operation => { try { await operation(); } catch (rollbackError) { rollbackErrors.push(rollbackError); } };
  for (const item of metadata.filter(item => item.touched).reverse()) {
    await restore(() => item.existed ? fs.copyFile(item.backup,item.destination) : fs.rm(item.destination,{force:true}));
  }
  if (launcherWritten) await restore(() => fs.writeFile(launcherPath,original));
  for (const file of installedFiles.reverse()) {
    await restore(async () => {
      await fs.rename(file.destination,path.join(backupRoot,`${file.name}.failed`));
      if (file.hadPrevious) await fs.copyFile(path.join(backupRoot,file.name),file.destination);
    });
  }
  if (rollbackErrors.length) throw new AggregateError([error,...rollbackErrors], 'Install failed and rollback was incomplete');
  throw error;
} finally {
  await Promise.all(stagedFiles.map(staged => fs.rm(staged,{force:true})));
}
