import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { devices } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

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
  // Nothing should open a browser modal any more; if something does, every
  // test that checks `errors` will say so.
  page.on('dialog', d => { errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
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
  Sky.paint(bctx, Game.width, Game.height, Sky.paletteFor(Game.difficulty.level));
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
    { width: 1920, height: 1080, expect: 54, bound: 'height' },
    { width: 1920, height: 700, expect: 34, bound: 'height' },
    { width: 1920, height: 400, expect: 18, bound: 'height' },
    { width: 320, height: 700, expect: 12, bound: 'minimum' }
  ];
  for (const c of cases) {
    const { context, page } = await newGame({ width: c.width, height: c.height });
    const m = await page.evaluate(() => ({ size: Game.fontSize, grid: Layout.GRID }));
    const g = m.grid;
    // Read from the grid rather than repeating its numbers, so tuning one of
    // them cannot leave this test asserting the old rule.
    const predicted = Math.round(Math.max(g.minFontSize, Math.min(
      g.baseFontSize * c.width / 1000,
      (c.height - g.footerReserve) / g.heightDivisor
    )));
    assert.equal(m.size, c.expect,
      `at ${c.width}x${c.height} (${c.bound}-bound) expected ${c.expect}px, got ${m.size}px`);
    assert.equal(m.size, predicted,
      `at ${c.width}x${c.height} the rule predicts ${predicted}px but got ${m.size}px`);
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
    Game.difficulty.level = 'H';
    Game.paint();
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
  const state = await page.evaluate(() => ({ diff: Game.difficulty.level, lost: Game.difficulty.maxLost, running: Game.running }));
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
  assert.equal(await page.evaluate(() => Game.difficulty.level), 'V');
  await context.close();
});

await t('balloons spawn and rise during play', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: 5000 });
  const before = await page.evaluate(() => Game.entities.map(b => b.ycoord));
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => Game.entities.map(b => b.ycoord));
  assert.ok(before.length > 0, 'no balloons spawned');
  assert.ok(after[0] < before[0], 'balloons should rise (y decreasing)');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('clicking a balloon pops it and scores a point', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: 5000 });

  const popped = await page.evaluate(async () => {
    // Freeze the loop so the balloon can't drift between reading and clicking.
    Game.stopLoop();
    const b = Game.entities[0];
    const caughtBefore = Game.balloons_caught;
    const countBefore = Game.entities.length;
    Game.canvas.dispatchEvent(new MouseEvent('click', {
      clientX: b.xcoord, clientY: b.ycoord, bubbles: true
    }));
    return {
      caughtBefore, caughtAfter: Game.balloons_caught,
      countBefore, countAfter: Game.entities.length
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
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });

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
  // Count listeners registered with an AbortSignal, decrementing when aborted.
  await page.addInitScript(() => {
    try { localStorage.setItem('name', 'Leaky'); } catch (e) {}
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

  // The exact count depends on how many handlers a state binds, which changes
  // as the game gains input. What must hold is that it never grows.
  const onTitle = await page.evaluate(() => window.__live);
  assert.ok(onTitle > 0 && onTitle < 20,
    `implausible title-screen listener count: ${onTitle}`);

  // Both binding paths have to be exercised. The title screen binds the menu
  // handlers and a round binds the popping handler; looping on restart() alone
  // only ever re-runs the second, so a listener leaked by the first would go
  // unnoticed.
  const seen = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const counts = { menu: [], play: [] };
    for (let i = 0; i < 6; i++) {
      Game.enter('title');
      await sleep(20);
      counts.menu.push(window.__live);
      Game.restart('E');
      await sleep(20);
      counts.play.push(window.__live);
    }
    return counts;
  });

  assert.equal(new Set(seen.menu).size, 1,
    'listeners accumulated across menu rebinds: ' + seen.menu);
  assert.equal(new Set(seen.play).size, 1,
    'listeners accumulated across restarts: ' + seen.play);
  assert.equal(seen.menu[0], onTitle,
    `rebinding the menu changed its listener count (${onTitle} -> ${seen.menu[0]})`);

  // And functionally: one click must pop exactly one balloon, not one per stacked handler.
  await page.waitForTimeout(2600);
  await page.waitForFunction(() => Game.entities.length > 1, null, { timeout: 5000 });
  const popped = await page.evaluate(() => {
    Game.stopLoop();
    const b = Game.entities[0];
    const before = Game.entities.length;
    Game.canvas.dispatchEvent(new MouseEvent('click', { clientX: b.xcoord, clientY: b.ycoord, bubbles: true }));
    return { before, after: Game.entities.length };
  });
  assert.equal(popped.after, popped.before - 1, 'one click removed more than one balloon');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a second game after game over still responds to input', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press('v');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(5600); // difficulty input is rebound after 5s
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({ diff: Game.difficulty.level, screen: Game.screen }));
  assert.equal(state.diff, 'E', 'could not start a new game after game over');
  assert.equal(state.screen, 'playing');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a first visit asks for a name on the page, not in a browser modal', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  let prompts = 0;
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { prompts++; d.dismiss(); });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  assert.equal(prompts, 0, 'a browser modal still interrupts the first visit');
  const opened = await page.evaluate(() => ({
    screen: Game.screen,
    shown: !NameField.element.hidden,
    focused: document.activeElement === NameField.element,
    value: NameField.element.value
  }));
  assert.equal(opened.screen, 'name', 'a first visit should open the name screen');
  assert.ok(opened.shown, 'the name field was not shown');
  assert.ok(opened.focused, 'the name field was not focused, so nothing typed would land');
  assert.equal(opened.value, 'anonymous', 'the field should start on the default');

  await page.keyboard.type('Persisted');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  const saved = await page.evaluate(() => ({
    screen: Game.screen, name: Game.name, hidden: NameField.element.hidden
  }));
  assert.equal(saved.screen, 'title', 'saving a name should land on the title screen');
  assert.equal(saved.name, 'Persisted');
  assert.ok(saved.hidden, 'the field is still on the page after leaving the name screen');

  await page.keyboard.press('h');
  await page.waitForTimeout(2400);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  assert.equal(prompts, 0, 'a returning visitor must not be prompted at all');
  const stored = await page.evaluate(() => ({
    name: Game.name, diff: Game.difficulty.level, screen: Game.screen
  }));
  assert.equal(stored.screen, 'title', 'a returning visitor should go straight to the title');
  assert.equal(stored.name, 'Persisted');
  assert.equal(stored.diff, 'H', 'difficulty should be remembered');
  assert.deepEqual(errors, [], errors.join(' | '));
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

  // Nothing can be remembered, so the name is asked for on every visit and
  // kept for the session. It used to be a prompt() on every load.
  assert.equal(await page.evaluate(() => Game.screen), 'name');
  await page.keyboard.type('NoStorage');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => Game.name), 'NoStorage');

  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => Game.difficulty.level), 'E');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('game still works when the score API is unreachable', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('name', 'Offline'); } catch (e) {} });
  await page.route('**/api/scores/**', r => r.abort());
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(2600);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: 5000 });
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
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: 5000 });
  const popped = await page.evaluate(() => {
    Game.stopLoop();
    const b = Game.entities[0];
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
  const state = await page.evaluate(() => ({ diff: Game.difficulty.level, lost: Game.difficulty.maxLost }));
  assert.equal(state.diff, 'H', 'hit regions went stale after resize');
  assert.equal(state.lost, 3);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('rotating mid-game keeps play running and balloons in bounds', async () => {
  const { context, page, errors } = await newGame({ width: 900, height: 500 });
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 2, null, { timeout: 5000 });
  await page.setViewportSize({ width: 500, height: 900 }); // portrait
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    screen: Game.screen,
    logicalW: Game.width,
    running: Game.running,
    maxXmax: Math.max(...Game.entities.map(b => b.xmax)),
    count: Game.entities.length
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
  await page.addInitScript(() => {
    try { localStorage.setItem('name', 'Ratio'); } catch (e) {}
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
    items: Difficulty.ORDER,
    buttons: Game.layout.menu.buttons.map(b => b.level),
    labels: Game.layout.menu.buttons.map(b => b.label),
    targets: Game.layout.targets.map(t => t.id)
  }));
  assert.deepEqual(m.buttons, m.items, 'a menu item did not become a button');
  assert.deepEqual(m.labels, ['Easy', 'Standard', 'Hard', 'VHard']);
  assert.deepEqual(m.targets, [...m.items, 'replay', 'player'],
    'targets should be the buttons, the high-score line and the name line');
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
  await page.evaluate(() => { Game.difficulty.level = 'H'; });
  const hit = await page.evaluate(() => Game.layout.scores.hit);
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.waitForTimeout(2600);
  assert.equal(await page.evaluate(() => Game.screen), 'playing',
    'the high-score line did not start a game');
  assert.equal(await page.evaluate(() => Game.difficulty.level), 'H');
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
      level: t.id,
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

    const state = await page.evaluate(() => ({ screen: Game.screen, diff: Game.difficulty.level }));
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
            overlaps.push(L.targets[i].id + '/' + L.targets[j].id);
          }
        }
      }
      // By id, not by level: two of the targets have no level of their own, so
      // comparing levels would let one resolve to the other unnoticed.
      const resolved = L.targets.map(t => {
        const point = { x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 };
        const got = Layout.pick(L.targets, point);
        return { want: t.id, got: got ? got.id : 'nothing' };
      });
      return { overlaps, resolved };
    });

    assert.deepEqual(m.overlaps, [], `targets overlap at ${w}x${h}: ${m.overlaps}`);
    m.resolved.forEach(r => {
      assert.equal(r.got, r.want,
        `a tap on the centre of ${r.want} resolved to ${r.got} at ${w}x${h}`);
    });
    await context.close();
  }
});


