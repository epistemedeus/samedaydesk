import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { assertComplete, parseProcess, sha256 } from './oracle.mjs';

export const PACK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(PACK, '../../..');
export const WORKER = join(PACK, 'workers/current.mjs');
export const CLI = join(REPO, 'server/paid-useful-jobs/bin/cli.mjs');
export const MAILBOX = join(REPO, 'tools/result-mailbox/bin/mailbox.mjs');
export const CLOCK = '2026-09-12T07:00:00.000Z';
export function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); return path; }
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

export async function until(fn, label, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = fn();
    if (result) return result;
    await delay(15);
  }
  throw new Error('Timed out waiting for ' + label);
}

export class Context {
  constructor(id) {
    this.id = id;
    this.dir = join(process.env.CW65_EVIDENCE, 'cases', id);
    this.tmp = join(process.env.CW65_SCRATCH, id);
    mkdirSync(this.dir, { recursive: true }); mkdirSync(this.tmp, { recursive: true });
    this.children = []; this.sequence = 0;
  }
  path(...parts) { return join(this.dir, ...parts); }
  json(name, value) { return writeJson(this.path(name + '.json'), value); }
  start(label, args, { timeoutMs = 30_000, env = {} } = {}) {
    const prefix = this.path('processes', String(this.sequence++).padStart(2, '0') + '-' + label);
    mkdirSync(dirname(prefix), { recursive: true });
    const startedAt = new Date().toISOString();
    const child = spawn(process.execPath, ['--max-old-space-size=768', ...args], {
      cwd: REPO, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768', TMPDIR: this.tmp,
        MANAGED_ORDER_WRAPPER_ROOT: join(REPO, 'server/paid-useful-jobs'),
        MANAGED_ORDER_EXECUTE_URL: '', MANAGED_ORDER_DATABASE_URL: '', HOST: '127.0.0.1', PORT: '0', ...env },
    });
    const handle = { child, pid: child.pid, prefix, stdout: '', stderr: '', closed: false, timedOut: false };
    const kill = signal => { if (!handle.closed) { try { process.kill(-child.pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; } } };
    handle.kill = kill;
    let escalation;
    const timer = setTimeout(() => { handle.timedOut = true; kill('SIGTERM'); escalation = setTimeout(() => kill('SIGKILL'), 300); }, timeoutMs);
    child.stdout.on('data', chunk => { handle.stdout += chunk; if (handle.stdout.length > 2 * 1024 * 1024) kill('SIGTERM'); });
    child.stderr.on('data', chunk => { handle.stderr += chunk; if (handle.stderr.length > 2 * 1024 * 1024) kill('SIGTERM'); });
    handle.done = new Promise((resolveDone, reject) => {
      child.on('error', reject);
      child.on('close', (status, signal) => {
        clearTimeout(timer); clearTimeout(escalation); handle.closed = true;
        const record = { pid: child.pid, command: process.execPath, args, cwd: REPO,
          heapMB: 768, tmpdir: this.tmp, startedAt, endedAt: new Date().toISOString(), status, signal,
          timedOut: handle.timedOut, stdout: handle.stdout, stderr: handle.stderr };
        writeFileSync(prefix + '.stdout', handle.stdout); writeFileSync(prefix + '.stderr', handle.stderr);
        const { stdout, stderr, ...metadata } = record; writeJson(prefix + '.json', metadata);
        resolveDone(record);
      });
    });
    this.children.push(handle);
    return handle;
  }
  async stop(handle, signal = 'SIGTERM') {
    if (!handle.closed) {
      handle.kill(signal);
      await Promise.race([handle.done, delay(500)]);
      if (!handle.closed) handle.kill('SIGKILL');
    }
    return handle.done;
  }
  async cleanup() {
    for (const child of this.children) await this.stop(child);
    const checks = this.children.map(({ pid, closed }) => {
      let alive = false; try { process.kill(pid, 0); alive = true; } catch (e) { if (e.code !== 'ESRCH') throw e; }
      return { pid, closed, alive };
    });
    this.json('cleanup', checks);
    assert.ok(checks.every(c => c.closed && !c.alive), 'owned child not reaped');
  }
  async worker(label, config) {
    const configPath = this.json('requests/' + label, config);
    return parseProcess(await this.start(label, [WORKER, configPath]).done);
  }
  startWorker(label, config) { return this.start(label, [WORKER, this.json('requests/' + label, config)]); }
  async cli(label, fixture, outDir = this.path('published', label), extra = []) {
    return parseProcess(await this.start(label, [CLI, 'run', fixture.jobId,
      ...Object.entries(fixture.inputs).flatMap(([k, v]) => ['--' + k, v]), '--out-dir', outDir, ...extra]).done);
  }
  async mailbox(label, args, env = {}) {
    return parseProcess(await this.start(label, [MAILBOX, ...args, '--clock', CLOCK], { env }).done);
  }
  verify(label, body, fixture, executionId) {
    this.json('results/' + label, body);
    if (body.runOutDir && existsSync(body.runOutDir)) {
      const dest = this.path('packages', label); cpSync(body.runOutDir, dest, { recursive: true });
    }
    return assertComplete(body, { ...fixture, executionId });
  }
  async server(label = 'http', config = {}) {
    const ready = this.path(label + '-ready.json');
    const handle = this.startWorker(label, { mode: 'server', ready, ...config });
    const info = await until(() => existsSync(ready) && readJson(ready), label + ' listen');
    return { ...info, handle };
  }
  async http(label, origin, path, body, headers = {}) {
    return this.worker(label, { mode: 'http', origin, path, body, headers });
  }
}

// Fresh caller inputs. No old PR52, I01, SAMPLE or historical accepted-output fixtures.
export function fixture(ctx, label, { jobId = 'vendor-budget-impact', change = true } = {}) {
  let before, after, outputs;
  if (jobId === 'vendor-budget-impact') {
    before = { label: 'cw65-caller-' + label, rows: [{ field: label + '-input', value: 2, unit: 'USD/1M-tokens' }] };
    after = { ...before, rows: [{ ...before.rows[0], value: change ? 3 : 2 }] };
    outputs = ['budget-impact.json', 'budget-impact.md'];
  } else if (jobId === 'lockfile-pin-delta') {
    const lock = version => ({ name: 'cw65-' + label, version: '1.0.0', lockfileVersion: 3, requires: true,
      packages: { '': { name: 'cw65-' + label, version: '1.0.0', dependencies: { 'cw65-lib': '^1.0.0' } },
        'node_modules/cw65-lib': { version, resolved: 'https://registry.invalid/cw65-lib/-/cw65-lib-' + version + '.tgz' } } });
    before = lock('1.0.0'); after = lock(change ? '1.1.0' : '1.0.0');
    outputs = ['pin-delta.json', 'pin-delta.md'];
  } else throw new Error('No fresh input generator for ' + jobId);
  const inputs = { before: ctx.json('inputs/' + label + '-before', before), after: ctx.json('inputs/' + label + '-after', after) };
  return { jobId, inputs, outputs, inputHashes: Object.fromEntries(Object.entries(inputs).map(([k, p]) => [k, sha256(readFileSync(p))])) };
}

export function executionRequest(ctx, label, f) {
  return { jobId: f.jobId, executionId: 'cw65-' + label, inputs: f.inputs, outDir: ctx.path('published', label) };
}
