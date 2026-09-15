import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './helpers/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' };

// Stand-in for the Netlify function, same contract (already unit-tested separately).
const boards = new Map();
const apiHits = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/scores/')) {
    const diff = url.pathname.slice('/api/scores/'.length);
    apiHits.push({ method: req.method, diff });
    const board = boards.get(diff) || [];
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const { name, score } = JSON.parse(body);
        const next = [...board, { name, score, score_day: '2026-09-15' }]
          .sort((a, b) => b.score - a.score).slice(0, 10);
        boards.set(diff, next);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(next));
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(board));
    return;
  }

  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

await new Promise(r => server.listen(8899, r));

const browser = await launchBrowser();

let pass = 0, failed = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); failed++; }
};

async function newGame({ width = 1280, height = 720, name = 'TestPlayer', dpr = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept(name));
  await page.addInitScript(n => {
    try { window.localStorage.setItem('name', n); } catch (e) {}
  }, name);
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { context, page, errors };
}

/** Counts non-transparent pixels, i.e. anything actually drawn on the canvas. */
const drawnPixels = page => page.evaluate(() => {
  const c = document.getElementById('balloon_canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});

await t('page loads with no JS errors and the title screen renders', async () => {
  const { context, page, errors } = await newGame();
  assert.deepEqual(errors, [], 'unexpected errors: ' + errors.join(' | '));
  assert.ok(await drawnPixels(page) > 1000, 'nothing was drawn on the canvas');
  await context.close();
});

await t('canvas fills the viewport', async () => {
  const { context, page } = await newGame({ width: 1024, height: 768 });
  const size = await page.evaluate(() => {
    const rect = Game.canvas.getBoundingClientRect();
    return { w: Game.width, h: Game.height, cssW: Math.round(rect.width), cssH: Math.round(rect.height) };
  });
  assert.equal(size.w, 1024, 'logical width');
  assert.equal(size.h, 768, 'logical height');
  assert.equal(size.cssW, 1024, 'rendered CSS width');
  assert.equal(size.cssH, 768, 'rendered CSS height');
  await context.close();
});

await t('font scales with width instead of the old bitwise-OR result', async () => {
  for (const [width, expected] of [[1000, 30], [1920, 58], [500, 15], [320, 12]]) {
    const { context, page } = await newGame({ width, height: 700 });
    const font = await page.evaluate(() => Game.ctx.font);
    const size = parseInt(font, 10);
    assert.equal(size, expected, `at ${width}px expected ${expected}px, got ${font}`);
    await context.close();
  }
});

await t('menu text fits inside the canvas at phone width', async () => {
  const { context, page } = await newGame({ width: 390, height: 844 });
  const fits = await page.evaluate(() => {
    const w = Game.ctx.measureText(DIFF_TOTAL).width;
    return { textWidth: w, limit: Game.width * (1 - START_TEXT_BEGIN_X) };
  });
  assert.ok(fits.textWidth <= fits.limit,
    `menu is ${fits.textWidth.toFixed(0)}px wide but only ${fits.limit.toFixed(0)}px available`);
  await context.close();
});

await t('drawn difficulty boxes line up with their click targets', async () => {
  const { context, page } = await newGame();
  const layout = await page.evaluate(() => Game.getDiffLayout());
  // Each box must contain the centre of the label text drawn inside it.
  const offsets = await page.evaluate(() => {
    const unit = Game.ctx.measureText(DIFFICULTY_CHOICE).width / DIFF_LENGTH_TOTAL;
    const left = Game.width * START_TEXT_BEGIN_X;
    return [
      [DIFF_OFFSET_1, DIFF_LENGTH_1], [DIFF_OFFSET_2, DIFF_LENGTH_2],
      [DIFF_OFFSET_3, DIFF_LENGTH_3], [DIFF_OFFSET_4, DIFF_LENGTH_4]
    ].map(([o, l]) => left + unit * (o + l / 2));
  });
  layout.boxes.forEach((box, i) => {
    assert.ok(offsets[i] >= box.x && offsets[i] <= box.x + box.width,
      `label ${i} centre ${offsets[i].toFixed(0)} outside box [${box.x.toFixed(0)}, ${(box.x + box.width).toFixed(0)}]`);
  });
  await context.close();
});

await t('clicking a difficulty box starts that game', async () => {
  const { context, page, errors } = await newGame();
  const box = (await page.evaluate(() => Game.getDiffLayout())).boxes[2]; // Hard
  const layout = await page.evaluate(() => Game.getDiffLayout());
  await page.mouse.click(box.x + box.width / 2, layout.top + layout.height / 2);
  await page.waitForTimeout(2600);
  const state = await page.evaluate(() => ({ diff: Game.diff_level, lost: MAX_LOST_BALLOONS, running: !!Game.tick_interval }));
  assert.equal(state.diff, 'H');
  assert.equal(state.lost, 3, 'Hard should allow 3 lost balloons');
  assert.ok(state.running, 'game loop should be running');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('keyboard shortcuts pick a difficulty', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press('v');
  await page.waitForTimeout(2400);
  assert.equal(await page.evaluate(() => Game.diff_level), 'V');
  await context.close();
});

await t('balloons spawn and rise during play', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.balloons.length > 0, null, { timeout: 5000 });
  const before = await page.evaluate(() => Game.balloons.map(b => b.ycoord));
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => Game.balloons.map(b => b.ycoord));
  assert.ok(before.length > 0, 'no balloons spawned');
  assert.ok(after[0] < before[0], 'balloons should rise (y decreasing)');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('clicking a balloon pops it and scores a point', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.balloons.length > 0, null, { timeout: 5000 });

  const popped = await page.evaluate(async () => {
    // Freeze the loop so the balloon can't drift between reading and clicking.
    clearInterval(Game.tick_interval);
    const b = Game.balloons[0];
    const caughtBefore = Game.balloons_caught;
    const countBefore = Game.balloons.length;
    Game.canvas.dispatchEvent(new MouseEvent('click', {
      clientX: b.xcoord, clientY: b.ycoord, bubbles: true
    }));
    return {
      caughtBefore, caughtAfter: Game.balloons_caught,
      countBefore, countAfter: Game.balloons.length
    };
  });
  assert.equal(popped.caughtAfter, popped.caughtBefore + 1, 'score did not increase');
  assert.equal(popped.countAfter, popped.countBefore - 1, 'balloon was not removed');
  await context.close();
});

await t('game over submits the score and shows the leaderboard', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Diego' });
  await page.keyboard.press('v'); // VHard: a single lost balloon ends it
  await page.waitForTimeout(2500);
  await page.evaluate(() => { Game.balloons_caught = 17; });
  await page.waitForFunction(() => Game.isrestart === true, null, { timeout: 20000 });

  await page.waitForTimeout(600);
  const posted = apiHits.find(h => h.method === 'POST');
  assert.ok(posted, 'no score was POSTed, saw: ' + JSON.stringify(apiHits));
  assert.equal(posted.diff, 'v', 'score posted to the wrong difficulty');
  assert.equal(boards.get('v')[0].name, 'Diego');
  assert.equal(boards.get('v')[0].score, 17);

  // After the 5s pause the board is fetched and drawn.
  await page.waitForTimeout(5600);
  assert.ok(apiHits.some(h => h.method === 'GET' && h.diff === 'v'), 'board was never fetched');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('no listeners leak across repeated restarts', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('Leaky'));
  // Count listeners registered with an AbortSignal, decrementing when aborted.
  await page.addInitScript(() => {
    window.__live = 0;
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (opts && opts.signal) {
        window.__live++;
        opts.signal.addEventListener('abort', () => { window.__live--; });
      }
      return origAdd.call(this, type, fn, opts);
    };
  });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  // Title screen: one canvas click + one document keydown.
  assert.equal(await page.evaluate(() => window.__live), 2, 'unexpected title-screen listener count');

  const seen = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const counts = [];
    for (let i = 0; i < 6; i++) {
      Game.restart('E');
      await sleep(30);
      counts.push(window.__live);
    }
    return counts;
  });
  // Each restart drops the previous state's listeners and binds exactly one.
  assert.deepEqual(seen, [1, 1, 1, 1, 1, 1], 'listeners accumulated across restarts: ' + seen);

  // And functionally: one click must pop exactly one balloon, not one per stacked handler.
  await page.waitForTimeout(2600);
  await page.waitForFunction(() => Game.balloons.length > 1, null, { timeout: 5000 });
  const popped = await page.evaluate(() => {
    clearInterval(Game.tick_interval);
    const b = Game.balloons[0];
    const before = Game.balloons.length;
    Game.canvas.dispatchEvent(new MouseEvent('click', { clientX: b.xcoord, clientY: b.ycoord, bubbles: true }));
    return { before, after: Game.balloons.length };
  });
  assert.equal(popped.after, popped.before - 1, 'one click removed more than one balloon');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a second game after game over still responds to input', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press('v');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.isrestart === true, null, { timeout: 20000 });
  await page.waitForTimeout(5600); // difficulty input is rebound after 5s
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({ diff: Game.diff_level, restart: Game.isrestart }));
  assert.equal(state.diff, 'E', 'could not start a new game after game over');
  assert.equal(state.restart, false);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('preferences persist across reloads without re-prompting', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  let prompts = 0;
  page.on('dialog', d => { prompts++; d.accept('Persisted'); });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  assert.equal(prompts, 1, 'first visit should prompt exactly once');
  await page.keyboard.press('h');
  await page.waitForTimeout(2400);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  assert.equal(prompts, 1, 'a returning visitor must not be prompted again');
  const stored = await page.evaluate(() => ({ name: Game.name, diff: Game.diff_level }));
  assert.equal(stored.name, 'Persisted');
  assert.equal(stored.diff, 'H', 'difficulty should be remembered');
  await context.close();
});

