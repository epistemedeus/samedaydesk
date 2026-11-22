const runFreeCheck = async (...args) => (await import('./probe.js')).runFreeCheck(...args);
import { storeReport, readReport } from './store.js';
import { clientKey, consumeClient } from '../agent-readiness/rate-limit.js';
let active = 0;

// Existing endpoint, opt-in v2. Its normal free-tool completion counter is owned
// by the route and receives one terminal outcome, never a new tracker.
export async function freeCheckHttp(req, res, record, { run = runFreeCheck, store = storeReport, read = readReport } = {}) {
  res.set('Cache-Control', 'no-store');
  if (req.query.report) {
    const report = await read(req.query.report);
    res.status(report ? 200 : 404).json(report || { error: 'This report was not found or has expired.' });
    return;
  }
  try { consumeClient(clientKey(req)); }
  catch (error) { record('other_failure'); res.set('Retry-After', String(error.retryAfterSec || 60)).status(429).json({ error: 'Too many checks. Please try again later.' }); return; }
  if (active >= 4) { record('other_failure'); res.set('Retry-After', '20').status(429).json({ error: 'The checker is busy. Please try again shortly.' }); return; }
  active += 1;
  const stream = req.query.stream === '1';
  const ctrl = new AbortController();
  const onClose = () => { if (!res.writableFinished) ctrl.abort(); };
  res.once('close', onClose);
  if (stream) {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.flushHeaders();
  }
  const send = (event, data) => { if (!res.destroyed && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    const report = await run(req.query.url, { signal: ctrl.signal, onProgress: stream ? (value) => send('progress', value) : undefined });
    if (ctrl.signal.aborted) return;
    // Persistence belongs to the useful result: failure is explicit, not a false
    // permanent link. Still return the completed free check to its visitor.
    let result;
    try { result = await store(report); }
    catch { result = { ...report, permalink: null, storageNotice: 'The check completed, but this report could not be saved. Download the JSON to keep it.' }; }
    record('completed');
    if (stream) { send('result', result); res.end(); }
    else res.json(result);
  } catch (error) {
    if (!ctrl.signal.aborted) {
      record(error.status === 400 ? 'invalid_host' : 'other_failure');
      const message = error.status === 400 ? error.message : 'The check could not finish. No result was saved.';
      if (stream) { send('error', { error: message }); res.end(); }
      else res.status(error.status === 400 ? 400 : 502).json({ error: message });
    }
  } finally { active -= 1; res.removeListener('close', onClose); ctrl.abort(); }
}
