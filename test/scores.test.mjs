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
