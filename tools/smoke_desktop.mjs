/** Integration test of our built Windows exe, using its isolated WebView2 CDP. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { root } from './itch.mjs';

if (process.platform !== 'win32') throw new Error('Windows desktop smoke is Windows-only');
const executable = path.resolve(process.argv[2] || path.join(root, 'desktop/src-tauri/target/release/baloncelli.exe'));
assert.ok(existsSync(executable), 'Build the desktop app first');
const profile = mkdtempSync(path.join(tmpdir(), 'baloncelli-desktop-smoke-'));
const screenshots = path.join(root, 'dist-itch', 'desktop-smoke');
mkdirSync(screenshots, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
let running;
let browser;
const errors = [];
let interceptedPosts = 0;
function check(condition, label) { assert.ok(condition, label); console.log(`PASS ${label}`); }
async function launch() {
  running = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    WEBVIEW2_USER_DATA_FOLDER: profile } });
  running.on('error', error => errors.push(String(error)));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (running.exitCode !== null) throw new Error(`Desktop app exited ${running.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; } } catch {}
    await sleep(200);
  }
  assert.ok(ready, 'WebView2 did not expose the test-only local CDP port');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let i = 0; i < 60; i++) {
    page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('http://tauri.localhost'));
    if (page) break;
    await sleep(200);
  }
  assert.ok(page, 'No game page at the packaged app origin');
  page.on('pageerror', error => errors.push(String(error)));
  await page.context().route('https://baloncelli.netlify.app/api/scores', async route => {
    if (route.request().method() === 'POST') interceptedPosts++;
    await route.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } });
  });
  await page.waitForFunction(() => window.Game && Game.screen, null, { polling: 100 });
  return page;
}
async function quit() {
  await browser?.close().catch(() => {});
  browser = null;
  if (running && running.exitCode === null) {
    const proc = running;
    const exited = new Promise(resolve => proc.once('exit', resolve));
    // Only the exe process created above; non-forced taskkill sends WM_CLOSE.
    spawnSync('taskkill', ['/PID', String(proc.pid)], { windowsHide: true, stdio: 'ignore' });
    await Promise.race([exited, sleep(10000)]);
    if (proc.exitCode === null) { proc.kill(); throw new Error('App did not close normally'); }
  }
  running = null;
  await sleep(1500);
}
try {
  let page = await launch();
  const first = await page.evaluate(() => ({ origin: location.origin, screen: Game.screen,
    width: innerWidth, height: innerHeight, url: Scores.URL, fonts: document.fonts.check('16px Fredoka') }));
  check(first.origin === 'http://tauri.localhost', 'game assets use the packaged app origin');
  check(first.width === 1280 && first.height === 800, 'native viewport opens at 1280x800');
  check(first.url === 'https://baloncelli.netlify.app/api/scores', 'scores URL is initialized before scripts load');
  check(first.fonts, 'bundled Fredoka font loads');
  check(first.screen === 'name', 'fresh temporary profile asks for a name');
  const field = await page.evaluate(() => {
    const r = document.getElementById('player_name').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(field.x, field.y);
  await page.waitForFunction(() => document.activeElement?.id === 'player_name', null, { polling: 100 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Desktop smoke');
  const typedName = await page.evaluate(() => document.getElementById('player_name').value);
  check(typedName === 'Desktop smoke', `name field receives typed text (${typedName})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Game.screen === 'title', null, { polling: 100 });
  const savedName = await page.evaluate(() => Game.name);
  check(savedName === 'Desktop smoke', `real keyboard name entry works (${savedName})`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => Game.screen === 'playing', null, { polling: 100 });
  await page.waitForFunction(() => Game.entities.some(e => e.kind === 'balloon' && e.ycoord > Game.layout.playfield.y + 35 && e.ycoord < Game.height - 60), null, { polling: 100, timeout: 20000 });
  const balloon = await page.evaluate(() => {
    Game.stopLoop();
    const b = Game.entities.find(e => e.kind === 'balloon' && e.ycoord > Game.layout.playfield.y + 35 && e.ycoord < Game.height - 60);
    return { x: b.xcoord, y: b.ycoord, score: Game.score };
  });
  await page.mouse.click(balloon.x, balloon.y);
  check(await page.evaluate(score => Game.score > score && Game.screen === 'playing', balloon.score), 'pointer pops a visible balloon and increases score');
  check(await page.evaluate(() => Game.layout.hud.pause.y + Game.layout.hud.pause.height <= Game.layout.playfield.y), 'controls remain outside the playable sky');
  await page.evaluate(() => Game.paint());
  await page.screenshot({ path: path.join(screenshots, 'windows-gameplay.png') });
  const quitBox = await page.evaluate(() => Game.layout.hud.quit);
  await page.mouse.click(quitBox.x + quitBox.width / 2, quitBox.y + quitBox.height / 2);
  await page.waitForFunction(() => Game.screen === 'confirmQuit', null, { polling: 100 });
  const yes = await page.evaluate(() => Game.layout.quitYes);
  await page.mouse.click(yes.x + yes.width / 2, yes.y + yes.height / 2);
  await page.waitForFunction(() => Game.screen === 'gameover', null, { polling: 100 });
  await page.waitForFunction(() => !Scores.submitted || !!Scores.board, null, { polling: 100, timeout: 3000 }).catch(() => {});
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem(Scores.HISTORY_KEY) || '[]'));
  check(history.length === 1 && history[0].score > 0, 'completed run is stored in local history');
  check(interceptedPosts > 0, 'smoke score submission is intercepted, never posted to production');
  await quit();
  page = await launch();
  check(await page.evaluate(() => Game.name === 'Desktop smoke' && Game.screen === 'title'), 'name survives a clean app restart');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem(Scores.HISTORY_KEY) || '[]').length === 1), 'local history survives restart');
  check(readdirSync(profile).length > 0, 'the app used the temporary profile');
  check(errors.length === 0, `no script/process errors: ${errors.join('; ')}`);
  await quit();
  console.log(`PASS desktop smoke; profile retained at ${profile}`);
} finally {
  await browser?.close().catch(() => {});
  if (running?.exitCode === null) running.kill();
}
