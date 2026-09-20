/**
 * Syntax-checks every module the game loads.
 *
 * This replaces a hand-written list of fourteen `node --check` calls chained
 * with `&&`. The list had drifted: six modules added during v2 -- attract,
 * birds, boss, fireflies, icons and play -- were never checked at all, which
 * is every module the second version introduced.
 *
 * The obvious repair, `node --check public/js/*.js`, is worse than the
 * problem. `node --check` takes ONE file: given more it checks the first and
 * exits 0 on the rest, so the glob would have checked announce.js alone and
 * reported success for the other nineteen. Coverage would have gone from
 * fourteen to one while the terminal stayed green.
 *
 * The shell loop that does work -- `for f in public/js/*.js; do ...; done` --
 * is fine under sh and fails under cmd.exe, which is what npm falls back to on
 * Windows when script-shell is unset. That is the machine this game is
 * developed and released from, so `npm test` would have stopped at its first
 * step there while passing on CI. Hence a script: one behaviour everywhere.
 *
 * It also checks that the directory and the page agree, so that a module added
 * to one and forgotten in the other fails here rather than in a browser.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'js');

const onDisk = readdirSync(dir).filter(n => n.endsWith('.js')).sort();

// Every <script src="js/..."> the page actually loads.
//
// Comments come out first. A tag inside <!-- --> is not loaded, and matching
// it anyway reported a disabled module as present -- which is the one case
// this cross-check exists for, since commenting a tag out is how you disable
// a module while bisecting and forgetting to put it back is how it ships.
const page = readFileSync(path.join(root, 'public', 'index.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');
const loaded = [...page.matchAll(/<script[^>]+src=["']js\/([^"']+\.js)["']/g)]
  .map(m => m[1]);

let bad = 0;

for (const file of onDisk) {
  try {
    execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    process.stderr.write(String(e.stderr));
  }
}

// A module nobody loads is dead, and one the page loads that isn't here is a
// 404 at runtime. Either way the two lists should be the same set.
const missing = onDisk.filter(f => !loaded.includes(f));
const phantom = loaded.filter(f => !onDisk.includes(f));

for (const f of missing) {
  bad++;
  process.stderr.write(`public/js/${f} is not loaded by public/index.html\n`);
}
for (const f of phantom) {
  bad++;
  process.stderr.write(`public/index.html loads js/${f}, which does not exist\n`);
}

if (bad) {
  process.stderr.write(`\ncheck failed: ${bad} problem${bad === 1 ? '' : 's'}\n`);
  process.exit(1);
}

console.log(`checked ${onDisk.length} modules in public/js, all loaded by index.html`);