// ---------- button states and dead air ----------

/** Average colour inside a button, so "is it painted differently" is measurable. */
const buttonPaint = (page, index) => page.evaluate((i) => {
  const b = Game.layout.menu.buttons[i];
  const d = Game.ctx.getImageData(
    Math.round((b.x + 4) * Game.dpr), Math.round((b.y + 4) * Game.dpr),
    Math.round((b.width - 8) * Game.dpr), Math.round((b.height - 8) * Game.dpr)
  ).data;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let p = 0; p < d.length; p += 4) { r += d[p]; g += d[p + 1]; bl += d[p + 2]; n++; }
  return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
}, index);

await t('the menu is not live during the countdown, and says so', async () => {
  const { context, page, errors } = await newGame();
  const idle = await buttonPaint(page, 0);

  await page.keyboard.press('e');
  await page.waitForTimeout(500);

  const during = await page.evaluate(() => ({
    screen: Game.screen, live: Game.isMenuLive()
  }));
  assert.equal(during.screen, 'starting');
  assert.equal(during.live, false, 'menu reported live while the game was starting');

  const disabled = await buttonPaint(page, 0);
  assert.notDeepEqual(disabled, idle,
    'buttons look identical whether or not they can be pressed');

  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the countdown counts down and then starts the game', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press('s');
  await page.waitForTimeout(250);
  const first = await page.evaluate(() => Math.ceil((Game.state.endsAt - Date.now()) / 1000));
  await page.waitForTimeout(1000);
  const second = await page.evaluate(() => Math.ceil((Game.state.endsAt - Date.now()) / 1000));
  assert.ok(second < first, `countdown did not advance: ${first} then ${second}`);

  // Something is drawn over the sky while counting down; it used to be blank.
  const painted = await drawnPixels(page);
  assert.ok(painted > 500, 'the countdown screen drew nothing over the sky');
  await context.close();
});

await t('the menu is dead briefly after a game, then live', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press('v'); // one lost balloon ends it
  await page.waitForTimeout(2400);
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });

  assert.equal(await page.evaluate(() => Game.isMenuLive()), false,
    'menu was live immediately after game over');

  // A tap during the lockout must not restart.
  const box = await page.evaluate(() => Game.layout.menu.buttons[0]);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => Game.screen), 'gameover',
    'a press during the lockout started a game');

  await page.waitForFunction(() => Game.isMenuLive(), null, { timeout: 4000 });
  const lockout = await page.evaluate(() => Game.MENU_LOCKOUT_MS);
  assert.ok(lockout <= 2000, `lockout is ${lockout}ms, too long to look intentional`);

  // And now it works.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => Game.difficulty.level), 'E',
    'the menu did not respond once live');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('scores are requested without waiting out the lockout', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page } = await newGame({ name: 'Diego' });
  await page.keyboard.press('v');
  await page.waitForTimeout(2400);
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  assert.ok(apiHits.some(h => h.method === 'GET'),
    'the board was not fetched shortly after game over');
  await context.close();
});

await t('pressing a button changes how it looks, selected or not', async () => {
  // Index 1 is Standard, the default selection, so this covers both the
  // selected button and an unselected one.
  for (const [index, level] of [[0, 'E'], [1, 'S']]) {
    const { context, page, errors } = await newGame();
    const selected = await page.evaluate(() => Game.difficulty.level);
    const before = await buttonPaint(page, index);
    const box = await page.evaluate(i => Game.layout.menu.buttons[i], index);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    const pressed = await buttonPaint(page, index);
    assert.equal(await page.evaluate(() => Game.pressed), level);
    assert.notDeepEqual(pressed, before,
      `pressing ${level} did not change its paint ` +
      `(${level === selected ? 'this is the selected button' : 'unselected'})`);

    // Release over empty sky: releasing on the button would fire a click and
    // correctly start a game, which is a different thing to test.
    const empty = await page.evaluate(() => ({ x: Game.width / 2, y: Game.height - 20 }));
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.up();
    await page.waitForTimeout(150);

    assert.equal(await page.evaluate(() => Game.screen), 'title',
      'releasing over empty sky should not start a game');
    const released = await buttonPaint(page, index);
    assert.deepEqual(released, before, `${level} stayed pressed after release`);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
  }
});



// ---------- balloon size floor ----------

