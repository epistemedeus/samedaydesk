// Disposable server and end-to-end probe for the existing workflow artifacts.
// All calls are loopback; fixtures and effect counters never reach a live tenant.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createServer, request as httpRequest} from 'node:http';
import {mkdtempSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createClientEndpoint} from '../integrations/workflow-kits-n12/src/client-endpoint.mjs';
import {periodNWebhookBody} from '../integrations/workflow-kits-n12/scripts/build-artifacts.mjs';
import {CLOCK} from '../integrations/workflow-kits-n12/vendor/payment-rail/recurring-journey/fixtures/load-synthetic-recurring.mjs';
import {openDurableApplyReceipts} from '../integrations/workflow-kits-n12-changed-period/src/durable-receipts.mjs';
import {serveLocalChangedPeriod} from '../integrations/workflow-kits-n12-changed-period/src/serve.mjs';
import {SCENARIO_CLOCK, periodNRequest, periodNPlus1Request} from '../integrations/workflow-kits-n12-changed-period/src/fixtures.mjs';

const origin = 'http://127.0.0.1:18787';
const n8n = 'http://127.0.0.1:15678';
const [action, dir] = process.argv.slice(2);
const fixture = name => JSON.parse(readFileSync(new URL('../integrations/' + name, import.meta.url)));
const targets = [
  ['base', 'n12BaseKit000001', 'workflow-kits-n12/n8n/record-to-accepted-output.workflow.json'],
  ['changed', 'n12ChangeKit0001', 'workflow-kits-n12-changed-period/n8n/changed-period.workflow.json'],
];

