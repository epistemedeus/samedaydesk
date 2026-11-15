// Opaque page cursors for the machine market public reads.
// The producer and the decoder live here so the server route cannot decode a
// cursor in a format its producer never emitted. A cursor carries a keyset
// position and a tag bound to the route scope. The tag key is derived from the
// existing replay key, so no new secret or storage is added. A cursor is not an
// authority: it only names where the next public page starts.
import {createHmac, timingSafeEqual} from 'node:crypto';

export const CURSOR_VERSION = 'mc1';
export const CURSOR_MAX_LENGTH = 200;
export const CURSOR_SCOPES = Object.freeze(['market.discover', 'market.accepted-work']);
const SHAPE = /^mc1\.([A-Za-z0-9_-]{1,160})\.([A-Za-z0-9_-]{32})$/;
// Keyset positions are task ids such as market-<64 hex>; 120 characters bound the body.
const POSITION = /^[A-Za-z0-9_-]{1,120}$/;

const refuse = code => { throw Object.assign(new Error(code), {code, codeName: code, http: 400}); };

// cursor_malformed: not a cursor this server version could emit (shape,
// length, encoding or version). cursor_unrecognized: well formed, but its tag
// does not verify for this route scope and key. That covers a tampered
// position, a cursor taken from another route, and a cursor issued before the
// replay key rotated. In every case the caller restarts from the first page.
export function createMarketCursor(replayKeyHex) {
  if (typeof replayKeyHex !== 'string' || !/^[a-f0-9]{64}$/.test(replayKeyHex)) refuse('replay_key_required');
  const key = createHmac('sha256', Buffer.from(replayKeyHex, 'hex')).update('hosted-wallet-market/market-cursor/v1').digest();
  const scoped = scope => {
    if (!CURSOR_SCOPES.includes(scope)) throw Object.assign(new Error('cursor_scope_unknown'), {codeName: 'cursor_scope_unknown'});
    return scope;
  };
  const tag = (scope, body) => createHmac('sha256', key).update(`${CURSOR_VERSION}\0${scope}\0${body}`).digest('base64url').slice(0, 32);
  function emit(scope, position) {
    scoped(scope);
    if (typeof position !== 'string' || !POSITION.test(position)) throw Object.assign(new Error('cursor_position_invalid'), {codeName: 'cursor_position_invalid'});
    const body = Buffer.from(position, 'utf8').toString('base64url');
    return `${CURSOR_VERSION}.${body}.${tag(scope, body)}`;
  }
  // Returns '' for an absent cursor, otherwise the verified keyset position.
  function read(scope, raw) {
    scoped(scope);
    if (raw === null || raw === undefined || raw === '') return '';
    if (typeof raw !== 'string' || raw.length > CURSOR_MAX_LENGTH) refuse('cursor_malformed');
    const match = SHAPE.exec(raw);
    if (!match) refuse('cursor_malformed');
    const [, body, received] = match;
    const expected = Buffer.from(tag(scope, body));
    const given = Buffer.from(received);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) refuse('cursor_unrecognized');
    const position = Buffer.from(body, 'base64url').toString('utf8');
    // A verified tag over a body this producer never writes is not reachable
    // without the key. Refuse it rather than pass it to SQL.
    if (!POSITION.test(position) || Buffer.from(position, 'utf8').toString('base64url') !== body) refuse('cursor_unrecognized');
    return position;
  }
  return Object.freeze({emit, read});
}