await t('balloons stay poppable at any score', async () => {
  // Without a floor the size factor ran past zero and went negative. check_hit
  // compares against the radius, so no point on the screen could pop one, and
  // every long game ended on an unwinnable board. On VHard that arrived after
  // roughly 300 balloons: about two and a half minutes of play.
  const { context, page, errors } = await newGame();
  await page.keyboard.press('v');
  await page.waitForTimeout(2400);

  const probed = await page.evaluate(() => {
    const check = (caught) => {
      Game.balloons_caught = caught;
      const balloon = Game.randomBalloon();
      let poppable = false;
      for (let x = 0; x < Game.width && !poppable; x += 5) {
        for (let y = 0; y < Game.height; y += 5) {
          if (balloon.hits({ x, y })) { poppable = true; break; }
        }
      }
      return { caught, size: balloon.size, poppable };
    };
    // ratioDecrease on VHard is 300; probe either side of it and well beyond.
    return [0, 150, 299, 300, 400, 1000, 5000].map(check);
  });

  probed.forEach(r => {
    assert.ok(r.size > 0, `balloon size ${r.size.toFixed(1)} at ${r.caught} popped`);
    assert.ok(r.poppable, `no point on screen pops a balloon at ${r.caught} popped ` +
      `(size ${r.size.toFixed(1)})`);
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('balloons still shrink as the score climbs, down to the floor', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press('v');
  await page.waitForTimeout(2400);

  const m = await page.evaluate(() => {
    // Average out the random size component so the trend is the only signal.
    const mean = (caught) => {
      Game.balloons_caught = caught;
      let total = 0;
      for (let i = 0; i < 400; i++) total += Game.randomBalloon().size;
      return total / 400;
    };
    return {
      floor: MIN_RATIO_SIZE,
      at0: mean(0), at150: mean(150), at300: mean(300), at3000: mean(3000)
    };
  });

  assert.ok(m.at150 < m.at0, 'balloons should shrink as the score climbs');
  assert.ok(m.at300 < m.at150, 'shrink should continue toward the floor');
  assert.ok(Math.abs(m.at3000 - m.at300) / m.at300 < 0.05,
    `size should settle at the floor, not keep falling (${m.at300.toFixed(1)} -> ${m.at3000.toFixed(1)})`);
  // Two floors apply: MIN_RATIO_SIZE bounds the shrink, and an absolute
  // minimum keeps the balloon tappable. Whichever is larger wins, so the
  // settled size is at least the ratio floor and never below the touch
  // minimum — which 'a balloon is never smaller than the touch minimum'
  // checks directly, across every screen.
  assert.ok(m.at3000 / m.at0 >= m.floor * 0.9,
    `settled size fell below the ratio floor: ${(m.at3000 / m.at0).toFixed(2)} of full`);
  assert.ok(m.at3000 < m.at0,
    'balloons should still end up smaller than they started');
  await context.close();
});



// ---------- the same game on every screen ----------

const SCREENS = [[390, 844], [412, 915], [768, 1024], [1280, 720], [1920, 1080], [1920, 400]];

await t('a balloon is never smaller than the touch minimum', async () => {
  // MIN_RATIO_SIZE stopped the radius reaching zero, but 40% of an already
  // tiny balloon is still untappable: on a 390px phone that was a 7px target.
  // The menu buttons have respected 44px since milestone 2; the balloons,
  // which are the actual game, did not.
  for (const [w, h] of SCREENS) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => {
      const smallest = (caught) => {
        Game.balloons_caught = caught;
        let min = Infinity;
        for (let i = 0; i < 2000; i++) {
          const width = Game.randomBalloon().size * 2;  // check_hit spans +/- radius
          if (width < min) min = width;
        }
        return min;
      };
      return {
        min: Layout.GRID.minTouchTarget,
        fresh: smallest(0),
        late: smallest(100000)
      };
    });
    assert.ok(m.fresh >= m.min - 0.5,
      `fresh balloon is only ${m.fresh.toFixed(0)}px wide at ${w}x${h}, under ${m.min}`);
    assert.ok(m.late >= m.min - 0.5,
      `late-game balloon is only ${m.late.toFixed(0)}px wide at ${w}x${h}, under ${m.min}`);
    await context.close();
  }
});

await t('a desktop game keeps the balloon sizes it always had', async () => {
  // The floor should lift only what was too small. At 1280 wide a fresh
  // balloon already cleared it, so nothing there should move.
  const { context, page } = await newGame({ width: 1280, height: 720 });
  const m = await page.evaluate(() => {
    Game.balloons_caught = 0;
    let min = Infinity, max = 0;
    for (let i = 0; i < 4000; i++) {
      const r = Game.randomBalloon().size;
      if (r < min) min = r;
      if (r > max) max = r;
    }
    return { min, max, ratio: Game.ratio };
  });
  // Historic formula: (24 + rand*50) * ratio, so 30.7 to 94.7 at this width.
  assert.ok(Math.abs(m.min - 24 * m.ratio) < 1,
    `smallest desktop balloon moved: ${m.min.toFixed(1)} vs ${(24 * m.ratio).toFixed(1)}`);
  assert.ok(Math.abs(m.max - 74 * m.ratio) < 2,
    `largest desktop balloon moved: ${m.max.toFixed(1)} vs ${(74 * m.ratio).toFixed(1)}`);
  await context.close();
});

await t('a balloon takes the same time to cross any shaped screen', async () => {
  // Speed was absolute pixels per tick while the distance was the screen
  // height, so a short window gave far less time to react than a tall one.
  const crossings = [];
  for (const [w, h] of SCREENS) {
    const { context, page } = await newGame({ width: w, height: h });
    const seconds = await page.evaluate(() => {
      Game.balloons_caught = 0;
      let total = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) {
        const b = Game.randomBalloon();
        total += Game.height / (Math.abs(b.delta) * (1000 / Game.STEP_MS));
      }
      return total / n;
    });
    crossings.push({ size: `${w}x${h}`, seconds });
    await context.close();
  }

  const values = crossings.map(c => c.seconds);
  const spread = Math.max(...values) / Math.min(...values);
  assert.ok(spread < 1.1,
    'time to cross still depends on screen shape: ' +
    crossings.map(c => `${c.size} ${c.seconds.toFixed(1)}s`).join(', '));
});



// ---------- difficulty as a value ----------

await t('one table describes a level, and everything reads it', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    Game.difficulty = Difficulty.get('H');
    Game.palette = Sky.paletteFor('H');
    Game.paint();
    return {
      table: Difficulty.get('H'),
      buttonLabels: Game.layout.menu.buttons.map(b => b.label),
      tableLabels: Difficulty.all().map(d => d.label),
      hudName: Game.difficulty.name
    };
  });
  // The button label and the HUD word used to live in two different files.
  assert.deepEqual(m.buttonLabels, m.tableLabels,
    'buttons and the table disagree about the labels');
  assert.equal(m.hudName, 'HARD');
  assert.equal(m.table.maxLost, 3);
  assert.equal(m.table.ratioDecrease, 700);
  assert.equal(m.table.speedIncrease, 120);
  await context.close();
});

await t('two difficulties can be held at once', async () => {
  // Previously impossible: the difficulty *was* four global variables, so
  // asking about a level meant first destroying whichever one was in play.
  // A hover preview, or a test covering two levels, both needed this.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const easy = Difficulty.get('E');
    const vhard = Difficulty.get('V');
    const inPlay = Game.difficulty.level;
    return {
      easyLives: easy.maxLost,
      vhardLives: vhard.maxLost,
      stillInPlay: Game.difficulty.level === inPlay,
      distinct: easy !== vhard
    };
  });
  assert.equal(m.easyLives, 15);
  assert.equal(m.vhardLives, 1);
  assert.ok(m.distinct, 'levels should be separate objects');
  assert.ok(m.stillInPlay, 'reading two levels disturbed the one in play');
  await context.close();
});

await t('every level in the table is playable and reachable', async () => {
  for (const level of ['E', 'S', 'H', 'V']) {
    const { context, page, errors } = await newGame();
    const box = await page.evaluate(
      l => Game.layout.menu.buttons.find(b => b.level === l), level
    );
    assert.ok(box, `no button for level ${level}`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(2600);
    const state = await page.evaluate(() => ({
      level: Game.difficulty.level,
      lives: Game.difficulty.maxLost,
      screen: Game.screen
    }));
    assert.equal(state.level, level);
    assert.equal(state.screen, 'playing');
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
  }
});

await t('a stored level that no longer exists falls back to the default', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('name', 'Fallback');
      localStorage.setItem('diff_level', 'X');  // a level that was removed
    } catch (e) {}
  });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    level: Game.difficulty.level,
    fallback: Difficulty.DEFAULT
  }));
  assert.equal(m.level, m.fallback, 'an unknown stored level should fall back');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


