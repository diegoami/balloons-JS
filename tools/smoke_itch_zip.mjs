/** Test the extracted artifact in a frame, rather than the development tree. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { launchBrowser } from '../test/helpers/browser.mjs';
import { root, readStage, publicEntries } from './itch.mjs';

const directory = path.resolve(process.argv[2] || path.join(root, 'dist-itch', 'v2.8'));
const source = readStage(directory);
const site = mkdtempSync(path.join(tmpdir(), 'baloncelli-itch-'));
const zip = path.join(directory, source.name);
if (process.platform === 'win32') {
  execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', zip, '-C', site]);
} else {
  execFileSync('unzip', ['-q', zip, '-d', site]);
}
const files = readdirSync(site, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => path.relative(site,
    path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
const expected = publicEntries(source.commit);
assert.deepEqual(files, expected.map(entry => entry.name).sort(), 'Missing or extra packaged files');
for (const entry of expected) {
  const actual = readFileSync(path.join(site, entry.name));
  if (entry.name === 'index.html') {
    // Deliberately independent of the packaging transform.
    const injected = '\n    <script>window.BALLOONS_SCORES_URL = "https://baloncelli.netlify.app/api/scores";</script>';
    assert.equal(actual.toString().split(injected).length, 2, 'Missing/duplicate scores override');
    assert.equal(actual.toString().replace(injected, ''), entry.data.toString());
  } else assert.ok(actual.equals(entry.data), `${entry.name} differs from committed public/`);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  if (req.url === '/frame') {
    res.setHeader('content-type', 'text/html');
    res.end(`<body style="margin:0"><iframe title="Game" style="border:0;width:100vw;height:100vh" src="http://localhost:${server.address().port}/"></iframe>`);
    return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(site + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const browser = await launchBrowser();
const shots = path.join(directory, 'screenshots');
mkdirSync(shots, { recursive: true });
try {
  // Baseline candidates plus itch's canonical and alternate embed sizes.
  for (const [width, height] of [[240, 320], [320, 240], [320, 480], [480, 320], [480, 720], [640, 480]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    try {
      const errors = [];
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      // No test score reaches production. Check GET and POST through the real client.
      const hits = [];
      await context.route('https://baloncelli.netlify.app/api/scores', async route => {
        hits.push(route.request().method());
        await route.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } });
      });
      await context.addInitScript(() => {
        localStorage.setItem('name', 'Itch smoke');
        window.embedRequests = [];
        Element.prototype.requestFullscreen = function () { window.embedRequests.push('fullscreen'); return Promise.resolve(); };
        if (screen.orientation) screen.orientation.lock = function () { window.embedRequests.push('lock'); return Promise.resolve(); };
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/frame`);
      const frame = page.frames().find(f => f.url().startsWith('http://localhost:'));
      await frame.waitForFunction(() => window.Game && Game.screen === 'title');
      const geometry = await frame.evaluate(() => {
        const button = Play.rect(Game);
        return { button, width: Game.width, height: Game.height,
          scroll: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth };
      });
      const r = geometry.button;
      assert.ok(r.width >= 44 && r.height >= 44, 'Play target is too small');
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height, 'Play is clipped');
      assert.equal(geometry.scroll, false, 'First screen scrolls');
      await page.screenshot({ path: path.join(shots, `${width}x${height}-title.png`) });
      // Freeze the moving button just for clicking its actual painted position.
      await frame.evaluate(() => { Play.step = function () {}; });
      const play = await frame.evaluate(() => { const b = Play.rect(Game); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      await page.mouse.click(play.x, play.y);
      await frame.waitForFunction(() => Game.screen === 'playing');
      await frame.waitForFunction(() => Game.entities.some(e => e.kind === 'balloon' && e.ycoord > 80 && e.ycoord < Game.height - 60), null, { timeout: 20000 });
      // Pause simulation between locating a visible balloon and the real pointer event.
      const balloon = await frame.evaluate(() => {
        Game.stopLoop();
        const b = Game.entities.find(e => e.kind === 'balloon' && e.ycoord > 80 && e.ycoord < Game.height - 60);
        return { x: b.xcoord, y: b.ycoord, score: Game.score };
      });
      await page.mouse.click(balloon.x, balloon.y);
      assert.ok(await frame.evaluate(score => Game.score > score, balloon.score), 'Pointer did not pop a balloon');
      await page.screenshot({ path: path.join(shots, `${width}x${height}-playing.png`) });
      await frame.evaluate(async () => {
        Scores.submit(Game, Game.score);
        await Scores.submitted;
        Scores.load(Game);
        await Scores.pending;
      });
      assert.ok(hits.includes('POST') && hits.includes('GET'), 'Scores did not use the production URL override');
      assert.deepEqual(await frame.evaluate(() => window.embedRequests), [], 'Game forced fullscreen/orientation');
      assert.deepEqual(errors, [], errors.join('\n'));
      console.log(`PASS ${width}x${height}: title, pointer pop, scores, no forced fullscreen`);
    } finally { await context.close(); }
  }
  writeFileSync(path.join(directory, 'smoke.json'), JSON.stringify({ commit: source.commit, sha256: source.hash, passed: true }) + '\n');
  console.log(`PASS extracted ZIP matches ${source.commit}; screenshots: ${shots}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log(`Extracted scratch files: ${site}`);
}
