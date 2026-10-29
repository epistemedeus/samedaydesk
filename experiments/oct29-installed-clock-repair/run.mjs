// Run serially on the admitted remote writer. Each invocation keeps earlier logs.
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const at = new Date().toISOString();
const runDir = new URL(`./evidence/run-${at.replaceAll(':', '-')}/`, import.meta.url);
mkdirSync(runDir, {recursive: true});
const commands = [
  ['cold-install', 'npm', ['ci', '--omit=dev', '--ignore-scripts']],
  ['source', 'node', ['experiments/oct29-installed-clock-repair/qualify.mjs', 'source']],
  ['caller', 'node', ['experiments/oct29-installed-clock-repair/qualify.mjs', 'caller']],
  ['pg-resolver', 'node', ['--test', 'server/scripts/test-postgres-bin.mjs']],
  ['managed-watch', 'npm', ['run', 'test:managed-watch']],
  ['http-pg-recipient', 'node', ['experiments/oct29-receive-time-freshness/accept.mjs']],
  ['cold-proxy', 'npm', ['run', 'test:proxy-addr']],
  ['startup-diagnostic', 'node', ['--test', 'server/scripts/test-correspondence-startup-diagnostic.js']],
  ['hosted-startup', 'npm', ['run', 'test:hosted-startup']],
  ['machine-discovery', 'npm', ['run', 'test:machine-discovery']],
  ['managed-build', 'npm', ['run', 'build:managed-foundry']],
  ['public', 'node', ['experiments/oct29-installed-clock-repair/qualify.mjs', 'public']],
];
const selected = process.argv.slice(2);
const report = {schema: 'h64334.serial-remote-commands.v1', startedAt: at, source: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), node: process.version, platform: process.platform, arch: process.arch, commands: []};
function sampleTree() {
  const rows = [];
  for (const pid of readdirSync('/proc').filter(n => /^\d+$/.test(n))) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ');
      const rss = Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1] || 0);
      rows.push({pid: Number(pid), ppid: Number(fields[1]), rssKiB: rss});
    } catch { /* child exited */ }
  }
  const descendants = new Set([process.pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (descendants.has(row.ppid) && !descendants.has(row.pid)) { descendants.add(row.pid); changed = true; }
  }
  return rows.filter(row => descendants.has(row.pid)).reduce((sum, row) => sum + row.rssKiB, 0);
}
function save() { writeFileSync(new URL('commands.json', runDir), JSON.stringify(report, null, 2) + '\n'); }
for (const [name, command, args] of commands) {
  if (selected.length && !selected.includes(name)) continue;
  const row = {name, command, args, cwd: root, startedAt: new Date().toISOString(), peakSampledTreeRssKiB: sampleTree()};
  console.log(`START ${name} ${row.startedAt}`);
  const child = spawn(command, args, {cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe']});
  const stdout = [], stderr = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  const timer = setInterval(() => { row.peakSampledTreeRssKiB = Math.max(row.peakSampledTreeRssKiB, sampleTree()); }, 200);
  try {
    [row.code, row.signal] = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (...result) => resolve(result)); });
  } catch (error) { row.error = error.message; row.code = null; }
  clearInterval(timer);
  row.finishedAt = new Date().toISOString();
  const outFile = new URL(`${name}.stdout.log`, runDir), errFile = new URL(`${name}.stderr.log`, runDir);
  writeFileSync(outFile, Buffer.concat(stdout)); writeFileSync(errFile, Buffer.concat(stderr));
  row.stdout = path.basename(fileURLToPath(outFile)); row.stderr = path.basename(fileURLToPath(errFile));
  report.commands.push(row);
  save();
  console.log(`END ${name} code=${row.code} peakTreeKiB=${row.peakSampledTreeRssKiB}`);
  if (name === 'http-pg-recipient') {
    // Unmodified H31 helper retains its schema label. These are newly executed H34 bytes.
    const generated = new URL('../oct29-receive-time-freshness/evidence/', import.meta.url);
    const archive = new URL('./fresh-http-pg-recipient/', runDir);
    mkdirSync(archive, {recursive: true});
    for (const name of ['acceptance.json', 'commands.txt', 'clocks.json', 'delayed-response.json']) {
      try { writeFileSync(new URL(name, archive), readFileSync(new URL(name, generated))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  if (row.code !== 0 || row.signal) { process.exitCode = 1; break; }
}
report.finishedAt = new Date().toISOString();
report.ok = report.commands.every(row => row.code === 0 && !row.signal);
save();
console.log(fileURLToPath(new URL('commands.json', runDir)));
