import assert from 'node:assert/strict';
import handler from '../netlify/functions/scores.mts';
import { calls, __reset } from './helpers/blobs-mock.mjs';

const ctx = (c = 'production') => ({ params: {}, deploy: { context: c } });
const get = (c) => handler(new Request('https://x/api/scores'), ctx(c));
const post = (body, c) => handler(new Request('https://x/api/scores', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body)
}), ctx(c));

let pass = 0;
const t = async (name, fn) => { await fn(); console.log('  ok  ' + name); pass++; };

__reset();

await t('the board answers something that is not the website', async () => {
  // The game shares an origin with this function and never needed CORS. An
  // Android build with the assets on the device does not share an origin with
  // anything, so without these headers it could neither read the board nor
  // post to it.
  const r = await get();
  assert.equal(r.headers.get('access-control-allow-origin'), '*',
    'a build that is not the website cannot read the board');

  // The preflight a cross-origin POST of JSON always makes first.
  const pre = await handler(new Request('https://x/api/scores', {
    method: 'OPTIONS',
    headers: { origin: 'https://appassets.androidplatform.net' }
  }), ctx());
  assert.equal(pre.status, 204, 'the preflight is refused, so the POST never happens');
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  assert.match(pre.headers.get('access-control-allow-methods') || '', /POST/);
  assert.match(pre.headers.get('access-control-allow-headers') || '', /content-type/);

  // And opening it changed nothing about what it will accept: CORS is a rule
  // browsers apply to each other, not a lock. The validation is the lock.
  const junk = await post({ name: 'x', score: 'not a number' });
  assert.equal(junk.status, 400, 'a bad score is still accepted');
});

await t('GET on an empty board returns []', async () => {
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
});

await t('POST stores a score and returns the board', async () => {
  const r = await post({ name: 'Diego', score: 42 });
  assert.equal(r.status, 200);
  const board = await r.json();
  assert.equal(board.length, 1);
  assert.equal(board[0].name, 'Diego');
  assert.equal(board[0].score, 42);
  assert.match(board[0].score_day, /^\d{4}-\d{2}-\d{2}$/);
});

await t('GET reads back what POST wrote', async () => {
  const board = await (await get()).json();
  assert.equal(board.length, 1);
  assert.equal(board[0].score, 42);
});

await t('board is sorted by score descending', async () => {
  await post({ name: 'low', score: 1 });
  await post({ name: 'high', score: 999 });
  const board = await (await get()).json();
  assert.deepEqual(board.map(e => e.score), [999, 42, 1]);
});

await t('board is capped at 10 entries, keeping the highest', async () => {
  for (let i = 0; i < 20; i++) await post({ name: 'p' + i, score: 1000 + i });
  const board = await (await get()).json();
  assert.equal(board.length, 10);
  assert.equal(board[0].score, 1019);
  assert.equal(board[9].score, 1010);
});

await t('there is one board, not one per difficulty', async () => {
  // Four boards could not be compared with each other: a score on Easy and a
  // score on VHard were different games. The route carries no difficulty now.
  assert.equal((await get()).status, 200);
  const posted = await (await post({ name: 'only', score: 999999 })).json();
  const fetched = await (await get()).json();
  assert.deepEqual(fetched, posted,
    'what a POST returns and what a GET reads are not the same board');
  assert.equal(fetched[0].name, 'only');
});

await t('invalid scores are rejected with 400', async () => {
  for (const bad of [-1, 1.5, NaN, 'abc', null, undefined, 1e9, Infinity]) {
    const r = await post({ name: 'x', score: bad });
    assert.equal(r.status, 400, 'expected 400 for score ' + String(bad));
  }
});

await t('malformed JSON body is rejected with 400', async () => {
  const r = await post('not json at all');
  assert.equal(r.status, 400);
});

await t('names are sanitised and capped', async () => {
  __reset();
  const nasty = "  Very\u0000Long\nName That Goes On Forever And Ever  ";
  await post({ name: nasty, score: 5 });
  const board = await (await get()).json();
  assert.ok(!/[\u0000-\u001F\u007F]/.test(board[0].name), 'control chars stripped');
  assert.ok(board[0].name.length <= 24, 'length capped, got ' + board[0].name.length);
});

await t('missing or non-string name falls back to anonymous', async () => {
  __reset();
  await post({ score: 5 });
  await post({ name: 12345, score: 6 });
  await post({ name: '   ', score: 7 });
  const board = await (await get()).json();
  assert.deepEqual(board.map(e => e.name), ['anonymous', 'anonymous', 'anonymous']);
});

await t('a score records the level it reached', async () => {
  __reset();
  await post({ name: 'Diego', score: 380, level: 7 });
  const board = await (await get()).json();
  assert.equal(board[0].level, 7, 'the level was not stored');
  assert.equal(board[0].won, undefined, 'a run that died was recorded as a win');
});

await t('a level that is not on the ladder is not recorded at all', async () => {
  // Undefined rather than a fallback: a level we cannot trust is a level we do
  // not have, and the board already knows how to draw a row without one.
  __reset();
  for (const level of [0, 21, -3, 4.5, '7', null, undefined, {}]) {
    await post({ name: 'Diego', score: 10, level });
  }
  const board = await (await get()).json();
  assert.equal(board.length, 8, 'a bad level should not cost the score');
  board.forEach((row, i) => {
    assert.equal(row.level, undefined, `row ${i} kept a level it should not have`);
  });
});