// ---------- screens ----------

await t('each screen keeps its own state, and gets a clean one', async () => {
  const { context, page, errors } = await newGame();

  // The title screen is not counting anything down and nothing is locked out.
  const title = await page.evaluate(() => ({ screen: Game.screen, keys: Object.keys(Game.state) }));
  assert.equal(title.screen, 'title');
  assert.deepEqual(title.keys, [], 'the title screen arrived holding state: ' + title.keys);

  await page.keyboard.press('v');
  await page.waitForTimeout(300);
  const starting = await page.evaluate(() => ({ screen: Game.screen, keys: Object.keys(Game.state) }));
  assert.equal(starting.screen, 'starting');
  assert.deepEqual(starting.keys, ['endsAt'], 'the countdown deadline is the only state it needs');

  // The deadline used to be Game.countdownEnd, a field that outlived the
  // countdown by the whole rest of the session.
  await page.waitForTimeout(2200);
  const playing = await page.evaluate(() => ({ screen: Game.screen, keys: Object.keys(Game.state) }));
  assert.equal(playing.screen, 'playing');
  assert.deepEqual(playing.keys, [], 'play is still carrying the countdown deadline');

  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  const over = await page.evaluate(() => ({
    keys: Object.keys(Game.state),
    locked: Game.state.liveAt > Date.now()
  }));
  assert.deepEqual(over.keys, ['liveAt']);
  assert.ok(over.locked, 'the menu lockout deadline was not set on arrival');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the fields a screen replaced are gone from the game', async () => {
  const { context, page } = await newGame();
  const leftovers = await page.evaluate(() =>
    ['isrestart', 'showscores', 'menuLiveAt', 'countdownEnd', 'time_to_show']
      .filter(k => k in Game));
  assert.deepEqual(leftovers, [],
    'state that belongs to a screen is still living on Game: ' + leftovers);
  await context.close();
});

await t('keys and the menu do nothing while a game is being played', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press('h');
  await page.waitForTimeout(2400);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');

  // Only the popping handler is bound during play: the difficulty keys and the
  // menu buttons are not listening, so neither can restart the game under you.
  const box = await page.evaluate(() => Game.layout.menu.buttons[0]);
  await page.keyboard.press('e');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => ({ screen: Game.screen, level: Game.difficulty.level }));
  assert.equal(m.screen, 'playing', 'input meant for the menu interrupted the game');
  assert.equal(m.level, 'H', 'a difficulty key changed the level mid-game');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the leaderboard is fetched once, however often it is asked for', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page } = await newGame();
  await page.waitForTimeout(300);
  const onLoad = apiHits.filter(h => h.method === 'GET').length;

  // The game-over screen asks for the board on every frame it draws. Asking
  // used to mean fetching: until the first response landed, the game issued
  // thirty requests a second.
  await page.evaluate(async () => {
    Scores.board = null;
    for (let i = 0; i < 10; i++) { Scores.load(Game); }
    await new Promise(r => setTimeout(r, 300));
  });

  const gets = apiHits.filter(h => h.method === 'GET').length - onLoad;
  assert.equal(gets, 1, `ten requests for the board made ${gets} fetches`);
  await context.close();
});

await t('a new score invalidates the board that was already on its way', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Diego' });

  const board = await page.evaluate(async () => {
    Scores.board = null;
    Scores.load(Game);            // in flight, and about to be out of date
    Game.balloons_caught = 42;
    Scores.submit(Game, 42);         // supersedes it
    Scores.load(Game);
    await new Promise(r => setTimeout(r, 600));
    return Scores.board;
  });

  assert.ok(Array.isArray(board), 'no board was drawn after submitting a score');
  assert.ok(board.some(entry => entry.score === 42),
    'the board kept a version fetched before the score was submitted: ' + JSON.stringify(board));
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


// ---------- naming yourself ----------

/** The centre of the name line along the bottom. */
const playerLine = page => page.evaluate(() => {
  const r = Game.layout.player;
  return { x: r.x + Math.min(r.width, 80) / 2, y: r.y + r.height / 2 };
});

await t('the name line opens the name screen and the new name sticks', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Before' });
  const point = await playerLine(page);

  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
  const opened = await page.evaluate(() => ({
    screen: Game.screen,
    shown: !NameField.element.hidden,
    focused: document.activeElement === NameField.element,
    value: NameField.element.value
  }));
  assert.equal(opened.screen, 'name', 'tapping the name line did not open the name screen');
  assert.ok(opened.shown && opened.focused, 'the field was not ready to type into');
  assert.equal(opened.value, 'Before', 'the field should start from the current name');

  await page.keyboard.press('Control+a');
  await page.keyboard.type('After');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  const saved = await page.evaluate(() => ({
    screen: Game.screen, name: Game.name, stored: localStorage.getItem('name')
  }));
  assert.equal(saved.screen, 'title', 'saving should land back on the title screen');
  assert.equal(saved.name, 'After');
  assert.equal(saved.stored, 'After', 'the new name was not remembered');

  // And the score goes to the board under the name that is on screen.
  await page.keyboard.press('v');
  await page.waitForTimeout(2400);
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const posted = apiHits.find(h => h.method === 'POST');
  assert.ok(posted, 'no score was posted');
  assert.equal(boards.get('v')[0].name, 'After', 'the score was posted under the old name');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the Save button saves without also starting a game', async () => {
  const { context, page, errors } = await newGame({ name: 'Clicker' });
  const point = await playerLine(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);

  await page.keyboard.press('Control+a');
  await page.keyboard.type('Clicked');
  const save = await page.evaluate(() => Game.layout.name.save);
  await page.mouse.click(save.x + save.width / 2, save.y + save.height / 2);
  await page.waitForTimeout(250);

  const m = await page.evaluate(() => ({ screen: Game.screen, name: Game.name }));
  assert.equal(m.name, 'Clicked');
  assert.equal(m.screen, 'title', 'the click that saved also started a game');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('escaping leaves the name as it was', async () => {
  const { context, page, errors } = await newGame({ name: 'Kept' });
  const point = await playerLine(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);

  await page.keyboard.press('Control+a');
  await page.keyboard.type('Discarded');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => ({
    screen: Game.screen, name: Game.name, stored: localStorage.getItem('name')
  }));
  assert.equal(m.screen, 'title', 'escape should leave the name screen');
  assert.equal(m.name, 'Kept', 'escape kept the typed name');
  assert.equal(m.stored, 'Kept');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the game cleans a name the same way the score function does', async () => {
  const { context, page } = await newGame({ name: 'Cleaner' });
  const m = await page.evaluate(() => ({
    blank: cleanName('   '),
    missing: cleanName(null),
    trimmed: cleanName('  Diego  '),
    control: cleanName('Die\u0000go\u007F'),
    long: cleanName('x'.repeat(40)).length,
    max: MAX_NAME_LENGTH,
    field: NameField.element.maxLength
  }));
  assert.equal(m.blank, 'anonymous', 'an empty field should not post a blank row');
  assert.equal(m.missing, 'anonymous');
  assert.equal(m.trimmed, 'Diego');
  assert.equal(m.control, 'Diego', 'control characters should be stripped');
  assert.equal(m.long, m.max, `a long name should be cut to ${m.max}`);
  assert.equal(m.field, m.max, 'the field lets you type more than will be kept');
  await context.close();
});

await t('the field is only on the page while the name screen is up', async () => {
  const { context, page, errors } = await newGame({ name: 'Hidden' });
  assert.equal(await page.evaluate(() => NameField.element.hidden), true,
    'the field is on the title screen, where it is not asked for');

  await page.keyboard.press('e');
  await page.waitForTimeout(2400);
  const playing = await page.evaluate(() => ({
    screen: Game.screen,
    hidden: NameField.element.hidden,
    focused: document.activeElement === NameField.element
  }));
  assert.equal(playing.screen, 'playing');
  assert.ok(playing.hidden, 'the field is live during play, where it would swallow keys');
  assert.ok(!playing.focused);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the field sits exactly where the layout puts it, before and after a resize', async () => {
  const { context, page, errors } = await newGame({ name: 'Mover' });
  const point = await playerLine(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);

  const measure = () => page.evaluate(() => {
    const box = NameField.element.getBoundingClientRect();
    const field = Game.layout.name.field;
    return {
      dx: Math.abs(box.x - field.x), dy: Math.abs(box.y - field.y),
      dw: Math.abs(box.width - field.width), dh: Math.abs(box.height - field.height),
      touch: box.height >= Layout.GRID.minTouchTarget
    };
  });

  for (const stage of ['at 1280x720', 'after resizing']) {
    const m = await measure();
    assert.ok(m.dx < 1 && m.dy < 1, `the field is not where the layout says ${stage}`);
    assert.ok(m.dw < 1 && m.dh < 1, `the field is not the size the layout says ${stage}`);
    assert.ok(m.touch, `the field is under the touch minimum ${stage}`);
    if (stage === 'at 1280x720') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => Game.screen), 'name',
        'a resize knocked the game off the name screen');
    }
  }
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the name line clears the composition at every viewport', async () => {
  // It is anchored to the bottom edge instead of flowing after the scores, so
  // the font size has to reserve room for it. Without that reservation the
  // last score row landed below the name line on a letterboxed window.
  for (const [w, h] of VIEWPORTS) {
    const { context, page } = await newGame({ width: w, height: h, name: 'Diego' });
    const m = await page.evaluate(() => {
      const L = Game.layout;
      return {
        deepest: L.scores.rows[L.scores.rows.length - 1],
        top: L.player.y,
        bottom: L.player.y + L.player.height
      };
    });
    assert.ok(m.top > m.deepest, `the name line overlaps the last score row at ${w}x${h}`);
    assert.ok(m.bottom <= h, `the name line runs off the bottom at ${w}x${h}`);
    await context.close();
  }
});


