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

  if (url.pathname === '/api/scores') {
    apiHits.push({ method: req.method });
    const board = boards.get('all') || [];
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const sent = JSON.parse(body);
        apiHits[apiHits.length - 1].body = sent;
        const { name, score, level, won, pointer } = sent;
        const row = { name, score, score_day: '2026-09-15' };
        if (level !== undefined) { row.level = level; }
        if (won === true && level === 20) { row.won = true; }
        if (pointer) { row.pointer = pointer; }
        const next = [...board, row]
          .sort((a, b) => b.score - a.score).slice(0, 10);
        boards.set('all', next);
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

/**
 * How long to allow for the sky to fill.
 *
 * Level 1 releases about 1.2 balloons a second on purpose, and spawning is a
 * coin flip per step rather than a metronome — so waiting five seconds for
 * three balloons came up short about one run in twenty, and for two about one
 * in eighty. None of the tests that wait are about the spawn rate.
 */
const SKY_FILLS = 15000;

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
  Sky.paint(bctx, Game.width, Game.height, Sky.paletteFor(Game.level));
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
  // Which term wins, not what it comes out at. The pixel values used to be
  // written down here as well, and the moment heightDivisor was tuned this
  // test failed for asserting the old rule — which is exactly what the comment
  // below says it was built not to do.
  // Each case is one where its bound wins CLEARLY. 1000x700 used to be in
  // here and it sat on the knife edge — width gave 30.0 and height 29.3 — so
  // the moment heightDivisor moved by one the winner flipped and this failed.
  // A case that close is not testing which bound applies, it is testing
  // arithmetic to three significant figures.
  const cases = [
    { width: 1000, height: 1400, bound: 'width' },
    { width: 500, height: 1400, bound: 'width' },
    { width: 1920, height: 1080, bound: 'height' },
    { width: 1920, height: 700, bound: 'height' },
    { width: 1920, height: 400, bound: 'height' },
    { width: 320, height: 700, bound: 'minimum' }
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
    const byWidth = g.baseFontSize * c.width / 1000;
    const byHeight = (c.height - g.footerReserve) / g.heightDivisor;
    const won = g.minFontSize >= Math.min(byWidth, byHeight)
      ? 'minimum'
      : (byWidth < byHeight ? 'width' : 'height');

    assert.equal(won, c.bound,
      `at ${c.width}x${c.height} the ${won} bound decides, not the ${c.bound} one`);

    // And it wins by enough that tuning a constant cannot flip it without
    // somebody meaning to. This is the guard that was missing.
    const spread = Math.abs(byWidth - byHeight) / Math.min(byWidth, byHeight);
    assert.ok(c.bound === 'minimum' || spread > 0.2,
      `at ${c.width}x${c.height} the two bounds are within ` +
      `${(spread * 100).toFixed(0)}% of each other, so which one wins is luck`);
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
        }))
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

await t('the title screen is playing the game behind its own text', async () => {
  const { context, page, errors } = await newGame();

  // Waited for, not sampled: the demo is popping and a few are getting away,
  // so the count at any one instant is a moving number.
  await page.waitForFunction(
    () => Game.entities.filter(e => e.kind === 'balloon').length >= 3,
    null,
    { timeout: SKY_FILLS }
  ).catch(() => { throw new Error('the title screen sky never had three balloons in it'); });

  const first = await page.evaluate(() => ({
    screen: Game.screen,
    level: Game.level,
    positions: Game.entities.map(e => e.ycoord)
  }));
  assert.equal(first.screen, 'title', 'the footage started a game by itself');
  // A balloon's position is `ycoord`. Reading `e.y` gave undefined, and the
  // comparison that used it passed by accident for a while: two arrays of NaN
  // are deeply equal, so "it moved" only failed once the count held still.
  assert.ok(first.positions.every(Number.isFinite),
    'balloons have no readable position: ' + first.positions.join(', '));

  // Nobody has touched anything, and it is still moving.
  await page.waitForTimeout(700);
  const later = await page.evaluate(() => Game.entities.map(e => e.ycoord));
  assert.notDeepEqual(later, first.positions, 'the footage is a still image');

  // And it is being played, not just left to drift: balloons are popping.
  // Waited for rather than sampled, because the demo taps at the level's own
  // pace and a reinforced balloon costs it two taps before anything scores.
  await page.waitForFunction(() => Game.score > 0, null, { timeout: SKY_FILLS })
    .catch(() => { throw new Error('nothing is being popped, so the footage shows a game nobody is playing'); });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('only the Play button starts the game', async () => {
  const { context, page, errors } = await newGame();

  // Empty sky does nothing now: the button is the way in.
  const empty = await page.evaluate(() => ({ x: Game.width * 0.62, y: Game.height * 0.42 }));
  await page.mouse.click(empty.x, empty.y);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => Game.screen), 'title',
    'a tap on empty sky started a game');

  const play = await page.evaluate(() => {
    const r = Play.rect(Game);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(play.x, play.y);
  await page.waitForTimeout(2600);
  const state = await page.evaluate(() => ({
    screen: Game.screen, level: Game.level, lives: Game.allowance, running: Game.running
  }));
  assert.equal(state.screen, 'playing');
  assert.equal(state.level, 1, 'a game starts at the bottom of the ladder');
  assert.equal(state.lives, 5, 'everyone gets the same five lives');
  assert.ok(state.running, 'game loop should be running');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('space starts a game', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');
  await context.close();
});

await t('balloons spawn and rise during play', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: SKY_FILLS });
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: SKY_FILLS });

  const popped = await page.evaluate(async () => {
    // Freeze the loop so the balloon can't drift between reading and clicking.
    Game.stopLoop();
    const b = Game.entities[0];
    const caughtBefore = Game.score;
    const countBefore = Game.entities.length;
    Game.canvas.dispatchEvent(new MouseEvent('click', {
      clientX: b.xcoord, clientY: b.ycoord, bubbles: true
    }));
    return {
      caughtBefore, caughtAfter: Game.score,
      countBefore, countAfter: Game.entities.length
    };
  });
  assert.equal(popped.caughtAfter, popped.caughtBefore + 1, 'score did not increase');
  assert.equal(popped.countAfter, popped.countBefore - 1, 'balloon was not removed');
  await context.close();
});

await t('game over submits the score; the board fetches on its own screen', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Diego' });
  // The title screen fetches the board on arrival; clear that before the run.
  await page.waitForTimeout(500);
  apiHits.length = 0;
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { Game.score = 17; });
  // Spend the allowance rather than waiting to lose it: the bottom of the
  // ladder releases about one balloon a second on purpose, so dying here
  // naturally takes most of a minute.
  await page.evaluate(() => { Game.livesLost = Game.allowance; });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });

  await page.waitForTimeout(600);
  const posted = apiHits.find(h => h.method === 'POST');
  assert.ok(posted, 'no score was POSTed, saw: ' + JSON.stringify(apiHits));
  assert.equal(boards.get('all')[0].name, 'Diego');
  assert.equal(boards.get('all')[0].score, 17);

  // Game over shows the run breakdown; it has no reason to fetch the board.
  await page.waitForTimeout(1500);
  assert.ok(!apiHits.some(h => h.method === 'GET'),
    'game over fetched the board; the breakdown does not need it');

  // The board screen is where the board is fetched.
  await page.evaluate(() => { Game.enter('board'); });
  await page.waitForTimeout(600);
  assert.ok(apiHits.some(h => h.method === 'GET'), 'the board screen never fetched');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the breakdown records each kind of point and each cause of loss', async () => {
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    const make = (skin, x, y) =>
      balloonConstructor(x, y, 60, { r: 200, g: 60, b: 60 }, Game.width, 5, 1, skin);
    Game.stopLoop();
    Game.entities = [];
    Game.score = 0;
    Game.livesLost = 0;
    Game.breakdown = Game.blankBreakdown();

    [1, 2, 3].forEach(function (skin) {
      const b = make(skin, 400, 300);
      while (b.skin > 0) { b.tapped(Game); }
    });

    const one = bossConstructor(400, 200, 30, 800, 1, 0);
    for (let i = 0; i < Ladder.saucer(1).taps; i++) { one.tapped(Game); }
    const two = bossConstructor(400, 200, 30, 800, 2, 0);
    for (let i = 0; i < Ladder.saucer(2).taps; i++) { two.tapped(Game); }

    // A saucer that runs out its fuse costs a life, recorded as a saucer loss.
    const fired = bossConstructor(200, 200, 30, 800, 1, 0);
    for (let i = 0; i < Ladder.saucer(1).fuse; i++) { fired.step(Game, false); }

    birdConstructor(0, 300, 20, 4, true).tapped(Game);
    fireflyConstructor(400, 300, 15, 0.5, Game.width, Game.height).tapped(Game);

    return {
      p: Game.breakdown.points, l: Game.breakdown.losses,
      score: Game.score, livesLost: Game.livesLost,
      totals: Game.breakdownTotals(),
      saucer1Worth: Ladder.saucer(1).points,
      saucer2Worth: Ladder.saucer(2).points
    };
  });

  assert.equal(m.p.ordinary, 1, 'an ordinary balloon is not worth one point');
  assert.equal(m.p.reinforced, 3, 'a reinforced balloon is not worth three');
  assert.equal(m.p.armoured, 6, 'an armoured balloon is not worth six');
  assert.equal(m.p.saucer1, m.saucer1Worth, 'the first saucer is in the wrong bucket');
  assert.equal(m.p.saucer2, m.saucer2Worth, 'the mark II is in the wrong bucket');
  assert.equal(m.l.saucers, 1, 'a saucer that fired was not recorded');
  assert.equal(m.l.birds, 1, 'touching a bird was not recorded');
  assert.equal(m.l.fireflies, 1, 'touching a firefly was not recorded');
  assert.equal(m.totals.points, m.score, 'the points do not add up to the score');
  assert.equal(m.totals.losses, m.livesLost, 'the losses do not add up to the lives lost');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('an escaped balloon is recorded by cause', async () => {
  const { context, page, errors } = await newGame();
  // Driven through the real playing update rather than waited for: a balloon's
  // crossing time is random, so a fixed wait is a coin toss.
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.entities = [];
    Game.livesLost = 0;
    Game.breakdown = Game.blankBreakdown();
    const b = Game.randomBalloon();
    b.ycoord = -9999;               // already over the top
    Game.add(b);
    Screens.playing.update(Game);
    return {
      escapes: Game.breakdown.losses.escapes,
      livesLost: Game.livesLost,
      totals: Game.breakdownTotals()
    };
  });
  assert.equal(m.escapes, 1, 'the escape was not recorded by cause: ' + JSON.stringify(m));
  assert.equal(m.livesLost, 1, 'the escape did not cost a life');
  assert.equal(m.totals.losses, m.livesLost, 'losses do not add up after an escape');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the board screen opens from its chip, toggles, and comes back', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Diego' });
  const chip = await page.evaluate(() => {
    const r = Game.layout.board;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(chip.x, chip.y);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => Game.screen), 'board');
  assert.equal(await page.evaluate(() => Game.state.mine), false, 'not showing everyone first');

  const toggle = await page.evaluate(() => {
    const r = Game.layout.boardScreen.toggle;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(toggle.x, toggle.y);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => Game.state.mine), true, 'the toggle did nothing');

  const back = await page.evaluate(() => {
    const r = Game.layout.boardScreen.back;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(back.x, back.y);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => Game.screen), 'title', 'the back chip did not leave');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('game over remembers the run locally, with its breakdown', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Diego' });
  await page.keyboard.press(' ');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const missing = Game.allowance - Game.livesLost;
    Game.livesLost = Game.allowance;
    Game.breakdown.losses.escapes += missing;
  });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });

  const m = await page.evaluate(() => {
    const totals = Game.breakdownTotals();
    return {
      history: Scores.history(),
      totals,
      score: Game.score,
      said: document.getElementById('game_status').textContent
    };
  });
  assert.ok(m.history.length >= 1, 'the run was not remembered locally');
  const run = m.history[0];
  assert.equal(run.name, 'Diego');
  assert.equal(run.score, m.score);
  assert.ok(run.breakdown && run.breakdown.points, 'the run carried no breakdown');
  assert.equal(m.totals.points, m.score, 'the remembered points do not add up');
  assert.match(m.said, /Lives lost/, 'the breakdown is not spoken: ' + m.said);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a practice run is not remembered locally', async () => {
  const { context, page } = await newGame({ name: 'Diego' });
  await page.evaluate(() => { Game.startLevel = Ladder.starts()[1]; });
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const missing = Game.allowance - Game.livesLost;
    Game.livesLost = Game.allowance;
    Game.breakdown.losses.escapes += missing;
  });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  const m = await page.evaluate(() => ({
    practice: Game.isPractice(),
    history: Scores.history()
  }));
  assert.ok(m.practice, 'the run was not a practice run');
  assert.equal(m.history.length, 0, 'a practice run was remembered');
  await context.close();
});

await t('the OK button does not overlap the run breakdown', async () => {
  for (const [w, h] of [[390, 844], [820, 1180], [1280, 720], [1920, 400]]) {
    const { context, page } = await newGame({ width: w, height: h });
    await page.keyboard.press(' ');
    await page.waitForTimeout(2400);
    await page.evaluate(() => { Game.livesLost = Game.allowance; });
    await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
    const m = await page.evaluate(() => {
      const L = Game.layout;
      return {
        okayY: L.okay.y,
        okayBottom: L.okay.y + L.okay.height,
        playerY: L.player.y,
        // The lowest baseline the breakdown can draw, at its smallest step.
        lowest: L.intro.y + L.line * 2.8 + L.line * 0.8 * 5
      };
    });
    assert.ok(m.okayY >= m.lowest,
      `the OK button at ${m.okayY.toFixed(0)} overlaps the breakdown ` +
      `(lowest ${m.lowest.toFixed(0)}) at ${w}x${h}`);
    assert.ok(m.okayBottom <= m.playerY,
      `the OK button runs into the name chip at ${w}x${h}`);
    await context.close();
  }
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
  await page.waitForFunction(() => Game.entities.length > 1, null, { timeout: SKY_FILLS });
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  // Spend the allowance rather than waiting to lose it: the bottom of the
  // ladder releases about one balloon a second on purpose, so dying here
  // naturally takes most of a minute.
  await page.evaluate(() => { Game.livesLost = Game.allowance; });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  // Game over goes HOME, not straight into another run. A tap used to land
  // anywhere here and start the next game, so a run could end and the next
  // begin before the score had been read.
  await page.waitForFunction(() => Game.isMenuLive(), null, { timeout: 6000 });
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => Game.screen), 'title',
    'game over did not go back to the title screen');

  // And from there a second game still starts, at the bottom of the ladder.
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({ level: Game.level, screen: Game.screen }));
  assert.equal(state.screen, 'playing', 'could not start a new game from the title');
  assert.equal(state.level, 1, 'the second game did not start at the bottom again');
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

  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  assert.equal(prompts, 0, 'a returning visitor must not be prompted at all');
  const stored = await page.evaluate(() => ({
    name: Game.name, screen: Game.screen
  }));
  assert.equal(stored.screen, 'title', 'a returning visitor should go straight to the title');
  assert.equal(stored.name, 'Persisted');
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

  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('game still works when the score API is unreachable', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('name', 'Offline'); } catch (e) {} });
  await page.route('**/api/scores', r => r.abort());
  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.keyboard.press(' ');
  await page.waitForTimeout(2600);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: SKY_FILLS });
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: SKY_FILLS });
  const popped = await page.evaluate(() => {
    Game.stopLoop();
    const b = Game.entities[0];
    const before = Game.score;
    Game.canvas.dispatchEvent(new MouseEvent('click', { clientX: b.xcoord, clientY: b.ycoord, bubbles: true }));
    return { before, after: Game.score };
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

await t('the Play button still starts a game after a resize', async () => {
  const { context, page, errors } = await newGame({ width: 900, height: 700 });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.waitForTimeout(300);
  const point = await page.evaluate(() => {
    const r = Play.rect(Game);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(2600);
  const state = await page.evaluate(() => ({ screen: Game.screen, lives: Game.allowance }));
  assert.equal(state.screen, 'playing', 'hit regions went stale after resize');
  assert.equal(state.lives, 5);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the Play button never covers a footer chip, at any size', async () => {
  // The button roams the bottom half, so every position it can take, at every
  // viewport, must clear the name and About chips and stay on the canvas.
  const { context, page, errors } = await newGame();
  const sizes = [[320, 480], [240, 240], [390, 844], [900, 500], [1280, 720]];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const overlap = (a, b) =>
        a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
      let worst = null;
      for (let i = 0; i <= 20 && !worst; i++) {
        for (let j = 0; j <= 20 && !worst; j++) {
          Play.at = { x: i / 20, y: j / 20 };
          const r = Play.rect(Game);
          for (const id of ['player', 'about', 'board', 'start']) {
            const chip = Game.layout[id];
            if (chip && overlap(r, chip)) { worst = { id, r, chip }; }
          }
          if (r.x < 0 || r.y < 0 ||
              r.x + r.width > Game.width || r.y + r.height > Game.height) {
            worst = { id: 'off-canvas', r };
          }
        }
      }
      return worst;
    });
    assert.equal(m, null,
      `${w}x${h}: the Play button overlapped ${m && m.id}: ` + JSON.stringify(m));
  }
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the name chip and title announcement show the name alone', async () => {
  const { context, page, errors } = await newGame({ name: 'Diego' });
  const m = await page.evaluate(() => {
    const seen = [];
    const orig = Paint.chip;
    Paint.chip = function (game, rect, label) {
      seen.push(label);
      return orig.apply(this, arguments);
    };
    Paint.player(Game);
    Paint.chip = orig;
    return { labels: seen, said: document.getElementById('game_status').textContent };
  });
  assert.ok(m.labels.includes('Diego'),
    'the bare name was not drawn: ' + JSON.stringify(m.labels));
  assert.ok(!m.labels.some(l => /Playing as/.test(l)),
    'the chip still says "Playing as": ' + JSON.stringify(m.labels));
  assert.doesNotMatch(m.said, /Playing as/,
    'the announcement still says "Playing as": ' + m.said);
  assert.match(m.said, /Diego/, 'the announcement does not name the player');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('rotating mid-game keeps play running and balloons in bounds', async () => {
  const { context, page, errors } = await newGame({ width: 900, height: 500 });
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 2, null, { timeout: SKY_FILLS });
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

await t('there are no buttons left, and the name line is the only exception', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    buttons: Game.layout.menu.buttons.length,
    targets: Game.layout.targets.map(t => t.id),
    sentences: Layout.DESCRIPTION,
    drawn: Game.layout.description.map(d => d.text),
    legend: Game.layout.legend.items.map(i => i.kind),
    rules: Icons.RULES.map(r => r.kind)
  }));
  assert.equal(m.buttons, 0, 'a button came back');
  assert.deepEqual(m.targets, ['about', 'board', 'player'],
    'the named targets should be the Scores and About chips and the name');

  // The rules sentence is NOT drawn: the legend of icons stands where it did.
  // It stays in Layout.DESCRIPTION regardless, because that is what is read
  // aloud, and a row of pictures says nothing at all to a screen reader.
  assert.ok(!m.drawn.join(' ').includes('repel'),
    'the rules sentence is drawn as well as being shown as icons');
  assert.ok(m.drawn.join(' ').includes('Twenty levels'),
    'the sentences that are not the legend stopped being drawn');
  assert.ok(m.drawn.length >= m.sentences.length - 1,
    'the description has no baseline for every line it wants to draw');
  assert.deepEqual(m.legend, m.rules,
    'the legend does not show what the rules say it should');
  await context.close();
});

