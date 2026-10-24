/** Stage only tracked public/ bytes from a single commit; default is a dry run. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildZip } from './zip.mjs';
import { root, git, sha256, sourceAt, publicEntries, htmlForItch } from './itch.mjs';

const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--candidate', '--confirm'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
if (git('status', '--porcelain')) throw new Error('Commit or remove working-tree changes before packaging');
const source = sourceAt();
const tag = `v${source.version}`;
if (!args.has('--candidate')) {
  if (git('cat-file', '-t', tag) !== 'tag' || git('rev-parse', `${tag}^{commit}`) !== source.commit)
    throw new Error(`HEAD must be the annotated ${tag}; use --candidate before review`);
}
const directory = path.join(root, 'dist-itch', args.has('--candidate') ? `candidate-${source.commit}` : tag);
const name = `Baloncelli-${source.version}-itch-html5.zip`;
console.log(`${source.commit}\n${directory}\n${name}`);
if (!args.has('--confirm')) {
  console.log('Dry run; add --confirm to write the package.');
} else {
  const entries = publicEntries(source.commit).map(entry => entry.name === 'index.html'
    ? { ...entry, data: htmlForItch(entry.data) } : entry);
  const zip = buildZip(entries);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), zip);
  writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${sha256(zip)}  ${name}\n`);
  writeFileSync(path.join(directory, 'source.json'), JSON.stringify(source, null, 2) + '\n');
  console.log(`Packaged ${entries.length} files; SHA-256 ${sha256(zip)}`);
}
