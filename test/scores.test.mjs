import assert from 'node:assert/strict';
import handler from '../netlify/functions/scores.mts';
import { calls, __reset } from './helpers/blobs-mock.mjs';

const ctx = (d, c = 'production') => ({ params: { difficulty: d }, deploy: { context: c } });
const get = (d, c) => handler(new Request('https://x/api/scores/' + encodeURIComponent(d)), ctx(d, c));
const post = (d, body, c) => handler(new Request('https://x/api/scores/' + d, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body)
}), ctx(d, c));

let pass = 0;
const t = async (name, fn) => { await fn(); console.log('  ok  ' + name); pass++; };

__reset();

await t('GET on an empty board returns []', async () => {
  const r = await get('s');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
});

await t('POST stores a score and returns the board', async () => {
  const r = await post('s', { name: 'Diego', score: 42 });
  assert.equal(r.status, 200);
  const board = await r.json();
  assert.equal(board.length, 1);
  assert.equal(board[0].name, 'Diego');
  assert.equal(board[0].score, 42);
  assert.match(board[0].score_day, /^\d{4}-\d{2}-\d{2}$/);
});

await t('GET reads back what POST wrote', async () => {
  const board = await (await get('s')).json();
  assert.equal(board.length, 1);
  assert.equal(board[0].score, 42);
});

await t('board is sorted by score descending', async () => {
  await post('s', { name: 'low', score: 1 });
  await post('s', { name: 'high', score: 999 });
  const board = await (await get('s')).json();
  assert.deepEqual(board.map(e => e.score), [999, 42, 1]);
});

await t('board is capped at 10 entries, keeping the highest', async () => {
  for (let i = 0; i < 20; i++) await post('s', { name: 'p' + i, score: 1000 + i });
  const board = await (await get('s')).json();
  assert.equal(board.length, 10);
  assert.equal(board[0].score, 1019);
  assert.equal(board[9].score, 1010);
});

await t('difficulties are stored independently', async () => {
  await post('h', { name: 'hardcore', score: 7 });
  const h = await (await get('h')).json();
  const s = await (await get('s')).json();
  assert.equal(h.length, 1);
  assert.equal(h[0].name, 'hardcore');
  assert.equal(s.length, 10);
});

await t('unknown difficulty is rejected with 404', async () => {
  for (const bad of ['x', '', 'S; DROP', '../../etc']) {
    const r = await get(bad);
    assert.equal(r.status, 404, 'expected 404 for ' + JSON.stringify(bad));
  }
});

await t('uppercase difficulty is accepted', async () => {
  assert.equal((await get('E')).status, 200);
});

await t('invalid scores are rejected with 400', async () => {
  for (const bad of [-1, 1.5, NaN, 'abc', null, undefined, 1e9, Infinity]) {
    const r = await post('e', { name: 'x', score: bad });
    assert.equal(r.status, 400, 'expected 400 for score ' + String(bad));
  }
});

await t('malformed JSON body is rejected with 400', async () => {
  const r = await post('e', 'not json at all');
  assert.equal(r.status, 400);
});

await t('names are sanitised and capped', async () => {
  __reset();
  const nasty = "  Very\u0000Long\nName That Goes On Forever And Ever  ";
  await post('v', { name: nasty, score: 5 });
  const board = await (await get('v')).json();
  assert.ok(!/[\u0000-\u001F\u007F]/.test(board[0].name), 'control chars stripped');
  assert.ok(board[0].name.length <= 24, 'length capped, got ' + board[0].name.length);
});

await t('missing or non-string name falls back to anonymous', async () => {
  __reset();
  await post('v', { score: 5 });
  await post('v', { name: 12345, score: 6 });
  await post('v', { name: '   ', score: 7 });
  const board = await (await get('v')).json();
  assert.deepEqual(board.map(e => e.name), ['anonymous', 'anonymous', 'anonymous']);
});

await t('unsupported methods are rejected with 405', async () => {
  const r = await handler(new Request('https://x/api/scores/s', { method: 'DELETE' }), ctx('s'));
  assert.equal(r.status, 405);
});

await t('production uses the global store, previews use the deploy store', async () => {
  __reset();
  await get('s', 'production');
  assert.equal(calls.global, 1, 'production should use global store');
  assert.equal(calls.deploy, 0);
  await get('s', 'deploy-preview');
  await get('s', 'branch-deploy');
  assert.equal(calls.deploy, 2, 'non-production should use deploy store');
  assert.equal(calls.global, 1);
});

await t('every store is opened with strong consistency', async () => {
  assert.ok(calls.options.every(o => o && o.consistency === 'strong'),
    'got ' + JSON.stringify(calls.options));
});

await t('preview scores never leak into the production board', async () => {
  __reset();
  await post('s', { name: 'preview-tester', score: 99999 }, 'deploy-preview');
  const prodBoard = await (await get('s', 'production')).json();
  assert.deepEqual(prodBoard, [], 'production board must stay empty');
});

await t('responses are JSON and marked no-store', async () => {
  const r = await get('s');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('content-type'), 'application/json');
});

console.log('\n' + pass + ' passed');