await t('the whole composition stays on screen at every viewport', async () => {
  for (const [w, h] of VIEWPORTS) {
    const { context, page } = await newGame({ width: w, height: h });
    const m = await page.evaluate(() => {
      const L = Game.layout;
      return {
        fontSize: Game.fontSize,
        deepest: L.boardScreen.rows[L.boardScreen.rows.length - 1],
        menuRight: Math.max(...L.menu.buttons.map(b => b.x + b.width)),
        introRight: Game.ctx.measureText(Layout.INTRO_TEXT).width + L.intro.x,
        scoreValueX: L.boardScreen.columns.value,
        hudTime: L.hud.time
      };
    });
    assert.ok(m.deepest < h, `bottom board row ${m.deepest.toFixed(0)} below ${h}px screen at ${w}x${h}`);
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
      row0: Math.round(Game.layout.boardScreen.rows[0]),
      menuTop: Math.round(Game.layout.menu.top)
    }));
    await context.close();
    return m;
  };
  const tall = await read(1200);
  const taller = await read(1600);
  assert.equal(tall.font, taller.font, 'font should not depend on height here');
  assert.equal(tall.row0, taller.row0,
    `rows moved with screen height: ${tall.row0} vs ${taller.row0}`);
  assert.equal(tall.menuTop, taller.menuTop);
});

await t('row spacing is proportional to the line height', async () => {
  const { context, page } = await newGame({ width: 1280, height: 720 });
  const m = await page.evaluate(() => {
    const L = Game.layout;
    return {
      line: L.line,
      gaps: L.boardScreen.rows.slice(1).map((y, i) => y - L.boardScreen.rows[i]),
      step: L.boardScreen.step / L.line
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

await t('the old high-score line no longer starts a game', async () => {
  // The title screen draws no board any more, and no longer starts on a tap
  // anywhere. The place the score heading used to be is now empty sky.
  const { context, page, errors } = await newGame();
  // Empty sky on the title: above the Play band and clear of the footer chips.
  const hit = await page.evaluate(() => ({
    x: Game.width * 0.5, y: Game.height * 0.22, width: 1, height: 1
  }));
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => Game.screen), 'title',
    'clicking empty sky started a game');
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
      introY: Game.layout.intro.y
    }));
    assert.ok(m.top >= 0, `menu box starts above the canvas (${m.top.toFixed(1)}) at ${w}x${h}`);
    assert.ok(m.bottom <= h, `menu box runs past the bottom at ${w}x${h}`);
    assert.ok(m.top > m.introY - 2, `menu box overlaps the intro line at ${w}x${h}`);
    await context.close();
  }
});

await t('an imprecise tap still lands on the button', async () => {
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
          results.push({ aimed: box.id, got: got ? got.id : null });
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

await t('tapping Play starts a game on an emulated phone', async () => {
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

    // On the Play button, which is now the only way in on a touch screen too.
    const point = await page.evaluate(() => {
      const r = Play.rect(Game);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(2800);

    const state = await page.evaluate(() => ({ screen: Game.screen, level: Game.level }));
    assert.equal(state.level, 1, `${name}: off-centre tap started somewhere odd`);
    assert.equal(state.screen, 'playing', `${name}: tap did not start the game`);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
  }
});

await t('no two tap targets overlap, and each resolves to itself', async () => {
  // Milestone 2 had to grow the menu boxes past what was drawn, which
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
/**
 * Stops the attract footage and empties the sky.
 *
 * The title screen plays the game to itself now, so anything that samples
 * pixels there is sampling moving balloons unless it says otherwise.
 */
const freezeTitle = (page) => page.evaluate(() => {
  Game.stopLoop();
  Game.entities = [];
  Game.applyLevel(1);
  Game.paint();
});

/** The average colour of one rect, after a repaint. */
const patchPaint = (page, rect) => page.evaluate((r) => {
  Game.paint();
  const d = Game.ctx.getImageData(
    Math.round(r.x * Game.dpr), Math.round(r.y * Game.dpr),
    Math.max(1, Math.round(r.width * Game.dpr)),
    Math.max(1, Math.round(r.height * Game.dpr))
  ).data;
  let red = 0, green = 0, blue = 0, n = 0;
  for (let p = 0; p < d.length; p += 4) { red += d[p]; green += d[p + 1]; blue += d[p + 2]; n++; }
  return [Math.round(red / n), Math.round(green / n), Math.round(blue / n)];
}, rect);

await t('the menu is not live during the countdown, and a tap does nothing', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(500);

  const during = await page.evaluate(() => ({
    screen: Game.screen, live: Game.isMenuLive(), endsAt: Game.state.endsAt
  }));
  assert.equal(during.screen, 'starting');
  assert.equal(during.live, false, 'menu reported live while the game was starting');

  // The countdown used to be restartable by tapping through it. This is the
  // check that matters more than how the screen looks: the tap has to land on
  // nothing, because only the Play button starts a game.
  await page.mouse.click(600, 400);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ screen: Game.screen, endsAt: Game.state.endsAt }));
  assert.equal(after.screen, 'starting', 'a tap during the countdown left the countdown');
  assert.equal(after.endsAt, during.endsAt, 'a tap during the countdown restarted it');

  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the countdown counts down and then starts the game', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);
  // Spend the allowance rather than waiting to lose it: the bottom of the
  // ladder releases about one balloon a second on purpose, so dying here
  // naturally takes most of a minute.
  await page.evaluate(() => { Game.livesLost = Game.allowance; });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });

  assert.equal(await page.evaluate(() => Game.isMenuLive()), false,
    'menu was live immediately after game over');

  // A tap during the lockout does nothing at all -- not on the sky, which is
  // no longer a way out of this screen, and not on the OK button either.
  const where = await page.evaluate(() => ({
    sky: { x: Game.width * 0.5, y: Game.height * 0.45 },
    okay: {
      x: Game.layout.okay.x + Game.layout.okay.width / 2,
      y: Game.layout.okay.y + Game.layout.okay.height / 2
    }
  }));
  await page.mouse.click(where.sky.x, where.sky.y);
  await page.mouse.click(where.okay.x, where.okay.y);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => Game.screen), 'gameover',
    'a press during the lockout left the game-over screen');

  await page.waitForFunction(() => Game.isMenuLive(), null, { timeout: 4000 });
  const lockout = await page.evaluate(() => Game.MENU_LOCKOUT_MS);
  // Three seconds, and long is the point now.
  //
  // This asserted the lockout was at most two, on the grounds that a longer
  // one reads as the game ignoring you. Played, 1200ms was not enough: a run
  // ended, the tap that popped the last balloon landed on the screen behind
  // it, and the next game was counting down before the score had been read. A
  // score nobody sees is a score that did not happen.
  //
  // What stops it reading as neglect is that the button is drawn disabled for
  // exactly this long, rather than looking ready while nothing is listening.
  assert.ok(lockout >= 2000 && lockout <= 4000,
    `lockout is ${lockout}ms, which is neither long enough to read a score ` +
    'nor short enough that nobody waits on it');

  // Once live, the OK button is the way out, and the sky is not.
  await page.mouse.click(where.sky.x, where.sky.y);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => Game.screen), 'gameover',
    'tapping the sky left the game-over screen, so a score can still be missed');

  await page.mouse.click(where.okay.x, where.okay.y);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => Game.screen), 'title',
    'the menu did not respond once live');

  // And now it works — but only on the Play button; the sky does nothing.
  await page.mouse.click(where.sky.x, where.sky.y);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => Game.screen), 'title',
    'tapping the sky on the title started a game');
  const play = await page.evaluate(() => {
    const r = Play.rect(Game);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(play.x, play.y);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => Game.screen), 'starting',
    'the Play button did not respond once live');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the board screen asks for the board as soon as it opens', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page } = await newGame({ name: 'Diego' });
  await page.evaluate(() => { Game.enter('board'); });
  await page.waitForTimeout(800);
  assert.ok(apiHits.some(h => h.method === 'GET'),
    'the board was not fetched when its screen opened');
  await context.close();
});

await t('pressing the name line changes how it looks, and releasing puts it back', async () => {
  // The Play button is gone, so the name chip is the only target left that has
  // a pressed state at all. The footage is frozen first, because otherwise
  // these samples are of balloons moving behind the chip.
  const { context, page, errors } = await newGame();
  await freezeTitle(page);
  const chip = await page.evaluate(() => Game.layout.player);
  const before = await patchPaint(page, chip);

  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const pressed = await patchPaint(page, chip);
  assert.equal(await page.evaluate(() => Game.pressed), 'player');
  assert.notDeepEqual(pressed, before, 'pressing the name line did not change its paint');

  // Cancelled rather than released: a release on the canvas is a click, and a
  // click on the title only starts a game on the Play button. pointercancel is
  // the path a browser takes when a gesture is taken over.
  await page.evaluate(() => {
    Game.canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
  });
  await page.waitForTimeout(150);

  assert.equal(await page.evaluate(() => Game.screen), 'title',
    'releasing away from the chip should not open the name screen');
  const released = await patchPaint(page, chip);
  assert.deepEqual(released, before, 'the name line stayed pressed after release');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});



// ---------- balloon size floor ----------

await t('balloons stay poppable at every rung of the ladder', async () => {
  // Without a floor the size factor ran past zero and went negative. check_hit
  // compares against the radius, so no point on the screen could pop one, and
  // every long game ended on an unwinnable board. The shrink is the ladder's
  // now rather than the score's, and the floor still has to hold at the top of
  // it and beyond.
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);

  const probed = await page.evaluate(() => {
    Game.stopLoop();
    const check = (level) => {
      Game.level = level;
      const balloon = Game.randomBalloon();
      let poppable = false;
      for (let x = 0; x < Game.width && !poppable; x += 5) {
        for (let y = 0; y < Game.height; y += 5) {
          if (balloon.hits({ x, y })) { poppable = true; break; }
        }
      }
      return { level, size: balloon.size, poppable };
    };
    // Every rung, and past the end of the ladder in case anything clamps badly.
    return [1, 4, 7, 9, 10, 14, 100].map(check);
  });

  probed.forEach(r => {
    assert.ok(r.size > 0, `balloon size ${r.size.toFixed(1)} at level ${r.level}`);
    assert.ok(r.poppable, `no point on screen pops a balloon at level ${r.level} ` +
      `(size ${r.size.toFixed(1)})`);
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('balloons shrink as the ladder climbs, down to the floor', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);

  const m = await page.evaluate(() => {
    // The loop writes Game.level thirty times a second; stop it, so what is
    // measured is the ladder and not a race with the game.
    Game.stopLoop();

    // Average out the random size component so the trend is the only signal.
    const mean = (level) => {
      Game.level = level;
      let total = 0;
      for (let i = 0; i < 4000; i++) total += Game.randomBalloon().size;
      return total / 4000;
    };
    return {
      floor: MIN_RATIO_SIZE,
      top: Ladder.MAX,
      at1: mean(1), at5: mean(5), at10: mean(10),
      atTop: mean(Ladder.MAX), past: mean(Ladder.MAX * 4),
      // The mechanism rather than a statistic: past the top, Ladder.at clamps,
      // so the row a balloon is built from is the same row.
      rowTop: Ladder.at(Ladder.MAX).size,
      rowPast: Ladder.at(Ladder.MAX * 4).size
    };
  });

  assert.equal(m.rowPast, m.rowTop,
    'past the last rung the ladder should hand back the last row');
  assert.ok(m.at5 < m.at1, 'balloons should shrink as the ladder climbs');
  assert.ok(m.at10 < m.at5, 'shrink should continue toward the top of the ladder');
  assert.ok(Math.abs(m.past - m.atTop) / m.atTop < 0.05,
    `past the last rung the size should hold, not keep falling (${m.atTop.toFixed(1)} -> ${m.past.toFixed(1)})`);
  // Two floors apply: MIN_RATIO_SIZE bounds the shrink, and an absolute
  // minimum keeps the balloon tappable. Whichever is larger wins, so the
  // settled size is at least the ratio floor and never below the touch
  // minimum — which 'a balloon is never smaller than the touch minimum'
  // checks directly, across every screen.
  assert.ok(m.at10 / m.at1 >= m.floor * 0.9,
    `the top of the ladder fell below the ratio floor: ${(m.at10 / m.at1).toFixed(2)} of full`);
  assert.ok(m.at10 < m.at1,
    'balloons at the top of the ladder should be smaller than at the bottom');
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
        Game.score = caught;
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
    // The title screen is running attract footage, which cycles the level; the
    // historic formula below is level 1's, so say so rather than sampling
    // whichever clip happens to be on.
    Game.stopLoop();
    Game.applyLevel(1);
    Game.score = 0;
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
      Game.score = 0;
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






// ---------- screens ----------

await t('each screen keeps its own state, and gets a clean one', async () => {
  const { context, page, errors } = await newGame();

  // The title screen is not counting anything down and nothing is locked out.
  const title = await page.evaluate(() => ({ screen: Game.screen, keys: Object.keys(Game.state).sort() }));
  assert.equal(title.screen, 'title');
  // The title screen plays the game to itself, so it owns the footage's state:
  // which clip is running, how long it has left, and how far into it we are.
  assert.deepEqual(title.keys, ['clip', 'endsAt', 'steps', 'tapEvery'],
    'the title screen is holding state it does not need: ' + title.keys);

  await page.keyboard.press(' ');
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

  // Spend the allowance rather than waiting to lose it: the bottom of the
  // ladder releases about one balloon a second on purpose, so dying here
  // naturally takes most of a minute.
  await page.evaluate(() => { Game.livesLost = Game.allowance; });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  const over = await page.evaluate(() => ({
    keys: Object.keys(Game.state),
    locked: Game.state.liveAt > Date.now()
  }));
  assert.deepEqual(over.keys.sort(), ['isBest', 'liveAt', 'stepsHome'],
    'game over should hold the lockout, the walk back to the title, and whether it was a best');
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);
  assert.equal(await page.evaluate(() => Game.screen), 'playing');

  // Only the popping handler is bound during play: the menu buttons are not
  // listening, so they cannot restart the game under you. A click during play
  // means "pop what is under it", never "start a game".
  const centre = await page.evaluate(() => ({ x: Game.width * 0.5, y: Game.height * 0.45 }));
  await page.keyboard.press(' ');
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => ({ screen: Game.screen, level: Game.level }));
  assert.equal(m.screen, 'playing', 'input meant for the menu interrupted the game');
  assert.equal(m.level, 1, 'a menu press restarted the game under the player');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the leaderboard is fetched once, however often it is asked for', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page } = await newGame();
  await page.waitForTimeout(300);
  const onLoad = apiHits.filter(h => h.method === 'GET').length;

  // A static screen asks for the board as it draws, frame after frame. Asking
  // used to mean fetching: until the first response landed, the game issued
  // thirty requests a second. The promise in flight is the lock that stops it.
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
    Game.score = 42;
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);
  // Spend the allowance rather than waiting to lose it: the bottom of the
  // ladder releases about one balloon a second on purpose, so dying here
  // naturally takes most of a minute.
  await page.evaluate(() => { Game.livesLost = Game.allowance; });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const posted = apiHits.find(h => h.method === 'POST');
  assert.ok(posted, 'no score was posted');
  assert.equal(boards.get('all')[0].name, 'After', 'the score was posted under the old name');
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

  await page.keyboard.press(' ');
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
        deepest: L.description[L.description.length - 1].y,
        top: L.player.y,
        bottom: L.player.y + L.player.height
      };
    });
    assert.ok(m.top > m.deepest, `the name line overlaps the last line of text at ${w}x${h}`);
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
    namespaces: ['Paint', 'Input', 'Scores', 'NameField', 'Screens', 'Layout', 'Sky', 'Ladder']
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

  await page.keyboard.press(' ');
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
  await page.keyboard.press(' ');
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);

  // A minute in a background tab, arriving as one frame. Replaying it would
  // spawn a minute of balloons into a single step and lose every one of them.
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.lastFrame = 0;
    Game.accumulator = 0;
    Game.ticks = 0;
    Game.entities.length = 0;
    Game.livesLost = 0;

    Game.advance(60000);
    return { ticks: Game.ticks, lost: Game.livesLost, cap: Game.MAX_CATCHUP_MS, step: Game.STEP_MS };
  });

  assert.ok(m.ticks <= Math.ceil(m.cap / m.step),
    `a 60 second stall ran ${m.ticks} steps, not the ${Math.ceil(m.cap / m.step)} it is capped at`);
  assert.equal(m.lost, 0, 'balloons escaped during a stall the player never saw');
  await context.close();
});