if (action === 'prepare') {
  for (const [kind, id, file] of targets) {
    const workflow = fixture(file);
    const fields = workflow.nodes.find(n => n.name === 'Kit Settings').parameters.assignments.assignments;
    const setting = fields.find(n => n.name === 'clientEndpoint');
    assert.match(setting.value, /^https:\/\/client\.example\.invalid\//);
    setting.value = origin + '/' + kind; // Only the documented setup value changes.
    writeFileSync(join(dir, kind + '.json'), JSON.stringify({...workflow, id, active: false}));
  }
} else if (action === 'serve-changed') {
  const first = process.argv[4] === '1';
  const workerClock = new Date(Date.parse(SCENARIO_CLOCK) + (first ? 0 : 1000)).toISOString();
  const worker = serveLocalChangedPeriod(dir, {port:0, now:() => workerClock,
    faults:first ? [{type:'lost_apply_reply', periodId:'period-N+1', recordKey:'r-003'}] : []});
  worker.once('listening', () => process.send({port:worker.address().port}));
  process.once('disconnect', () => worker.close());
} else if (action === 'serve') {
  const base = createClientEndpoint({clock: CLOCK});
  const storeFile = join(mkdtempSync(join(realpathSync(dir), 'restart-')), 'receipts.sqlite');
  const receiptObserver = openDurableApplyReceipts(storeFile, {initialize:true});
  async function launchChanged(generation) {
    const child = fork(fileURLToPath(import.meta.url), ['serve-changed', storeFile, String(generation)],
      {stdio:['ignore','inherit','inherit','ipc']});
    const exited = once(child, 'exit');
    try {
      const [{port}] = await Promise.race([
        once(child, 'message'),
        exited.then(() => { throw new Error('changed worker exited before readiness'); }),
        delay(6000, null, {ref:false}).then(() => { throw new Error('changed worker readiness timed out'); }),
      ]);
      assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
      return {child, exited, port, generation};
    } catch (error) {
      child.kill();
      await exited.catch(() => {});
      throw error;
    }
  }
  let changed = await launchChanged(1);
  let restartStarted = false;
  const changedApplyCalls = new Map();
  let changedLostReplies = 0;
  const reply = (res, status, body) => {
    res.writeHead(status, {'content-type': 'application/json'});
    res.end(JSON.stringify(body));
  };
  const harness = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/observe') return reply(res, 200, {
        baseEffects: base.deliveriesTotal(), changedEffects: receiptObserver.effects(), changedLostReplies,
        changedReceipts: receiptObserver.snapshot(), changedGeneration: changed.generation,
        changedPid: changed.child.pid,
        changedApplyCalls: [...changedApplyCalls],
      });
      assert.equal(req.method, 'POST');
      if (path === '/restart-changed') {
        assert.equal(restartStarted, false);
        assert.equal(changedLostReplies, 1);
        restartStarted = true;
        req.resume();
        const old = changed;
        assert.equal(old.child.kill('SIGKILL'), true);
        const [, signal] = await old.exited;
        assert.equal(signal, 'SIGKILL');
        changed = await launchChanged(2);
        return reply(res, 200, {priorPid:old.child.pid, pid:changed.child.pid, signal});
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const body = JSON.parse(bytes);
      const headers = {'Idempotency-Key': req.headers['idempotency-key']};
      if (/^\/base\/periods(?:\/(accepted|flowassert))?$/.test(path)) {
        const result = base.handle({method: req.method, path, headers, body});
        return reply(res, result.status, result.body);
      }
      if (/^\/changed\/(evaluate|apply|replay)$/.test(path)) {
        const backend = changed;
        if (path === '/changed/apply') {
          const key = body.periodId + '/' + body.recordKey;
          changedApplyCalls.set(key, (changedApplyCalls.get(key) ?? 0) + 1);
        }
        const upstream = httpRequest({
          hostname:'127.0.0.1', port:backend.port, method:'POST', path:path.slice('/changed'.length),
          signal:AbortSignal.timeout(8000),
          headers:{'Content-Type':'application/json', 'Content-Length':bytes.length,
            ...(headers['Idempotency-Key'] === undefined ? {} : headers)},
        }, replyFromWorker => {
          res.writeHead(replyFromWorker.statusCode, replyFromWorker.headers);
          replyFromWorker.pipe(res);
        });
        upstream.once('error', error => {
          if (backend.generation === 1 && error.code === 'ECONNRESET' && path === '/changed/apply' &&
              body.periodId === 'period-N+1' && body.recordKey === 'r-003' &&
              receiptObserver.get(body.ledgerKey)?.recordKey === body.recordKey) {
            changedLostReplies++;
            return req.socket.destroy();
          }
          return reply(res, 502, {error:'unexpected_changed_worker_transport'});
        });
        upstream.end(bytes);
        return;
      }
      return reply(res, 404, {});
    } catch (error) {
      console.error(error.message);
      return reply(res, 500, {error: 'fixture_error'});
    }
  }).listen(18787, '127.0.0.1');
  process.once('SIGTERM', async () => {
    harness.close();
    changed.child.kill();
    await changed.exited;
    receiptObserver.close();
  });
} else if (action === 'verify') {
  const request = async (path, body) => {
    const r = await fetch(n8n + '/webhook/' + path, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body),
      signal:AbortSignal.timeout(30000),
    });
    const raw = await r.text();
    console.log(path, r.status, raw.slice(0, 320));
    assert.equal(r.status, 200, raw);
    return JSON.parse(raw);
  };
  const observe = async () => (await fetch(origin + '/observe', {signal:AbortSignal.timeout(5000)})).json();
  const expectEffects = async (key, count, when = () => true) => {
    // The changed webhook responds to evaluation before applying records.
    const stop = Date.now() + 12000;
    let state;
    do {
      state = await observe();
      if (state[key] === count && when(state)) return state;
      if (state[key] > count) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < stop);
    assert.equal(state[key], count, JSON.stringify(state));
    assert.ok(when(state), JSON.stringify(state));
  };
  const firstPath = 'samedaydesk-record-to-accepted-output';
  const first = await request(firstPath, periodNWebhookBody());
  assert.equal(first.period.decision, 'accept');
  assert.equal(first.delivery.duplicate, false);
  const duplicate = await request(firstPath, periodNWebhookBody());
  assert.equal(duplicate.delivery.duplicate, true);
  assert.equal(first.period.idempotencyKey, duplicate.period.idempotencyKey);
  await expectEffects('baseEffects', 1);

  const changedPath = 'samedaydesk-changed-period';
  assert.equal((await request(changedPath, periodNRequest())).summary.ready, 3);
  const initial = await expectEffects('changedEffects', 3);
  const next = periodNPlus1Request({stale:false});
  const unadapted = structuredClone(next);
  unadapted.period.mappingVersion = 'workflow-output.v1';
  const rejected = await request(changedPath, unadapted);
  assert.deepEqual(rejected.records.map(r => r.exception.code), Array(5).fill('schema_changed'));
  await expectEffects('changedEffects', 3);
  const one = {...next, records:next.records.filter(r => r.rowId === 'r-003')};
  assert.equal((await request(changedPath, one)).summary.ready, 1);
  const interrupted = await expectEffects('changedEffects', 4, state => state.changedLostReplies === 1);
  assert.equal(interrupted.changedLostReplies, 1);
  const beforeRestart = interrupted.changedReceipts.find(r => r.periodId === 'period-N+1' && r.recordKey === 'r-003');
  assert.ok(beforeRestart);
  const restart = await fetch(origin + '/restart-changed', {method:'POST', signal:AbortSignal.timeout(9000)});
  assert.equal(restart.status, 200);
  const restarted = await restart.json();
  assert.equal(restarted.priorPid, interrupted.changedPid);
  assert.notEqual(restarted.pid, restarted.priorPid);
  assert.equal(restarted.signal, 'SIGKILL');
  const reopened = await observe();
  assert.equal(reopened.changedGeneration, 2);
  assert.deepEqual(reopened.changedReceipts, interrupted.changedReceipts);
  const resumed = await request(changedPath, next);
  assert.equal(resumed.summary.ready, 3);
  const recovered = resumed.records.find(r => r.recordKey === 'r-003');
  assert.equal(recovered.outcome, 'already_applied');
  assert.deepEqual(recovered.receipt, beforeRestart);
  assert.equal(resumed.records.find(r => r.recordKey === 'r-005').exception.code, 'ingestion_not_permitted');
  await expectEffects('changedEffects', 7);
  const replay = await request(changedPath, next);
  assert.equal(replay.summary.alreadyApplied, 4);
  const terminal = await request(changedPath, fixture('workflow-kits-n12-changed-period/fixtures/period-n.terms-changed.request.json'));
  assert.deepEqual(terminal.records.map(r => r.exception.code), Array(3).fill('terms_changed'));
  const final = await expectEffects('changedEffects', 7);
  assert.deepEqual(final.changedReceipts.filter(r => r.periodId === 'period-N'), initial.changedReceipts);
  assert.ok(final.changedReceipts.every(r => r.applyCount === 1));
  // The receipt export sorts by key; the request trace preserves arrival.
  // Compare keyed multisets so the deliberately early r-003 keeps its place.
  assert.deepEqual(new Map(final.changedApplyCalls),
    new Map(final.changedReceipts.map(({periodId, recordKey}) => [periodId + '/' + recordKey, 1])));
  console.log(JSON.stringify({received: true, runtime: 'n8n', synthetic: true, runs: 8,
    baseEffects: final.baseEffects, changedEffects: final.changedEffects, changedLostReplies: final.changedLostReplies,
    maxAppliesPerKey: 1, oldTermsPreserved: true, actualWorkerRestart:true, originalReceiptRecovered:true}));
} else {
  throw new Error('Expected prepare, serve, or verify');
}
