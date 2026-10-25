/** Export store images from the verified released ZIP, never the working game. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, sourceAt, readStage, publicEntries, htmlForItch, sha256 } from './itch.mjs';
import { buildZip } from './zip.mjs';
import { launchBrowser } from '../test/helpers/browser.mjs';

const tag = process.argv[2] || 'v2.8';
assert.match(tag, /^v\d+\.\d+$/);
const source = sourceAt(tag);
const stage = path.join(root, 'dist-itch', tag);
const record = readStage(stage);
assert.equal(record.commit, source.commit, 'Stage does not match the release tag');
const temporaryRoot = realpathSync(tmpdir());
const site = realpathSync(mkdtempSync(path.join(temporaryRoot, 'baloncelli-listing-')));
assert.equal(path.dirname(site), temporaryRoot);
assert.ok(path.basename(site).startsWith('baloncelli-listing-'));
const out = path.join(root, 'itch-listing', tag);
mkdirSync(out, { recursive: true });
const extractor = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'unzip';
execFileSync(extractor, process.platform === 'win32'
  ? ['-xf', path.join(stage, record.name), '-C', site]
  : ['-q', path.join(stage, record.name), '-d', site]);
for (const entry of publicEntries(source.commit)) {
  const expected = entry.name === 'index.html' ? htmlForItch(entry.data) : entry.data;
  assert.ok(readFileSync(path.join(site, entry.name)).equals(expected), `Archive differs: ${entry.name}`);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(site, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(site + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const scenes = [
  { file: 'cover-630x500.png', width: 630, height: 500, level: 6, cover: true, caption: 'Cover image: released game artwork with a promotional title overlay.' },
  { file: '01-title-1280x720.png', width: 1280, height: 720, title: true, caption: 'Opening screen and Play button.' },
  { file: '02-morning-1280x720.png', width: 1280, height: 720, level: 1, caption: 'Early-level balloons, with a separate information and control strip.' },
  { file: '03-saucer-1280x720.png', width: 1280, height: 720, level: 6, caption: 'The first saucer and reinforced balloons in the afternoon sky.' },
  { file: '04-night-1280x720.png', width: 1280, height: 720, level: 20, caption: 'Night-time play with the mark II saucer, birds and fireflies.' },
  { file: '05-phone-960x1440.png', width: 480, height: 720, dpr: 2, level: 12, caption: 'Portrait play at the canonical 480×720 embed, captured at 2× density.' }
];
const browser = await launchBrowser();
try {
  for (const scene of scenes) {
    const context = await browser.newContext({ viewport: { width: scene.width, height: scene.height }, deviceScaleFactor: scene.dpr || 1 });
    try {
      const errors = [];
      await context.route('https://baloncelli.netlify.app/api/scores', route => route.fulfill({ json: [] }));
      await context.addInitScript(() => {
        localStorage.setItem('name', 'Player');
        let seed = 20261025;
        Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.Game && Game.screen === 'title');
      await page.evaluate(scene => {
        Game.stopLoop();
        if (scene.title) { Game.paint(); return; }
        Game.enter('starting');
        Game.enter('playing');
        Game.stopLoop();
        Game.applyLevel(scene.level);
        Game.ticks = ((scene.level - 1) * Ladder.CLIMB_SECONDS + 6) * 30;
        Game.score = scene.level === 1 ? 18 : scene.level === 6 ? 140 : scene.level === 12 ? 540 : 1040;
        Game.allowance = Game.LIVES + Ladder.livesBy(scene.level);
        Game.livesLost = scene.level >= 12 ? 2 : 0;
        Game.entities = [];
        Game.lastBoss = -Infinity;
        if (scene.level >= 6) Game.spawnBoss();
        if (scene.level >= 16) Game.spawnFireflies();
        const field = Game.layout.playfield;
        const positions = [[0.12, 0.17], [0.3, 0.53], [0.47, 0.8], [0.65, 0.36], [0.85, 0.69]];
        for (let i = 0; i < positions.length; i++) {
          let b = Game.randomBalloon();
          if (scene.level >= 4 && i === 0) {
            for (let n = 0; n < 100 && b.skin < 2; n++) b = Game.randomBalloon();
          }
          const [x, y] = positions[i];
          b.xcoord = Math.max(b.size + 8, Math.min(Game.width - b.size - 8, Game.width * x));
          b.ycoord = scene.cover ? field.y + field.height * (0.57 + i * 0.07)
            : Math.max(field.y + b.size * 1.4 + 8, Math.min(Game.height - b.size * 1.4 - 8, field.y + field.height * y));
          Game.add(b);
        }
        if (scene.level >= 8) Game.add(birdConstructor(Game.width * 0.76, field.y + field.height * 0.54,
          Math.max(BIRD_MIN_RADIUS, BIRD_BASE_SIZE * Game.ratio), BIRD_SPEED * Game.ratio, true));
        if (scene.cover) {
          const boss = Game.entities.find(e => e.kind === 'boss');
          if (boss) boss.ycoord = field.y + field.height * 0.4;
          const label = document.createElement('div');
          label.style.cssText = 'position:absolute;left:20px;right:20px;top:76px;text-align:center;color:#fff;font-family:Fredoka,Verdana,sans-serif;text-shadow:0 2px 5px #102c48;pointer-events:none';
          label.innerHTML = '<h1 style="font-size:64px;line-height:1.1;margin:0">Baloncelli</h1><p style="font-size:20px;margin-top:10px">Pop your way through twenty levels.</p>';
          document.body.appendChild(label);
        }
        Game.paint();
      }, scene);
      assert.deepEqual(errors, [], errors.join('\n'));
      await page.screenshot({ path: path.join(out, scene.file) });
      console.log(scene.file);
    } finally { await context.close(); }
  }
  const metadata = { tag, commit: source.commit, zipSha256: record.hash,
    note: 'Gameplay scenes are posed using released entities/painters; cover adds promotional type. No game assets or code were modified. Score traffic was intercepted.',
    images: scenes.map(scene => ({ ...scene, sha256: sha256(readFileSync(path.join(out, scene.file))) })) };
  writeFileSync(path.join(out, 'source.json'), JSON.stringify(metadata, null, 2) + '\n');
  writeFileSync(path.join(out, 'README.md'), `# Baloncelli ${tag} — itch.io images\n\n` +
    `Use cover-630x500.png for the cover; the numbered files are screenshots.\n` +
    `Page copy and suggested tags are in [ITCH.md](../../ITCH.md).\n\n` +
    scenes.map(s => `- **${s.file}** — ${s.caption}`).join('\n') +
    `\n\nSource: ${tag}, commit ${source.commit}; ZIP SHA-256 ${record.hash}.\n` +
    `Scenes are posed with the released painters; the cover has promotional text.\n` +
    `No images are invented or taken from another game, and no scores are submitted.\n`);
  const files = readdirSync(out).map(name => ({ name: `itch-listing/${tag}/${name}`, data: readFileSync(path.join(out, name)) }));
  files.push({ name: 'ITCH.md', data: readFileSync(path.join(root, 'ITCH.md')) });
  const bundle = path.join(root, 'dist-itch', `Baloncelli-${source.version}-itch-listing.zip`);
  writeFileSync(bundle, buildZip(files));
  console.log(`Upload kit: ${bundle}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  // This is only the verified mkdtemp child created by this process.
  if (path.dirname(site) === temporaryRoot && path.basename(site).startsWith('baloncelli-listing-')) rmSync(site, { recursive: true });
}
