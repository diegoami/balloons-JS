import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { devices } from 'playwright';
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

/**
 * Counts pixels that differ from a bare sky, i.e. everything the game drew on
 * top of it. The canvas is opaque now that the sky is painted rather than left
 * transparent, so counting non-transparent pixels would always return the lot.
 */
const drawnPixels = page => page.evaluate(() => {
  const c = document.getElementById('balloon_canvas');
  const actual = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;

  const bare = document.createElement('canvas');
  bare.width = c.width;
  bare.height = c.height;
  const bctx = bare.getContext('2d');
  bctx.setTransform(Game.dpr, 0, 0, Game.dpr, 0, 0);
  Sky.paint(bctx, Game.width, Game.height, Sky.paletteFor(Game.diff_level));
  const plain = bctx.getImageData(0, 0, bare.width, bare.height).data;

  let n = 0;
  for (let i = 0; i < actual.length; i += 4) {
    if (Math.abs(actual[i] - plain[i]) > 6 ||
        Math.abs(actual[i + 1] - plain[i + 1]) > 6 ||
        Math.abs(actual[i + 2] - plain[i + 2]) > 6) {
      n++;
    }
  }
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

await t('font size is bounded by width, by height and by the menu', async () => {
  // Width sets the scale; height keeps the bottom row on screen; a final
  // measurement of the menu string guarantees it fits. The old code was
  // width-only, and bitwise-OR'd the result with the default as a string
  // ("15" | 30 === 31), so a phone rendered a 31px font where 15 was meant.
  const cases = [
    { width: 1000, height: 700, expect: 30, bound: 'width' },
    { width: 500, height: 700, expect: 15, bound: 'width' },
    { width: 1920, height: 1080, expect: 57, bound: 'height, just' },
    { width: 1920, height: 700, expect: 37, bound: 'height' },
    { width: 1920, height: 400, expect: 21, bound: 'height' },
    { width: 320, height: 700, expect: 12, bound: 'minimum' }
  ];
  for (const c of cases) {
    const { context, page } = await newGame({ width: c.width, height: c.height });
    const size = await page.evaluate(() => Game.fontSize);
    const predicted = Math.round(Math.max(12, Math.min(30 * c.width / 1000, c.height / 19)));
    assert.equal(size, c.expect,
      `at ${c.width}x${c.height} (${c.bound}-bound) expected ${c.expect}px, got ${size}px`);
    assert.equal(size, predicted,
      `at ${c.width}x${c.height} the rule predicts ${predicted}px but got ${size}px`);
    await context.close();
  }
});

await t('menu text fits inside the canvas at phone width', async () => {
  const { context, page } = await newGame({ width: 390, height: 844 });
  const fits = await page.evaluate(() => {
    const w = Game.ctx.measureText(Layout.HINT_TEXT).width;
    return { textWidth: w, limit: Game.width * (1 - 2 * Layout.GRID.columns.margin) };
  });
  assert.ok(fits.textWidth <= fits.limit,
    `menu is ${fits.textWidth.toFixed(0)}px wide but only ${fits.limit.toFixed(0)}px available`);
  await context.close();
});

await t('every drawn region lines up with its click target', async () => {
  for (const [w, h] of [[1280, 720], [390, 844], [1920, 400], [820, 1180]]) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => {
      const L = Game.layout, ctx = Game.ctx;
      ctx.font = L.fonts.menu;
      return {
        buttons: L.menu.buttons.map(b => ({
          level: b.level,
          labelWidth: ctx.measureText(b.label).width,
          x: b.x, y: b.y, width: b.width, height: b.height,
          hit: b.hit
        })),
        heading: L.scores.heading,
        hit: L.scores.hit
      };
    });

    m.buttons.forEach(button => {
      // The button a finger hits is the button that was drawn: same rect.
      assert.deepEqual(
        { x: button.hit.x, y: button.hit.y, width: button.hit.width, height: button.hit.height },
        { x: button.x, y: button.y, width: button.width, height: button.height },
        `${button.level} hit rect differs from its drawn rect at ${w}x${h}`
      );
      assert.ok(button.labelWidth <= button.width,
        `${button.level} label (${button.labelWidth.toFixed(0)}) overflows its button ` +
        `(${button.width.toFixed(0)}) at ${w}x${h}`);
    });

    assert.ok(m.heading.y > m.hit.y && m.heading.y < m.hit.y + m.hit.height,
      `scores baseline outside its hit rect at ${w}x${h}`);
    await context.close();
  }
});

