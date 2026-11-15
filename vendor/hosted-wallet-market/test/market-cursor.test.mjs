// Dependency-free: node --test test/market-cursor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMarketCursor, CURSOR_MAX_LENGTH} from '../src/market-cursor.mjs';

const KEY = 'a1'.repeat(32);
const OTHER_KEY = 'b2'.repeat(32);
const id = n => 'market-' + createHash('sha256').update(String(n)).digest('hex');
const LIVE_ID = 'market-f4bb0ef782866b47f3d0ede84e968cdbb152ad5aee92056b941aa4ee161752f3';
const code = expected => error => error.codeName === expected && error.http === 400;

// The keyset page shape of machine-market discover(): LIMIT limit+1, cursor
// only when a further row exists, position decoded by the same producer.
function pager(rows, cursors, scope = 'market.discover') {
  const sorted = [...rows].sort();
  return ({limit, cursor = ''}) => {
    const position = cursors.read(scope, cursor);
    const found = sorted.filter(row => row > position).slice(0, limit + 1);
    const more = found.length > limit;
    const page = more ? found.slice(0, limit) : found;
    return {items: page, nextCursor: more ? cursors.emit(scope, page.at(-1)) : null};
  };
}

test('regression: the pin route decoded a raw producer id as base64url and refused it', () => {
  // server.mjs page() at 32437117: Buffer.from(raw,'base64url') then /^[A-Za-z0-9_-]+$/.
  const decoded = Buffer.from(LIVE_ID, 'base64url').toString('utf8');
  assert.equal(/^[A-Za-z0-9_-]+$/.test(decoded), false);
});

test('an emitted cursor round-trips to its keyset position', () => {
  const cursors = createMarketCursor(KEY);
  const cursor = cursors.emit('market.discover', LIVE_ID);
  assert.match(cursor, /^mc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{32}$/);
  assert.ok(cursor.length <= CURSOR_MAX_LENGTH);
  assert.equal(cursors.read('market.discover', cursor), LIVE_ID);
  // Survives URL query encoding unchanged (no characters need escaping).
  assert.equal(new URL('https://x.invalid/?cursor=' + cursor).searchParams.get('cursor'), cursor);
});

test('absent cursor reads the first page', () => {
  const cursors = createMarketCursor(KEY);
  for (const raw of [undefined, null, '']) assert.equal(cursors.read('market.discover', raw), '');
});

test('normal next-page readback over limit=1 walks every row once and ends with null', () => {
  const cursors = createMarketCursor(KEY);
  const rows = [id(1), id(2), id(3)];
  const read = pager(rows, cursors);
  const seen = [];
  let cursor = '', pages = 0;
  do {
    const page = read({limit: 1, cursor});
    seen.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 10);
  assert.deepEqual(seen, [...rows].sort());
  assert.equal(pages, 3);
});

test('a single row at limit=1 emits no cursor (the live case)', () => {
  const read = pager([LIVE_ID], createMarketCursor(KEY));
  assert.deepEqual(read({limit: 1}), {items: [LIVE_ID], nextCursor: null});
  assert.deepEqual(read({limit: 5}), {items: [LIVE_ID], nextCursor: null});
});

test('exact page boundary: rows === limit emits no cursor, rows === limit+1 emits one', () => {
  const cursors = createMarketCursor(KEY);
  assert.equal(pager([id(1), id(2)], cursors)({limit: 2}).nextCursor, null);
  const page = pager([id(1), id(2), id(3)], cursors)({limit: 2});
  assert.equal(page.items.length, 2);
  assert.equal(cursors.read('market.discover', page.nextCursor), page.items[1]);
});

test('malformed cursors are cursor_malformed', () => {
  const cursors = createMarketCursor(KEY);
  const good = cursors.emit('market.discover', LIVE_ID);
  for (const raw of [
    'garbage', LIVE_ID, Buffer.from(LIVE_ID).toString('base64url'), 'mc2' + good.slice(3),
    good.slice(0, -1), good + 'x', 'mc1..' + 'A'.repeat(32), 'mc1.a b.' + 'A'.repeat(32),
    'x'.repeat(CURSOR_MAX_LENGTH + 1), 42, {}, ['mc1'],
  ]) assert.throws(() => cursors.read('market.discover', raw), code('cursor_malformed'), String(raw).slice(0, 40));
});

test('tampered, foreign-scope or foreign-key cursors are cursor_unrecognized', () => {
  const cursors = createMarketCursor(KEY);
  const good = cursors.emit('market.discover', id(1));
  const [, body, tag] = good.split('.');
  const otherBody = Buffer.from(id(2)).toString('base64url');
  const flipped = tag.slice(0, -1) + (tag.at(-1) === 'A' ? 'B' : 'A');
  assert.throws(() => cursors.read('market.discover', `mc1.${otherBody}.${tag}`), code('cursor_unrecognized'));
  assert.throws(() => cursors.read('market.discover', `mc1.${body}.${flipped}`), code('cursor_unrecognized'));
  assert.throws(() => cursors.read('market.accepted-work', good), code('cursor_unrecognized'));
  assert.throws(() => createMarketCursor(OTHER_KEY).read('market.discover', good), code('cursor_unrecognized'));
});

test('a server-emitted cursor is never refused by the same server scope', () => {
  const cursors = createMarketCursor(KEY);
  for (let n = 0; n < 200; n++) {
    for (const scope of ['market.discover', 'market.accepted-work']) {
      assert.equal(cursors.read(scope, cursors.emit(scope, id(n))), id(n));
    }
  }
});

test('construction and producer inputs are bounded', () => {
  assert.throws(() => createMarketCursor('short'), code('replay_key_required'));
  const cursors = createMarketCursor(KEY);
  assert.throws(() => cursors.emit('market.discover', 'bad id'), /cursor_position_invalid/);
  assert.throws(() => cursors.emit('market.other', LIVE_ID), /cursor_scope_unknown/);
  assert.throws(() => cursors.read('market.other', ''), /cursor_scope_unknown/);
});
