/** Stage a traceable Windows preview; never imply coverage by the old v2.8 tag. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, git, sha256, sourceAt } from './itch.mjs';

const args = new Set(process.argv.slice(2));
for (const arg of args) if (arg !== '--confirm') throw new Error(`Unknown option ${arg}`);
if (process.platform !== 'win32') throw new Error('Build Windows on Windows');
if (git('status', '--porcelain')) throw new Error('Commit all source changes before staging');
const source = sourceAt();
const desktop = path.join(root, 'desktop');
const npm = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const config = JSON.parse(readFileSync(path.join(desktop, 'src-tauri/tauri.conf.json'), 'utf8'));
const cargo = /^version = "([^"]+)"/m.exec(readFileSync(path.join(desktop, 'src-tauri/Cargo.toml'), 'utf8'))?.[1];
if (npm.version !== config.version || npm.version !== cargo || npm.version !== `${source.version}.0`)
  throw new Error('Desktop/game version declarations disagree');
const directory = path.join(root, 'dist-itch', `windows-preview-${source.commit}`);
const name = `Baloncelli-${npm.version}-windows-x64-preview.exe`;
console.log(`${source.commit}\n${directory}\n${name}`);
if (!args.has('--confirm')) {
  console.log('Dry run; add --confirm to build, smoke-test and stage the preview.');
} else {
  execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm run build'], { cwd: desktop, stdio: 'inherit' });
  const executable = path.join(desktop, 'src-tauri/target/release/baloncelli.exe');
  execFileSync(process.execPath, [path.join(root, 'tools/smoke_desktop.mjs'), executable], { cwd: root, stdio: 'inherit' });
  if (git('status', '--porcelain') || sourceAt().commit !== source.commit) throw new Error('Source changed during desktop build');
  const hash = sha256(readFileSync(executable));
  mkdirSync(directory, { recursive: true });
  copyFileSync(executable, path.join(directory, name));
  writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${hash}  ${name}\n`);
  writeFileSync(path.join(directory, 'source.json'), JSON.stringify({ ...source, desktopVersion: npm.version,
    status: 'preview-unreviewed-native-wrapper', file: name, sha256: hash }, null, 2) + '\n');
  console.log(`Staged preview SHA-256 ${hash}`);
}