// ---------- what the page actually ships ----------

await t('every icon the page links to is served and decodes', async () => {
  const { context, page, errors } = await newGame();
  const icons = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel$="icon"]')].map(l => ({
      rel: l.rel, href: l.getAttribute('href'), type: l.type
    })));

  assert.ok(icons.some(i => i.type === 'image/svg+xml'), 'no SVG icon is linked');
  assert.ok(icons.some(i => i.href.endsWith('.ico')), 'no .ico fallback is linked');
  assert.ok(icons.some(i => i.rel === 'apple-touch-icon'), 'no home-screen icon is linked');

  // A hand-built .ico that no decoder accepts would look fine in the listing
  // and be a blank tab in the browser.
  const decoded = await page.evaluate(async (hrefs) => {
    const sizes = {};
    for (const href of hrefs) {
      const img = new Image();
      await new Promise(resolve => {
        img.onload = img.onerror = resolve;
        img.src = href;
      });
      sizes[href] = img.naturalWidth;
    }
    return sizes;
  }, icons.map(i => i.href));

  Object.keys(decoded).forEach(href => {
    assert.ok(decoded[href] > 0, `${href} did not decode`);
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the icons are not the largest thing the site serves', async () => {
  // They were: a 184KB .ico holding nine sizes, eight of them uncompressed
  // bitmaps, against 51KB for the game, its scripts, the stylesheet and the
  // page put together.
  const sizeOf = name => fs.statSync(path.join(ROOT, name)).size;
  const code = fs.readdirSync(path.join(ROOT, 'js')).reduce(
    (total, f) => total + sizeOf(path.join('js', f)),
    sizeOf('index.html') + sizeOf(path.join('css', 'styles.css')));

  const tab = sizeOf('favicon.svg') + sizeOf('favicon.ico');
  assert.ok(tab < code / 4,
    `the tab icons are ${tab} bytes against ${code} bytes of game`);
  assert.ok(sizeOf('favicon.ico') < 10 * 1024,
    `the .ico fallback is ${sizeOf('favicon.ico')} bytes`);
});


// ---------- one file, one job ----------

await t('every script the page asks for is served', async () => {
  const { context, page, errors } = await newGame();
  const scripts = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')));

  assert.ok(scripts.length > 1, 'the page loads no scripts at all');
  for (const src of scripts) {
    const res = await fetch('http://localhost:8899/' + src);
    assert.equal(res.status, 200, `${src} is linked but not served`);
  }
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the game keeps the game, and nothing else', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    // Drawing, input, the leaderboard and the one DOM element moved out.
    leftovers: [
      'clear', 'drawIntro', 'drawMenu', 'drawScores', 'drawCountdown',
      'drawPlayer', 'drawNameScreen', 'drawBalloons', 'drawHud',
      'bindMenu', 'bindPopping', 'getCanvasPoint',
      'loadScores', 'submitScore', 'scores', 'pendingScore',
      'nameField', 'showNameField', 'hideNameField', 'positionNameField'
    ].filter(k => k in Game),
    namespaces: ['Paint', 'Input', 'Scores', 'NameField', 'Screens', 'Layout', 'Sky', 'Difficulty']
      .filter(n => typeof window[n] !== 'object'),
    // What the game is left holding.
    kept: ['enter', 'paint', 'advance', 'restart', 'applyCanvasSize', 'randomBalloon',
           'reap', 'step', 'add', 'countOf', 'spawnBalloon', 'init']
      .filter(k => typeof Game[k] !== 'function')
  }));

  assert.deepEqual(m.leftovers, [],
    'these moved out of game.js but are still on Game: ' + m.leftovers);
  assert.deepEqual(m.namespaces, [], 'missing namespace: ' + m.namespaces);
  assert.deepEqual(m.kept, [], 'the game lost something that is its own: ' + m.kept);
  await context.close();
});


// ---------- the engine ----------

/** Drives the loop by hand: no rAF, no clock, just steps. */
const driveBy = (page, frames, ms) => page.evaluate(({ frames, ms }) => {
  Game.stopLoop();
  Game.lastFrame = 0;
  Game.accumulator = 0;
  Game.ticks = 0;

  let now = 0;
  for (let i = 0; i < frames; i++) {
    now += ms;
    Game.advance(now);
  }
  return Game.ticks;
}, { frames, ms });