await t('buttons never overlap each other', async () => {
  for (const [w, h] of [[1280, 720], [390, 844], [320, 568], [240, 600], [1920, 400]]) {
    const { context, page } = await newGame({ width: w, height: h });
    const buttons = await page.evaluate(() => Game.layout.menu.buttons.map(b => ({
      level: b.level, x: b.x, y: b.y, width: b.width, height: b.height
    })));
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], z = buttons[j];
        const overlap = a.x < z.x + z.width && z.x < a.x + a.width &&
                        a.y < z.y + z.height && z.y < a.y + a.height;
        assert.ok(!overlap, `${a.level} overlaps ${z.level} at ${w}x${h}`);
      }
    }
    await context.close();
  }
});

await t('the selected difficulty is drawn differently from the rest', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const L = Game.layout, ctx = Game.ctx;
    Game.diff_level = 'H';
    Game.drawTitleScreen();
    const sample = (button) => {
      const b = button;
      const d = ctx.getImageData(
        Math.round((b.x + b.width / 2) * Game.dpr),
        Math.round((b.y + 3) * Game.dpr), 1, 1
      ).data;
      return [d[0], d[1], d[2]];
    };
    const byLevel = {};
    L.menu.buttons.forEach(b => { byLevel[b.level] = sample(b); });
    return byLevel;
  });
  const active = m.H.join(',');
  ['E', 'S', 'V'].forEach(level => {
    assert.notEqual(m[level].join(','), active,
      `${level} is painted the same as the selected H button`);
  });
  await context.close();
});

await t('clicking a difficulty box starts that game', async () => {
  const { context, page, errors } = await newGame();
  const layout = await page.evaluate(() => Game.layout.menu);
  const box = layout.buttons[2]; // Hard
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
  const painted = await drawnPixels(page);
  const m = await page.evaluate(() => ({
    backingW: Game.canvas.width, logicalW: Game.width, logicalH: Game.height
  }));
  m.painted = painted;
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
  const layout = await page.evaluate(() => Game.layout.menu);
  const box = layout.buttons[2]; // Hard
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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



// ---------- milestone 2: the layout system ----------

const VIEWPORTS = [
  [1280, 720], [1920, 1080], [390, 844], [430, 932], [820, 1180],
  [1920, 400], [1024, 768], [320, 568], [2560, 1440], [768, 1024]
];

await t('every menu item becomes a button and a target', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    items: Layout.MENU_ITEMS.map(i => i.level),
    buttons: Game.layout.menu.buttons.map(b => b.level),
    labels: Game.layout.menu.buttons.map(b => b.label),
    targets: Game.layout.targets.map(t => t.level)
  }));
  assert.deepEqual(m.buttons, m.items, 'a menu item did not become a button');
  assert.deepEqual(m.labels, ['Easy', 'Standard', 'Hard', 'VHard']);
  assert.deepEqual(m.targets, [...m.items, null],
    'targets should be the buttons plus the high-score line');
  await context.close();
});

await t('the whole composition stays on screen at every viewport', async () => {
  for (const [w, h] of VIEWPORTS) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => {
      const L = Game.layout;
      return {
        fontSize: Game.fontSize,
        deepest: L.scores.rows[L.scores.rows.length - 1],
        menuRight: Math.max(...L.menu.buttons.map(b => b.x + b.width)),
        introRight: Game.ctx.measureText(Layout.INTRO_TEXT).width + L.intro.x,
        scoreValueX: L.scores.columns.value,
        hudTime: L.hud.time
      };
    });
    assert.ok(m.deepest < h, `bottom score row ${m.deepest.toFixed(0)} below ${h}px screen at ${w}x${h}`);
    assert.ok(m.menuRight <= w, `menu boxes run to ${m.menuRight.toFixed(0)} past ${w}px at ${w}x${h}`);
    assert.ok(m.introRight <= w, `intro text runs to ${m.introRight.toFixed(0)} past ${w}px at ${w}x${h}`);
    assert.ok(m.scoreValueX < w && m.hudTime < w, `right-hand columns off screen at ${w}x${h}`);
    assert.ok(m.fontSize >= 1, `font collapsed to ${m.fontSize} at ${w}x${h}`);
    await context.close();
  }
});

