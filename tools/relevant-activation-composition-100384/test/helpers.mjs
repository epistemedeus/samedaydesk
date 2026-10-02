import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createPublicReadinessRouter } from '../../../server/lib/public-readiness-mount.js';
import { resetRateLimits } from '../../../server/lib/agent-readiness/rate-limit.js';
import { catalogDocument } from '../../l08-agent-repair/lib/task-catalog.mjs';

export const root = new URL('../', import.meta.url).pathname;
export const bin = new URL('../bin/sds-activation.mjs', import.meta.url).pathname;
export const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url)));

export async function sdsHost(t) {
  resetRateLimits();
  const app = express();
  const hits = [];
  app.use((req, _res, next) => { hits.push({ method: req.method, path: req.path }); next(); });
  app.use(express.json({ limit: '32kb' }));
  app.get('/discovery/task-readiness.json', (_req, res) => res.json(catalogDocument()));
  app.use('/api/public-readiness', createPublicReadinessRouter());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); resetRateLimits(); });
  return { base: `http://127.0.0.1:${server.address().port}`, hits };
}

export function scratch(t) {
  const path = mkdtempSync(join(tmpdir(), 'sol384-qa-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

export function envFor(task, sds, dir, extra = {}) {
  const records = join(dir, `${task.taskId}.sources.private.json`);
  if (!existsSync(records)) writeFileSync(records, JSON.stringify({ schema: 'samedaydesk.caller-source-records.v1', taskId: task.taskId, recipientId: task.recipientId, goal: task.goal, facts: task.facts }), { mode: 0o600 });
  // No inherited grants, paid-provider credentials, NODE_OPTIONS or auth.
  return {
    PATH: '/usr/bin:/bin', LANG: 'C',
    SDS_ACTIVATION_RECIPIENT_ID: task.recipientId,
    SDS_ACTIVATION_SOURCE_RECORDS_FILE: records,
    EIN_CONTINUATION_TASK_ID: task.taskId,
    EIN_CONTINUATION_CUSTOMER_KEY: 'qa-caller-key-sol384',
    EIN_CONTINUATION_INTENDED_EMAIL: 'owner@example.test',
    EIN_CONTINUATION_FILE: join(dir, `${task.taskId}.private.json`),
    EIN_CONTINUATION_LANE: 'disposable_owner_qa',
    EIN_ACTIVATION_BASE_URL: 'http://127.0.0.1:1',
    SDS_ACTIVATION_BASE_URL: sds,
    ...extra,
  };
}

export function run(args, { env, input, binPath = bin, cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('owned caller timeout')); }, 20000);
    child.stdout.on('data', (data) => { stdout += data; if (Buffer.byteLength(stdout) > 65536) child.kill('SIGKILL'); });
    child.stderr.on('data', (data) => { stderr += data; if (Buffer.byteLength(stderr) > 65536) child.kill('SIGKILL'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let json;
      try { json = JSON.parse(stdout); } catch { json = null; }
      resolve({ code, json, stdout, stderr, pid: child.pid, exited: child.exitCode !== null || child.signalCode !== null });
    });
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

export function successful(result) {
  assert.equal(result.exited, true);
  assert.equal(result.code, 0, result.json?.error?.code);
  assert.ok(result.json);
  return result.json;
}

export function refused(result, code) {
  assert.equal(result.exited, true);
  assert.equal(result.code, 2);
  assert.equal(result.json?.error?.code, code);
  return result.json;
}

export async function directReadiness(base, body) {
  const response = await fetch(base + '/api/public-readiness/supplied-row', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}

export function noSecrets(output, secrets) {
  for (const secret of secrets) if (secret) assert.equal(JSON.stringify(output).includes(secret), false, 'private capability leaked');
}
