import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { htmlForItch, sourceAt, readStage, sha256, root } from '../tools/itch.mjs';

test('the packaged scores override is before the game scripts', () => {
  const html = htmlForItch(Buffer.from('<head>\n<script src="js/scores.js"></script>')).toString();
  assert.ok(html.indexOf('window.BALLOONS_SCORES_URL') < html.indexOf('src="js/scores.js"'));
  assert.ok(html.includes('https://baloncelli.netlify.app/api/scores'));
  assert.throws(() => htmlForItch(Buffer.from('missing head')));
});

test('stage checks reject a changed ZIP and a mismatched source tree', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'baloncelli-stage-test-'));
  const source = sourceAt();
  const name = `Baloncelli-${source.version}-itch-html5.zip`;
  const bytes = Buffer.from('artifact');
  writeFileSync(path.join(directory, name), bytes);
  writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${sha256(bytes)}  ${name}\n`);
  writeFileSync(path.join(directory, 'source.json'), JSON.stringify(source));
  assert.equal(readStage(directory).commit, source.commit);
  writeFileSync(path.join(directory, name), 'damaged');
  assert.throws(() => readStage(directory), /ZIP does not match/);
  writeFileSync(path.join(directory, name), bytes);
  writeFileSync(path.join(directory, 'source.json'), JSON.stringify({ ...source, tree: '0'.repeat(40) }));
  assert.throws(() => readStage(directory), /tree disagrees/);
});

test('publisher rejects missing or malformed projects before contacting itch.io', () => {
  for (const args of [[], ['--project', 'https://diegoami.itch.io/baloncelli'], ['--project', '../bad']]) {
    assert.throws(() => execFileSync(process.execPath, ['tools/publish_itch.mjs', ...args],
      { cwd: root, stdio: 'pipe' }), error => /Supply --project owner\/slug/.test(error.stderr.toString()));
  }
});