await t('the time on the board is time played, not time elapsed', async () => {
  const { context, page } = await newGame({ name: 'Clocked' });
  await page.keyboard.press(' ');
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
    window.__built = { painters: 0, colours: 0, balloons: 0 };

    // Count balloons at the source rather than inferring it downstream.
    const made = Game.randomBalloon.bind(Game);
    Game.randomBalloon = function () {
      window.__built.balloons++;
      return made();
    };

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

  // Measured at level 10 rather than level 1. The bottom of the ladder releases
  // about one balloon a second on purpose, which is far too few in three seconds
  // to tell one painter each from one per frame; level 10 is where the sky is
  // fullest. The clock is wound forward rather than waited out.
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);
  await page.evaluate(() => {
    Game.ticks = 9 * Ladder.CLIMB_SECONDS * 1000 / Game.STEP_MS;

    // Start counting from here, with an empty sky. The title screen plays the
    // game to itself, so the wrapper above was already counting balloons the
    // attract footage built — and resetRound then threw those balloons away,
    // leaving painters with no balloon to match. It read as "one balloon
    // needed two painters", which is exactly the defect this test is for.
    Game.entities = [];
    window.__built = { painters: 0, colours: 0, balloons: 0 };
  });

  // Waited for rather than timed. The sky is built at level 1 and only starts
  // filling at level 10's rate once the clock is wound, so "three seconds"
  // was a bet on the spawner rather than a number of balloons.
  await page.waitForFunction(() => window.__built.balloons > 5, null, { timeout: SKY_FILLS })
    .catch(() => { throw new Error('too few balloons made to judge the painters'); });
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => ({
    painters: window.__built.painters,
    colours: window.__built.colours,
    balloons: window.__built.balloons
  }));

  assert.ok(m.balloons > 3, `only ${m.balloons} balloons, too few to judge`);
  // Every frame since each was born was a chance to rebuild it.
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
  assert.match(region.text, /Press Play to start/, 'the title screen does not say how to start');
  assert.match(region.text, /Twenty levels/,
    'the title screen does not describe the game a reader cannot watch');
  assert.match(region.text, /Listener/, 'the title screen does not say who is playing');

  await page.evaluate(() => {
    window.__said = [];
    const say = Announce.say;
    Announce.say = function (text) { window.__said.push(text); return say(text); };
  });

  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  // One balloon has to get away for real, because losing one is the thing being
  // listened for here. The rest of the allowance is spent rather than waited out.
  await page.waitForFunction(() => Game.livesLost > 0, null, { timeout: 40000 });
  await page.evaluate(() => { Game.livesLost = Game.allowance; });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(200);

  const said = await page.evaluate(() => window.__said);
  const heard = said.join(' | ');
  assert.match(heard, /Get ready/, 'the countdown is silent: ' + heard);
  // Numerals, like every other announcement. The countdown used to spell it,
  // which was the only place in the game that did.
  assert.match(heard, /Level 1\b/, 'the level is never said: ' + heard);
  assert.match(heard, /\d+ of 5 lost/, 'losing a balloon is silent: ' + heard);
  assert.match(heard, /Game over\. \d+ points in [\d.]+ seconds/,
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
  assert.equal(m.role, 'application', 'the game keys would be swallowed by the reader');
  assert.ok(m.label && m.label.length > 3, 'the canvas has no name');
  assert.match(m.help, /space/i, 'the description does not say which keys work');
  assert.match(m.help, /Play button/, 'the description does not say the button works too');
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
    // EVERY level, not one per band. The sky is mixed between four keyframes
    // now, so level 11 is a colour no palette in the file actually contains —
    // and an interpolated ground is exactly where contrast can quietly fail.
    const all = [];
    for (let n = 1; n <= Ladder.MAX; n++) { all.push(n); }
    all.forEach(level => {
      Game.applyLevel(level);
      const p = Game.palette;
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
      check('description', p.inkSoft, L.description[0].x + 40, L.description[0].y, true);
      check('board name', p.ink, L.boardScreen.columns.name, L.boardScreen.rows[0], true);
      check('board score', p.accent, L.boardScreen.columns.value, L.boardScreen.rows[0], true);
      check('board breakdown', p.inkSoft,
        L.boardScreen.columns.name, L.boardScreen.rows[0] + L.line * 0.95, true);

      // The HUD is drawn during play, where each run of it has a chip of its
      // own. Painted by the game rather than rebuilt here, so the ground the
      // test measures is the ground the player gets.
      const hudGround = (x, y) => {
        Paint.sky(Game);
        Paint.hudGround(Game);
        const d = Game.ctx.getImageData(
          Math.round(x * Game.dpr), Math.round(y * Game.dpr), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      [['hud', p.ink, L.hud.caught + 20], ['hud level', p.inkSoft, L.hud.level],
       ['hud time', p.accent, L.hud.time]].forEach(([what, colour, x]) => {
        const bg = hudGround(x, L.hud.y);
        out.push({ level, what, ratio: ratio(over(parse(colour), bg), bg) });
      });

      // The About screen, which is the one screen that is nothing but text.
      const aboutGround = (y) => {
        Paint.sky(Game);
        Paint.panel(Game, { y: 0, height: Game.height });
        const d = Game.ctx.getImageData(
          Math.round(L.intro.x * Game.dpr + 4), Math.round(y * Game.dpr), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      [L.intro.y, Game.height * 0.5, L.back.y - L.line].forEach((y, i) => {
        const bg = aboutGround(y);
        out.push({ level, what: 'about body ' + i, ratio: ratio(over(parse(p.inkSoft), bg), bg) });
        out.push({ level, what: 'about heading ' + i, ratio: ratio(over(parse(p.accent), bg), bg) });
      });

      // The accent is still used for the score column and the HUD clock.
      out.push({
        level, what: 'accent on its own ground',
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
    [1, 4, 7, 9].forEach(level => {
      Game.applyLevel(level);
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

await t('the ladder climbs to the ceiling and then holds there', async () => {
  // The defect this guards has changed shape. It used to be that difficulty was
  // two ramps keyed to the score, so a level's opening was fixed and the
  // escalation was invisible. Now it is twenty rows — and a game you can WIN
  // cannot simply outrun the player. The old curve crossed 2.1 taps a second at
  // level 5 and reached 3.2 by 10; extending that slope to 20 would ask for six
  // taps a second at the top and nobody would ever see the end of it.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    rungs: Ladder.LEVELS.map(r => ({
      level: r.level, speed: r.speed, frequency: r.frequency, size: r.size,
      life: r.life || 0,
      taps: Ladder.meanTaps(r),
      arrivals: Ladder.arrivals(r),
      // As played, at the sky the level actually runs at...
      demand: Ladder.demand(r),
      // ...and as the sum used to read it, against a sky of twenty.
      demandFull: Ladder.demand(r, MAX_BALLOONS)
    })),
    max: Ladder.MAX,
    climb: Ladder.CLIMB_SECONDS,
    sky: Ladder.SKY.length,
    skyTop: Ladder.SKY[Ladder.MAX - 1],
    skyClamped: Ladder.skyAt(999)
  }));

  assert.equal(m.rungs.length, 20, 'the ladder is not twenty levels');
  assert.equal(m.max, 20);
  assert.equal(m.climb, 20, 'a level should last twenty seconds');
  assert.equal(m.sky, 20, 'every level needs a measured sky to divide by');
  assert.equal(m.skyClamped, m.skyTop,
    'past the last rung the sky should hold at the top one');

  m.rungs.forEach((r, i) => {
    assert.equal(r.level, i + 1, 'a rung is out of order or mislabelled');
    if (i === 0) { return; }
    const under = m.rungs[i - 1];
    assert.ok(r.speed > under.speed,
      `level ${r.level} is no faster than ${under.level} (${under.speed} then ${r.speed})`);
    assert.ok(r.size < under.size,
      `level ${r.level} is no smaller than ${under.level}`);
    assert.ok(r.taps >= under.taps,
      `level ${r.level} has lighter balloons than ${under.level}`);
    // The spawn rate may FALL, and above level 9 it always does: a three-tap
    // balloon costs three of the two taps a second anyone has, so the sky has
    // to thin as what is in it gets heavier. Thinning it for nothing would just
    // be an easier rung.
    if (r.frequency < under.frequency) {
      assert.ok(r.taps > under.taps,
        `level ${r.level} releases fewer balloons than ${under.level} without ` +
        'making them any heavier');
    }
  });

  // THE BUG THIS LOCKS DOWN. `demand` used to divide by a full sky of twenty
  // balloons, which the game never reaches — the spawn throttle slows arrivals
  // as the sky fills, so it settles far below that. Every figure the last three
  // phases were tuned against was understated, worst at the bottom where the
  // sky is nearly empty. Occupancy is measured and passed in now.
  assert.ok(m.rungs[0].demandFull < m.rungs[0].demand / 2,
    'the full-sky sum should read far lower than the game does at level 1 ' +
    `(${m.rungs[0].demandFull.toFixed(2)} against ${m.rungs[0].demand.toFixed(2)})`);
  m.rungs.forEach(r => {
    assert.ok(r.demand > r.demandFull,
      `level ${r.level} reads harder at a full sky than at its own, which means ` +
      'the occupancy column is wrong');
  });

  // The bottom half is a climb. Level by level it wobbles, because the rate is
  // not the only thing feeding it, so the check is on bands rather than on
  // neighbours.
  const band = (from, to) => {
    const rows = m.rungs.filter(r => r.level >= from && r.level <= to);
    return rows.reduce((total, r) => total + r.demand, 0) / rows.length;
  };
  assert.ok(band(1, 3) < band(4, 7),
    `levels 1-3 ask ${band(1, 3).toFixed(2)} taps a second and 4-7 ask ` +
    `${band(4, 7).toFixed(2)}; the ladder is not climbing`);
  assert.ok(band(4, 7) < band(8, 12),
    `levels 4-7 ask ${band(4, 7).toFixed(2)} and 8-12 ask ${band(8, 12).toFixed(2)}`);

  // And then it stops climbing. A game you can WIN cannot outrun the player:
  // levels 13 to 20 are meant to get harder by taking taps AWAY — a balloon
  // that jinks, one that fades, a firefly, a boss — not by asking for more.
  assert.ok(band(13, 20) <= band(8, 12),
    `the top of the ladder asks ${band(13, 20).toFixed(2)} taps a second against ` +
    `${band(8, 12).toFixed(2)} in the middle; the back half has no room for that`);

  // The peak, against a supply measured in the SAME UNIT.
  //
  // This asserted the peak was near 2.1 and passed for months, because both
  // numbers were wrong in the same direction: the sky column understated how
  // hard the spawn throttle pushes, and the 2.1 was POPS a second compared
  // against a demand in TAPS. Measured, a player lands 2.29 taps a second on
  // balloons and saucers and the ladder peaks at 2.82 — a quarter more than
  // anyone has.
  //
  // That is the design, not a fault. Asking for more taps than a player has
  // does not mean losing; it means balloons get away, and how many you can
  // afford is what the lives are for. What WOULD be a fault is a curve that
  // runs away, so this checks the shape: it climbs, it peaks in the middle
  // within half again of supply, and it eases afterwards.
  const supply = 2.29;
  const demands = m.rungs.map(r => r.demand);
  const peak = Math.max(...demands);
  const peakAt = demands.indexOf(peak) + 1;

  assert.ok(peak > supply,
    `the ladder peaks at ${peak.toFixed(2)} taps a second, under a player's ` +
    `${supply} — a ladder nobody can fall off is not a ladder`);
  assert.ok(peak < supply * 1.5,
    `the ladder peaks at ${peak.toFixed(2)} against a player's ${supply}, ` +
    'which is running away rather than climbing');
  assert.ok(peakAt >= 8 && peakAt <= 15,
    `the ladder peaks at level ${peakAt}, not around the middle where the ` +
    'climb is supposed to stop');
  assert.ok(demands[19] < peak * 0.9, 'the ladder never eases off after its peak');
  assert.ok(demands[0] < demands[9] * 0.7, 'the ladder barely climbs at all');

  // Five flat lives cannot reach 20.
  const awarded = m.rungs.filter(r => r.life > 0).map(r => r.level);
  assert.deepEqual(awarded, [12, 15, 18],
    'a life should arrive at 12, 15 and 18, where a new thing arrives to take one');
  await context.close();
});

await t('there is one game: one pace, one lives count, one board', async () => {
  // Four difficulties meant four leaderboards that could not be compared with
  // each other. This is the property that replaced them.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    gone: typeof window.Difficulty,
    lives: Game.LIVES,
    pace: Ladder.CLIMB_SECONDS,
    startsAt: Game.levelFor(0),
    board: Scores.URL,
    buttons: Game.layout.menu.buttons.length,
    stored: Object.keys(localStorage)
  }));

  assert.equal(m.gone, 'undefined', 'the difficulty table is still loaded');
  assert.equal(m.lives, 5, 'everyone should get the same five lives');
  assert.ok(m.pace > 0, 'there is no climb pace');
  assert.equal(m.startsAt, 1, 'a game does not start at the bottom of the ladder');
  assert.equal(m.board, '/api/scores', 'the board is still addressed per difficulty');
  assert.equal(m.buttons, 0, 'a button came back to stand between the player and the game');
  assert.ok(!m.stored.includes('diff_level'),
    'a difficulty is still being remembered between visits');
  await context.close();
});

await t('the level climbs with time played, and stops at the top', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2400);

  const m = await page.evaluate(() => {
    const perLevel = Ladder.CLIMB_SECONDS;
    const stepsFor = seconds => Math.ceil(seconds * 1000 / Game.STEP_MS);
    return {
      start: Game.level,
      configured: 1,
      justBefore: Game.levelFor(stepsFor(perLevel) - 2),
      justAfter: Game.levelFor(stepsFor(perLevel) + 2),
      halfway: Game.levelFor(stepsFor(perLevel * 4.5)),
      farPast: Game.levelFor(stepsFor(perLevel * 400)),
      top: Ladder.MAX
    };
  });

  assert.equal(m.start, m.configured, 'a round does not open where its difficulty says');
  assert.equal(m.justBefore, m.configured, 'the level climbed early');
  assert.equal(m.justAfter, m.configured + 1, 'the level did not climb on time');
  assert.equal(m.halfway, m.configured + 4);
  assert.equal(m.farPast, m.top, 'the ladder does not stop at the top');
  assert.deepEqual(errors, [], errors.join(' | '));
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
  await page.keyboard.press(' ');
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 2, null, { timeout: SKY_FILLS });

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


// ---------- balloons that take more than one tap ----------

/** Builds a balloon of a given thickness, wherever we want it. */
const THICK = `(skin, x, y) => {
  const b = balloonConstructor(x, y, 60, { r: 200, g: 60, b: 60 }, Game.width, 5, 1, skin);
  b.xcoord = x; b.ycoord = y;
  return b;
}`;

await t('a thick balloon takes a tap per skin, and scores when the last comes off', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const runs = await page.evaluate((thick) => {
    const make = eval(thick);
    Game.stopLoop();
    return [1, 2, 3].map(skin => {
      Game.entities.length = 0;
      Game.score = 0;
      const b = make(skin, 400, 300);
      Game.add(b);

      const taps = [];
      for (let i = 0; i < skin + 1; i++) {
        const before = Game.score;
        Game.canvas.dispatchEvent(new MouseEvent('click', {
          clientX: 400, clientY: 300, bubbles: true
        }));
        taps.push({ scored: Game.score - before, up: Game.entities.length });
      }
      return { skin, taps, worth: b.points, score: Game.score };
    });
  }, THICK);

  runs.forEach(r => {
    // Every tap but the last takes a skin off and scores nothing.
    for (let i = 0; i < r.skin - 1; i++) {
      assert.equal(r.taps[i].scored, 0,
        `skin ${r.skin}: tap ${i + 1} scored before the balloon popped`);
      assert.equal(r.taps[i].up, 1,
        `skin ${r.skin}: tap ${i + 1} removed a balloon that should have survived it`);
    }
    const last = r.taps[r.skin - 1];
    assert.equal(last.up, 0, `skin ${r.skin}: the last tap did not pop it`);
    assert.equal(last.scored, r.worth,
      `skin ${r.skin}: popping scored ${last.scored}, not the ${r.worth} it was worth`);
    // And a tap into the empty space it left does nothing at all.
    assert.equal(r.taps[r.skin].scored, 0, `skin ${r.skin}: scored after it was gone`);
  });

  const worths = runs.map(r => r.worth);
  assert.deepEqual(worths, [1, 3, 6], 'a thicker balloon is not worth more');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a thick balloon is bigger, slower, and looks different before you touch it', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate((thick) => {
    const make = eval(thick);
    Game.stopLoop();
    const of = skin => {
      // Average the random rise so the trend is the only signal.
      let rise = 0;
      const n = 300;
      for (let i = 0; i < n; i++) { rise += Math.abs(make(skin, 400, 300).delta); }
      const one = make(skin, 400, 300);
      return { size: one.size, rise: rise / n, points: one.points };
    };
    return { thin: of(1), mid: of(2), fat: of(3) };
  }, THICK);

  assert.ok(m.mid.size > m.thin.size, 'a reinforced balloon is no bigger than an ordinary one');
  assert.ok(m.fat.size > m.mid.size, 'an armoured balloon is no bigger than a reinforced one');
  assert.ok(m.mid.rise < m.thin.rise, 'a reinforced balloon rises as fast as an ordinary one');
  assert.ok(m.fat.rise < m.mid.rise, 'an armoured balloon rises as fast as a reinforced one');

  // The taps have to fit in the time it is on screen: roughly a skin's worth
  // of extra seconds per extra skin.
  assert.ok(m.thin.rise / m.fat.rise > 1.5,
    `an armoured balloon is only ${(m.thin.rise / m.fat.rise).toFixed(2)}x slower, ` +
    'which is not enough time for three taps');
  await context.close();
});

await t('a tap that does not pop answers within a frame', async () => {
  // The highest-risk detail in the feature: a balloon that takes a tap and
  // does nothing visible reads as having ignored you.
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate((thick) => {
    const make = eval(thick);
    Game.stopLoop();
    Game.entities.length = 0;
    const b = make(3, 400, 300);
    Game.add(b);

    const shot = () => {
      Paint.sky(Game);
      Paint.entities(Game);
      const d = Game.ctx.getImageData(
        Math.round((400 - 90) * Game.dpr), Math.round((300 - 90) * Game.dpr),
        Math.round(180 * Game.dpr), Math.round(180 * Game.dpr)).data;
      return Array.from(d);
    };
    const differs = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i + 1] - b[i + 1]) > 6 ||
            Math.abs(a[i + 2] - b[i + 2]) > 6) { n++; }
      }
      return n;
    };

    const before = shot();
    b.tapped(Game);
    const afterTap = shot();      // the same frame the tap landed in
    for (let i = 0; i < 6; i++) { b.step(Game, false); }
    const settled = shot();

    return {
      answered: differs(before, afterTap),
      stillDifferent: differs(before, settled),
      skinLeft: b.skin
    };
  }, THICK);

  assert.equal(m.skinLeft, 2, 'the tap did not take a skin off');
  assert.ok(m.answered > 300,
    `the balloon changed by only ${m.answered} pixels in the frame the tap landed`);
  // And it still looks different once the squash has passed: it is thinner now.
  assert.ok(m.stillDifferent > 300,
    'a balloon that lost a skin looks exactly like it did before');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('thick balloons arrive with the rungs, not before', async () => {
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    const seen = {};
    Ladder.LEVELS.forEach(row => {
      Game.level = row.level;
      const skins = new Set();
      for (let i = 0; i < 3000; i++) { skins.add(Game.randomBalloon().skin); }
      seen[row.level] = [...skins].sort();
    });
    return {
      seen,
      firstReinforced: Ladder.LEVELS.find(r => r.reinforced > 0).level,
      firstArmoured: Ladder.LEVELS.find(r => r.armoured > 0).level
    };
  });

  assert.equal(m.firstReinforced, 4, 'reinforced balloons do not start at rung 4');
  assert.equal(m.firstArmoured, 10, 'armoured balloons do not start at rung 10');
  for (const level of Object.keys(m.seen).map(Number)) {
    const skins = m.seen[level];
    if (level < m.firstReinforced) {
      assert.deepEqual(skins, [1], `level ${level} has thick balloons before they arrive`);
    }
    if (level >= m.firstReinforced && level < m.firstArmoured) {
      assert.deepEqual(skins, [1, 2], `level ${level} should have ordinary and reinforced only`);
    }
    if (level >= m.firstArmoured) {
      assert.deepEqual(skins, [1, 2, 3], `level ${level} is missing a thickness`);
    }
  }
  await context.close();
});