await t('game still works when localStorage throws', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('NoStorage'));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('site data blocked'); }
    });
  });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => Game.diff_level), 'E');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('game still works when the score API is unreachable', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('Offline'));
  await page.route('**/api/scores/**', r => r.abort());
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(2600);
  await page.waitForFunction(() => Game.balloons.length > 0, null, { timeout: 5000 });
  assert.deepEqual(errors, [], 'a dead leaderboard must not break the game: ' + errors.join(' | '));
  await context.close();
});

await t('balloon colours render identically to the old library', async () => {
  const { context, page } = await newGame();
  const sample = await page.evaluate(() => {
    const c = new Color({ r: 112, g: 29, b: 253 });
    return {
      dark: new Color({ r: 112, g: 29, b: 253 }).darken(0.3).rgbString(),
      light: new Color({ r: 112, g: 29, b: 253 }).lighten(0.3).rgbString()
    };
  });
  // Values captured from the original vendored color.js bundle.
  assert.equal(sample.dark, 'rgb(73, 2, 194)');
  assert.equal(sample.light, 'rgb(163, 111, 254)');
  await context.close();
});


// ---------- milestone 1: device pixel ratio and resize ----------

await t('backing store is sized in device pixels at 1x, 2x and 3x', async () => {
  for (const dpr of [1, 2, 3]) {
    const { context, page } = await newGame({ width: 1024, height: 768, dpr });
    const m = await page.evaluate(() => {
      const t = Game.ctx.getTransform();
      return {
        backingW: Game.canvas.width, backingH: Game.canvas.height,
        logicalW: Game.width, logicalH: Game.height,
        dpr: Game.dpr, scaleX: t.a, scaleY: t.d
      };
    });
    assert.equal(m.dpr, dpr, `Game.dpr at ${dpr}x`);
    assert.equal(m.backingW, 1024 * dpr, `backing width at ${dpr}x`);
    assert.equal(m.backingH, 768 * dpr, `backing height at ${dpr}x`);
    assert.equal(m.logicalW, 1024, `logical width must stay in CSS pixels at ${dpr}x`);
    assert.equal(m.logicalH, 768, `logical height must stay in CSS pixels at ${dpr}x`);
    assert.equal(m.scaleX, dpr, `context x-scale at ${dpr}x`);
    assert.equal(m.scaleY, dpr, `context y-scale at ${dpr}x`);
    await context.close();
  }
});