await t('vertical rhythm follows the type scale, not screen height', async () => {
  // Same width, very different heights: while the font is unchanged, the rows
  // must land in the same place. Under the old height-fraction scheme they
  // scaled with the screen, stranding tiny text across a tall phone.
  const read = async (h) => {
    const { context, page } = await newGame({ width: 800, height: h });
    const m = await page.evaluate(() => ({
      font: Game.fontSize,
      rows: Game.layout.scores.rows.map(Math.round),
      menuTop: Math.round(Game.layout.menu.top)
    }));
    await context.close();
    return m;
  };
  const tall = await read(1200);
  const taller = await read(1600);
  assert.equal(tall.font, taller.font, 'font should not depend on height here');
  assert.deepEqual(tall.rows, taller.rows,
    `rows moved with screen height: ${tall.rows} vs ${taller.rows}`);
  assert.equal(tall.menuTop, taller.menuTop);
});

await t('row spacing is proportional to the line height', async () => {
  const { context, page } = await newGame({ width: 1280, height: 720 });
  const m = await page.evaluate(() => {
    const L = Game.layout;
    return {
      line: L.line,
      gaps: L.scores.rows.slice(1).map((y, i) => y - L.scores.rows[i]),
      step: Layout.GRID.scoreRowStep
    };
  });
  m.gaps.forEach(gap => {
    assert.ok(Math.abs(gap - m.line * m.step) < 0.01,
      `row gap ${gap.toFixed(1)} is not ${m.step} line heights (${(m.line * m.step).toFixed(1)})`);
  });
  assert.equal(new Set(m.gaps.map(g => g.toFixed(4))).size, 1, 'row gaps are not even');
  await context.close();
});

await t('the menu never overflows, even at extreme widths', async () => {
  for (const [w, h] of [[240, 600], [280, 600], [320, 568], [360, 640], [3440, 1440]]) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => ({
      textWidth: Game.ctx.measureText(Layout.HINT_TEXT).width,
      limit: Game.width * (1 - 2 * Layout.GRID.columns.margin),
      font: Game.fontSize
    }));
    assert.ok(m.textWidth <= m.limit + 0.5,
      `menu is ${m.textWidth.toFixed(0)}px at ${w}px wide but only ${m.limit.toFixed(0)}px is available (font ${m.font})`);
    await context.close();
  }
});

await t('clicking the high-score line restarts at the current difficulty', async () => {
  const { context, page, errors } = await newGame();
  await page.evaluate(() => { Game.diff_level = 'H'; });
  const hit = await page.evaluate(() => Game.layout.scores.hit);
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.waitForTimeout(2600);
  assert.equal(await page.evaluate(() => Game.screen), 'playing',
    'the high-score line did not start a game');
  assert.equal(await page.evaluate(() => Game.diff_level), 'H');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the layout is recomputed on resize', async () => {
  const { context, page } = await newGame({ width: 1280, height: 720 });
  const before = await page.evaluate(() => ({ x: Game.layout.intro.x, line: Game.layout.line }));
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ x: Game.layout.intro.x, line: Game.layout.line }));
  assert.notEqual(before.x, after.x, 'layout was not recomputed after resize');
  assert.ok(Math.abs(after.x - 600 * 0.05) < 0.01, 'left margin does not track the new width');
  assert.ok(after.line < before.line, 'line height should shrink with the narrower viewport');
  await context.close();
});



// ---------- touch targets ----------

await t('every tappable target meets the 44px touch minimum', async () => {
  for (const [w, h] of [[390, 664], [412, 839], [320, 568], [1280, 720], [820, 1180]]) {
    const { context, page } = await newGame({ width: w, height: h });
    const targets = await page.evaluate(() => Game.layout.targets.map(t => ({
      level: t.level || 'replay',
      width: +t.hit.width.toFixed(1),
      height: +t.hit.height.toFixed(1)
    })));
    const min = await page.evaluate(() => Layout.GRID.minTouchTarget);
    targets.forEach(target => {
      assert.ok(target.width >= min,
        `${target.level} target is ${target.width}px wide at ${w}x${h}, needs ${min}`);
      assert.ok(target.height >= min,
        `${target.level} target is ${target.height}px tall at ${w}x${h}, needs ${min}`);
    });
    await context.close();
  }
});