await t('the game runs on animation frames, not on a timer of its own', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    try { localStorage.setItem('name', 'Framed'); } catch (e) {}
    window.__rafs = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (fn) { window.__rafs++; return raf(fn); };
  });
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  await page.keyboard.press('e');
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => ({
    rafs: window.__rafs, running: Game.running, interval: 'tick_interval' in Game
  }));

  assert.ok(m.running, 'the loop is not running during play');
  assert.ok(!m.interval, 'the game still keeps an interval handle');
  assert.ok(m.rafs > 20, `only ${m.rafs} animation frames in a second of play`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the simulation steps at its own rate, whatever the display does', async () => {
  const { context, page } = await newGame({ name: 'Stepper' });
  await page.keyboard.press('e');
  await page.waitForTimeout(2400);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');

  // A second of simulation, delivered as 30Hz, 60Hz and 144Hz frames. Balloon
  // speed is expressed per step, so if the step rate followed the display the
  // game would be nearly five times faster on the last of these.
  const at30 = await driveBy(page, 30, 1000 / 30);
  const at60 = await driveBy(page, 60, 1000 / 60);
  const at144 = await driveBy(page, 144, 1000 / 144);

  // A second's worth of frames lands a hair under a second in floating point,
  // so the thirtieth step can fall into the next frame; what matters is that
  // all three agree, not that they hit a round number.
  [[30, at30], [60, at60], [144, at144]].forEach(([hz, steps]) => {
    assert.ok(steps === 30 || steps === 29,
      `${hz}Hz gave ${steps} steps in a second of frames`);
  });
  assert.ok(Math.max(at30, at60, at144) - Math.min(at30, at60, at144) <= 1,
    `the step rate follows the display: ${at30}, ${at60}, ${at144}`);
  await context.close();
});

await t('a stall is not replayed at full speed', async () => {
  const { context, page } = await newGame({ name: 'Staller' });
  await page.keyboard.press('e');
  await page.waitForTimeout(2400);

  // A minute in a background tab, arriving as one frame. Replaying it would
  // spawn a minute of balloons into a single step and lose every one of them.
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.lastFrame = 0;
    Game.accumulator = 0;
    Game.ticks = 0;
    Game.entities.length = 0;
    Game.lostBalloons = 0;

    Game.advance(60000);
    return { ticks: Game.ticks, lost: Game.lostBalloons, cap: Game.MAX_CATCHUP_MS, step: Game.STEP_MS };
  });

  assert.ok(m.ticks <= Math.ceil(m.cap / m.step),
    `a 60 second stall ran ${m.ticks} steps, not the ${Math.ceil(m.cap / m.step)} it is capped at`);
  assert.equal(m.lost, 0, 'balloons escaped during a stall the player never saw');
  await context.close();
});

await t('the time on the board is time played, not time elapsed', async () => {
  const { context, page } = await newGame({ name: 'Clocked' });
  await page.keyboard.press('e');
  await page.waitForTimeout(2400);

  const m = await page.evaluate(async () => {
    Game.stopLoop();
    Game.lastFrame = 0;
    Game.accumulator = 0;
    Game.ticks = 0;

    // Two seconds of simulation, then a real-time wait with the loop stopped.
    let now = 0;
    for (let i = 0; i < 60; i++) { now += 1000 / 30; Game.advance(now); }
    const played = Game.elapsed();
    await new Promise(r => setTimeout(r, 600));
    return { played, after: Game.elapsed(), ticks: Game.ticks, step: Game.STEP_MS };
  });

  assert.ok(m.ticks === 60 || m.ticks === 59, `two seconds of frames ran ${m.ticks} steps`);
  assert.equal(m.played, (m.ticks * m.step / 1000).toFixed(2),
    'the clock is not simply the steps played');
  assert.ok(Math.abs(Number(m.played) - 2) < 0.05, `two seconds read as ${m.played}`);
  assert.equal(m.after, m.played, 'the clock ran on while the game was not');
  await context.close();
});

