import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest } from '../src/inputs.mjs';
export const exec = promisify(execFile);
const packageRoot = new URL('../', import.meta.url);
export const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, packageRoot), 'utf8'));
export const save = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
export async function createHarness({ disposition = 'changed', expiry = null, rightsPatch = {}, priorPatch = {}, fields = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ae18-occurrence-'));
  const sourcePath = join(dir, 'owner-source.json'), priorPath = join(dir, 'prior.json'), rightsPath = join(dir, 'rights.json');
  const descriptorPath = join(dir, 'descriptor.json'), configPath = join(dir, 'runtime.json'), stateDir = join(dir, 'state');
  mkdirSync(stateDir, { mode: 0o700 });
  const prior = { ...fixture('prior'), createdAt: new Date(Date.now() - 60000).toISOString(), ...priorPatch };
  if (priorPatch.payload) prior.sha256 = digest(prior.payload);
  save(priorPath, prior);
  save(sourcePath, fixture('source-before'));
  let sourceGets = 0, holdSource = false, notifySource;
  const merchantRoot = process.env.MERCHANT_INPUT_ROOT;
  const require = createRequire(join(merchantRoot, 'package.json'));
  const express = require('express');
  const app = express();
  app.get('/owner-source.json', (_req, res) => { sourceGets++; notifySource?.(); notifySource = null; if (holdSource) return; res.type('application/json').send(readFileSync(sourcePath)); });
  const merchant = await import(pathToFileURL(join(merchantRoot, 'page-change-http.mjs')).href);
  merchant.mountPageChangeHttp(app, { env: { PAGE_CHANGE_HTTP_ENABLED: '1', PAGE_CHANGE_SOURCE_COMMIT: '82a51274e7dc7a7600b90f1317a6be6b28442592' } });
  const source = app.listen(0, '127.0.0.1');
  await new Promise(resolve => source.once('listening', resolve));
  const origin = `http://127.0.0.1:${source.address().port}`, sourceUrl = `${origin}/owner-source.json`;
  const before = await fetch(sourceUrl).then(r => r.json());
  // A real owner-controlled file changes while its HTTP mount is running.
  save(sourcePath, fields ? { fields } : fixture(disposition === 'unchanged' ? 'source-before' : 'source-after'));
  const after = await fetch(sourceUrl).then(r => r.json());
  const rights = { schema: 'samedaydesk.maintenance-rights.v1', owner: 'local-source-owner', sourceId: 'owner-contract', taskId: 'maintenance-assessment',
    revision: 'rights-1', licensePlane: 'owner_qa', readAllowed: true, reviewAllowed: true, reuseAllowed: true, mandateState: 'active',
    validUntil: new Date(Date.now() + 3600000).toISOString(), expectedReviewer: 'supplied-reviewer', ...rightsPatch };
  save(rightsPath, rights);
  const descriptor = { schema: 'samedaydesk.maintenance-descriptor.v1', occurrenceId: 'owner-contract-change', taskId: rights.taskId,
    distinctTaskId: prior.taskId, subject: 'contract-change-assessment', sequence: 2, owner: rights.owner,
    source: { id: rights.sourceId, owner: rights.owner, url: sourceUrl, expectedDigest: digest(readFileSync(sourcePath)) },
    priorDigest: prior.sha256, fields: ['title', 'description'], expiry: expiry || new Date(Date.now() + 1800000).toISOString(),
    horizonHours: 24, optIn: true, retained: { taskId: prior.taskId, sourceId: prior.sourceId, payloadDigest: prior.sha256, entitled: true } };
  save(descriptorPath, descriptor);
  const routePrefix = `maintenance.${descriptor.occurrenceId}`;
  // Explicit unsigned local test authorities; no enrollment, account or secret creation.
  const ownerCredential = 'ae18_local_owner_fixture_000000000000000000', reviewerCredential = 'ae18_local_reviewer_fixture_00000000000000';
  const tenants = [{ id: 'local-owner', tokenSha256: digest(ownerCredential), routes: [`${routePrefix}.assess`], maxUnits: 0, maxCalls: 200, maxConcurrent: 1 },
    { id: 'local-reviewer', tokenSha256: digest(reviewerCredential), routes: [`${routePrefix}.review`], maxUnits: 0, maxCalls: 200, maxConcurrent: 1 }];
  const tenantsFile = join(dir, 'tenants.json'); save(tenantsFile, { tenants });
  const ownerCredentialFile = join(dir, 'owner.credential'), reviewCredentialFile = join(dir, 'reviewer.credential');
  writeFileSync(ownerCredentialFile, ownerCredential, { mode: 0o600 }); writeFileSync(reviewCredentialFile, reviewerCredential, { mode: 0o600 });
  const config = { inputs: { sdsRoot: process.env.SDS_INPUT_ROOT, merchantRoot, gatewayRoot: process.env.GATEWAY_INPUT_ROOT },
    stateFile: join(stateDir, 'machine-gateway.sqlite'), tenantsFile, paymentsEnabled: false,
    maintenance: { descriptorPath, rightsPath, priorPath, ownerTenant: tenants[0].id, reviewTenant: tenants[1].id, mountedOrigin: origin } };
  save(configPath, config);
  let child, baseUrl, stderr = '';
  async function start() {
    child = spawn(process.execPath, [new URL('serve-local.mjs', import.meta.url).pathname, configPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', chunk => { stderr += chunk; });
    baseUrl = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('\n')) resolve(`http://127.0.0.1:${JSON.parse(output.split('\n')[0]).port}/api/machine-gateway`); });
      child.once('exit', code => reject(new Error(`runtime exited ${code}: ${stderr.slice(-1500)}`)));
      child.once('error', reject);
    });
    return baseUrl;
  }
  async function stop() { if (!child || child.exitCode !== null || child.signalCode !== null) return; const done = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await done; }
  async function api(path, body, role = 'owner', key = null) {
    const response = await fetch(`${baseUrl}${path}`, { method: body ? 'POST' : 'GET', headers: {
      authorization: `Bearer ${role === 'owner' ? ownerCredential : reviewerCredential}`, 'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json(), replay: response.headers.get('idempotency-replayed') };
  }
  let keyIndex = 0;
  async function execute(route, input, role = 'owner') {
    const quote = await api('/v1/quote', { routeId: `${routePrefix}.${route}`, input }, role);
    if (quote.status !== 200) return quote;
    return api('/v1/execute', { quoteId: quote.body.quoteId, input, maxUnits: 0 }, role, `ae18-test-operation-${++keyIndex}`);
  }
  const assessInput = { descriptorDigest: digest(descriptor) };
  const reviewInput = assessment => ({ assessmentId: assessment.id, assessmentDigest: assessment.output.digest,
    taskId: descriptor.taskId, sourceDigest: descriptor.source.expectedDigest, decision: 'accept', reviewer: rights.expectedReviewer });
  return { dir, config, configPath, descriptor, rights, prior, before, after, origin, sourcePath, priorPath, rightsPath, descriptorPath,
    ownerCredentialFile, reviewCredentialFile, assessInput, reviewInput, start, stop, api, execute, routePrefix,
    holdNextSource() { holdSource = true; return new Promise(resolve => { notifySource = resolve; }); },
    async crashOwnRuntime() { const done = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await done; }, get sourceGets() { return sourceGets; },
    get baseUrl() { return baseUrl; }, async close() { await stop(); source.closeAllConnections(); await new Promise(resolve => source.close(resolve)); rmSync(dir, { recursive: true, force: true }); } };
}