await t('a win only counts at the top of the ladder', async () => {
  // Anything else claiming one is a client that disagrees with this function
  // about what winning is.
  __reset();
  await post({ name: 'Honest', score: 1000, level: 20, won: true });
  await post({ name: 'Hopeful', score: 900, level: 11, won: true });
  await post({ name: 'Confused', score: 800, won: true });
  const board = await (await get()).json();
  const by = (name) => board.find(r => r.name === name);
  assert.equal(by('Honest').won, true, 'surviving level 20 was not recorded as a win');
  assert.equal(by('Hopeful').won, undefined, 'a win was recorded at level 11');
  assert.equal(by('Confused').won, undefined, 'a win was recorded with no level at all');
});

await t('rows written before levels existed are left alone', async () => {
  __reset();
  await post({ name: 'Old', score: 500 });
  const board = await (await get()).json();
  assert.equal(board[0].level, undefined);
  assert.equal(board[0].won, undefined);
  assert.deepEqual(Object.keys(board[0]).sort(), ['name', 'score', 'score_day'],
    'a row with no level should carry no level key at all');
});

await t('a score records what it was played with', async () => {
  __reset();
  await post({ name: 'Thumbs', score: 900, level: 20, pointer: 'touch' });
  await post({ name: 'Mouser', score: 800, level: 14, pointer: 'mouse' });
  await post({ name: 'Both', score: 700, level: 9, pointer: 'mixed' });
  const board = await (await get()).json();
  const by = (name) => board.find(r => r.name === name);
  assert.equal(by('Thumbs').pointer, 'touch');
  assert.equal(by('Mouser').pointer, 'mouse');
  assert.equal(by('Both').pointer, 'mixed');
});

await t('a pointer we do not know is not recorded at all', async () => {
  // Undefined rather than a fallback, like the level: a fact we cannot trust
  // is a fact we do not have, and the board knows how to draw a row without
  // one. Guessing "mouse" would quietly claim the harder achievement.
  __reset();
  for (const pointer of ['finger', 'TOUCH', '', 0, null, true, {}, undefined]) {
    await post({ name: 'Odd', score: 10, level: 5, pointer });
  }
  const board = await (await get()).json();
  assert.equal(board.length, 8, 'a bad pointer should not cost the score');
  board.forEach((row, i) => {
    assert.equal(row.pointer, undefined, `row ${i} kept a pointer it should not have`);
  });
});

await t('a valid breakdown is stored with the score', async () => {
  __reset();
  const breakdown = {
    points: { ordinary: 10, reinforced: 3, armoured: 2, saucer1: 12, saucer2: 20 },
    losses: { escapes: 1, saucers: 1, birds: 0, fireflies: 2 }
  };
  await post({ name: 'Detailed', score: 47, level: 12, breakdown });
  const board = await (await get()).json();
  assert.deepEqual(board[0].breakdown, breakdown, 'the breakdown was not stored intact');
});

await t('a bad breakdown is dropped, and the score is not', async () => {
  __reset();
  const good = {
    points: { ordinary: 5, reinforced: 0, armoured: 0, saucer1: 0, saucer2: 0 },
    losses: { escapes: 0, saucers: 0, birds: 0, fireflies: 0 }
  };
  const cases = [
    undefined,
    { ...good, points: { ...good.points, ordinary: -1 } },
    { ...good, points: { ...good.points, ordinary: 1.5 } },
    { ...good, points: { ...good.points, ordinary: 6 } },   // does not sum to the score
    { points: good.points },                                 // no losses at all
    { ...good, losses: { escapes: 1000, saucers: 0, birds: 0, fireflies: 0 } },
    { ...good, points: { ...good.points, ordinary: NaN } }
  ];
  for (const breakdown of cases) {
    const r = await post({ name: 'Forged', score: 5, level: 3, breakdown });
    assert.equal(r.status, 200, 'a bad breakdown rejected the whole score');
  }
  const board = await (await get()).json();
  assert.equal(board.length, cases.length, 'a bad breakdown cost the score');
  board.forEach((row, i) => {
    assert.equal(row.breakdown, undefined, `row ${i} kept a breakdown it should not have`);
    assert.equal(row.score, 5, `row ${i} lost its score`);
  });
});

await t('unsupported methods are rejected with 405', async () => {
  const r = await handler(new Request('https://x/api/scores', { method: 'DELETE' }), ctx());
  assert.equal(r.status, 405);
});

await t('production uses the global store, previews use the deploy store', async () => {
  __reset();
  await get('production');
  assert.equal(calls.global, 1, 'production should use global store');
  assert.equal(calls.deploy, 0);
  await get('deploy-preview');
  await get('branch-deploy');
  assert.equal(calls.deploy, 2, 'non-production should use deploy store');
  assert.equal(calls.global, 1);
});

await t('every store is opened with strong consistency', async () => {
  assert.ok(calls.options.every(o => o && o.consistency === 'strong'),
    'got ' + JSON.stringify(calls.options));
});

await t('preview scores never leak into the production board', async () => {
  __reset();
  await post({ name: 'preview-tester', score: 99999 }, 'deploy-preview');
  const prodBoard = await (await get('production')).json();
  assert.deepEqual(prodBoard, [], 'production board must stay empty');
});

await t('responses are JSON and marked no-store', async () => {
  const r = await get();
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('content-type'), 'application/json');
});

console.log('\n' + pass + ' passed');