await t('a balloon is painted by one painter, not a new one every frame', async () => {
  const { context, page, errors } = await newGame({ name: 'Counter' });
  await page.evaluate(() => {
    window.__built = { painters: 0, colours: 0 };
    const Balloon = CANVASBALLOON.Balloon;
    CANVASBALLOON.Balloon = function (id, x, y, r, c) {
      window.__built.painters++;
      return new Balloon(id, x, y, r, c);
    };
    CANVASBALLOON.Balloon.prototype = Balloon.prototype;

    const Original = window.Color;
    window.Color = function (rgb) {
      window.__built.colours++;
      return new Original(rgb);
    };
    window.Color.prototype = Original.prototype;
  });

  // Standard rather than Easy: Easy releases balloons slowly enough that three
  // seconds of it is too few to tell one painter each from one per frame.
  await page.keyboard.press('s');
  await page.waitForTimeout(2400 + 3000);

  const m = await page.evaluate(() => ({
    painters: window.__built.painters,
    colours: window.__built.colours,
    balloons: Game.entities.length + Game.balloons_caught + Game.lostBalloons
  }));

  assert.ok(m.balloons > 3, `only ${m.balloons} balloons in three seconds, too few to judge`);
  // Three seconds at thirty frames is ninety chances to rebuild each one.
  assert.equal(m.painters, m.balloons,
    `${m.balloons} balloons needed ${m.painters} painters`);
  assert.equal(m.colours, m.balloons * 3,
    `each balloon should work out its three colours once, got ${m.colours} for ${m.balloons}`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('every script the game ships is strict', async () => {
  // Sloppy mode silently swallows an assignment to an undeclared name, which
  // is how a typo becomes a global instead of an error.
  const loose = fs.readdirSync(path.join(ROOT, 'js')).filter(file => {
    const body = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    const firstStatement = body.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    return !firstStatement.startsWith('"use strict";');
  });
  assert.deepEqual(loose, [], 'not strict: ' + loose);
});


// ---------- what the game says, and to whom ----------

await t('the game says what screen it is on, and what happened', async () => {
  const { context, page, errors } = await newGame({ name: 'Listener' });

  // The live region is what a screen reader has instead of the canvas, which
  // to anything but a pair of eyes is one empty element.
  const region = await page.evaluate(() => {
    const el = document.getElementById('game_status');
    return el && {
      live: el.getAttribute('aria-live'),
      role: el.getAttribute('role'),
      atomic: el.getAttribute('aria-atomic'),
      text: el.textContent.trim()
    };
  });
  assert.ok(region, 'there is no live region on the page');
  assert.equal(region.live, 'polite', 'the region interrupts instead of waiting');
  assert.equal(region.role, 'status');
  assert.equal(region.atomic, 'true', 'a partial update would be read out of context');
  assert.match(region.text, /Standard/, 'the title screen does not say what is selected');
  assert.match(region.text, /Listener/, 'the title screen does not say who is playing');

  await page.evaluate(() => {
    window.__said = [];
    const say = Announce.say;
    Announce.say = function (text) { window.__said.push(text); return say(text); };
  });

  await page.keyboard.press('v'); // VHard: one escaped balloon ends it
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(200);

  const said = await page.evaluate(() => window.__said);
  const heard = said.join(' | ');
  assert.match(heard, /Get ready/, 'the countdown is silent: ' + heard);
  assert.match(heard, /VHard/, 'the difficulty is never said: ' + heard);
  assert.match(heard, /1 of 1 lost/, 'losing a balloon is silent: ' + heard);
  assert.match(heard, /Game over\. \d+ popped in [\d.]+ seconds/,
    'the result is never said: ' + heard);

  // The last thing said is the thing that just happened.
  const last = await page.evaluate(() => document.getElementById('game_status').textContent);
  assert.match(last, /Game over/);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the canvas can be reached and described without seeing it', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const canvas = document.getElementById('balloon_canvas');
    const help = document.getElementById(canvas.getAttribute('aria-describedby'));
    return {
      tabindex: canvas.getAttribute('tabindex'),
      role: canvas.getAttribute('role'),
      label: canvas.getAttribute('aria-label'),
      help: help && help.textContent.replace(/\s+/g, ' ').trim(),
      hiddenToSight: help && getComputedStyle(help).clipPath !== 'none'
    };
  });

  assert.equal(m.tabindex, '0', 'a keyboard cannot reach the game at all');
  assert.equal(m.role, 'application', 'the difficulty keys would be swallowed by the reader');
  assert.ok(m.label && m.label.length > 3, 'the canvas has no name');
  assert.match(m.help, /E, S, H or V/, 'the description does not say which keys work');
  assert.match(m.help, /pointer/, 'the description does not admit that popping needs a pointer');
  assert.ok(m.hiddenToSight, 'the description is drawn on the page as well as read');
  await context.close();
});

await t('leaving the name screen hands focus back to the game', async () => {
  const { context, page, errors } = await newGame({ name: 'Tabber' });
  const point = await playerLine(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.activeElement === NameField.element),
    'the field did not take focus');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Hiding a focused element drops focus on the body, and the next Tab starts
  // again from the top of the page.
  const where = await page.evaluate(() => document.activeElement.id);
  assert.equal(where, 'balloon_canvas', `focus went to ${where || 'nothing'}`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('every colour the game draws text in is readable on its ground', async () => {
  // Measured, not asserted by eye: the leaderboard used to land at 1.4:1
  // against a near-white horizon, which is not text at all. WCAG AA asks 4.5.
  const { context, page } = await newGame();
  const rows = await page.evaluate(() => {
    const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const ratio = (a, b) => {
      const pair = [lum(a), lum(b)].sort((m, n) => n - m);
      return (pair[0] + 0.05) / (pair[1] + 0.05);
    };
    const parse = css => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map(Number);
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
      const h = css.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    };
    const over = (fg, bg) => [0, 1, 2].map(i => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])));

    const out = [];
    Difficulty.ORDER.forEach(level => {
      const p = Sky.paletteFor(level);
      Game.difficulty = Difficulty.get(level);
      Game.palette = p;
      Game.measureLayout();
      const L = Game.layout;

      // The ground as it is actually drawn, with no text on top of it.
      const ground = (x, y, panelled) => {
        Paint.sky(Game);
        if (panelled) { Paint.panel(Game); }
        const d = Game.ctx.getImageData(
          Math.round(x * Game.dpr), Math.round(y * Game.dpr), 1, 1).data;
        return [d[0], d[1], d[2]];
      };

      const check = (what, colour, x, y, panelled) => {
        const bg = ground(x, y, panelled);
        out.push({ level, what, ratio: ratio(over(parse(colour), bg), bg) });
      };

      // On the static screens everything sits on the panel.
      check('intro', p.ink, L.intro.x + 40, L.intro.y, true);
      check('hint', p.inkSoft, L.hint.x + 40, L.hint.y, true);
      check('score name', p.ink, L.scores.columns.name, L.scores.rows[2], true);
      check('score date', p.inkSoft, L.scores.columns.date + 20, L.scores.rows[2], true);
      check('score value', p.accent, L.scores.columns.value, L.scores.rows[2], true);

      // The HUD is drawn during play, where it has a band of its own.
      const hudGround = (x, y) => {
        Paint.sky(Game);
        const strip = Game.ctx.createLinearGradient(0, 0, 0, L.hud.band.height);
        strip.addColorStop(0, p.panel);
        strip.addColorStop(L.hud.band.solid, p.panel);
        strip.addColorStop(1, Sky.transparent(p.panel));
        Game.ctx.fillStyle = strip;
        Game.ctx.fillRect(0, 0, Game.width, L.hud.band.height);
        const d = Game.ctx.getImageData(
          Math.round(x * Game.dpr), Math.round(y * Game.dpr), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      [['hud', p.ink, L.hud.caught + 20], ['hud level', p.inkSoft, L.hud.level],
       ['hud time', p.accent, L.hud.time]].forEach(([what, colour, x]) => {
        const bg = hudGround(x, L.hud.y);
        out.push({ level, what, ratio: ratio(over(parse(colour), bg), bg) });
      });

      // A button label sits on the button's own fill, over the panel.
      const buttonGround = ground(L.menu.buttons[0].x + 30, L.menu.buttons[0].y + 20, true);
      const fill = over(parse(p.buttonFill), buttonGround);
      out.push({ level, what: 'button label', ratio: ratio(over(parse(p.ink), fill), fill) });
      out.push({
        level, what: 'selected button',
        ratio: ratio(parse(p.onAccent).slice(0, 3), parse(p.accent).slice(0, 3))
      });

      // And the name chip carries the panel colour itself.
      const chipGround = ground(L.player.x + 40, L.player.y + L.player.height / 2, false);
      const chip = over(parse(p.panel), chipGround);
      out.push({ level, what: 'name chip', ratio: ratio(over(parse(p.ink), chip), chip) });
    });
    return out;
  });

  const failures = rows.filter(r => r.ratio < 4.5)
    .map(r => `${r.level} ${r.what} ${r.ratio.toFixed(2)}:1`);
  assert.deepEqual(failures, [], 'text below WCAG AA 4.5:1 — ' + failures.join(', '));
  assert.ok(rows.length >= 40, `only ${rows.length} colours checked`);
  await context.close();
});


await t('the name field is readable too, in the colours it is really given', async () => {
  // Everything else on the screen is drawn, so measuring the canvas covers it.
  // The field is an element whose colours are set from the same palette in
  // JavaScript, which is exactly the kind of second copy that drifts.
  const { context, page, errors } = await newGame({ name: 'Readable' });
  const point = await playerLine(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(200);

  const worst = await page.evaluate(() => {
    const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const ratio = (a, b) => {
      const pair = [lum(a), lum(b)].sort((m, n) => n - m);
      return (pair[0] + 0.05) / (pair[1] + 0.05);
    };
    const parse = css => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      const p = m[1].split(',').map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (fg, bg) => [0, 1, 2].map(i => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])));

    let lowest = { level: null, ratio: Infinity };
    Difficulty.ORDER.forEach(level => {
      Game.difficulty = Difficulty.get(level);
      Game.palette = Sky.paletteFor(level);
      Game.measureLayout();
      Game.paint();

      const field = Game.layout.name.field;
      const style = getComputedStyle(NameField.element);

      // What the canvas is showing underneath the field, where it sits.
      const under = (() => {
        Paint.sky(Game);
        Paint.panel(Game);
        const d = Game.ctx.getImageData(
          Math.round((field.x + 4) * Game.dpr),
          Math.round((field.y + field.height / 2) * Game.dpr), 1, 1).data;
        return [d[0], d[1], d[2]];
      })();

      const background = over(parse(style.backgroundColor), under);
      const text = ratio(over(parse(style.color), background), background);
      const border = ratio(over(parse(style.borderColor), background), background);

      if (text < lowest.ratio) { lowest = { level, ratio: text, what: 'text' }; }
      // A border only has to be visible, which WCAG puts at 3:1.
      if (border < 3) { lowest = { level, ratio: border, what: 'border' }; }
    });
    return lowest;
  });

  assert.ok(worst.ratio >= 4.5,
    `the name field's ${worst.what} is ${worst.ratio.toFixed(2)}:1 on ${worst.level}`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

// ---------- the difficulty curve ----------

await t('a level is harder than the one before it from the first balloon', async () => {
  // The defect this guards: speed and spawn rate were globals, so every level
  // opened identically and only diverged as the score climbed. A bot with
  // fixed reflexes scored 185 on Easy and 187 on Standard.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const levels = Difficulty.all();

    // The rise of a fresh balloon, averaged, with the score at zero so the
    // ramps cannot be what is doing the work.
    const opening = level => {
      Game.difficulty = level;
      Game.balloons_caught = 0;
      let rise = 0;
      const n = 2000;
      for (let i = 0; i < n; i++) { rise += Math.abs(Game.randomBalloon().delta); }
      return rise / n;
    };

    return levels.map(level => ({
      label: level.label,
      lives: level.maxLost,
      speed: level.speed,
      frequency: level.frequency,
      rise: opening(level)
    }));
  });

  const ordered = (what, pick, direction) => {
    for (let i = 1; i < m.length; i++) {
      const before = pick(m[i - 1]), after = pick(m[i]);
      const moved = direction > 0 ? after > before : after < before;
      assert.ok(moved,
        `${what}: ${m[i].label} is not past ${m[i - 1].label} (${before} then ${after})`);
    }
  };

  ordered('balloons rise faster', l => l.speed, 1);
  ordered('fewer mistakes allowed', l => l.lives, -1);

  // Speed is the dial that carries difficulty; the spawn rate is not, and
  // cannot be. Past about Standard's rate the sky fills faster than anyone can
  // clear it however well they play, and the level stops being a test of skill
  // and becomes a countdown: at 0.14 and 0.18 the bot died at 19 and 11
  // seconds regardless of how fast the balloons themselves were rising.
  const anchor = m.find(level => level.label === 'Standard');
  m.forEach((level, i) => {
    assert.ok(level.frequency <= anchor.frequency + 1e-9,
      `${level.label} releases balloons faster than anyone can pop them ` +
      `(${level.frequency} against ${anchor.frequency})`);
    if (i > 0) {
      assert.ok(level.frequency >= m[i - 1].frequency - 1e-9,
        `${level.label} is calmer than ${m[i - 1].label}`);
    }
  });

  // And the table's numbers reach the balloons rather than sitting unread.
  ordered('a fresh balloon actually rises faster', l => +l.rise.toFixed(3), 1);

  // The ends have to be far enough apart to feel like different games.
  const spread = m[m.length - 1].rise / m[0].rise;
  assert.ok(spread > 1.8,
    `the hardest level opens only ${spread.toFixed(2)}x faster than the easiest`);
  await context.close();
});

