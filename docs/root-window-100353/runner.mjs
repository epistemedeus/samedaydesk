#!/usr/bin/env node
// Invoked on the enrolled remote host. No local inference or provider API key.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const [specFile] = process.argv.slice(2);
if (!specFile) throw new Error('expected one explicit remote job specification');
const spec = JSON.parse(await readFile(specFile, 'utf8'));
if (!/^ROOT-SOL-[A-Z0-9-]+-1003\d\d$/.test(spec.id)) throw new Error('invalid job id');
if (!/^codex\/[a-z0-9-]+$/.test(spec.branch)) throw new Error('invalid branch');
if (!/^https:\/\/github.com\/epistemedeus\/[a-zA-Z0-9-]+\.git$/.test(spec.repository)) throw new Error('invalid repository');
if (!/^[0-9a-f]{40}$/.test(spec.base)) throw new Error('exact base required');
if (!['max', 'xhigh', 'high'].includes(spec.effort)) throw new Error('invalid effort');
if (spec.model !== 'gpt-6.1-sol') throw new Error('this bounded window uses the requested native model');
const root = resolve(spec.root);
const worktree = resolve(spec.worktree);
const promptPath = resolve(spec.prompt);
const cli = resolve(spec.cli);
if (![worktree, promptPath, cli].every(p => p.startsWith('/home/ubuntu/'))) throw new Error('remote-owned paths required');
if (!root.startsWith('/home/ubuntu/root-sol-window100337/')) throw new Error('owned result directory required');
await stat(cli);
const memory = await readFile('/proc/meminfo', 'utf8');
const availableKiB = Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]);
if (!Number.isFinite(availableKiB) || availableKiB < 3 * 1024 * 1024) throw new Error('remote memory reserve reached; use another warm host');
await mkdir(root, { recursive: true, mode: 0o700 });
const receiptPath = join(root, 'RUN.json');
try { await stat(receiptPath); throw new Error('owned job already exists; inspect its exact session, do not replay'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const env = { ...process.env };
delete env.OPENAI_API_KEY;
delete env.AZURE_OPENAI_API_KEY;
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
const run = (args, cwd) => execFileSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
const begin = {
  id: spec.id, model: spec.model, effort: spec.effort,
  source: spec.base, repository: spec.repository, branch: spec.branch,
  worktree, promptPath, startedAt: new Date().toISOString(),
  availableKiBAtAdmission: availableKiB, state: 'preparing',
  authentication: 'native-chatgpt', nativeSessionObserved: false,
};
await writeFile(receiptPath, JSON.stringify(begin, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
try {
  try { await stat(join(worktree, '.git')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    run(['clone', '--filter=blob:none', spec.repository, worktree]);
  }
  if (run(['status', '--porcelain'], worktree).trim()) throw new Error('worktree not clean; preserve existing work');
  run(['fetch', 'origin', spec.base], worktree);
  run(['switch', '-c', spec.branch, spec.base], worktree);
  if (run(['rev-parse', 'HEAD'], worktree).trim() !== spec.base) throw new Error('source mismatch');
  const prompt = await readFile(promptPath, 'utf8');
  if (!prompt.trim() || Buffer.byteLength(prompt) > 128 * 1024) throw new Error('invalid bounded prompt');
  begin.state = 'running';
  await writeFile(receiptPath, JSON.stringify(begin, null, 2) + '\n', { mode: 0o600 });
  const log = createWriteStream(join(root, 'events.jsonl'), { flags: 'wx', mode: 0o600 });
  const child = spawn(cli, [
    '--ask-for-approval', 'never', 'exec', '--sandbox', 'danger-full-access',
    '--ignore-user-config', '-m', spec.model, '-c', `model_reasoning_effort="${spec.effort}"`,
    '--json', '-C', worktree, '-o', join(root, 'RESULT.md'), '-',
  ], { cwd: worktree, env, stdio: ['pipe', 'pipe', 'pipe'] });
  begin.pid = child.pid;
  await writeFile(receiptPath, JSON.stringify(begin, null, 2) + '\n', { mode: 0o600 });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.stdin.end(prompt);
  const code = await new Promise((done, fail) => { child.once('error', fail); child.once('close', done); });
  await new Promise(done => log.end(done));
  Object.assign(begin, { state: code === 0 ? 'terminal' : 'terminal-failed', exitCode: code,
    finishedAt: new Date().toISOString(), exportedHead: run(['rev-parse', 'HEAD'], worktree).trim() });
  // Parse bounded event lines for actual session and usage, without relaying transcripts.
  let carry = '', discard = false;
  const consume = line => {
    let event; try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'thread.started') { begin.nativeSession = event.thread_id; begin.nativeSessionObserved = true; }
    if (event.type === 'turn.completed' && event.usage) begin.usage = event.usage;
  };
  for await (const chunk of createReadStream(join(root, 'events.jsonl'), { encoding: 'utf8', highWaterMark: 64 * 1024 })) {
    for (const piece of chunk.split(/(?<=\n)/)) {
      if (!discard) carry += piece;
      if (carry.length > 1024 * 1024) { carry = ''; discard = true; }
      if (piece.endsWith('\n')) { if (!discard) consume(carry); carry = ''; discard = false; }
    }
  }
  if (carry && !discard) consume(carry);
  await writeFile(receiptPath, JSON.stringify(begin, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ id: begin.id, state: begin.state, exitCode: code, head: begin.exportedHead }));
} catch (error) {
  Object.assign(begin, { state: 'terminal-failed', finishedAt: new Date().toISOString(), failure: error.message });
  await writeFile(receiptPath, JSON.stringify(begin, null, 2) + '\n', { mode: 0o600 });
  throw error;
}
