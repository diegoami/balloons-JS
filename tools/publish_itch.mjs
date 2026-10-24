/** Publish only tagged, smoke-tested browser and Android artifacts. */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { root, git, readStage, sha256, sourceAt } from './itch.mjs';

const args = process.argv.slice(2);
const index = args.indexOf('--project');
const project = index >= 0 ? args[index + 1] : '';
if (!/^[a-z0-9_-]+\/[a-z0-9_-]+$/.test(project)) throw new Error('Supply --project owner/slug');
const rest = args.filter((_, i) => i !== index && i !== index + 1);
if (rest.some(arg => arg !== '--confirm')) throw new Error('Unknown option');
const source = sourceAt();
const tag = `v${source.version}`;
const directory = path.join(root, 'dist-itch', tag);
const staged = readStage(directory);
if (source.commit !== staged.commit) throw new Error('Checkout differs from stage');
const allowed = ['SHA256SUMS.txt', 'source.json', staged.name, 'smoke.json', 'screenshots', 'android'].sort();
if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(allowed)) throw new Error('Unexpected or missing files in release stage');
const smoke = JSON.parse(readFileSync(path.join(directory, 'smoke.json'), 'utf8'));
if (!smoke.passed || smoke.commit !== source.commit || smoke.sha256 !== staged.hash) throw new Error('Smoke the release ZIP first');
const android = path.join(directory, 'android');
const apk = JSON.parse(readFileSync(path.join(android, 'source.json'), 'utf8'));
for (const key of ['commit', 'tree', 'version']) if (apk[key] !== source[key]) throw new Error(`Android ${key} differs`);
const apkName = `Baloncelli-${source.version}-android.apk`;
if (apk.name !== apkName) throw new Error('Unexpected Android filename');
const hash = sha256(readFileSync(path.join(android, apkName)));
if (hash !== apk.sha256 || readFileSync(path.join(android, 'SHA256SUMS.txt'), 'utf8') !== `${hash}  ${apkName}\n`)
  throw new Error('APK checksum mismatch');
if (JSON.stringify(readdirSync(android).sort()) !== JSON.stringify(['SHA256SUMS.txt', 'source.json', apkName].sort()))
  throw new Error('Unexpected Android stage files');
if (git('cat-file', '-t', tag) !== 'tag' || git('rev-parse', `${tag}^{commit}`) !== source.commit) throw new Error('Local annotated tag differs');
// Fetch live refs rather than trusting a stale origin/master.
git('fetch', 'origin', 'master', '--tags');
const remote = git('ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
if (!remote.split('\n').includes(`${source.commit}\trefs/tags/${tag}^{}`)) throw new Error('Origin annotated tag differs');
git('merge-base', '--is-ancestor', source.commit, 'origin/master');
const butler = process.env.BUTLER || 'butler';
const channels = [[path.join(directory, staged.name), 'html5'], [path.join(android, apkName), 'android']];
for (const [file, channel] of channels) console.log(`${file} -> ${project}:${channel} (version ${source.version})`);
if (!args.includes('--confirm')) console.log('Dry run; add --confirm to upload both channels.');
else {
  for (const [file, channel] of channels) {
    execFileSync(butler, ['push', file, `${project}:${channel}`, '--userversion', source.version], { stdio: 'inherit' });
    console.log(`Uploaded ${channel}`);
  }
}
