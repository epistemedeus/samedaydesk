// Disposable server and end-to-end probe for the existing workflow artifacts.
// All calls are loopback; fixtures and effect counters never reach a live tenant.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClientEndpoint} from '../integrations/workflow-kits-n12/src/client-endpoint.mjs';
import {periodNWebhookBody} from '../integrations/workflow-kits-n12/scripts/build-artifacts.mjs';
import {CLOCK} from '../integrations/workflow-kits-n12/vendor/payment-rail/recurring-journey/fixtures/load-synthetic-recurring.mjs';
import {CLIENT_ENDPOINT, createChangedPeriodEndpoint} from '../integrations/workflow-kits-n12-changed-period/src/client-endpoint.mjs';
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
} else if (action === 'serve') {
  const base = createClientEndpoint({clock: CLOCK});
  const changed = createChangedPeriodEndpoint({clock: SCENARIO_CLOCK,
    faults: [{type: 'lost_apply_reply', periodId: 'period-N+1', recordKey: 'r-003'}]});
  const changedApplyCalls = new Map();
  let changedLostReplies = 0;
  const reply = (res, status, body) => {
    res.writeHead(status, {'content-type': 'application/json'});
    res.end(JSON.stringify(body));
  };
  createServer(async (req, res) => {
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/observe') return reply(res, 200, {
        baseEffects: base.deliveriesTotal(), changedEffects: changed.externalEffects(), changedLostReplies,
        changedReceipts: changed.receipts.snapshot().map(({periodId, recordKey, applyCount, termsVersion}) =>
          ({periodId, recordKey, applyCount, termsVersion})),
        changedApplyCalls: [...changedApplyCalls],
      });
      assert.equal(req.method, 'POST');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      const headers = {'Idempotency-Key': req.headers['idempotency-key']};
      let result;
      if (/^\/base\/periods(?:\/(accepted|flowassert))?$/.test(path))
        result = base.handle({method: req.method, path, headers, body});
      if (/^\/changed\/(evaluate|apply|replay)$/.test(path)) {
        result = changed.handle({method: req.method, url: CLIENT_ENDPOINT + path.slice('/changed'.length), headers, body});
        if (path === '/changed/apply') {
          const key = body.periodId + '/' + body.recordKey;
          changedApplyCalls.set(key, (changedApplyCalls.get(key) ?? 0) + 1);
        }
      }
      if (result?.transportError) {
        changedLostReplies++;
        return req.socket.destroy();
      }
      return reply(res, result?.status ?? 404, result?.body ?? {});
    } catch (error) {
      console.error(error.message);
      return reply(res, 500, {error: 'fixture_error'});
    }
  }).listen(18787, '127.0.0.1');
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
  const expectEffects = async (key, count) => {
    // The changed webhook responds to evaluation before applying records.
    const stop = Date.now() + 12000;
    let state;
    do {
      state = await observe();
      if (state[key] === count) return state;
      if (state[key] > count) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < stop);
    assert.equal(state[key], count, JSON.stringify(state));
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
  const interrupted = await expectEffects('changedEffects', 4);
  assert.equal(interrupted.changedLostReplies, 1);
  const resumed = await request(changedPath, next);
  assert.equal(resumed.summary.ready, 3);
  assert.equal(resumed.records.find(r => r.recordKey === 'r-003').outcome, 'already_applied');
  assert.equal(resumed.records.find(r => r.recordKey === 'r-005').exception.code, 'ingestion_not_permitted');
  await expectEffects('changedEffects', 7);
  const replay = await request(changedPath, next);
  assert.equal(replay.summary.alreadyApplied, 4);
  const terminal = await request(changedPath, fixture('workflow-kits-n12-changed-period/fixtures/period-n.terms-changed.request.json'));
  assert.deepEqual(terminal.records.map(r => r.exception.code), Array(3).fill('terms_changed'));
  const final = await expectEffects('changedEffects', 7);
  assert.deepEqual(final.changedReceipts.filter(r => r.periodId === 'period-N'), initial.changedReceipts);
  assert.ok(final.changedReceipts.every(r => r.applyCount === 1));
  assert.deepEqual(final.changedApplyCalls, final.changedReceipts.map(({periodId, recordKey}) => [periodId + '/' + recordKey, 1]));
  console.log(JSON.stringify({received: true, runtime: 'n8n', synthetic: true, runs: 8,
    baseEffects: final.baseEffects, changedEffects: final.changedEffects, changedLostReplies: final.changedLostReplies,
    maxAppliesPerKey: 1, oldTermsPreserved: true}));
} else {
  throw new Error('Expected prepare, serve, or verify');
}