await t('the sky thins out as what is in it gets heavier', async () => {
  // Diego's rule, and the arithmetic agrees: rarer as well as slower, because
  // a three-tap balloon spends three of the two taps a second anyone has.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => Ladder.LEVELS.map(r => ({
    level: r.level,
    arrivals: Ladder.arrivals(r),
    taps: Ladder.meanTaps(r),
    demand: Ladder.demand(r)
  })));

  const arriving = m.find(r => r.level === 4);
  const under = m.find(r => r.level === 3);
  assert.ok(arriving.arrivals < under.arrivals,
    'the rung that brings reinforced balloons releases as many as the one below');
  // Heavier per balloon, not necessarily more taps a second. Measured, the
  // heavy rung can ask NO MORE demand than the one below: slow three-tap
  // balloons linger, the sky fills, and the throttle then releases fewer of
  // them, so `arrivals x meanTaps` dips even as the sky gets fuller and every
  // balloon in it costs more. That relation is stable and player-independent;
  // the demand comparison was a coin toss between measurement batches. See
  // issue #46.
  assert.ok(arriving.taps > under.taps,
    'the rung that brings reinforced balloons is no heavier per balloon');

  const armoured = m.find(r => r.level === 10);
  const belowArmoured = m.find(r => r.level === 9);
  assert.ok(armoured.arrivals < belowArmoured.arrivals,
    'the rung that brings armoured balloons releases as many as the one below');
  assert.ok(armoured.taps > belowArmoured.taps,
    'the rung that brings armoured balloons is no heavier per balloon');

  // Across the whole ladder the two numbers move in opposite directions — from
  // the PEAK onwards, which is the honest version of this.
  //
  // It used to say level 20 releases fewer balloons a second than level 1, and
  // that passed only while the sky column overstated how full the sky gets.
  // Measured for 2.2, arrivals climb from 1.49 a second at level 1 to about
  // 2.12 at level 9 and then fall to 1.52 by the top: the sky thins from its
  // own peak, not from the tutorial. Level 20 is still busier than level 1 AND
  // every balloon in it costs 1.52 taps instead of 1.
  const first = m.find(r => r.level === 1);
  const last = m.find(r => r.level === 20);
  const busiest = m.reduce((a, b) => (b.arrivals > a.arrivals ? b : a));

  assert.ok(busiest.level >= 6 && busiest.level <= 12,
    `the sky is busiest at level ${busiest.level}, which is not the middle`);
  assert.ok(last.arrivals < busiest.arrivals * 0.75,
    `level 20 releases ${last.arrivals.toFixed(2)} balloons a second against ` +
    `the peak's ${busiest.arrivals.toFixed(2)}, so the sky never thins for the ` +
    'heavier balloons in it');
  assert.ok(last.demand > first.demand * 1.5,
    `level 20 asks ${last.demand.toFixed(2)} taps a second against level 1's ` +
    `${first.demand.toFixed(2)}, which is not a climb`);
  assert.ok(last.taps > first.taps * 1.5,
    `a balloon at level 20 costs ${last.taps.toFixed(2)} taps, which is not much ` +
    `more than level 1's ${first.taps.toFixed(2)}`);

  // Taps per balloon only ever rise: a rung that thinned the sky without making
  // what is left heavier would just be an easier rung.
  m.forEach((r, i) => {
    if (i === 0) { return; }
    assert.ok(r.taps >= m[i - 1].taps,
      `level ${r.level} has lighter balloons than ${m[i - 1].level}`);
  });
  await context.close();
});


await t('surviving the last level wins the game; reaching it does not', async () => {
  // This is the one case a level number cannot describe. levelFor clamps at the
  // top, so it reads 20 both a second into the last level and a second after it
  // should have ended — and the difference between those two is the finish line.
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2600);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    const out = { run: Game.runTicks() };

    out.levelNearEnd = Game.levelFor(Game.runTicks() - 30);
    Game.ticks = Game.runTicks() - 30;   // a second of level 20 still to play
    out.finishedNearEnd = Game.finished();
    Screens.playing.update(Game);
    out.screenNearEnd = Game.screen;
    out.wonNearEnd = Game.won;

    Game.ticks = Game.runTicks() - 1;    // the last step of the last level
    Screens.playing.update(Game);
    out.finishedAtEnd = Game.finished();
    out.screenAtEnd = Game.screen;
    out.wonAtEnd = Game.won;
    return out;
  });

  assert.equal(m.run, 20 * 20 * 30, 'a whole run should be twenty levels of twenty seconds');
  assert.equal(m.levelNearEnd, 20, 'a second short of the end is still level 20');
  assert.equal(m.finishedNearEnd, false, 'the run finished before level 20 was played out');
  assert.equal(m.screenNearEnd, 'playing', 'reaching level 20 ended the game by itself');
  assert.equal(m.wonNearEnd, false, 'the game was won on arrival at the top rung');
  assert.equal(m.finishedAtEnd, true, 'playing out level 20 did not finish the run');
  assert.equal(m.screenAtEnd, 'gameover');
  assert.equal(m.wonAtEnd, true, 'surviving the last level was not recorded as a win');

  const heard = await page.evaluate(() => document.getElementById('game_status').textContent);
  assert.match(heard, /You win/, 'a won run is announced as a game over: ' + heard);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the ladder hands out lives, and the run ends on the allowance', async () => {
  // The bug this guards: the end-of-run check read the constant five, so an
  // awarded life could be announced and then quietly ignored.
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2600);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.resetRound();
    const start = Game.allowance;
    const given = [];
    for (let level = 1; level <= Ladder.MAX; level++) {
      if (Game.awardLife(level) > 0) { given.push(level); }
    }
    const end = Game.allowance;

    Game.ticks = 0;
    Game.allowance = 7;
    Game.livesLost = 6;
    Screens.playing.update(Game);
    const atSix = Game.screen;
    Game.livesLost = 7;
    Screens.playing.update(Game);
    const atSeven = Game.screen;
    return { start, given, end, atSix, atSeven };
  });

  assert.equal(m.start, 5, 'a run should start on five lives');
  assert.deepEqual(m.given, [12, 15, 18]);
  assert.equal(m.end, 8, 'three awarded lives should leave an allowance of eight');
  assert.equal(m.atSix, 'playing',
    'six lost out of an allowance of seven ended the run early');
  assert.equal(m.atSeven, 'gameover',
    'the run did not end when the allowance ran out');
  await context.close();
});

await t('the sky runs down continuously across twenty levels, not in four steps', async () => {
  // It used to be four bands: the sky changed four times and sat still in
  // between, and each change landed as a jump. Four keyframes mixed across
  // twenty levels means every level has a sky of its own.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const skies = [];
    for (let level = 1; level <= Ladder.MAX; level++) {
      const p = Sky.paletteFor(level);
      skies.push({ level, top: p.top, mid: p.mid, horizon: p.horizon, stars: p.stars });
    }
    return {
      skies,
      max: Ladder.MAX,
      keyframes: Sky.KEYFRAMES.map(k => k.at),
      atKeyframes: Sky.KEYFRAMES.map(k => Sky.paletteFor(k.at).name),
      named: Sky.KEYFRAMES.map(k => Sky.PALETTES[k.palette].name)
    };
  });

  // The keyframes are themselves, not a mix of themselves.
  assert.deepEqual(m.atKeyframes, m.named,
    'a keyframe level is not showing its own palette');
  assert.deepEqual(m.keyframes, [1, 7, 14, 20],
    'the day is not pinned where this test thinks it is');

  // No two levels share a sky.
  const seen = new Map();
  m.skies.forEach(sky => {
    const key = [sky.top, sky.mid, sky.horizon].join('|');
    if (seen.has(key)) {
      assert.fail(`levels ${seen.get(key)} and ${sky.level} are drawn on the same sky`);
    }
    seen.set(key, sky.level);
  });

  // And the stars come out gradually rather than all at once.
  const stars = m.skies.map(s => s.stars);
  assert.equal(stars[0], 0, 'level 1 has stars in a clear morning');
  assert.ok(stars[m.max - 1] > 50, 'the top of the ladder is not dark');
  stars.forEach((n, i) => {
    if (i === 0) { return; }
    assert.ok(n >= stars[i - 1],
      `level ${i + 1} has fewer stars than level ${i}; the night is going backwards`);
  });
  const dawn = stars.findIndex(n => n > 0) + 1;
  assert.ok(dawn > 14 && dawn < 20,
    `the first star appears at level ${dawn}, which is not dusk turning to night`);
  await context.close();
});

await t('the footage cuts between levels with nobody touching it', async () => {
  const { context, page, errors } = await newGame();
  const seen = await page.evaluate(async () => {
    const levels = new Set();
    for (let i = 0; i < 40; i++) {
      levels.add(Game.level);
      await new Promise(r => setTimeout(r, 500));
      if (levels.size >= 3) { break; }
    }
    return { levels: [...levels], clips: Attract.CLIPS, screen: Game.screen };
  });

  assert.equal(seen.screen, 'title', 'the footage started a game by itself');
  assert.ok(seen.levels.length >= 3,
    `the footage stayed on ${seen.levels.join(', ')}; it is one clip, not several`);
  seen.levels.forEach(level => {
    assert.ok(seen.clips.includes(level),
      `the footage showed level ${level}, which is not one of the clips`);
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('the hitbox is the balloon, checked against the pixels it draws', async () => {
  // It used to be the bounding rectangle, which is 31% bigger than the shape
  // inside it: a third of the taps that popped a balloon landed on empty sky
  // beside it, most of them in the bands of nothing either side of the tail.
  // So this does not check a formula against another formula. It draws a
  // balloon, reads every pixel of its bounding box, and asks the hit test
  // about each one.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const ctx = Game.ctx;
    const radius = 70;
    const cx = Game.width / 2;
    const cy = Game.height / 2;

    // Flat black ground and a bright balloon, so "not background" is "balloon"
    // with no judgement call about a gradient.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, Game.canvas.width, Game.canvas.height);

    const balloon = new CANVASBALLOON.Balloon('balloon_canvas', cx, cy, radius, {
      r: 255, g: 255, b: 255
    });
    balloon.draw();

    const reach = radius * (1 + CANVASBALLOON.HEIGHT_FACTOR);
    const wrong = { tappedEmptySky: 0, missedTheBalloon: 0 };
    const worst = { emptySky: 0, balloon: 0 };
    let drawn = 0;
    let tappable = 0;

    // The knot below the tail is drawn separately and is not meant to be
    // tappable, so the grid stops at the tip.
    for (let y = Math.floor(cy - radius) - 3; y <= Math.ceil(cy + reach); y++) {
      for (let x = Math.floor(cx - radius) - 3; x <= Math.ceil(cx + radius) + 3; x++) {
        const px = ctx.getImageData(x, y, 1, 1).data;
        const painted = px[0] + px[1] + px[2] > 24;
        const hit = balloon.check_hit(x, y);
        if (painted) { drawn++; }
        if (hit) { tappable++; }
        if (hit === painted) { continue; }

        // Disagreement is only fair near the edge: the fitted taper follows
        // the beziers to within a fraction of a pixel, and the fill is
        // antialiased. Measure how far in from the boundary it happens.
        const dx = Math.abs(x - cx);
        const dy = y - cy;
        const edge = dy <= 0
          ? Math.abs(Math.sqrt(dx * dx + dy * dy) - radius)
          : Math.abs(dx - radius * Math.sqrt(Math.max(0,
              1 - Math.pow(Math.min(1, dy / reach), CANVASBALLOON.TAPER_POWER))));
        if (hit) {
          wrong.tappedEmptySky++;
          worst.emptySky = Math.max(worst.emptySky, edge);
        } else {
          wrong.missedTheBalloon++;
          worst.balloon = Math.max(worst.balloon, edge);
        }
      }
    }

    return { wrong, worst, drawn, tappable, radius, reach };
  });

  // Every disagreement sits within a pixel or two of the outline.
  assert.ok(m.worst.emptySky <= 2.5,
    `the hit test says yes ${m.worst.emptySky.toFixed(1)}px outside the balloon`);
  assert.ok(m.worst.balloon <= 2.5,
    `the hit test says no ${m.worst.balloon.toFixed(1)}px inside the balloon`);

  // And the tappable area is the drawn area, not a box around it.
  const ratio = m.tappable / m.drawn;
  assert.ok(ratio > 0.95 && ratio < 1.05,
    `the tappable area is ${(ratio * 100).toFixed(0)}% of the drawn balloon`);

  // The rectangle it replaced, for the record: 2r wide by r + reach tall.
  const box = 2 * m.radius * (m.radius + m.reach);
  assert.ok(box / m.drawn > 1.2,
    'the bounding box is no longer meaningfully bigger than the balloon, so ' +
    'either the shape or this test has changed');
  await context.close();
});

await t('a tap beside the tail no longer pops the balloon', async () => {
  // The worst of the old rectangle: two wide bands of empty sky either side of
  // the tail, a full radius across at the very bottom, all of it tappable.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const radius = 60;
    const balloon = new CANVASBALLOON.Balloon('balloon_canvas', 300, 300, radius, {
      r: 200, g: 40, b: 40
    });
    const reach = radius * (1 + CANVASBALLOON.HEIGHT_FACTOR);
    return {
      // Just inside the old box, beside the tail, where there is nothing.
      besideTheTail: balloon.check_hit(300 + radius - 2, 300 + reach - 2),
      // The corner of the old box, above the shoulder.
      aboveTheShoulder: balloon.check_hit(300 + radius - 2, 300 - radius + 2),
      // Things that must still work.
      middle: balloon.check_hit(300, 300),
      topOfTheHead: balloon.check_hit(300, 300 - radius + 1),
      theWaist: balloon.check_hit(300 - radius + 1, 300),
      downTheTail: balloon.check_hit(300, 300 + reach - 1),
      belowTheTip: balloon.check_hit(300, 300 + reach + 3)
    };
  });

  assert.equal(m.besideTheTail, false, 'empty sky beside the tail still pops a balloon');
  assert.equal(m.aboveTheShoulder, false, 'the corner of the old box still pops a balloon');
  assert.equal(m.middle, true, 'the middle of the balloon does not pop it');
  assert.equal(m.topOfTheHead, true, 'the top of the head does not pop it');
  assert.equal(m.theWaist, true, 'the widest part of the balloon does not pop it');
  assert.equal(m.downTheTail, true, 'the tail does not pop it');
  assert.equal(m.belowTheTip, false, 'the knot below the balloon pops it');
  await context.close();
});




await t('the countdown says nothing, and the rules are somewhere you can find them', async () => {
  // It used to draw the whole rules sentence over the 3-2-1. With four icons
  // on the title screen and a page of text behind the About chip, that was the
  // third telling in a row — in the one moment a player should be watching the
  // sky rather than reading.
  const { context, page } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    // Everything the countdown puts on the canvas, by what it writes.
    const wrote = [];
    const was = Game.ctx.fillText.bind(Game.ctx);
    Game.ctx.fillText = function (text) {
      wrote.push(String(text));
      return was.apply(Game.ctx, arguments);
    };
    Paint.countdown(Game, 2400);
    Game.ctx.fillText = was;

    return {
      screen: Game.screen,
      wrote,
      about: Layout.about().map(s => s.heading),
      said: document.getElementById('game_status').textContent
    };
  });

  assert.equal(m.screen, 'starting');
  assert.deepEqual(m.wrote, ['3'], `the countdown drew ${m.wrote.join(' / ')}`);
  // The rules did not vanish, they moved.
  assert.ok(m.about.length >= 4,
    'the About screen has no sections for the rules to live in');
  assert.match(m.said, /Get ready/, 'the countdown is silent: ' + m.said);
  await context.close();
});


await t('looking away pauses the game and says so on the way back', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 0, null, { timeout: SKY_FILLS });

  // Read the clock and hide the tab in ONE call. These were two, and the game
  // went on running in the round trip between them — so a step could land
  // after the sample and before the pause, and the test then reported the
  // balloons as having risen while the tab was away. About one run in eight.
  //
  // Playwright cannot background a tab, so this drives the event the browser
  // would fire. What it checks is the handler, which is the part that is ours.
  // The handler runs synchronously, so nothing can step in between.
  const playing = await page.evaluate(() => {
    const before = {
      ticks: Game.ticks,
      positions: Game.entities.map(e => e.ycoord)
    };
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return before;
  });
  await page.waitForTimeout(300);

  const away = await page.evaluate(() => ({
    screen: Game.screen,
    said: document.getElementById('game_status').textContent
  }));
  assert.equal(away.screen, 'paused', 'a backgrounded tab left the game running');
  assert.match(away.said, /Paused/, 'the pause is silent: ' + away.said);

  // It waits. A break between levels resumes itself because the player is
  // there; this screen is up precisely because they were not.
  await page.waitForTimeout(900);
  const still = await page.evaluate(() => ({
    screen: Game.screen,
    ticks: Game.ticks,
    positions: Game.entities.map(e => e.ycoord)
  }));
  assert.equal(still.screen, 'paused', 'the pause resumed on its own');
  assert.equal(still.ticks, playing.ticks, 'the clock ran while the tab was away');
  assert.deepEqual(still.positions, playing.positions,
    'the balloons kept rising while the tab was away');

  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => Game.screen), 'playing',
    'the game did not carry on when asked');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('the board records how far up the ladder a score got', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Diego' });
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  // Die at a known level rather than at whichever one the clock reaches.
  await page.evaluate(() => {
    Game.ticks = 6 * Ladder.CLIMB_SECONDS * 1000 / Game.STEP_MS;
    Game.score = 380;
    Game.livesLost = Game.allowance;
  });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(400);

  const posted = apiHits.find(h => h.method === 'POST');
  assert.ok(posted && posted.body, 'no score was posted');
  assert.equal(posted.body.level, 7, 'the level was not sent with the score');
  assert.equal(posted.body.won, false, 'a run that died claimed a win');
  assert.equal(boards.get('all')[0].level, 7, 'the board did not keep the level');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a row says won, a level, or nothing, and never invents one', async () => {
  boards.clear();
  apiHits.length = 0;
  boards.set('all', [
    { name: 'Winner', score: 1100, score_day: '2026-09-17', level: 20, won: true },
    { name: 'Climber', score: 700, score_day: '2026-09-16', level: 14 },
    { name: 'Ancient', score: 500, score_day: '2026-09-01' }
  ]);
  const { context, page } = await newGame({ name: 'Diego' });
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => ({
    reached: Scores.board.map(row => Paint.reached(row)),
    hasLevelColumn: typeof Game.layout.boardScreen.columns.level === 'number',
    levelLeftOfValue: Game.layout.boardScreen.columns.level < Game.layout.boardScreen.columns.value
  }));

  // An em dash, not a zero: a row written before levels existed has no level,
  // and that is different from having reached none.
  assert.deepEqual(m.reached, ['WON', 'L14', '\u2014']);
  assert.ok(m.hasLevelColumn, 'there is nowhere to draw the level');
  assert.ok(m.levelLeftOfValue, 'the level should read before the score, not after it');
  await context.close();
});