await t('every level still describes itself completely', async () => {
  const { context, page } = await newGame();
  const missing = await page.evaluate(() => {
    const needed = ['level', 'label', 'name', 'maxLost', 'speed', 'frequency',
                    'ratioDecrease', 'speedIncrease'];
    const gaps = [];
    Difficulty.all().forEach(level => {
      needed.forEach(key => {
        if (level[key] === undefined) { gaps.push(level.level + '.' + key); }
      });
    });
    return gaps;
  });
  assert.deepEqual(missing, [],
    'a level is described partly somewhere else: ' + missing);
  await context.close();
});


// ---------- the sky holds several kinds of thing ----------

/** A stand-in entity: answers the contract, does nothing. */
const STUB = `(kind, layer, why) => ({
  kind, layer, xcoord: 0, ycoord: 0,
  step() {}, draw() {}, hits() { return false; },
  tapped() { return true; }, gone() { return why || null; }
})`;

await t('a tap goes where it was aimed, not to whatever comes first in the list', async () => {
  // While everything in the sky was a balloon, "first one hit, walking the list
  // backwards" was a fine answer. The moment a bird can overlap a balloon it
  // decides which one you meant by the order they happened to spawn in.
  const { context, page, errors } = await newGame();
  await page.keyboard.press('e');
  await page.waitForTimeout(2500);

  const runs = await page.evaluate(() => {
    Game.stopLoop();
    const out = [];

    ['near last', 'near first'].forEach(order => {
      Game.entities.length = 0;
      const far = Game.randomBalloon();
      const near = Game.randomBalloon();
      far.xcoord = 300; far.ycoord = 300;
      near.xcoord = 330; near.ycoord = 300;

      // Overlapping: both contain the point, 2px from one centre and 28 from
      // the other. Aim, not order, has to decide.
      const pair = order === 'near last' ? [far, near] : [near, far];
      pair.forEach(e => Game.entities.push(e));

      Game.canvas.dispatchEvent(new MouseEvent('click', {
        clientX: 328, clientY: 300, bubbles: true
      }));
      out.push({
        order,
        left: Game.entities.length,
        tookNear: !Game.entities.includes(near),
        bothWereHit: far.hits({ x: 328, y: 300 }) && near.hits({ x: 328, y: 300 })
      });
    });
    return out;
  });

  runs.forEach(r => {
    assert.ok(r.bothWereHit, `${r.order}: the two did not overlap, so this proves nothing`);
    assert.equal(r.left, 1, `${r.order}: one tap removed ${2 - r.left} things`);
    assert.ok(r.tookNear, `${r.order}: the tap landed on the far one`);
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the sky keeps its draw order however things arrive', async () => {
  const { context, page } = await newGame();
  const order = await page.evaluate((stub) => {
    const make = eval(stub);
    Game.entities.length = 0;
    // Deliberately backwards: a boss spawning before a balloon must still end
    // up drawn over it.
    Game.add(make('boss', Entities.LAYERS.boss));
    Game.add(make('balloon', Entities.LAYERS.balloon));
    Game.add(make('shot', Entities.LAYERS.shot));
    Game.add(make('bird', Entities.LAYERS.bird));
    Game.add(make('balloon', Entities.LAYERS.balloon));
    return Game.entities.map(e => e.kind);
  }, STUB);

  assert.deepEqual(order, ['balloon', 'balloon', 'bird', 'boss', 'shot'],
    'things are not kept in the order they should be drawn');
  await context.close();
});

await t('leaving is free, escaping is not', async () => {
  // A bird crossing the screen and going is not a balloon getting away, and
  // the difference is the entity's to declare.
  const { context, page } = await newGame();
  const m = await page.evaluate((stub) => {
    const make = eval(stub);
    Game.stopLoop();
    Game.entities.length = 0;
    Game.add(make('bird', Entities.LAYERS.bird, 'left'));
    Game.add(make('balloon', Entities.LAYERS.balloon, 'escaped'));
    Game.add(make('balloon', Entities.LAYERS.balloon, null));

    const escaped = Game.reap();
    return { escaped, left: Game.entities.length };
  }, STUB);

  assert.equal(m.escaped, 1, 'the thing that merely left was counted against the player');
  assert.equal(m.left, 1, 'reaping did not clear out what was finished with');
  await context.close();
});

await t('everything in the sky answers the same questions', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press('s');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 2, null, { timeout: 5000 });

  const m = await page.evaluate(() => {
    const contract = ['step', 'draw', 'hits', 'tapped', 'gone'];
    const broken = [];
    Game.entities.forEach((e, i) => {
      if (typeof e.kind !== 'string') { broken.push(i + '.kind'); }
      if (typeof e.layer !== 'number') { broken.push(i + '.layer'); }
      contract.forEach(m => {
        if (typeof e[m] !== 'function') { broken.push(i + '.' + m); }
      });
    });
    return { broken, kinds: [...new Set(Game.entities.map(e => e.kind))] };
  });

  assert.deepEqual(m.broken, [], 'an entity does not answer the contract: ' + m.broken);
  assert.deepEqual(m.kinds, ['balloon'], 'phase 1 adds no new kinds');
  await context.close();
});


await browser.close();
server.close();

console.log('\n' + pass + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
