/**
 * Plays the game with a bot that has human limits, and reports what happened.
 *
 * This is a measuring instrument, not a test: it asserts nothing and it is not
 * part of `npm test`. Its job is to answer questions about tuning that reading
 * the code does not, by holding the player constant and letting the four
 * difficulties differ.
 *
 * The bot acts on what it saw REACTION ms ago, so it aims where a balloon was
 * rather than where it is. That is the error a person makes against a rising
 * target, and it is what makes faster balloons genuinely harder rather than
 * just differently numbered.
 *
 *   npm run playtest
 *   npm run playtest -- --runs=5 --cap=120 --reaction=200
 *   npm run playtest -- --width=390 --height=844 --port=8911
 *
 * What it found on first use, against master at the time:
 *   - All four difficulties played identically. BALLOON_FREQUENCY and
 *     BALLOON_SPEED were shared globals rather than per-level, so only lives
 *     and a slow ramp differed between them. Both now live in the difficulty
 *     table, and this harness is what says whether that was enough.
 *   - 11 of 12 games survived a 70 second cap, VHard included, and that level
 *     ends on one escaped balloon.
 *   - Balloon speed spans 23:1, so the slowest balloon takes 97 seconds to
 *     cross the screen and the fastest 4.2.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../test/helpers/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript',
  '.css': 'text/css', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.png': 'image/png'
};

function flag(name, fallback) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const OPTIONS = {
  runs: Number(flag('runs', 3)),
  capMs: Number(flag('cap', 420)) * 1000,
  width: Number(flag('width', 1280)),
  height: Number(flag('height', 720)),
  // So several viewport sizes can be measured concurrently.
  port: Number(flag('port', 8910)),
  // A person needs about this long to see a balloon and act on it.
  reaction: Number(flag('reaction', 250)),
  // Pointing is not pixel perfect.
  aimError: Number(flag('aim', 12)),
  // Nobody sustains more than roughly 3.5 aimed clicks a second.
  interval: Number(flag('interval', 280))
};

const BOT = (o) => `
(() => {
  const REACTION = ${o.reaction}, AIM_ERROR = ${o.aimError}, INTERVAL = ${o.interval};
  const history = [];
  const seen = new Map();
  window.__stats = { clicks: 0, hits: 0, lifetimes: [], sky: [], byLevel: {} };

  setInterval(() => {
    if (!Game.entities) return;
    const balloons = Game.entities.filter(e => e.kind === 'balloon');
    // The entity itself, not a copy of where it was. Deciding what to go for
    // is what the reaction delay applies to; where to put the finger is not,
    // because a person tracks a thing that is moving steadily.
    history.push({
      t: Date.now(),
      balloons: balloons.map(b => ({ ref: b, x: b.xcoord, y: b.ycoord }))
    });
    while (history.length > 40) history.shift();

    // How full the sky is. Score cannot tell an easy level from a middling
    // one, because a player who is already clicking as fast as they can pops
    // the same number either way; what changes is how much is coming at them.
    if (Game.screen === 'playing') {
      window.__stats.sky.push(balloons.length);

      // And how full it is PER LEVEL. Ladder.demand computes arrivals against a
      // full sky of MAX_BALLOONS, which the game never reaches — so every
      // demand figure in the ladder has been understated by the difference.
      // This is the measurement that replaces the assumption.
      const bucket = window.__stats.byLevel[Game.level] ||
        (window.__stats.byLevel[Game.level] = []);
      bucket.push(balloons.length);
    }

    // How long each balloon is actually on screen: the player's real window.
    const now = Date.now();
    balloons.forEach(b => { if (!seen.has(b)) seen.set(b, now); });
    for (const [b, born] of seen) {
      if (!Game.entities.includes(b)) {
        window.__stats.lifetimes.push((now - born) / 1000);
        seen.delete(b);
      }
    }
  }, 40);

  setInterval(() => {
    if (Game.screen !== 'playing' || !Game.entities || !Game.entities.length) return;

    const cutoff = Date.now() - REACTION;
    let memory = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].t <= cutoff) { memory = history[i]; break; }
    }
    if (!memory || !memory.balloons.length) return;

    // Go for whatever looked closest to escaping, a reaction time ago.
    const target = memory.balloons.reduce((a, b) => (b.y < a.y ? b : a));
    if (!Game.entities.includes(target.ref)) return;

    // And aim where it is NOW. Aiming at the remembered position instead meant
    // aiming some sixty pixels below the balloon at the upper levels, which the
    // old bounding-box hit test quietly absorbed: the box ran 1.4 radii below
    // the centre. Against the balloon's real outline those taps land on sky,
    // so the harness was measuring its own failure to track rather than the
    // game's difficulty.
    const aimX = target.ref.xcoord;
    const aimY = target.ref.ycoord;
    const before = Game.score;
    Game.canvas.dispatchEvent(new MouseEvent('click', {
      clientX: aimX + (Math.random() * 2 - 1) * AIM_ERROR,
      clientY: aimY + (Math.random() * 2 - 1) * AIM_ERROR,
      bubbles: true
    }));
    window.__stats.clicks++;
    if (Game.score > before) window.__stats.hits++;
  }, INTERVAL);
})();
`;

function serve(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

const server = await serve(OPTIONS.port);
const browser = await launchBrowser();

/** One game, played start to finish. Games run in parallel. */
async function playGame(index) {
  {
    const context = await browser.newContext({
      viewport: { width: OPTIONS.width, height: OPTIONS.height }
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem('name', 'Bot');
      } catch (e) { /* storage blocked; the game copes */ }
    });

    await page.goto(`http://localhost:${OPTIONS.port}/`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.evaluate(BOT(OPTIONS));
    await page.keyboard.press(' ');
    await page.waitForTimeout(2300); // the countdown

    const started = Date.now();
    await page.waitForFunction(() => Game.screen === 'gameover', null, { timeout: OPTIONS.capMs })
      .catch(() => { /* survived the cap, which is itself a result */ });

    const result = await page.evaluate(() => ({
      score: Game.score,
      lost: Game.lostBalloons,
      // The allowance rather than the constant: a run that reached 12, 15 or 18
      // was handed a life there, and a table saying 5 would be hiding it.
      lives: Game.allowance,
      ended: Game.screen === 'gameover',
      // A run can now end two ways, and the screen alone cannot tell them
      // apart — surviving level 20 and dying on it both land on gameover.
      won: Game.won === true,
      time: Game.end_time ? parseFloat(Game.end_time) : null,
      // How far up the ladder the run got: the number this harness exists to
      // report now that a game is twenty rungs climbed with time.
      rung: Game.level,
      stats: window.__stats
    }));

    result.run = index + 1;
    result.wall = Math.round((Date.now() - started) / 100) / 10;
    await context.close();
    return result;
  }
}