await t('a bird crosses the sky and costs nothing for being there', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(async () => {
    Game.stopLoop();
    Game.applyLevel(12);
    Game.entities = [];
    // spawnBird is a dice roll per step, so roll it until one lands rather
    // than reaching into the shared ladder row to force it.
    for (let i = 0; i < 40000 && !Game.entities.length; i++) { Game.spawnBird(); }
    const bird = Game.entities.find(e => e.kind === 'bird');
    const started = { x: bird.xcoord, offscreen: bird.xcoord < 0 || bird.xcoord > Game.width };

    const lostBefore = Game.livesLost;
    let steps = 0;
    while (Game.entities.includes(bird) && steps < 2000) {
      Game.reap();
      Game.step(false);
      steps++;
    }
    return {
      started,
      steps,
      crossed: !Game.entities.includes(bird),
      cost: Game.livesLost - lostBefore,
      layer: bird.layer,
      aboveBalloons: bird.layer > Entities.LAYERS.balloon
    };
  });

  assert.ok(m.started.offscreen,
    `a bird appeared on screen at x=${m.started.x}; it has to fly in from outside`);
  assert.ok(m.crossed, 'the bird never left');
  assert.ok(m.steps > 30, `the bird crossed in ${m.steps} steps, too fast to see`);
  assert.equal(m.cost, 0, 'a bird minding its own business cost a life');
  assert.ok(m.aboveBalloons, 'birds should pass in front of balloons, consistently');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('touching a bird costs a life, and it flies off rather than popping', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(12);
    Game.entities = [];
    for (let i = 0; i < 40000 && !Game.entities.length; i++) { Game.spawnBird(); }
    const bird = Game.entities.find(e => e.kind === 'bird');
    bird.xcoord = Game.width / 2;

    const before = Game.livesLost;
    const removedByTap = bird.tapped(Game);
    const afterOne = Game.livesLost;

    // Tapping it again must not charge twice: it is already leaving.
    bird.tapped(Game);
    const afterTwo = Game.livesLost;

    const y = bird.ycoord;
    for (let i = 0; i < 10; i++) { bird.step(Game, false); }
    return {
      before, afterOne, afterTwo,
      removedByTap,
      stillThere: Game.entities.includes(bird),
      climbed: bird.ycoord < y,
      said: document.getElementById('game_status').textContent
    };
  });

  assert.equal(m.afterOne, m.before + 1, 'touching a bird did not cost a life');
  assert.equal(m.afterTwo, m.afterOne, 'a bird already leaving charged a second life');
  // The one thing a bird must never look like is a balloon that popped.
  assert.equal(m.removedByTap, false, 'the bird vanished under the finger');
  assert.ok(m.stillThere, 'the bird was removed on the spot');
  assert.ok(m.climbed, 'a startled bird should visibly clear off');
  assert.match(m.said, /touched a bird/i, 'the penalty is silent: ' + m.said);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t("a bird's hitbox is inside its silhouette, which is the opposite of a balloon's", async () => {
  // A balloon's hit shape matches its outline, because a tap aimed at one
  // should land. Touching a bird is the mistake, so every pixel of doubt goes
  // to the player: the wings are drawn and deliberately not tappable.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const ctx = Game.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, Game.canvas.width, Game.canvas.height);

    Game.stopLoop();
    Game.applyLevel(12);
    Game.palette = Object.assign({}, Game.palette, { birdInk: '#FFFFFF' });
    const bird = birdConstructor(420, 300, 40, 4, true);
    bird.draw(Game);

    const span = 40 * BIRD_SPAN;
    let drawn = 0, tappable = 0, tappableButBlank = 0;
    for (let y = Math.floor(300 - span); y <= Math.ceil(300 + span); y++) {
      for (let x = Math.floor(420 - span); x <= Math.ceil(420 + span); x++) {
        const px = ctx.getImageData(x, y, 1, 1).data;
        // Any ink at all. The fill is antialiased, so a pixel on the outline
        // is partly covered -- and a partly covered pixel is not empty sky.
        const painted = px[0] + px[1] + px[2] > 0;
        const hit = bird.hits({ x, y });
        if (painted) { drawn++; }
        if (hit) { tappable++; }
        if (hit && !painted) { tappableButBlank++; }
      }
    }
    return { drawn, tappable, tappableButBlank };
  });

  assert.ok(m.drawn > 0, 'the bird drew nothing at all');
  assert.ok(m.tappable > 0, 'the bird cannot be touched, so it costs nothing');
  assert.ok(m.tappable < m.drawn,
    `the hitbox (${m.tappable}px) is not smaller than the drawing (${m.drawn}px)`);
  // Not zero: an analytic ellipse and a rasterised fill disagree by a pixel
  // here and there along the outline, and no threshold makes that go away.
  // Half a percent is "the outline"; the loose ellipse this replaced scored
  // 37%, all of it in the blank notch between the wings.
  const blank = m.tappableButBlank / m.drawn;
  assert.ok(blank < 0.005,
    `${m.tappableButBlank} of ${m.drawn} painted pixels' worth of empty sky ` +
    `would cost a life (${(blank * 100).toFixed(1)}%)`);
  await context.close();
});

await t('birds arrive at level 8, and never before it', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    first: Ladder.LEVELS.find(r => (r.birds || 0) > 0).level,
    perLevel: Ladder.LEVELS.map(r => r.birds || 0),
    news: Ladder.at(8).news,
    // A bird costs no taps, so it must not move the demand sum.
    demandAt8: Ladder.demand(Ladder.at(8)),
    tapsAt8: Ladder.meanTaps(Ladder.at(8))
  }));

  assert.equal(m.first, 8, 'birds do not start at level 8');
  m.perLevel.forEach((chance, i) => {
    if (i + 1 < 8) {
      assert.equal(chance, 0, `level ${i + 1} has birds before they arrive`);
    } else {
      assert.ok(chance > 0, `level ${i + 1} lost its birds`);
    }
    if (i + 1 > 8) {
      assert.ok(chance >= m.perLevel[i - 1],
        `level ${i + 1} has fewer birds than level ${i}`);
    }
  });
  assert.ok(Array.isArray(m.news), 'level 8 does not say that birds have arrived');
  assert.match(m.news[1], /cost a life/i, 'the break does not say what a bird costs');
  assert.equal(m.tapsAt8, 1.20, 'birds changed what a balloon costs in taps');
  await context.close();
});


await t('the boss arrives when the sky goes scarce, not when it is empty', async () => {
  // The obvious rule is "when the sky is cleared". Measured, the sky is never
  // cleared: balloons arrive about as fast as anyone pops them, so the count
  // hovers near its cap and touches zero roughly never. A boss on that trigger
  // would be a feature almost nobody met.
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(6);
    const rung = Game.rung();
    const out = { threshold: rung.bossAt, cooldown: rung.bossEvery };

    // One more balloon up than the threshold allows: no boss.
    Game.entities = [];
    Game.lastBoss = -Infinity;
    for (let i = 0; i < rung.bossAt + 1; i++) { Game.add(Game.randomBalloon()); }
    Game.spawnBoss();
    out.whileBusy = Game.countOf('boss');

    // Down to the threshold: a boss.
    Game.entities = Game.entities.slice(0, rung.bossAt);
    Game.spawnBoss();
    out.whenScarce = Game.countOf('boss');

    // And only one at a time.
    Game.spawnBoss();
    out.twoAtOnce = Game.countOf('boss');
    return out;
  });

  assert.ok(m.threshold >= 1, 'level 6 has no boss threshold');
  assert.ok(m.cooldown > 0, 'level 6 has no cooldown between bosses');
  assert.equal(m.whileBusy, 0, 'a boss arrived while the sky was still busy');
  assert.equal(m.whenScarce, 1, 'the sky went scarce and no boss came');
  assert.equal(m.twoAtOnce, 1, 'two bosses at once');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the threshold climbs and the cooldown falls, so bosses keep coming', async () => {
  // A fixed threshold would mean one boss per game and never another: clearing
  // down to one balloon is a feat at level 6 and impossible by 12.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    first: Ladder.LEVELS.find(r => r.bossAt).level,
    thresholds: Ladder.LEVELS.map(r => r.bossAt || 0),
    cooldowns: Ladder.LEVELS.map(r => r.bossEvery || 0)
  }));

  assert.equal(m.first, 6, 'the boss does not start at level 6');
  m.thresholds.forEach((at, i) => {
    if (i + 1 < 6) {
      assert.equal(at, 0, `level ${i + 1} has a boss before it should`);
      return;
    }
    assert.ok(at > 0, `level ${i + 1} lost its boss`);
    if (i + 1 > 6) {
      assert.ok(at >= m.thresholds[i - 1],
        `level ${i + 1} is harder to trigger than level ${i}`);
      assert.ok(m.cooldowns[i] <= m.cooldowns[i - 1],
        `level ${i + 1} waits longer between bosses than level ${i}`);
    }
  });
  assert.ok(m.thresholds[19] > m.thresholds[5],
    'the threshold never climbs, so the top of the ladder never sees a boss');
  await context.close();
});

await t('the boss takes five taps, and the shot is telegraphed for long enough', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(6);
    Game.entities = [];
    Game.lastBoss = -Infinity;
    Game.score = 0;
    Game.spawnBoss();
    const boss = Game.entities.find(e => e.kind === 'boss');

    const out = { taps: boss.taps, fuse: boss.fuse, chargeSteps: 0 };
    const startedAt = boss.xcoord;

    // Four taps must not finish it.
    for (let i = 0; i < 4; i++) { boss.tapped(Game); }
    out.afterFour = { taps: boss.taps, score: Game.score };

    // Count the steps FIRST: `i < boss.fuse` re-reads a counter that is going
    // down, so the two meet in the middle and it never gets to fire.
    const steps = boss.fuse + 1;
    const lost = Game.livesLost;
    for (let i = 0; i < steps; i++) {
      boss.step(Game, false);
      if (boss.charging()) { out.chargeSteps++; }
    }
    out.moved = boss.xcoord !== startedAt;
    out.cost = Game.livesLost - lost;
    out.said = document.getElementById('game_status').textContent;
    return out;
  });

  assert.equal(m.taps, 5, 'the boss does not take five taps');
  assert.equal(m.fuse, 90, 'the fuse is not three seconds at thirty steps a second');
  assert.equal(m.afterFour.taps, 1, 'four taps should not finish it');
  assert.equal(m.afterFour.score, 0, 'a boss scored before it was destroyed');

  // 600ms is the floor: anything shorter than a reaction time plus an aim is
  // unfair by construction, so losing is something you watched coming.
  assert.ok(m.chargeSteps * (1000 / 30) >= 600,
    `the shot is telegraphed for only ${Math.round(m.chargeSteps * (1000 / 30))}ms`);
  assert.ok(m.moved, 'the boss sits still, which makes the fight a rhythm test');
  assert.equal(m.cost, 1, 'the shot did not cost a life');
  assert.match(m.said, /saucer fired/i, 'the shot is silent: ' + m.said);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('destroying the boss scores, and starts the cooldown', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(6);
    Game.entities = [];
    Game.lastBoss = -Infinity;
    Game.ticks = 5000;
    Game.score = 0;
    Game.spawnBoss();
    const boss = Game.entities.find(e => e.kind === 'boss');

    for (let i = 0; i < 5; i++) { boss.tapped(Game); }
    const out = {
      score: Game.score,
      lost: Game.livesLost,
      said: document.getElementById('game_status').textContent,
      // Not removed on the spot: it lifts out of the sky, so the player sees
      // the thing they beat go rather than having it blink out under a finger.
      stillThere: Game.entities.includes(boss),
      cooldownFrom: Game.ticks - Game.lastBoss
    };

    // Another cannot arrive until the cooldown has run. Without it, the moment
    // after a boss dies is the emptiest the sky ever gets, which is exactly
    // the trigger condition, and you would fight two back to back.
    Game.entities = [];
    Game.spawnBoss();
    out.straightAway = Game.countOf('boss');
    Game.ticks += Game.rung().bossEvery;
    Game.spawnBoss();
    out.afterCooldown = Game.countOf('boss');
    return out;
  });

  assert.equal(m.score, 12, 'destroying the boss is worth nothing');
  assert.equal(m.lost, 0, 'beating the boss cost a life');
  assert.match(m.said, /destroyed/i, 'the win is silent: ' + m.said);
  assert.ok(m.stillThere, 'the boss blinked out under the finger');
  assert.equal(m.cooldownFrom, 0, 'the cooldown did not start when the fight settled');
  assert.equal(m.straightAway, 0, 'a second boss arrived with no gap at all');
  assert.equal(m.afterCooldown, 1, 'no boss came back after the cooldown');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('the level chip cycles through the levels worth practising', async () => {
  // Not all twenty: stepping one at a time to reach 18 is seventeen taps. The
  // list is the levels where something new arrives, which the ladder already
  // knows, so it grows on its own as each phase lands.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    const out = { offered: Ladder.starts(), seen: [], start: Game.startLevel };
    const news = Ladder.LEVELS.filter(r => r.news).map(r => r.level);
    out.news = news;
    for (let i = 0; i < out.offered.length + 1; i++) {
      out.seen.push(Game.startLevel);
      Game.cycleStartLevel();
    }
    out.wrapped = Game.startLevel;
    return out;
  });

  assert.equal(m.start, 1, 'a fresh visit does not start at level 1');
  assert.equal(m.offered[0], 1, 'level 1 is not the first thing offered');
  assert.ok(m.offered.includes(20), 'the top rung is not offered');
  m.news.forEach(level => {
    assert.ok(m.offered.includes(level),
      `level ${level} brings something new but cannot be practised`);
  });
  assert.deepEqual(m.seen, m.offered.concat([1]),
    'the chip does not cycle through the list and wrap: ' + m.seen.join(', '));
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the level chip is gone, and what it drove is still there', async () => {
  // It was a development aid on the title screen of a finished game: a way to
  // practise level 18 without climbing to it, with a warning that the score
  // would not count. It is off the screen now.
  //
  // Game.startLevel and everything behind it stays, because the playtest
  // harness sets it directly to measure the top of the ladder -- which is the
  // only thing that ever really needed a way in.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => ({
    targets: Game.layout.targets.map(t => t.id),
    startLevel: Game.startLevel,
    practice: Game.isPractice(),
    starts: Ladder.starts(),
    drawn: (() => {
      const wrote = [];
      const was = Game.ctx.fillText.bind(Game.ctx);
      Game.ctx.fillText = function (text) { wrote.push(String(text)); };
      Screens.title.draw(Game);
      Game.ctx.fillText = was;
      return wrote.join(' | ');
    })()
  }));

  assert.ok(!m.targets.includes('start'), 'the level chip is still a tap target');
  assert.ok(!/From level/i.test(m.drawn),
    'the level chip is still drawn: ' + m.drawn);

  // A run opened from the title still starts at the bottom and still counts.
  assert.equal(m.startLevel, 1, 'a fresh game does not start at level 1');
  assert.equal(m.practice, false, 'a fresh game counts as practice');

  // And the machinery the harness drives is intact.
  assert.ok(m.starts.length > 2, 'the practice levels stopped being derivable');
  const above = await page.evaluate(() => {
    Game.startLevel = 18;
    return { practice: Game.isPractice(), lives: Game.LIVES + Ladder.livesBy(18) };
  });
  assert.equal(above.practice, true,
    'starting above level 1 stopped counting as a practice run');
  assert.equal(above.lives, 8,
    'a run opened at 18 no longer gets the lives it would have climbed with');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a practice run is never posted to the board', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Practiser' });
  await page.evaluate(() => { Game.startLevel = 12; Game.measureLayout(); });
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Game.score = 500;
    Game.livesLost = Game.allowance;
  });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(500);

  const posted = apiHits.filter(h => h.method === 'POST');
  assert.deepEqual(posted, [], 'a practice score was posted to the board');
  assert.equal((boards.get('all') || []).length, 0, 'the board took a practice score');

  const said = await page.evaluate(() => document.getElementById('game_status').textContent);
  assert.match(said, /not saved/i, 'the game over does not say it was practice: ' + said);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a practice run is shorter, because it has fewer levels left to climb', async () => {
  // runTicks used to count from level 1 always, so a run opening at 16 would
  // have sat on the top rung for four minutes with nothing left to climb.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const at = (level) => {
      Game.startLevel = level;
      return {
        run: Game.runTicks(),
        opensAt: Game.levelFor(0),
        topAfter: Game.levelFor(Game.runTicks() - 1)
      };
    };
    const out = { one: at(1), twelve: at(12), top: at(20) };
    // One level's worth of steps, worked out where Game.STEP_MS lives.
    out.oneLevel = Math.round(Ladder.CLIMB_SECONDS * 1000 / Game.STEP_MS);
    Game.startLevel = 1;
    return out;
  });

  assert.equal(m.one.opensAt, 1);
  assert.equal(m.twelve.opensAt, 12, 'a run starting at 12 does not open on 12');
  assert.equal(m.one.topAfter, 20, 'a full run does not end on the top rung');
  assert.equal(m.twelve.topAfter, 20, 'a practice run does not reach the top rung');
  assert.ok(m.twelve.run < m.one.run,
    'a run starting at 12 is no shorter than a run starting at 1');
  assert.equal(m.top.run, m.oneLevel,
    'a run starting at the top is not one level long');
  await context.close();
});


await t('fireflies arrive in numbers at 16, and there are more of them higher up', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    first: Ladder.LEVELS.find(r => r.fireflies).level,
    counts: Ladder.LEVELS.map(r => r.fireflies || 0),
    news: Ladder.at(16).news,
    // They cost no taps of their own, so they must not move the demand sum.
    withFlies: Ladder.meanTaps({ reinforced: 0.27, armoured: 0.16, fireflies: 9 }),
    without: Ladder.meanTaps({ reinforced: 0.27, armoured: 0.16 })
  }));

  assert.equal(m.first, 16, 'fireflies do not start at level 16');
  assert.ok(m.counts[15] > 1, 'level 16 has a single firefly, not fireflies');
  m.counts.forEach((n, i) => {
    if (i + 1 < 16) {
      assert.equal(n, 0, `level ${i + 1} has fireflies before they arrive`);
    } else {
      assert.ok(n > 1, `level ${i + 1} is down to one firefly`);
      assert.ok(n >= m.counts[i - 1], `level ${i + 1} has fewer than level ${i}`);
    }
  });
  assert.ok(m.counts[19] > m.counts[15], 'the swarm never grows');
  assert.ok(Array.isArray(m.news), 'level 16 does not announce them');
  assert.equal(m.withFlies, m.without,
    'fireflies changed what a balloon costs in taps');
  await context.close();
});

