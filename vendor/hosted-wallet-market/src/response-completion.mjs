import {randomBytes} from 'node:crypto';

// Finite, default-off correlation between one vendor JSON end and the Node
// socket. Unset, zero, and every value outside 0..32 stay inert: no header,
// no listener, and no log. This does not retry, purge, or read the request.
export const COMPLETION_HEADER = 'x-ae-completion';
export const COMPLETION_LIMIT = 32;
export const WIRE_HEADER = 'x-ae-wire-version';
export const WIRE_VERSION = 'c0-1';
const SERVER_CLASS_HEADER = 'x-ae-server-class';
export function responseCompletionLimit(value) {
  if (value === undefined || value === null || value === '') return 0;
  const text = typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(text)) return 0;
  const limit = Number(text);
  if (!Number.isInteger(limit) || limit < 0 || limit > COMPLETION_LIMIT) return 0;
  return limit;
}

export function createResponseCompletion(limit, emit = console.log) {
  let remaining = responseCompletionLimit(limit);
  return {
    budget() { return remaining; },
    take() {
      if (remaining <= 0) return null;
      remaining -= 1;
      const id = randomBytes(4).toString('hex');
      return {id, emit};
    },
  };
}

function byteDelta(before, socket) {
  const after = socket && Number.isFinite(socket.bytesWritten) ? socket.bytesWritten : null;
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const delta = after - before;
  return Number.isSafeInteger(delta) ? delta : null;
}

function scalarCount(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function publish(token, fields) {
  const record = {
    id: token.id,
    status: Number.isInteger(fields.status) ? fields.status : null,
    declaredBytes: scalarCount(fields.declaredBytes),
    ended: fields.ended === true,
    finish: fields.finish === true,
    close: fields.close === true,
    writableFinished: fields.writableFinished === true,
    bytesWrittenDelta: scalarCount(fields.bytesWrittenDelta),
    suppressed: fields.suppressed === true,
  };
  token.emit(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: 'installed_response_completion ' + JSON.stringify(record),
  }));
}

/** Single writer of the installed JSON envelope. A call after end or destroy
 * writes nothing. An armed budget records that refusal once; a zero budget stays silent. */
export function deliverJsonResponse(res, status, body, extra = {}, completion = null) {
  if (res.destroyed || res.writableEnded) {
    const token = completion?.take?.() ?? null;
    if (token) {
      publish(token, {
        status,
        declaredBytes: null,
        ended: res.writableEnded === true,
        finish: false,
        close: res.closed === true,
        writableFinished: res.writableFinished === true,
        bytesWrittenDelta: null,
        suppressed: true,
      });
    }
    return {sent: false, id: token ? token.id : null, bytes: 0};
  }
  const payload = Buffer.from(JSON.stringify(body));
  const declaredBytes = payload.length;
  const token = completion?.take?.() ?? null;
  const socket = res.socket ?? null;
  const before = socket && Number.isFinite(socket.bytesWritten) ? socket.bytesWritten : null;
  if (token) {
    let finish = false;
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      publish(token, {
        status,
        declaredBytes,
        ended: res.writableEnded === true,
        finish,
        close: true,
        writableFinished: res.writableFinished === true,
        bytesWrittenDelta: byteDelta(before, socket),
        suppressed: false,
      });
    };
    res.once('finish', () => { finish = true; });
    res.once('close', report);
    const headers = responseHeaders(payload, extra);
    headers[COMPLETION_HEADER] = token.id;
    res.writeHead(status, headers);
    res.end(payload);
    if (res.closed) report();
    return {sent: true, id: token.id, bytes: payload.length};
  }
  res.writeHead(status, responseHeaders(payload, extra));
  res.end(payload);
  return {sent: true, id: null, bytes: payload.length};
}

function responseHeaders(payload, extra) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    connection: 'close',
    'cache-control': 'no-store',
    [WIRE_HEADER]: WIRE_VERSION,
    [SERVER_CLASS_HEADER]: 'live',
    ...extra,
  };
}