await t('font size depends on logical width, not device pixels', async () => {
  const sizes = [];
  for (const dpr of [1, 2, 3]) {
    const { context, page } = await newGame({ width: 1024, height: 768, dpr });
    sizes.push(await page.evaluate(() => Game.fontSize));
    await context.close();
  }
  assert.deepEqual(sizes, [sizes[0], sizes[0], sizes[0]],
    'font must not scale with device pixel ratio, got ' + sizes);
});

await t('clicking a balloon still pops it at 2x (no double-applied ratio)', async () => {
  const { context, page, errors } = await newGame({ dpr: 2 });
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.balloons.length > 0, null, { timeout: 5000 });
  const popped = await page.evaluate(() => {
    clearInterval(Game.tick_interval);
    const b = Game.balloons[0];
    const before = Game.balloons_caught;
    Game.canvas.dispatchEvent(new MouseEvent('click', { clientX: b.xcoord, clientY: b.ycoord, bubbles: true }));
    return { before, after: Game.balloons_caught };
  });
  assert.equal(popped.after, popped.before + 1, 'hit-testing broke at 2x');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('resizing re-sizes the canvas and repaints the title screen', async () => {
  const { context, page, errors } = await newGame({ width: 1280, height: 720, dpr: 2 });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const c = Game.canvas;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return { backingW: c.width, logicalW: Game.width, logicalH: Game.height, painted };
  });
  assert.equal(m.logicalW, 640, 'logical width did not follow the viewport');
  assert.equal(m.logicalH, 900, 'logical height did not follow the viewport');
  assert.equal(m.backingW, 1280, 'backing store should be 640 x 2');
  assert.ok(m.painted > 1000, 'title screen was not repainted after resize');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('difficulty boxes stay clickable after a resize', async () => {
  const { context, page, errors } = await newGame({ width: 1280, height: 720 });
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.waitForTimeout(300);
  const layout = await page.evaluate(() => Game.getDiffLayout());
  const box = layout.boxes[2]; // Hard
  await page.mouse.click(box.x + box.width / 2, layout.top + layout.height / 2);
  await page.waitForTimeout(2600);
  const state = await page.evaluate(() => ({ diff: Game.diff_level, lost: MAX_LOST_BALLOONS }));
  assert.equal(state.diff, 'H', 'hit regions went stale after resize');
  assert.equal(state.lost, 3);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('rotating mid-game keeps play running and balloons in bounds', async () => {
  const { context, page, errors } = await newGame({ width: 900, height: 500 });
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.balloons.length > 2, null, { timeout: 5000 });
  await page.setViewportSize({ width: 500, height: 900 }); // portrait
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    screen: Game.screen,
    logicalW: Game.width,
    running: !!Game.tick_interval,
    maxXmax: Math.max(...Game.balloons.map(b => b.xmax)),
    count: Game.balloons.length
  }));
  assert.equal(m.logicalW, 500);
  assert.equal(m.screen, 'playing', 'game should still be in play after rotating');
  assert.ok(m.running, 'loop stopped on rotate');
  assert.equal(m.maxXmax, 500, 'existing balloons kept the old bounce boundary');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a burst of resizes coalesces and lands on the final size', async () => {
  const { context, page, errors } = await newGame({ width: 1280, height: 720 });
  for (const w of [1200, 1100, 1000, 900, 800, 760]) {
    await page.setViewportSize({ width: w, height: 700 });
  }
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({ w: Game.width, backing: Game.canvas.width, pending: Game.resizePending }));
  assert.equal(m.w, 760, 'did not settle on the final viewport size');
  assert.equal(m.backing, 760);
  assert.equal(m.pending, false, 'a coalesced resize was left pending');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});



await t('repeated resizes do not accumulate pixel-ratio listeners', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('Ratio'));
  await page.addInitScript(() => {
    window.__mqlListeners = 0;
    const origMatch = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      const mql = origMatch(q);
      const origAdd = mql.addEventListener && mql.addEventListener.bind(mql);
      if (origAdd) {
        mql.addEventListener = function (type, fn, opts) {
          window.__mqlListeners++;
          return origAdd(type, fn, opts);
        };
      }
      return mql;
    };
  });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const afterLoad = await page.evaluate(() => window.__mqlListeners);
  for (const w of [1200, 1100, 1000, 900, 800, 700, 600, 900, 1200]) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  const afterResizes = await page.evaluate(() => window.__mqlListeners);

  assert.equal(afterLoad, 1, 'expected exactly one ratio listener at load');
  assert.equal(afterResizes, 1,
    `ratio listeners grew from ${afterLoad} to ${afterResizes} across 9 resizes`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await browser.close();
server.close();

console.log('\n' + pass + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