await t('the sky is topped up to the number of fireflies, and no further', async () => {
  // A population, not a rate: they are never removed and never reach the top,
  // so once the count is met the spawner has nothing left to do.
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(20);
    Game.entities = [];

    Game.spawnFireflies();
    const first = Game.countOf('firefly');
    for (let i = 0; i < 50; i++) { Game.spawnFireflies(); }
    const after = Game.countOf('firefly');

    // One taken away is replaced; the population is the target.
    const flies = Game.entities.filter(e => e.kind === 'firefly');
    Game.entities.splice(Game.entities.indexOf(flies[0]), 1);
    Game.spawnFireflies();

    return { wanted: Game.rung().fireflies, first, after, topped: Game.countOf('firefly') };
  });

  assert.equal(m.first, m.wanted, 'the sky did not fill to the level\'s number');
  assert.equal(m.after, m.wanted, 'fireflies kept arriving after the sky was full');
  assert.equal(m.topped, m.wanted, 'a firefly that went was not replaced');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a firefly costs a life, once per flare, and cannot be waited out', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(20);
    Game.entities = [];
    Game.spawnFireflies();
    const fly = Game.entities.find(e => e.kind === 'firefly');

    const before = { lost: Game.livesLost, score: Game.score };
    const removed = fly.tapped(Game);
    const out = {
      removed,
      costLife: Game.livesLost - before.lost,
      costScore: Game.score - before.score,
      stillThere: Game.entities.includes(fly),
      goneNow: fly.gone(Game)
    };

    // A second tap while it is still flaring is the same mistake still being
    // made, not a new one. A firefly stays where a bird leaves, so without
    // this a burst of taps at one balloon could take three lives for one
    // error of aim.
    const during = Game.livesLost;
    fly.tapped(Game);
    fly.tapped(Game);
    out.chargedAgainWhileFlaring = Game.livesLost - during;

    // Once it has stopped flaring it is a hazard again.
    for (let i = 0; i < FIREFLY_FLINCH_STEPS + 1; i++) { fly.step(Game, false); }
    const after = Game.livesLost;
    fly.tapped(Game);
    out.chargedAgainAfterwards = Game.livesLost - after;

    // It wanders, stays on screen, and is still there a long time later --
    // which is what makes it a tax rather than an event.
    const from = { x: fly.xcoord, y: fly.ycoord };
    let offScreen = 0;
    for (let i = 0; i < 1200; i++) {
      fly.step(Game, false);
      if (fly.xcoord < 0 || fly.xcoord > Game.width ||
          fly.ycoord < 0 || fly.ycoord > Game.height) { offScreen++; }
    }
    out.wandered = Math.round(Math.hypot(fly.xcoord - from.x, fly.ycoord - from.y));
    out.offScreen = offScreen;
    out.leftAfterAges = fly.gone(Game);

    // A round ending does clear them out.
    for (let i = 0; i < 400; i++) { fly.step(Game, true); }
    out.leftOnRoundEnd = fly.gone(Game);
    return out;
  });

  // It used to cost only the tap. Playing it showed why that was wrong: a tap
  // that vanishes into a firefly is indistinguishable from one that simply
  // missed, so the player learns nothing and the prettiest thing in the sky
  // turns out to be free.
  assert.equal(m.costLife, 1, 'touching a firefly cost no life');
  assert.equal(m.chargedAgainWhileFlaring, 0,
    'a firefly charged twice for one error of aim while it was still flaring');
  assert.equal(m.chargedAgainAfterwards, 1,
    'a firefly that has finished flaring stopped being a hazard');
  assert.equal(m.costScore, 0, 'a firefly scored');
  assert.equal(m.removed, false, 'a firefly popped');
  assert.ok(m.stillThere, 'the firefly was removed by a tap');
  assert.equal(m.goneNow, null, 'the firefly left the moment it was tapped');
  assert.equal(m.offScreen, 0, 'a firefly wandered off the screen');
  assert.ok(m.wandered > 0, 'the firefly never moved, so it can be learned once and ignored');
  assert.equal(m.leftAfterAges, null, 'a firefly can be waited out');
  assert.equal(m.leftOnRoundEnd, 'left', 'fireflies stay after the round is over');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a firefly takes a tap aimed at the balloon beside it', async () => {
  // This is the whole feature: nearest-centre dispatch means a firefly parked
  // next to a balloon quietly takes every sloppy tap aimed at that balloon.
  // What it costs is precision, not recognition.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(20);
    Game.entities = [];

    const balloon = Game.randomBalloon();
    balloon.xcoord = 600;
    balloon.ycoord = 400;
    Game.add(balloon);

    const fly = fireflyConstructor(600 + balloon.size + 18, 400, 20, 0.5, Game.width, Game.height);
    Game.add(fly);

    // Dead centre of the balloon still gets the balloon.
    const onBalloon = Entities.pick(Game.entities, { x: 600, y: 400 });
    // A tap that drifted towards the firefly gets the firefly.
    const drifted = Entities.pick(Game.entities, { x: fly.xcoord, y: fly.ycoord });

    return {
      onBalloon: onBalloon && onBalloon.kind,
      drifted: drifted && drifted.kind,
      layerAbove: fly.layer > balloon.layer
    };
  });

  assert.equal(m.onBalloon, 'balloon', 'a tap on the balloon did not reach it');
  assert.equal(m.drifted, 'firefly', 'a tap that drifted onto a firefly missed it entirely');
  assert.ok(m.layerAbove, 'fireflies should be drawn over balloons, so you can see one coming');
  await context.close();
});


await t('the game records what a run was played with, and only when it knows', async () => {
  // The ladder assumes one pointer at about 2.29 taps a second. Two thumbs on a
  // touchscreen doubles that -- measured, the difference between dying around
  // level 10 and usually finishing -- so the board should not pretend the two
  // are the same achievement.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    const kind = () => {
      Game.pointers = { touch: 0, mouse: 0 };
      return Game;
    };
    const out = {};

    out.nothingSaid = Game.pointerKind.call(kind());
    kind(); for (let i = 0; i < 10; i++) { Game.countPointer('mouse'); }
    out.allMouse = Game.pointerKind();
    kind(); for (let i = 0; i < 10; i++) { Game.countPointer('touch'); }
    out.allTouch = Game.pointerKind();
    kind(); for (let i = 0; i < 10; i++) { Game.countPointer('pen'); }
    out.pen = Game.pointerKind();

    // A laptop with a touchscreen registers the odd stray touch. One is not
    // a mixed run.
    kind();
    for (let i = 0; i < 40; i++) { Game.countPointer('mouse'); }
    Game.countPointer('touch');
    out.strayTouch = Game.pointerKind();

    kind();
    for (let i = 0; i < 6; i++) { Game.countPointer('mouse'); }
    for (let i = 0; i < 4; i++) { Game.countPointer('touch'); }
    out.reallyMixed = Game.pointerKind();

    // An old browser that fires pointerdown without the field says nothing.
    kind(); Game.countPointer(undefined);
    out.unknown = Game.pointerKind();
    return out;
  });

  assert.equal(m.nothingSaid, null, 'a run with no taps claimed a pointer');
  assert.equal(m.allMouse, 'mouse');
  assert.equal(m.allTouch, 'touch');
  assert.equal(m.pen, 'touch', 'a pen is a pointer you aim, like a finger');
  assert.equal(m.strayTouch, 'mouse', 'one stray touch made a whole run mixed');
  assert.equal(m.reallyMixed, 'mixed');
  assert.equal(m.unknown, null, 'an unknown pointer was guessed at rather than left out');
  await context.close();
});

await t('the pointer goes to the board, and is only shown when it is not a mouse', async () => {
  boards.clear();
  apiHits.length = 0;
  const { context, page, errors } = await newGame({ name: 'Toucher' });
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Game.pointers = { touch: 20, mouse: 0 };
    Game.score = 240;
    Game.livesLost = Game.allowance;
  });
  await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: 20000 });
  await page.waitForTimeout(400);

  const posted = apiHits.find(h => h.method === 'POST');
  assert.ok(posted && posted.body, 'no score was posted');
  assert.equal(posted.body.pointer, 'touch', 'the pointer was not sent with the score');
  assert.equal(boards.get('all')[0].pointer, 'touch', 'the board did not keep it');

  // A mouse is the baseline the ladder is calibrated against, so it carries no
  // label; two thumbs is the thing worth flagging. A fifth column would not
  // fit a phone and a marker on every row would be noise.
  const drawn = await page.evaluate(() => [
    Paint.reached({ level: 14, pointer: 'mouse' }),
    Paint.reached({ level: 14, pointer: 'touch' }),
    Paint.reached({ level: 14, pointer: 'mixed' }),
    Paint.reached({ level: 14 }),
    Paint.reached({ level: 20, won: true, pointer: 'touch' }),
    Paint.reached({})
  ]);
  assert.deepEqual(drawn,
    ['L14', 'L14 touch', 'L14 mixed', 'L14', 'WON touch', '\u2014']);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('a real touch is recorded as touch, and a real mouse as mouse', async () => {
  // The tests above call countPointer directly, which leaves the part most
  // likely to break silently untested: whether pointerdown fires at all on the
  // playing screen, and whether it carries a pointerType. If it did not, every
  // score would quietly record nothing.
  const phone = devices['Pixel 7'];
  const touchContext = await browser.newContext({ ...phone });
  const touchPage = await touchContext.newPage();
  await touchPage.addInitScript(() => {
    try { localStorage.setItem('name', 'Toucher'); } catch (e) {}
  });
  await touchPage.goto('http://localhost:8899/', { waitUntil: 'load' });
  await touchPage.waitForTimeout(400);
  const touchPlay = await touchPage.evaluate(() => {
    const r = Play.rect(Game);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await touchPage.touchscreen.tap(touchPlay.x, touchPlay.y);
  await touchPage.waitForTimeout(2600);
  for (let i = 0; i < 5; i++) {
    await touchPage.touchscreen.tap(110 + i * 30, 500);
  }
  const touched = await touchPage.evaluate(() => ({
    screen: Game.screen, pointers: Game.pointers, kind: Game.pointerKind()
  }));
  await touchContext.close();

  const { context, page } = await newGame({ name: 'Mouser' });
  const mousePlay = await page.evaluate(() => {
    const r = Play.rect(Game);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(mousePlay.x, mousePlay.y);
  await page.waitForTimeout(2600);
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(300 + i * 40, 500);
  }
  const moused = await page.evaluate(() => ({
    screen: Game.screen, pointers: Game.pointers, kind: Game.pointerKind()
  }));
  await context.close();

  assert.equal(touched.screen, 'playing', 'the phone never got into a game');
  assert.equal(moused.screen, 'playing', 'the desktop never got into a game');
  assert.ok(touched.pointers.touch >= 5, 'touches were not counted: ' +
    JSON.stringify(touched.pointers));
  assert.equal(touched.pointers.mouse, 0, 'a touch was counted as a mouse');
  assert.equal(touched.kind, 'touch');
  assert.ok(moused.pointers.mouse >= 5, 'clicks were not counted: ' +
    JSON.stringify(moused.pointers));
  assert.equal(moused.pointers.touch, 0, 'a click was counted as a touch');
  assert.equal(moused.kind, 'mouse');

  // The tap that STARTED each game is not counted: it landed on the title
  // screen, and what the board wants is what the run was played with.
  assert.ok(touched.pointers.touch < 7, 'the tap that started the game was counted');
});


await t('janky balloons arrive at 12, and more of the sky wanders higher up', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    first: Ladder.LEVELS.find(r => r.janky).level,
    shares: Ladder.LEVELS.map(r => r.janky || 0),
    unions: Ladder.LEVELS.map(r => (r.janky || 0) + (r.fading || 0)),
    news: Ladder.at(12).news,
    // Wandering costs no extra taps, so it must not move the demand sum.
    withJanky: Ladder.meanTaps({ reinforced: 0.25, armoured: 0.12, janky: 0.9 }),
    without: Ladder.meanTaps({ reinforced: 0.25, armoured: 0.12 })
  }));

  assert.equal(m.first, 12, 'janky balloons do not start at level 12');
  m.shares.forEach((share, i) => {
    if (i + 1 < 12) {
      assert.equal(share, 0, `level ${i + 1} wanders before it should`);
    } else {
      assert.ok(share > 0, `level ${i + 1} lost its janky balloons`);
    }
  });

  // Janky used to be asserted to climb every level. It does not any more, and
  // that is the design rather than a slip: from 14 it hands share to fading,
  // because at the two to four balloons the sky really holds, splitting the
  // awkward share evenly meant neither kind was ever on screen. What may
  // never fall is the two of them TOGETHER.
  m.unions.forEach((union, i) => {
    if (i >= 12) {
      assert.ok(union >= m.unions[i - 1] - 1e-9,
        `level ${i + 1} is less awkward than level ${i}: ${union} against ${m.unions[i - 1]}`);
    }
  });

  // Not most of them: a sky where everything jinks stops reading as "some of
  // these are awkward" and starts reading as the game being unsteady.
  assert.ok(m.shares[19] <= 0.5, 'more than half the sky wanders at the top');
  assert.ok(m.shares[19] > m.shares[11],
    'the top of the ladder wanders no more than level 12 does');
  assert.ok(Array.isArray(m.news), 'level 12 does not announce them');
  assert.equal(m.withJanky, m.without,
    'janky balloons changed what a balloon costs in taps');
  await context.close();
});

await t('a janky balloon cannot leave where you aimed inside a reaction time', async () => {
  // The whole fairness argument. A person needs about 250ms between seeing and
  // tapping; if the balloon is gone from where they aimed by then, the tap was
  // never theirs to land and it reads as cheating rather than as difficult.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    const worst = { share: 0, level: 0, radius: 0 };
    const smallest = { radius: Infinity, drift: 0 };

    for (let level = 12; level <= Ladder.MAX; level++) {
      Game.applyLevel(level);
      for (let i = 0; i < 300; i++) {
        const b = Game.randomBalloon();
        if (!b.janky) { continue; }

        // How far it can travel while a person is deciding, as a share of its
        // own radius. Bigger targets honestly tolerate more movement.
        const reach = b.jinkMax * 7.5;
        const share = reach / b.size;
        if (share > worst.share) {
          worst.share = share;
          worst.level = level;
          worst.radius = b.size;
        }
        if (b.size < smallest.radius) {
          smallest.radius = b.size;
          smallest.drift = b.jinkMax;
        }
      }
    }
    return { worst, smallest, floor: Layout.GRID.minTouchTarget / 2 };
  });

  assert.ok(m.worst.share <= 0.5 + 1e-9,
    `a janky balloon can travel ${(m.worst.share * 100).toFixed(0)}% of its own ` +
    `radius while you decide (level ${m.worst.level}, radius ${m.worst.radius.toFixed(0)})`);
  assert.ok(m.worst.share > 0.4, 'the bound is so tight that nothing really wanders');

  // And the smallest balloon in the game is the case the bound was derived
  // from: at the touch floor it is about 1.5px a step, 44 a second.
  assert.ok(m.smallest.radius <= m.floor * 1.6,
    'no balloon anywhere near the touch floor was sampled');
  assert.ok(m.smallest.drift < 3,
    `the smallest janky balloon drifts ${m.smallest.drift.toFixed(2)}px a step`);
  await context.close();
});

await t('a janky balloon is bigger, and wanders both ways rather than drifting', async () => {
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(20);

    // Same skin on both sides, so the comparison is about jankiness alone.
    const sizes = { janky: [], steady: [] };
    for (let i = 0; i < 1500; i++) {
      const b = Game.randomBalloon();
      if (b.skin !== 1) { continue; }
      (b.janky ? sizes.janky : sizes.steady).push(b.size);
    }
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

    // Watch one wander.
    let b = null;
    for (let i = 0; i < 8000 && !b; i++) {
      const made = Game.randomBalloon();
      if (made.janky && made.skin === 1) { b = made; }
    }
    Game.entities = [b];
    const headings = new Set();
    const speeds = [];
    for (let step = 0; step < 400; step++) {
      b.step(Game, false);
      headings.add(Math.sign(b.xdelta));
      speeds.push(Math.abs(b.xdelta));
    }

    // A janky balloon with skins on keeps the extra size when one comes off.
    // The factor belongs to the balloon, not to the skin it is wearing.
    let thick = null;
    for (let i = 0; i < 8000 && !thick; i++) {
      const made = Game.randomBalloon();
      if (made.janky && made.skin === 3) { thick = made; }
    }
    const beforeTap = thick.size;
    thick.tapped(Game);

    return {
      jankyMean: mean(sizes.janky),
      steadyMean: mean(sizes.steady),
      bothWays: headings.size > 1,
      neverExceeded: Math.max(...speeds) <= b.jinkMax + 1e-9,
      shrankBy: beforeTap / thick.size
    };
  });

  assert.ok(m.jankyMean > m.steadyMean,
    `a janky balloon (${m.jankyMean.toFixed(0)}px) is no bigger than a steady one ` +
    `(${m.steadyMean.toFixed(0)}px); a moving target and a small target are the ` +
    'same tax charged twice');
  assert.ok(m.bothWays, 'it only ever drifts one way, which is a drift and not a wander');
  assert.ok(m.neverExceeded, 'it wandered faster than its own bound allows');
  // Skin 3 is 1.30 of the base and skin 2 is 1.15, so one tap should take
  // exactly that much off and nothing else.
  assert.ok(Math.abs(m.shrankBy - 1.30 / 1.15) < 1e-6,
    `a tap shrank a janky balloon by ${m.shrankBy.toFixed(3)}, not the ` +
    'difference between its two skins');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('fading balloons arrive at 14, and never share a balloon with a janky one', async () => {
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    // The two awkward columns come off ONE roll, so the share of the sky that
    // is awkward at all can be read straight off the table.
    const quirks = { janky: 0, fading: 0, plain: 0 };
    const row = Ladder.at(20);
    for (let i = 0; i < 20000; i++) {
      quirks[Ladder.rollQuirk(row) || 'plain']++;
    }

    return {
      first: Ladder.LEVELS.find(r => r.fading).level,
      shares: Ladder.LEVELS.map(r => r.fading || 0),
      unions: Ladder.LEVELS.map(r => (r.fading || 0) + (r.janky || 0)),
      news: Ladder.at(14).news,
      quirks,
      // Thinning out costs no extra taps, so it must not move the demand sum.
      withFading: Ladder.meanTaps({ reinforced: 0.26, armoured: 0.14, fading: 0.9 }),
      without: Ladder.meanTaps({ reinforced: 0.26, armoured: 0.14 })
    };
  });

  assert.equal(m.first, 14, 'fading balloons do not start at level 14');
  m.shares.forEach((share, i) => {
    if (i + 1 < 14) {
      assert.equal(share, 0, `level ${i + 1} fades before it should`);
    } else {
      assert.ok(share > 0, `level ${i + 1} lost its fading balloons`);
      assert.ok(share >= m.shares[i - 1], `level ${i + 1} fades less than level ${i}`);
    }
  });

  // The ceiling belongs to the UNION of the two columns rather than to either
  // one: a sky where most balloons are awkward in some way stops reading as
  // "some of these are awkward".
  const worst = Math.max(...m.unions);
  assert.ok(worst <= 0.6, `${(worst * 100).toFixed(0)}% of the sky is awkward at the top`);
  assert.ok(m.unions[19] > m.unions[11], 'the sky gets no more awkward than it was at 12');
  assert.ok(Array.isArray(m.news), 'level 14 does not announce them');
  assert.equal(m.withFading, m.without, 'fading changed what a balloon costs in taps');

  // Read off the row rather than written down twice: the split between the two
  // columns is tuned and these numbers move with it. What the test is for is
  // that ONE roll produces both shares faithfully, not what they happen to be.
  const top = { janky: 0.22, fading: 0.34 };
  assert.ok(Math.abs(m.quirks.janky / 20000 - top.janky) < 0.02,
    `janky came out at ${(m.quirks.janky / 20000).toFixed(3)}, not ${top.janky}`);
  assert.ok(Math.abs(m.quirks.fading / 20000 - top.fading) < 0.02,
    `fading came out at ${(m.quirks.fading / 20000).toFixed(3)}, not ${top.fading}`);
  await context.close();
});