await t('the menu box stays on screen after growing to touch size', async () => {
  for (const [w, h] of [[240, 600], [320, 568], [390, 664], [1920, 400], [2560, 1440]]) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => ({
      top: Game.layout.menu.top,
      bottom: Game.layout.menu.bottom,
      introY: Game.layout.intro.y,
      scoresY: Game.layout.scores.heading.y
    }));
    assert.ok(m.top >= 0, `menu box starts above the canvas (${m.top.toFixed(1)}) at ${w}x${h}`);
    assert.ok(m.bottom <= h, `menu box runs past the bottom at ${w}x${h}`);
    assert.ok(m.top > m.introY - 2, `menu box overlaps the intro line at ${w}x${h}`);
    await context.close();
  }
});

await t('an imprecise tap still selects the difficulty aimed at', async () => {
  const { context, page } = await newGame({ width: 390, height: 664 });
  // A grid of offsets around each box centre, within a fingertip of the target.
  const outcome = await page.evaluate(() => {
    const L = Game.layout;
    const results = [];
    for (const box of L.menu.buttons) {
      for (let dx = -10; dx <= 10; dx += 5) {
        for (let dy = -10; dy <= 10; dy += 5) {
          const point = {
            x: box.x + box.width / 2 + dx,
            y: box.y + box.height / 2 + dy
          };
          const got = Layout.pick(L.targets, point);
          results.push({ aimed: box.level, got: got ? (got.level || 'replay') : null });
        }
      }
    }
    return results;
  });
  const wrong = outcome.filter(r => r.got !== r.aimed);
  assert.equal(wrong.length, 0,
    `${wrong.length}/${outcome.length} offset taps missed: ` +
    JSON.stringify(wrong.slice(0, 5)));
  await context.close();
});

await t('a real touch tap starts a game on an emulated phone', async () => {
  const phones = ['iPhone 13', 'Pixel 7'];
  for (const name of phones) {
    const device = devices[name];
    if (!device) continue;
    const context = await browser.newContext({ ...device });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.accept('Toucher'));
    await page.addInitScript(() => { try { localStorage.setItem('name', 'Toucher'); } catch (e) {} });
    await page.goto('http://localhost:8899/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Deliberately off-centre, the way a thumb lands.
    const point = await page.evaluate(() => {
      const b = Game.layout.menu.buttons[3]; // VHard
      return { x: b.x + b.width / 2 + 6, y: b.y + b.height / 2 - 8 };
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(2800);

    const state = await page.evaluate(() => ({ screen: Game.screen, diff: Game.diff_level }));
    assert.equal(state.diff, 'V', `${name}: off-centre tap selected ${state.diff}`);
    assert.equal(state.screen, 'playing', `${name}: tap did not start the game`);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
  }
});

await t('no two tap targets overlap, and each resolves to itself', async () => {
  // Milestone 2 had to grow the difficulty boxes past what was drawn, which
  // made them overlap the high-score line and needed nearest-centre
  // resolution. Laid-out buttons separate cleanly, so the stronger property
  // holds: every target is disjoint and unambiguous.
  for (const [w, h] of [[1280, 720], [390, 664], [412, 839], [320, 568], [240, 600], [1920, 400]]) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => {
      const L = Game.layout;
      const overlaps = [];
      for (let i = 0; i < L.targets.length; i++) {
        for (let j = i + 1; j < L.targets.length; j++) {
          const a = L.targets[i].hit, z = L.targets[j].hit;
          if (a.x < z.x + z.width && z.x < a.x + a.width &&
              a.y < z.y + z.height && z.y < a.y + a.height) {
            overlaps.push((L.targets[i].level || 'replay') + '/' + (L.targets[j].level || 'replay'));
          }
        }
      }
      const resolved = L.targets.map(t => {
        const point = { x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 };
        const got = Layout.pick(L.targets, point);
        return { want: t.level, got: got ? got.level : 'nothing' };
      });
      return { overlaps, resolved };
    });

    assert.deepEqual(m.overlaps, [], `targets overlap at ${w}x${h}: ${m.overlaps}`);
    m.resolved.forEach(r => {
      assert.equal(r.got, r.want,
        `a tap on the centre of ${r.want || 'replay'} resolved to ${r.got} at ${w}x${h}`);
    });
    await context.close();
  }
});

await browser.close();
server.close();

console.log('\n' + pass + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
