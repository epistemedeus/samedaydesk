/** SPDX-License-Identifier: MIT. Actual public reads and free supplied-row QA; no formation writes. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiTransport } from '../vendor/ein-activation-continuation/src/transport.mjs';
import { scopeFor } from '../src/budget.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'sol384-public-readback-'));
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cold = (bin, command, env, input) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [bin, command], { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('owned public readback child timed out')); }, 20000);
  child.stdout.on('data', (data) => { output += data; if (Buffer.byteLength(output) > 65536) child.kill('SIGKILL'); });
  child.stderr.resume();
  child.on('error', (error) => { clearTimeout(timer); reject(error); });
  child.on('close', (code) => {
    clearTimeout(timer);
    try { const result = JSON.parse(output); assert.equal(code, 0, result.error?.code); resolve(result); }
    catch (error) { reject(error); }
  });
  child.stdin.end(input ? JSON.stringify(input) : '');
});

try {
  const safeEnv = {
    PATH: '/usr/bin:/bin', LANG: 'C',
    EIN_ACTIVATION_BASE_URL: 'https://ein.llc', EIN_CONTINUATION_LANE: 'agent_assisted_human',
    EIN_CONTINUATION_CUSTOMER_KEY: 'qa-caller-key-sol384', EIN_CONTINUATION_INTENDED_EMAIL: 'owner@example.test',
    SDS_ACTIVATION_RECIPIENT_ID: 'qa-operator-384',
  };
  const reads = await createApiTransport({ apiOrigin: 'https://ein.llc', fetch: globalThis.fetch, timeoutMs: 15000, maxResponseBytes: 1048576 });
  const manifest = (await reads.request('GET', '/downloads/ein-activation-continuation-v0.1.3.json')).payload;
  const index = (await reads.request('GET', '/downloads/ein-activation-continuation.json')).payload;
  assert.equal(manifest.downloads.tgz.sha256, '1273c33e77aadef2eececd1d1c7269ef9c9205558c223adb2982e7517d523ad2');
  const discovery = [];
  for (const transport of ['http', 'mcp', 'a2a', 'a2a-rest']) {
    const env = { ...safeEnv, EIN_CONTINUATION_TASK_ID: `qa-public-${transport}-384`, EIN_CONTINUATION_FILE: join(work, `${transport}.private.json`),
      EIN_CONTINUATION_TRANSPORT: transport,
      ...(['a2a', 'a2a-rest'].includes(transport) ? { EIN_CONTINUATION_CATALOG_TRANSPORT: 'http' } : {}) };
    const result = await cold(join(root, 'vendor/ein-activation-continuation/bin/ein-continuation.mjs'), 'discover', env);
    assert.equal(result.catalogSchema, 'ein.agent-service-catalog.v1');
    assert.equal(result.contract.operation, transport);
    assert.equal(result.contract.cachedOfferUsed, false);
    discovery.push({ transport, catalogVersion: result.catalogVersion, termsFingerprint: result.termsFingerprint, contract: result.contract });
  }
  const callers = [];
  for (const name of ['qualifying', 'existing-business', 'ambiguous', 'technical']) {
    const input = JSON.parse(readFileSync(join(root, 'examples', `${name}.json`)));
    const records = join(work, `${name}.sources.private.json`);
    writeFileSync(records, readFileSync(join(root, 'examples', `${name}.source-record.json`)), { mode: 0o600 });
    const env = { ...safeEnv, EIN_CONTINUATION_TASK_ID: input.task.taskId,
      SDS_ACTIVATION_SOURCE_RECORDS_FILE: records,
      EIN_CONTINUATION_FILE: join(work, `${name}.private.json`) };
    const result = await cold(join(root, 'bin/sds-activation.mjs'), 'plan', env, input);
    const scope = scopeFor({});
    const direct = await createApiTransport({ apiOrigin: 'https://samedaydesk.com', fetch: scope.fetch(globalThis.fetch), timeoutMs: 15000, maxResponseBytes: scope.maxBytes });
    const baseline = (await direct.request('POST', '/api/public-readiness/supplied-row', { body: input.task.readiness, success: [200] })).payload;
    assert.equal(sha(result.work.result), sha(baseline));
    let recheck = null;
    if (result.work.nextAction.body) {
      recheck = (await direct.request('POST', '/api/public-readiness/supplied-row', { body: result.work.nextAction.body, success: [200] })).payload;
      assert.equal(recheck.observation.checkerOk, true);
      assert.equal(recheck.observation.readinessClaimed, false);
    }
    assert.equal(result.productionMutation, false);
    assert.equal(result.revenue, false);
    if (name !== 'qualifying') assert.equal(result.service, null);
    if (name === 'ambiguous') assert.deepEqual(result.nextAction.requiredInputs, ['facts.providerRequiresUsEntity']);
    callers.push({ name, category: result.category, qualified: result.qualification.qualified,
      offer: result.service?.offer ?? null, nextAction: result.nextAction.kind,
      clarificationFields: result.nextAction.requiredInputs ?? [],
      sameInputDirectReadiness: true, readinessDigest: sha(baseline), findings: baseline.observation.findings,
      repairApplied: baseline.repair.applied.map((action) => action.requiredPath),
      recheckCheckerOk: recheck?.observation.checkerOk ?? null,
      readinessClaimed: false, paymentSent: baseline.checkerSafety.paymentSent,
      budget: result.budget });
  }
  const receipt = { schema: 'samedaydesk.relevant-activation.public-readback.v1', observedAt: new Date().toISOString(),
    execution: 'native_cursor_vm_public_hosts', nativeModel: 'gpt-6.1-sol',
    archiveReceived: JSON.parse(readFileSync(join(root, 'EIN-ACQUISITION.json'))).sha256,
    manifestPublished: manifest.published, mutableIndexPublished: index.published,
    bytesHostedSeparatelyFromPublicationFlag: true, discovery, callers,
    productionAssess: 'not_run', productionPrepare: 'not_run', productionClaim: 'not_run', productionPayment: 'not_run',
    grants: 'none', callerInputs: 'independently_supplied_owner_QA_records',
    outsideUsefulDelivery: 'unknown', customerDemand: 'unknown', customerPayment: 'not_observed' };
  mkdirSync(join(root, 'evidence'), { recursive: true });
  writeFileSync(join(root, 'evidence/public-readback.json'), JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(JSON.stringify(receipt) + '\n');
} finally { rmSync(work, { recursive: true, force: true }); }
