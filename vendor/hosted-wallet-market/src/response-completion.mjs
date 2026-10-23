import {randomBytes} from 'node:crypto';

// Finite, default-off correlation between one vendor JSON end and the Node
// socket. Both a count and an absolute <=10 minute expiry are required. This
// observes Node's local handoff, never delivery beyond its socket or consent.
export const COMPLETION_HEADER = 'x-ae-completion';
export const COMPLETION_LIMIT = 32;
export const COMPLETION_WINDOW_MS = 600000;
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

export function createResponseCompletion(limit, emit = console.log, {expiresAt, now = Date.now} = {}) {
  const parsed = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  const expires = Number.isFinite(parsed) && new Date(parsed).toISOString() === expiresAt ? parsed : NaN;
  const duration = expires - now();
  let remaining = Number.isFinite(duration) && duration > 0 && duration <= COMPLETION_WINDOW_MS
    ? responseCompletionLimit(limit) : 0;
  const active = new Set(), responses = new WeakMap();
  let timer = null, closed = false;
  const write = line => { try { emit(line); } catch { /* diagnostics cannot fail a response */ } };
  const stop = stage => {
    if (closed) return;
    closed = true;
    remaining = 0;
    clearTimeout(timer);
    for (const trace of active) { trace.stage(stage); trace.cleanup(); }
  };
  const budget = () => {
    if (!closed && now() >= expires) stop('window_end');
    return remaining;
  };
  function take() {
    if (budget() <= 0) return null;
    remaining -= 1;
    if (!timer) {
      timer = setTimeout(() => stop('window_end'), Math.max(0, expires - now()));
      timer.unref();
    }
    return {id: randomBytes(4).toString('hex'), emit: line => {
      if (!closed && now() < expires) write(line);
    }};
  }
  return {
    budget,
    take,
    close() { stop('diagnostic_closed'); },
    begin(req, res) {
      if (responses.has(res)) return;
      const token = take();
      if (!token) return;
      const socket = res.socket, before = socket?.bytesWritten;
      const started = performance.now(), listeners = [];
      let status = null, declaredBytes = null, done = false, sends = 0;
      const stage = name => {
        if (done) return;
        if (now() >= expires && name !== 'window_end' && name !== 'diagnostic_closed') {
          stop('window_end'); return;
        }
        // A fixed scalar allowlist: never inspect URLs, bodies, credentials,
        // arbitrary headers, error messages or socket addresses.
        const record = {id: token.id, stage: name,
          elapsedMs: Math.round(performance.now() - started), status, declaredBytes,
          actualStatus: Number.isInteger(res.statusCode) ? res.statusCode : null,
          headersSent: res.headersSent === true, ended: res.writableEnded === true,
          writableFinished: res.writableFinished === true, destroyed: res.destroyed === true,
          bodyAllowed: typeof res._hasBody === 'boolean' ? res._hasBody : null,
          requestComplete: req?.complete === true, requestAborted: req?.aborted === true,
          bytesWrittenDelta: byteDelta(before, socket)};
        write(JSON.stringify({timestamp: new Date().toISOString(), level: 'INFO',
          message: 'installed_response_lifecycle ' + JSON.stringify(record)}));
      };
      const cleanup = () => {
        done = true;
        for (const [target, event, fn] of listeners) target.removeListener(event, fn);
        active.delete(trace);
      };
      const track = (target, event, fn) => {
        if (done) return undefined;
        listeners.push([target, event, fn]); return fn;
      };
      const on = (target, event, fn) => {
        if (!target?.once) return;
        target.once(event, fn); track(target, event, fn);
      };
      const trace = {token, stage, cleanup, on, track,
        intended(code, bytes) {
          // A single fallback write can follow a synchronous send error.
          // Further attempts cannot make the finite record count unbounded.
          if (sends++ >= 2) return false;
          status = Number.isInteger(code) ? code : null;
          declaredBytes = scalarCount(bytes);
          stage(sends === 1 ? 'intended' : 'repeat_intended'); return true;
        }};
      responses.set(res, trace); active.add(trace);
      on(req, 'end', () => stage('request_end'));
      on(req, 'aborted', () => stage('request_aborted'));
      on(req, 'error', () => stage('request_error'));
      on(res, 'finish', () => stage('finish'));
      on(res, 'close', () => { stage('close'); if (status !== null && !socket) cleanup(); });
      on(res, 'error', () => stage('response_error'));
      on(socket, 'error', () => stage('socket_error'));
      on(socket, 'close', () => { stage('socket_close'); if (status !== null) cleanup(); });
      stage('entered');
    },
    response(res) { budget(); return closed ? undefined : responses.get(res); },
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
  const trace = completion?.response?.(res);
  if (res.destroyed || res.writableEnded) {
    if (trace?.intended(status, null)) trace.stage('suppressed');
    const token = trace?.token ?? completion?.take?.() ?? null;
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
    if (res.destroyed) trace?.cleanup();
    return {sent: false, id: token ? token.id : null, bytes: 0};
  }
  const payload = Buffer.from(JSON.stringify(body));
  const declaredBytes = payload.length;
  const observed = trace?.intended(status, declaredBytes) === true;
  const token = trace?.token ?? completion?.take?.() ?? null;
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
    if (trace) {
      trace.on(res, 'finish', () => { finish = true; });
      trace.on(res, 'close', report);
    } else {
      res.once('finish', () => { finish = true; });
      res.once('close', report);
    }
    const headers = responseHeaders(payload, extra);
    headers[COMPLETION_HEADER] = token.id;
    try {
      res.writeHead(status, headers);
      if (observed) trace.stage('headers_written');
      if (observed) trace.stage('end_call');
      const endCallback = observed ? trace.track(res, 'finish', () => trace.stage('end_callback')) : undefined;
      res.end(payload, endCallback);
      if (observed) trace.stage('end_return');
    } catch (error) {
      if (observed) trace.stage('send_error');
      throw error;
    }
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