await t('the level that announces fading balloons actually has them', async () => {
  // This is the test that caught the arithmetic. The first version of the
  // floor asked every height to survive the opacity of the TOP of the climb,
  // which almost no colour at level 14 can do: the share arrived at 0.008
  // against the 0.12 its row asks for, and the feature did not exist on the
  // level that announces it. A column is worth what it delivers.
  const { context, page } = await newGame();
  const rows = await page.evaluate(() => {
    Game.stopLoop();
    const out = [];
    [14, 17, 20].forEach(level => {
      Game.applyLevel(level);
      let faded = 0;
      const floors = [];
      for (let i = 0; i < 2000; i++) {
        const b = Game.randomBalloon();
        if (b.fading) { faded++; floors.push(b.alphaFloor); }
      }
      floors.sort((a, b) => a - b);
      out.push({
        level,
        wanted: Ladder.at(level).fading,
        got: faded / 2000,
        median: floors.length ? floors[Math.floor(floors.length / 2)] : 1
      });
    });
    return out;
  });

  // Three quarters, and the three quarters is measured rather than picked.
  //
  // Over twenty repeats of this exact count, level 14 delivers 0.114 of the
  // 0.12 its row asks for -- the colour search still loses a few even at four
  // hundred tries -- with a spread that reaches 0.82 of it. A threshold of
  // 0.85 sat inside that noise and failed about one run in eight, which is
  // the third assertion in this feature I have written too tight. What this
  // test is for is catching the feature NOT EXISTING, and when it did not
  // exist it delivered 0.07 of what it asked.
  //
  // The ceiling was the fourth, and it was CI that caught it. Since the 2.2
  // table, over 300 repeats of this count, every level delivers its row's
  // share on average (14: 0.240 of 0.24, 17: 0.301 of 0.30, 20: 0.341 of
  // 0.34) with a spread of 0.010-0.011, and the worst run came in 0.040 over.
  // A ceiling of +0.025 sat 2.2 to 2.4 spreads above the mean: one suite run
  // in 38 failed it, one CI run of eight legs in five. +0.05 sits 4.5 spreads
  // up, and still catches what it is for -- fading applied to everything.
  // The floor has room too: the lowest of the 900 was 0.89 of its row.
  rows.forEach(r => {
    assert.ok(r.got >= r.wanted * 0.75,
      `level ${r.level} asks for ${r.wanted} fading balloons and delivers ${r.got.toFixed(3)}`);
    assert.ok(r.got <= r.wanted + 0.05,
      `level ${r.level} asks for ${r.wanted} fading balloons and delivers ${r.got.toFixed(3)}, too many`);
    // And they have to actually fade. A floor of 0.95 is a feature nobody sees.
    assert.ok(r.median <= 0.75,
      `the middling fading balloon at level ${r.level} only reaches ` +
      `${r.median.toFixed(2)} opacity`);
  });
  await context.close();
});

await t('a fading balloon never drops under 3:1 against the sky it is drawn on', async () => {
  // The whole fairness argument, measured off the painted pixels rather than
  // recomputed from the model that set the floor. WCAG SC 1.4.11 puts a
  // graphical object you have to make out at 3:1, and a balloon is exactly
  // that: the game is finding one and tapping it.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const ratio = (a, b) => {
      const pair = [lum(a), lum(b)].sort((x, y) => y - x);
      return (pair[0] + 0.05) / (pair[1] + 0.05);
    };
    const pixel = (x, y) => {
      const d = Game.ctx.getImageData(
        Math.round(x * Game.dpr), Math.round(y * Game.dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    };

    // The middle of five, not one.
    //
    // At night the sky has STARS in it, and a star is one bright pixel. Read
    // a single pixel and a balloon that happens to pass over one is measured
    // against the star rather than against the sky — which came out at 1.7:1
    // and looked exactly like the game breaking its own bound. It is not: the
    // star is a pixel and the balloon is fifty of them across. A median over
    // a few pixels is what the sky behind a balloon actually is.
    const ground = (x, y) => {
      const around = [[0, 0], [-3, -2], [3, -2], [-3, 2], [3, 2]]
        .map(([dx, dy]) => pixel(x + dx, y + dy));
      return [0, 1, 2].map(c =>
        around.map(p => p[c]).sort((a, b) => a - b)[2]);
    };

    let worst = { ratio: Infinity, level: 0, alpha: 1 };
    let faintest = 1;
    let checked = 0;

    [14, 17, 20].forEach(level => {
      Game.applyLevel(level);

      for (let n = 0; n < 10; n++) {
        let b = null;
        // One skin only: a rim is a stroke in its own colour, and is not part
        // of the gradient the floor was derived from.
        for (let i = 0; i < 3000 && !b; i++) {
          const made = Game.randomBalloon();
          if (made.fading && made.skin === 1) { b = made; }
        }
        if (!b) { continue; }

        // FLOWN, not teleported. A balloon drifts sideways as it rises and
        // works its floor out along the path it is going to take, so dropping
        // it at a height is not the same test at all -- and putting it at an
        // x it was never going to reach is how this test first reported the
        // game failing its own bound.
        Game.entities = [b];

        while (b.ycoord > Game.height * (1 - FADE_HOLD)) {
          b.step(Game, false);
        }

        for (;;) {
          for (let i = 0; i < 8; i++) { b.step(Game, false); }
          // Past the top it stops being drawn at all, and comparing a sky
          // against itself is a perfect 1:1 that looks just like a failure.
          if (b.ycoord <= 0) { break; }
          const r = b.size;
          // The two ends of the gradient: its centre, and a point past the
          // 70% stop that is still inside the balloon's shape.
          // Only spots whose whole neighbourhood is still on the canvas: by
          // the top of the climb the upper one runs off the screen, and
          // reading past the edge gives black for both the sky and the
          // balloon, which compares as a perfect 1:1 and looks exactly like a
          // failure. Rounded to device pixels, because x = 1279.6 on a
          // 1280-wide canvas is off it.
          const on = (x, y) => Math.round(x * Game.dpr) >= 4 &&
            Math.round(y * Game.dpr) >= 4 &&
            Math.round(x * Game.dpr) < Game.canvas.width - 4 &&
            Math.round(y * Game.dpr) < Game.canvas.height - 4;
          const spots = [
            [b.xcoord + r / 3, b.ycoord - r / 3],
            [b.xcoord - r * 0.6, b.ycoord + r * 0.3]
          ].filter(([x, y]) => on(x, y));
          if (!spots.length) { continue; }

          Paint.sky(Game);
          const sky = spots.map(([x, y]) => ground(x, y));
          Paint.entities(Game);
          const drawn = spots.map(([x, y]) => pixel(x, y));

          faintest = Math.min(faintest, b.alpha());
          drawn.forEach((colour, i) => {
            checked++;
            const got = ratio(colour, sky[i]);
            if (got < worst.ratio) {
              worst = { ratio: got, level: level, alpha: b.alpha() };
            }
          });
        }
      }
    });

    return { worst, faintest, checked };
  });

  assert.ok(m.checked > 200, `only ${m.checked} pixels compared`);
  // Three, not a shade under it. The derivation aims above 3:1 by a measured
  // margin precisely so that this, the number on the screen, is the real one.
  assert.ok(m.worst.ratio >= 3,
    `a fading balloon reached ${m.worst.ratio.toFixed(2)}:1 against its sky ` +
    `at level ${m.worst.level}, at ${m.worst.alpha.toFixed(2)} opacity`);
  // And the bound is not vacuous: something really does get faint.
  assert.ok(m.faintest <= 0.7,
    `the faintest balloon anywhere was ${m.faintest.toFixed(2)} opacity`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the fade holds, then falls, and only ever on a fading balloon', async () => {
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(20);

    const climb = (b) => {
      const out = [];
      for (let i = 0; i <= 20; i++) {
        b.ycoord = Game.height * (1 - i / 20);
        out.push(b.alpha());
      }
      return out;
    };

    let fading = null;
    let steady = null;
    for (let i = 0; i < 6000 && !(fading && steady); i++) {
      const made = Game.randomBalloon();
      if (made.fading && !fading) { fading = made; }
      if (!made.fading && !steady) { steady = made; }
    }

    const trace = climb(fading);
    return {
      trace,
      solidFor: (trace.filter(a => a === 1).length - 1) / (trace.length - 1),
      steadyTrace: climb(steady),
      floor: fading.alphaFloor
    };
  });

  assert.equal(m.trace[0], 1, 'a balloon arrives already faded');
  assert.ok(m.solidFor >= 0.45,
    `the fade starts ${(m.solidFor * 100).toFixed(0)}% up the climb, before the ` +
    'balloon has given you a clear look at it');
  m.trace.forEach((a, i) => {
    if (i > 0) {
      assert.ok(a <= m.trace[i - 1] + 1e-9, `the fade goes back up at step ${i}`);
    }
  });
  assert.ok(Math.abs(m.trace[m.trace.length - 1] - m.floor) < 1e-9,
    'it does not reach its floor by the top of the screen');
  assert.deepEqual(m.steadyTrace, m.steadyTrace.map(() => 1),
    'an ordinary balloon fades, and it should cost nothing to be one');
  // There was an assertion here that a fading balloon loses under a tenth of
  // its opacity inside a reaction window. That tenth was a number I made up:
  // the fastest balloons reach 0.13 and nothing ever promised otherwise, so it
  // failed about one run in twelve and had been passing by luck. What the
  // design actually guarantees is the contrast floor, which the test above
  // measures off the screen.
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('the HUD stands on the words rather than lying across the sky', async () => {
  // It used to be one bar the full width of the screen, and the HUD is drawn
  // OVER the play area — so that was a lid on the top of the game. A balloon
  // behind it sat at about 1.4:1 against the sky, under the 3:1 anything you
  // have to find is meant to clear, and balloons escaped through a strip
  // nobody could see into.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    const out = [];

    // A fresh run, a long one, and a phone-sized window, because the widest
    // the score ever gets is what decides how much sky this costs.
    [[1420, 2, 7], [99999, 9, 9]].forEach(state => {
      [1, 14, 20].forEach(level => {
        Game.applyLevel(level);
        Game.measureLayout();
        Game.score = state[0];
        Game.livesLost = state[1];
        Game.allowance = state[2];

        Paint.sky(Game);
        const grounds = Paint.hudGround(Game);
        const plate = Game.layout.hud.plate;
        out.push({
          level,
          score: state[0],
          grounds: grounds.map(g => ({ x: g.x, right: g.x + g.width })),
          covered: grounds.reduce((a, g) => a + g.width, 0) / Game.width,
          clearAbove: plate.y,
          height: plate.height,
          row: Game.layout.hud.y,
          width: Game.width
        });
      });
    });
    return out;
  });

  m.forEach(row => {
    // Sky either side of the words. Not most of the width: the score is the
    // long one and it is allowed to be long, but not to be a lid.
    assert.ok(row.covered <= 0.75,
      `the HUD covers ${(row.covered * 100).toFixed(0)}% of the width at level ` +
      `${row.level} with ${row.score} points`);

    // Clear sky ABOVE the chips, which the old bar did not leave: a balloon
    // escapes through the very top, and that is where it must be visible.
    assert.ok(row.clearAbove > row.height * 0.4,
      `only ${row.clearAbove.toFixed(0)}px of clear sky above the HUD`);

    // Two chips that touch are merged into one, so they can never overlap and
    // show their seams.
    row.grounds.forEach((g, i) => {
      if (i > 0) {
        assert.ok(g.x > row.grounds[i - 1].right,
          `HUD chips overlap at level ${row.level}`);
      }
    });
  });

  // And the narrowest window the game supports, where the runs crowd together
  // and become a bar again.
  //
  // The narrowest window, with the longest score and the most lives it can
  // hold. WHICH width crowds depends on the face and on how wide the runs are
  // — this asserted 390 with Verdana and a spelled-out life count, and both of
  // those have since changed. The behaviour is the thing: runs that would
  // overlap get merged instead. So it is driven to the case that must crowd.
  const narrow = await page.evaluate(() => {
    const was = { w: Game.width, h: Game.height };
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 568, configurable: true });
    Game.applyCanvasSize();
    Game.score = 99999; Game.livesLost = 9; Game.allowance = 9;
    Paint.sky(Game);
    const grounds = Paint.hudGround(Game);
    const got = {
      chips: grounds.length,
      covered: grounds.reduce((a, g) => a + g.width, 0) / Game.width,
      overlap: grounds.some((g, i) => i > 0 && g.x <= grounds[i - 1].x + grounds[i - 1].width)
    };
    Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
    Game.applyCanvasSize();
    return got;
  });

  assert.ok(narrow.chips < 3, 'the crowded runs on a phone did not merge');
  assert.ok(!narrow.overlap, 'merged HUD chips still overlap');
  assert.ok(narrow.covered <= 0.8,
    `the HUD covers ${(narrow.covered * 100).toFixed(0)}% of a phone's width`);
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('the mark II saucer arrives at 18, and asks no more per second than the first', async () => {
  // The whole design of it. A fight that demanded more taps a second than a
  // person can produce would not be a fight, it would be a countdown — so the
  // mark II is not harder per second. It is harder because it is longer,
  // because it moves, and because every one of those seconds is a second the
  // sky goes unwatched.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => ({
    marks: Ladder.LEVELS.map(r => r.bossMark || 1),
    news: Ladder.at(18).news,
    saucers: Ladder.SAUCERS.map(k => ({
      mark: k.mark,
      taps: k.taps,
      perSecond: k.taps / (k.fuse / 30),
      perTap: k.points / k.taps,
      reach: k.reach,
      size: k.size
    })),
    // Every level that brings something now stops to say so.
    breaks: Ladder.LEVELS.filter(r => r.news).map(r => r.level)
  }));

  const first = m.saucers[0];
  const second = m.saucers[1];

  assert.equal(m.marks.filter(mark => mark > 1).length, 3,
    'the mark II turns up on some number of levels other than the last three');
  m.marks.forEach((mark, i) => {
    assert.equal(mark, i + 1 >= 18 ? 2 : 1, `level ${i + 1} sends the wrong saucer`);
  });

  assert.ok(Math.abs(second.perSecond - first.perSecond) < 1e-9,
    `the mark II asks ${second.perSecond.toFixed(2)} taps a second against the ` +
    `first one's ${first.perSecond.toFixed(2)}`);
  assert.ok(second.perSecond < 2.1,
    'a saucer asks for more taps a second than a player has');
  assert.ok(second.taps > first.taps, 'the mark II is not tougher at all');
  assert.ok(second.perTap >= first.perTap,
    'the mark II pays worse per tap than the one it replaces, which is how a ' +
    'player learns to walk away from it');
  assert.ok(second.reach > first.reach && second.size > first.size,
    'the mark II is neither faster nor bigger');
  assert.ok(Array.isArray(m.news), 'level 18 does not announce it');
  assert.equal(m.breaks.length, 8, `${m.breaks.length} breaks in a run, not eight`);

  // And bigger ON A PHONE, which is where it counts: the touch floor is a
  // minimum for keeping a saucer a real target, not a size for both of them
  // to collapse onto.
  const sizes = await page.evaluate(() => {
    const was = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true });
    Game.applyCanvasSize();
    const radius = (mark) => bossConstructor(
      Game.width / 2, Game.height * 0.26, BOSS_BASE_SIZE * Game.ratio,
      Game.width, mark, 0
    ).radius;
    const got = { one: radius(1), two: radius(2), floor: BOSS_MIN_RADIUS };
    Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
    Game.applyCanvasSize();
    return got;
  });

  assert.ok(sizes.one >= sizes.floor, 'a saucer fell under the touch minimum');
  assert.ok(sizes.two > sizes.one * 1.2,
    `on a phone the mark II is ${sizes.two.toFixed(0)}px against the first one's ` +
    `${sizes.one.toFixed(0)}px, which is not bigger in any way you could see`);
  await context.close();
});