const settled = await Promise.all(
  Array.from({ length: OPTIONS.runs }, (unused, i) => playGame(i))
);
await browser.close();
server.close();

// ---------------------------------------------------------------- report

const round = n => (Math.round(n * 10) / 10).toString();
const all = settled;

console.log(
  `\nbot: ${OPTIONS.reaction}ms reaction, ±${OPTIONS.aimError}px aim, ` +
  `${Math.round(1000 / OPTIONS.interval * 10) / 10} clicks/sec ` +
  `· ${OPTIONS.width}×${OPTIONS.height} · ${OPTIONS.capMs / 1000}s cap\n`
);
console.log('run   lives  survived   points  pops/tap   sky    lost   rung   outcome');

const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

settled.forEach(r => {
  const accuracy = r.stats.clicks ? (r.stats.hits / r.stats.clicks * 100) : 0;
  console.log(
    String(r.run).padEnd(5),
    String(r.lives).padEnd(6),
    (round(r.time !== null ? r.time : r.wall) + 's').padEnd(10),
    String(r.score).padEnd(7),
    (round(accuracy) + '%').padEnd(10),
    round(mean(r.stats.sky)).padEnd(6),
    String(r.lost).padEnd(6),
    String(r.rung).padEnd(6),
    r.won ? 'WON' : (r.ended ? 'died' : 'survived the cap')
  );
});

const won = all.filter(r => r.won).length;
const capped = all.filter(r => !r.ended).length;
console.log(
  `\n${won} of ${all.length} games were won; ${capped} hit the cap without ending.`
);

// A run that hits the cap says nothing about where the ladder would have ended
// it, which is the number this harness exists to report.
if (capped > 0) {
  console.log(
    'A run that hits the cap is not a result: raise --cap above ' +
    'Ladder.MAX × Ladder.CLIMB_SECONDS so every game can finish.'
  );
}

// The occupancy curve: what Ladder.demand should be dividing by.
const occupancy = {};
all.forEach(r => {
  Object.entries(r.stats.byLevel).forEach(([level, samples]) => {
    (occupancy[level] || (occupancy[level] = [])).push(...samples);
  });
});
const levels = Object.keys(occupancy).map(Number).sort((a, b) => a - b);
if (levels.length) {
  console.log('\nhow full the sky actually is, per level (MAX_BALLOONS is 20):');
  console.log(levels.map(l => `${l}:${round(mean(occupancy[l]))}`).join('  '));
}

const lifetimes = all.flatMap(r => r.stats.lifetimes).sort((a, b) => a - b);
if (lifetimes.length) {
  const at = q => round(lifetimes[Math.floor(lifetimes.length * q)]);
  console.log(
    `\nballoon time on screen across ${lifetimes.length} balloons: ` +
    `median ${at(0.5)}s, fastest 10% ${at(0.1)}s, slowest 10% ${at(0.9)}s`
  );
}
