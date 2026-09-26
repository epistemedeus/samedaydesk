import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { Pool, quoteIdent } from '../src/deps.mjs';
import { SCHEMA, BASE } from '../src/contract.mjs';
export const url = process.env.VF10_TEST_DATABASE_URL;
assert.ok(url && process.env.VF10_TEST_SCRATCH, 'run through tests/disposable-pg.mjs; missing runtime is a failure');
export const settings = { id: 'vf10:private-v1', maxEnrollments: 12, maxEvents: 3, grantSeconds: 3600, workspaceSeconds: 86400 };
export const random = () => randomBytes(32).toString('base64url');
export function attempt(descriptor) { return { proof: random(), body: { schema: SCHEMA, requestId: random(), profileId: descriptor.profile.profileId, termsHash: descriptor.profile.termsHash } }; }
export async function http(base, path, { body, token, key, method = body ? 'POST' : 'GET' } = {}) {
  const start = performance.now();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch(`${base}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json', 'idempotency-key': key ?? body.requestId ?? random() } : {}) }, body: payload });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, ms: performance.now() - start,
    requestBytes: Buffer.byteLength(payload ?? ''), responseBytes: Buffer.byteLength(text), cache: response.headers.get('cache-control') };
}
export const register = (base, a, action = 'register') => http(base, `${BASE}/${action}`, { body: a.body, token: a.proof });
export async function boot(schema, { profile = settings, fault = '', receiver = false, withCells = false, port = '' } = {}) {
  const child = fork(new URL('./host.mjs', import.meta.url), [], { env: { ...process.env, VF10_TEST_SCHEMA: schema,
    VF10_WITH_CELLS: withCells ? '1' : '0', VF10_PROFILE: JSON.stringify(profile), VF10_FAULT: fault, VF10_RECEIVER: receiver ? '1' : '0', VF10_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stderr = ''; child.stdout.resume(); child.stderr.on('data', d => { stderr += d; });
  const exited = once(child, 'exit'); let timer;
  const ready = await Promise.race([once(child, 'message').then(([x]) => x), exited.then(([c]) => { throw new Error(`host failed ${c}: ${stderr}`); }),
    new Promise((_, reject) => { timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('host timeout')); }, 15000); })]).finally(() => clearTimeout(timer));
  return { ...ready, child, exited, logs: () => stderr, async metrics() { const p = once(child, 'message'); child.send('metrics'); return (await p)[0].metrics; },
    async stop() { if (child.exitCode !== null || child.signalCode !== null) return; child.kill('SIGTERM'); await exited; } };
}
export async function db(schema) {
  const pool = new Pool({ connectionString: url, max: 1 });
  return { async query(sql, values) { const c = await pool.connect(); try { await c.query(`SET search_path TO ${quoteIdent(schema)}`); return await c.query(sql, values); } finally { c.release(); } }, close: () => pool.end() };
}
export async function cli(args) {
  const child = spawn(process.execPath, [new URL('../cli.mjs', import.meta.url).pathname, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, err); return JSON.parse(out);
}
export async function counts(database) {
  return (await database.query(`SELECT
    (SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,
    (SELECT count(*)::int FROM correspondence_projects) projects,
    (SELECT count(*)::int FROM correspondence_grants) grants,
    (SELECT charged FROM correspondence_vf10_installation) charged`)).rows[0];
}
export function refused(r, status, code) { assert.equal(r.status, status); assert.equal(r.body.error.code, code); assert.ok(r.body.error.nextAction); }