await t('a wandering saucer cannot leave where you aimed inside a reaction time', async () => {
  // The same bound a janky balloon lives under, and for the same reason: a
  // target that is gone from where you aimed before you get there was never
  // yours to hit. Half a radius is the room that leaves.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    const out = [];

    [10, 18, 20].forEach(level => {
      Game.applyLevel(level);
      Game.measureLayout();
      Game.entities = [];
      Game.lastBoss = -Infinity;
      Game.spawnBoss();
      const b = Game.entities.find(e => e.kind === 'boss');

      const plate = Game.layout.hud.plate;
      let worstStep = 0;
      let highestRing = Infinity;
      const headings = new Set();
      let was = { x: b.xcoord, y: b.ycoord };
      const from = { x: b.xcoord, y: b.ycoord };
      let spread = { x: 0, y: 0 };

      for (let i = 0; i < Ladder.saucer(b.mark).fuse - 1; i++) {
        b.step(Game, false);
        worstStep = Math.max(worstStep, Math.hypot(b.xcoord - was.x, b.ycoord - was.y));
        highestRing = Math.min(highestRing, b.ycoord - b.radius * 1.25);
        headings.add(Math.sign(Math.round(b.xcoord - was.x)) + ':' +
          Math.sign(Math.round(b.ycoord - was.y)));
        spread.x = Math.max(spread.x, Math.abs(b.xcoord - from.x));
        spread.y = Math.max(spread.y, Math.abs(b.ycoord - from.y));
        was = { x: b.xcoord, y: b.ycoord };
      }

      out.push({
        level, mark: b.mark, radius: b.radius,
        reach: worstStep * REACTION_STEPS / b.radius,
        headings: headings.size,
        spread,
        highestRing,
        hudBottom: plate.y + plate.height
      });
    });
    return out;
  });

  m.forEach(row => {
    assert.ok(row.reach <= 0.5 + 1e-9,
      `the mark ${row.mark} saucer at level ${row.level} can cross ` +
      `${(row.reach * 100).toFixed(0)}% of its own radius while you decide`);

    // The gauge has to be readable, because it is the only clock the player
    // gets: a saucer that parks the top of its fuse ring behind the HUD has
    // taken the deadline away from the person it is timing.
    assert.ok(row.highestRing >= row.hudBottom - 1,
      `the fuse ring reaches ${row.highestRing.toFixed(0)}px, above the HUD at ` +
      `${row.hudBottom.toFixed(0)}px, at level ${row.level}`);

    if (row.mark > 1) {
      assert.ok(row.reach > 0.4, 'the mark II barely moves');
      assert.ok(row.headings > 2,
        `it held ${row.headings} heading(s), which is a slide rather than a wander`);
      assert.ok(row.spread.y > row.radius * 0.5,
        `it moved ${row.spread.y.toFixed(0)}px up and down, which is none to speak of`);
    } else {
      assert.ok(row.spread.y === 0, 'the first saucer started wandering vertically');
    }
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the mark II takes eight taps and pays for them', async () => {
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(18);
    Game.measureLayout();
    Game.entities = [];
    Game.score = 0;
    Game.lastBoss = -Infinity;
    Game.spawnBoss();
    const b = Game.entities.find(e => e.kind === 'boss');

    const stages = [];
    for (let i = 0; i < 8; i++) {
      stages.push({ taps: b.taps, score: Game.score, removed: b.tapped(Game) });
    }
    return {
      stages,
      score: Game.score,
      // It lifts out rather than blinking out, so it is still there for a
      // moment after the last tap.
      stillUp: Game.entities.indexOf(b) >= 0,
      gonePromptly: (function () {
        for (let i = 0; i < 400; i++) { b.step(Game, true); }
        return b.gone(Game) === 'left';
      })()
    };
  });

  assert.equal(m.stages[0].taps, 8, `it arrived with ${m.stages[0].taps} taps on it`);
  assert.deepEqual(m.stages.map(s => s.removed), Array(8).fill(false),
    'a saucer is removed by the tap that kills it rather than lifting out');
  assert.equal(m.score, 20, `destroying it scored ${m.score}`);
  assert.ok(m.stillUp, 'it blinked out from under the finger that beat it');
  assert.ok(m.gonePromptly, 'it never leaves');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('a tapped firefly does something its idle pulse never does', async () => {
  // It used to answer a tap by being 25% bigger for six steps. Measured, that
  // is nothing: it breathes between 0.78 and 1.00 of its size all by itself,
  // so a quarter more is inside the range it moves through anyway, and 200ms
  // is shorter than the quarter second a person needs to notice anything. A
  // player tapping one saw nothing happen and concluded nothing had.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(16);
    Game.entities = [];
    Game.spawnFireflies();
    const fly = Game.entities.find(e => e.kind === 'firefly');
    fly.xcoord = Game.width / 2;
    fly.ycoord = Game.height / 2;
    Game.entities = [fly];

    const lit = () => {
      Paint.sky(Game);
      Paint.entities(Game);
      // Outside anything the idle core ever reaches, inside the flare.
      const d = Game.ctx.getImageData(
        Math.round((fly.xcoord + fly.radius * 1.2) * Game.dpr),
        Math.round(fly.ycoord * Game.dpr), 1, 1).data;
      return Sky.luminance([d[0], d[1], d[2]]);
    };

    // A whole breath, untouched: the brightest that spot ever gets on its own.
    let idle = 0;
    for (let i = 0; i < FIREFLY_PULSE_STEPS * 2; i++) {
      const was = { x: fly.xcoord, y: fly.ycoord };
      fly.step(Game, false);
      fly.xcoord = was.x;
      fly.ycoord = was.y;
      idle = Math.max(idle, lit());
    }

    // And now tapped.
    fly.tapped(Game);
    const startled = lit();

    // GROUND COVERED, not distance from where it started. A firefly wanders,
    // so displacement over sixteen steps depends mostly on which way it
    // happened to be pointing — comparing two of those is comparing two coin
    // flips. Path length is exactly speed per step, so this is deterministic.
    const walk = (who, steps) => {
      let far = 0;
      for (let i = 0; i < steps; i++) {
        const was = { x: who.xcoord, y: who.ycoord };
        who.step(Game, false);
        far += Math.hypot(who.xcoord - was.x, who.ycoord - was.y);
      }
      return far;
    };

    const bolted = walk(fly, FIREFLY_FLINCH_STEPS);
    // The same firefly once it has settled, so nothing but the bolt differs.
    const drifted = walk(fly, FIREFLY_FLINCH_STEPS);

    return { idle, startled, bolted, drifted, flinch: FIREFLY_FLINCH_STEPS, reaction: REACTION_STEPS };
  });

  assert.ok(m.startled > m.idle * 1.8,
    `a tapped firefly reads at ${m.startled.toFixed(3)} where its own breathing ` +
    `already reaches ${m.idle.toFixed(3)} — that is not an answer, it is the pulse`);
  assert.ok(m.flinch >= m.reaction,
    `the flinch lasts ${m.flinch} steps, under the ${m.reaction} a person ` +
    'needs to notice it at all');
  // The bolt decays from 3.2x to 1x across the flinch, so the ground covered
  // should be about twice a settled firefly's. Well clear of 1, which is the
  // only thing that would mean it did not bolt at all.
  assert.ok(m.bolted > m.drifted * 1.6,
    `it covered ${m.bolted.toFixed(0)}px when startled against ${m.drifted.toFixed(0)}px ` +
    'settled, so nothing about being tapped got it out of the way');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('birds cross where the taps are, not where nobody is aiming', async () => {
  // The rule "do not touch the birds, they cost a life" was one the game
  // announced and never enforced: over 3,583 played taps with no avoidance at
  // all, not one landed on a bird, because the nearest was a median 400px
  // away. Birds were flying through the part of the sky nobody was reaching
  // into. They still enter a full wingspan off the canvas — being visible
  // before you can be punished by one is the rule this rests on.
  const { context, page, errors } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    Game.applyLevel(12);
    Game.measureLayout();

    // A sky with balloons in it, held still, and a lot of birds released into
    // it: how far is a new bird from the nearest balloon's height?
    const gaps = [];
    let underHud = 0;
    const plate = Game.layout.hud.plate;

    for (let n = 0; n < 300; n++) {
      Game.entities = [];
      for (let i = 0; i < 4; i++) { Game.add(Game.randomBalloon()); }
      Game.entities.forEach(e => {
        if (e.kind === 'balloon') { e.ycoord = Game.height * (0.05 + 0.6 * Math.random()); }
      });
      const balloons = Game.entities.filter(e => e.kind === 'balloon');

      let bird = null;
      for (let i = 0; i < 4000 && !bird; i++) {
        Game.spawnBird();
        bird = Game.entities.find(e => e.kind === 'bird');
      }
      if (!bird) { continue; }
      if (bird.ycoord - bird.radius < plate.y + plate.height) { underHud++; }
      gaps.push(Math.min(...balloons.map(b => Math.abs(b.ycoord - bird.ycoord))));
      // It has to come in from off the canvas, every time.
      if (bird.xcoord > 0 && bird.xcoord < Game.width) { gaps.push(Infinity); }
    }

    gaps.sort((a, b) => a - b);
    const crossing = Game.width / (BIRD_SPEED * Game.ratio) / 30;
    return {
      median: gaps[Math.floor(gaps.length / 2)],
      near: gaps.filter(g => g < 60).length / gaps.length,
      offCanvas: gaps.every(g => g !== Infinity),
      underHud,
      crossingSeconds: crossing,
      samples: gaps.length
    };
  });

  assert.ok(m.samples > 200, `only ${m.samples} birds sampled`);
  assert.ok(m.offCanvas, 'a bird appeared inside the canvas rather than flying into it');
  assert.equal(m.underHud, 0, `${m.underHud} birds crossed behind the HUD`);
  assert.ok(m.near > 0.25,
    `only ${(m.near * 100).toFixed(0)}% of birds cross within 60px of a balloon's ` +
    'height, which is the part of the sky taps actually happen in');
  // And it lingers long enough to be in the way rather than flicking past.
  assert.ok(m.crossingSeconds > 6,
    `a bird crosses in ${m.crossingSeconds.toFixed(1)}s, which is barely time to be ` +
    'anywhere near a tap');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('no balloon outlives the level it was born in', async () => {
  // The rung's speed column used to set only the FASTEST a balloon rose: the
  // floor was an absolute 0.25 pixels a step, the same crawl at level 20 as at
  // level 1. A quarter of level 1's balloons took over twenty seconds to cross
  // and four in a hundred took over a minute, on a screen where a level lasts
  // twenty. It cost twice, because the spawn throttle counts balloons — a
  // ninety-six-second loiterer holds a slot for five levels and suppresses the
  // arrivals that would have filled the sky it is making look empty.
  const { context, page } = await newGame();
  const m = await page.evaluate(() => {
    Game.stopLoop();
    const rows = [];
    for (let level = 1; level <= Ladder.MAX; level++) {
      Game.applyLevel(level);
      let slowest = 0;
      let fastest = Infinity;
      for (let i = 0; i < 600; i++) {
        const b = Game.randomBalloon();
        // Skin 1 only: a reinforced balloon is deliberately slower still, and
        // it is allowed to be — it is paying for the taps it costs.
        if (b.skin !== 1) { continue; }
        const secs = Game.height / Math.abs(b.delta) / 30;
        slowest = Math.max(slowest, secs);
        fastest = Math.min(fastest, secs);
      }
      rows.push({ level, slowest, fastest });
    }
    return {
      rows,
      climb: Ladder.CLIMB_SECONDS,
      share: BALLOON_SLOWEST,
      // What the share is derived from, so a change to either end shows up
      // here rather than quietly widening the tail again.
      derived: REFERENCE_HEIGHT /
        (Ladder.at(1).speed * (1000 / Game.STEP_MS) * Ladder.CLIMB_SECONDS)
    };
  });

  assert.ok(Math.abs(m.share - m.derived) < 0.005,
    `the slowest share is ${m.share} where the ladder's own pace gives ` +
    `${m.derived.toFixed(3)} — one of them has moved`);

  m.rows.forEach(row => {
    assert.ok(row.slowest <= m.climb + 0.5,
      `the slowest balloon at level ${row.level} takes ${row.slowest.toFixed(1)}s ` +
      `to cross, and a level lasts ${m.climb}s`);
    // And the sky is not uniform: variety is the point of a spread at all.
    assert.ok(row.slowest > row.fastest * 1.5,
      `every balloon at level ${row.level} rises at nearly the same speed`);
  });
  await context.close();
});


await t('a pause is a resource, and it gives itself back', async () => {
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.screen === 'playing', null, { timeout: SKY_FILLS });

  const m = await page.evaluate(() => {
    Game.stopLoop();
    const out = { budget: Game.PAUSES, seconds: Game.PAUSE_SECONDS, spent: [] };

    for (let i = 0; i < Game.PAUSES + 2; i++) {
      Game.enter('playing');
      const took = Game.askPause();
      out.spent.push({ took, left: Game.pausesLeft, screen: Game.screen });
    }

    // Wound back, and run down to nothing: it resumes on its own.
    Game.enter('playing');
    Game.pausesLeft = 1;
    Game.askPause();
    const steps = Game.pauseSteps;
    let ticks = 0;
    while (Game.screen === 'paused' && ticks < steps * 2) {
      Screens.paused.update(Game);
      ticks++;
    }
    out.resumedAfter = ticks;
    out.startedAt = steps;
    out.backTo = Game.screen;
    return out;
  });

  assert.equal(m.spent.filter(s => s.took).length, m.budget,
    `a run got ${m.spent.filter(s => s.took).length} pauses, not ${m.budget}`);
  assert.deepEqual(m.spent.map(s => s.left), [2, 1, 0, 0, 0],
    'the count of pauses left does not go down one at a time and stop');
  assert.equal(m.spent[m.budget].screen, 'playing',
    'a pause was taken after the last one had been spent');

  // It runs out on its own. That is the difference between a pause and a stop.
  assert.equal(m.backTo, 'playing', 'a pause never gave itself back');
  assert.equal(m.resumedAfter, m.startedAt,
    `it resumed after ${m.resumedAfter} steps, not the ${m.startedAt} it promised`);
  assert.equal(m.startedAt, Math.round(m.seconds * 1000 / (1000 / 30)),
    'the pause length does not match the seconds it is documented as');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('a pause hides the sky, and looking away costs nothing', async () => {
  // The abuse a pause button invites is not that it is long, it is that it is
  // a free look at where everything is. A limit on how OFTEN you may study the
  // sky is not a limit on studying it, so the sky is not drawn at all.
  const { context, page, errors } = await newGame();
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => Game.entities.length > 2, null, { timeout: SKY_FILLS });

  const m = await page.evaluate(() => {
    Game.stopLoop();

    // What the paused screen draws, by what it asks the entities to do.
    let drew = 0;
    Game.entities.forEach(e => {
      const was = e.draw;
      e.draw = function () { drew++; return was.apply(e, arguments); };
    });

    Game.askPause();
    Screens.paused.draw(Game);
    const whileAsked = drew;

    // And a pause that came from looking away: free, and it waits.
    Game.enter('playing');
    const before = Game.pausesLeft;
    Game.askedToPause = false;
    Game.enter('paused');
    const idle = { cost: before - Game.pausesLeft, steps: Game.pauseSteps };
    for (let i = 0; i < 2000; i++) { Screens.paused.update(Game); }

    return {
      drewWhilePaused: whileAsked,
      entities: Game.entities.length,
      idleCost: idle.cost,
      stillPaused: Game.screen === 'paused'
    };
  });

  assert.ok(m.entities > 2, 'nothing was in the sky to hide');
  assert.equal(m.drewWhilePaused, 0,
    `the paused screen drew ${m.drewWhilePaused} things from the sky`);
  assert.equal(m.idleCost, 0, 'looking away spent one of the pauses');
  assert.ok(m.stillPaused,
    'a pause that came from looking away resumed itself, so it can be used as a free one');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});

await t('the About screen says what the tables say, and there is a way back', async () => {
  // Every number on it is read from the table that decides it. A rules page
  // that goes stale is worse than no rules page: it is one that lies.
  const { context, page, errors } = await newGame();

  const m = await page.evaluate(() => {
    const words = Layout.about()
      .map(s => s.heading + ' ' + s.lines.join(' ')).join(' ');
    Game.enter('about');
    Game.paint();
    return {
      screen: Game.screen,
      words,
      sections: Layout.about().length,
      said: document.getElementById('game_status').textContent,
      chipOnTitle: Game.layout.targets.some(t => t.id === 'about')
    };
  });

  assert.equal(m.screen, 'about', 'the About chip did not open the About screen');
  assert.ok(m.chipOnTitle, 'there is no way in to the About screen');
  assert.ok(m.sections >= 4, `only ${m.sections} sections of rules`);

  // Drawn from the tables rather than written down twice.
  const facts = await page.evaluate(() => ({
    levels: Ladder.MAX,
    climb: Ladder.CLIMB_SECONDS,
    pauses: Game.PAUSES,
    pauseSeconds: Game.PAUSE_SECONDS,
    bossTaps: Ladder.saucer(1).taps,
    markTwoTaps: Ladder.saucer(2).taps
  }));
  Object.entries(facts).forEach(([what, value]) => {
    assert.ok(m.words.includes(String(value)),
      `the About screen never mentions ${what} (${value}), so it is not reading the table`);
  });

  // And it is read out, because it is nothing but text.
  assert.ok(m.said.length > 200, 'the About screen is silent: ' + m.said);

  const back = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return Game.screen;
  });
  assert.equal(back, 'title', 'Escape does not leave the About screen');
  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await t('turning the phone mid-game keeps the sky where it was', async () => {
  // A rotation is not a resize, it is a different window. Measured before this
  // was handled: turning a phone upright mid-game put EVERY balloon in the sky
  // past the right edge — invisible, untappable, and still costing a life each
  // when they reached the top — and more than doubled how long one took to
  // cross, because the rise had been worked out for the old height.
  const { context, page, errors } = await newGame({ width: 844, height: 390 });
  await page.keyboard.press(' ');
  await page.waitForTimeout(2500);
  await page.waitForFunction(
    () => Game.entities.filter(e => e.kind === 'balloon').length >= 3,
    null, { timeout: SKY_FILLS });

  const read = () => page.evaluate(() => {
    const share = e => ({
      kind: e.kind,
      x: +(e.xcoord / Game.width).toFixed(3),
      y: +(e.ycoord / Game.height).toFixed(3),
      cross: +(Game.height / Math.abs(e.delta || 1) / 30).toFixed(1)
    });
    return {
      width: Game.width,
      height: Game.height,
      balloons: Game.entities.filter(e => e.kind === 'balloon').map(share),
      offScreen: Game.entities.filter(e =>
        e.xcoord < 0 || e.xcoord > Game.width).length
    };
  });

  await page.evaluate(() => Game.stopLoop());
  const before = await read();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const after = await read();

  assert.ok(before.balloons.length >= 3, 'nothing was in the sky to turn');
  assert.ok(after.width < after.height, 'the window did not actually turn');
  assert.equal(after.offScreen, 0,
    `${after.offScreen} things were left outside the window by the turn`);

  // Same share of the sky, and the same time left to reach the top. Rounding
  // to three places is the width of the check: this is proportional, not
  // approximate.
  assert.deepEqual(after.balloons.map(b => [b.x, b.y]),
    before.balloons.map(b => [b.x, b.y]),
    'the balloons did not keep their place in the sky');
  assert.deepEqual(after.balloons.map(b => b.cross),
    before.balloons.map(b => b.cross),
    'the balloons changed speed when the window did');

  assert.deepEqual(errors, [], errors.join(' | '));
  await context.close();
});


await browser.close();
server.close();

console.log('\n' + pass + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
