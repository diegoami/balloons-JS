/** Build and stage the APK from the same committed checkout as the browser ZIP. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, git, sourceAt, sha256 } from './itch.mjs';

const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--candidate', '--confirm'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
if (git('status', '--porcelain')) throw new Error('Working tree must be clean');
const source = sourceAt();
const tag = `v${source.version}`;
if (!args.has('--candidate') &&
    (git('cat-file', '-t', tag) !== 'tag' || git('rev-parse', `${tag}^{commit}`) !== source.commit))
  throw new Error(`HEAD must be annotated ${tag}; use --candidate before review`);
const directory = path.join(root, 'dist-itch', args.has('--candidate') ? `candidate-${source.commit}` : tag, 'android');
console.log(`Build Android ${source.version} from ${source.commit}\n${directory}`);
if (!args.has('--confirm')) {
  console.log('Dry run; add --confirm to build and stage.');
} else {
  const android = path.join(root, 'android');
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'gradlew.bat assembleRelease'], { cwd: android, stdio: 'inherit' });
  } else execFileSync('./gradlew', ['assembleRelease'], { cwd: android, stdio: 'inherit' });
  if (git('status', '--porcelain') || sourceAt().commit !== source.commit) throw new Error('Source changed during build');
  const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
  const hash = sha256(readFileSync(apk));
  mkdirSync(directory, { recursive: true });
  const name = `Baloncelli-${source.version}-android.apk`;
  copyFileSync(apk, path.join(directory, name));
  writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${hash}  ${name}\n`);
  writeFileSync(path.join(directory, 'source.json'), JSON.stringify({ ...source, name, sha256: hash }, null, 2) + '\n');
  console.log(`Staged ${name}; SHA-256 ${hash}. Verify signing before publishing.`);
}
