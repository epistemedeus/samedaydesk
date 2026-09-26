import os from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { boot, project, grant, create, state, mutate, command, pg, databaseUrl, root } from './tests/helpers.mjs';

const output = `${root}scripts/visitor-foundry/work-cells/evidence/benchmark.json`;
const hosts = [], runs = [];
const now = () => new Date().toISOString();
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const processResources = (pid) => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  return { pid, cpuTicks: Number(stat[13]) + Number(stat[14]), rssKiB: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]), highWaterRssKiB: Number(/VmHWM:\s+(\d+)/.exec(status)?.[1]) };
};
const db = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const report = { schema: 'neomorphic.foundry.work-cell-benchmark.v1', recordedAt: now(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  evidenceClass: 'owner-controlled-loopback-mechanics; not demand, independent operators, or production capacity',
  conditions: { node: process.version, kernel: os.release(), cpuCount: os.cpus().length,
    cpuModel: os.cpus()[0].model, memoryTotalBytes: os.totalmem(), memoryFreeBeforeBytes: os.freemem(),
    loadBefore: os.loadavg(), hosts: 2, vf02PoolMaxPerHost: 2, basePoolMaxPerHost: 1,
    pgMaxConnections: 24, pgSharedBuffers: '32MB', fsync: true, synchronousCommit: true,
    requestTimeoutMs: 10000, lockTimeoutMs: 1500, poolAcquireTimeoutMs: 3000,
    repeats: 3, ticksPerSecond: Number(execFileSync('getconf', ['CLK_TCK']).toString().trim()),
    payloadBytes: Buffer.byteLength(JSON.stringify(command('claim', 1, { ttlSeconds: 60, voluntaryOptIn: true }))),
    setupExcluded: true, sharedVm: true, syntheticGap: true }, runs };
try {
  hosts.push(await boot(), await boot());
  const p = await project(hosts[0].baseUrl), writer = await grant(hosts[0].baseUrl, p);
  report.conditions.hostsBefore = hosts.map((h) => processResources(h.pid));
  report.conditions.postgres = (await db.query('SELECT version() AS version')).rows[0].version;
  for (const offered of [1, 8, 32, 128]) for (const pattern of ['independent', 'contended', 'duplicate']) {
    for (let repeat = 0; repeat < 3; repeat++) {
      const cells = [];
      for (let i = 0; i < (pattern === 'independent' ? offered : 1); i++) cells.push(state(await create(hosts[i % 2].baseUrl, p)));
      const commonKey = randomUUID(), times = [], statuses = {};
      const start = performance.now();
      let accepted = 0, replayed = 0, conflicted = 0, failed = 0;
      await Promise.all(Array.from({ length: offered }, async (_, i) => {
        const begin = performance.now();
        try {
          const r = await mutate(hosts[i % 2].baseUrl, p, cells[pattern === 'independent' ? i : 0], writer.token,
            'claim', { ttlSeconds: 60, voluntaryOptIn: true }, pattern === 'duplicate' ? commonKey : randomUUID());
          const status = r.body?.error?.code ?? String(r.status);
          statuses[status] = (statuses[status] ?? 0) + 1;
          if (r.status === 201) accepted++;
          else if (r.status === 200 && r.body.replayed) replayed++;
          else if (r.status === 409) conflicted++;
          else failed++;
        } catch { failed++; statuses.transport_unknown = (statuses.transport_unknown ?? 0) + 1; }
        times.push(performance.now() - begin);
      }));
      const elapsedMs = performance.now() - start;
      runs.push({ offeredClients: offered, pattern, repeat, accepted, replayed, conflicted, failed,
        elapsedMs, acceptedPerSecond: accepted / (elapsedMs / 1000), statuses,
        latencyMs: { min: Math.min(...times), p50: percentile(times, .5), p95: percentile(times, .95), max: Math.max(...times) },
        loadAverage: os.loadavg(), freeMemoryBytes: os.freemem(), hosts: hosts.map((h) => processResources(h.pid)) });
      console.log(JSON.stringify(runs.at(-1)));
    }
  }
  report.conditions.hostsAfter = hosts.map((h) => processResources(h.pid));
  report.conditions.memoryFreeAfterBytes = os.freemem();
  report.conditions.loadAfter = os.loadavg();
  report.conditions.connectionsAtEnd = (await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database()")).rows[0].count;
  report.complete = true;
} finally {
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  await Promise.all(hosts.map((h) => h.stop()));
  await db.end();
}
