/** Shared source identity and HTML5 staging. No credentials are read here. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const boardURL = 'https://baloncelli.netlify.app/api/scores';
export function versionAt(commit) {
  const gradle = git('show', `${commit}:android/app/build.gradle.kts`);
  const version = /versionName = "(\d+\.\d+)"/.exec(gradle)?.[1];
  if (!version) throw new Error('No Android versionName found');
  return version;
}
export function sourceAt(commit = 'HEAD') {
  const sha = git('rev-parse', `${commit}^{commit}`);
  return { commit: sha, tree: git('rev-parse', `${sha}^{tree}`), version: versionAt(sha) };
}
export function htmlForItch(data) {
  const html = data.toString('utf8');
  if (!html.includes('<head>')) throw new Error('index.html has no <head>');
  return Buffer.from(html.replace('<head>', `<head>\n    <script>window.BALLOONS_SCORES_URL = ${JSON.stringify(boardURL)};</script>`));
}
export function publicEntries(commit) {
  return git('ls-tree', '-r', '--name-only', commit, 'public/').split('\n').map(file => ({
    name: file.slice('public/'.length),
    data: execFileSync('git', ['show', `${commit}:${file}`], { cwd: root })
  }));
}
export function readStage(directory) {
  const record = JSON.parse(readFileSync(path.join(directory, 'source.json'), 'utf8'));
  const source = sourceAt(record.commit);
  for (const key of ['commit', 'tree', 'version']) {
    if (record[key] !== source[key]) throw new Error(`Stage ${key} disagrees with git`);
  }
  const name = `Baloncelli-${source.version}-itch-html5.zip`;
  const hash = sha256(readFileSync(path.join(directory, name)));
  if (readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8') !== `${hash}  ${name}\n`)
    throw new Error('ZIP does not match SHA256SUMS.txt');
  return { ...source, name, hash };
}
