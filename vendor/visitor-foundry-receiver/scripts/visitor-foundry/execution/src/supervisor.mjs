import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { bytesHash, hash, PROFILE, SCHEMA, validateArtifact, validateBinding, encodeInput, decodeOutput, copy, check } from './contracts.mjs';

export const python = fileURLToPath(new URL('../.runtime/bin/python', import.meta.url));
const childPath = fileURLToPath(new URL('./child.py', import.meta.url));
// Includes the wrapper and exact native library, not just a claimed version string.
export function installation() {
  check(process.platform === PROFILE.platform && process.arch === PROFILE.arch, 'runtime platform');
  const lib = fileURLToPath(new URL('../.runtime/lib/', import.meta.url));
  // Site path comes from the task-local venv configuration, not a caller path.
  const cfg = readFileSync(new URL('../.runtime/pyvenv.cfg', import.meta.url), 'utf8');
  const version = cfg.match(/^version = (\d+\.\d+)\./m)?.[1]; check(version, 'python installation');
  const bindingRoot = `${lib}python${version}/site-packages/wasmtime`;
  const bindingFiles = readdirSync(bindingRoot, { recursive: true }).filter(f => f.endsWith('.py')).sort();
  const pins = { profile: PROFILE, node: process.version, python: bytesHash(readFileSync(python)),
    binding: hash(bindingFiles.map(path => ({ path, digest: bytesHash(readFileSync(`${bindingRoot}/${path}`)) }))),
    native: bytesHash(readFileSync(`${lib}python${version}/site-packages/wasmtime/linux-x86_64/_libwasmtime.so`)),
    worker: bytesHash(readFileSync(childPath)), supervisor: bytesHash(readFileSync(fileURLToPath(import.meta.url))),
    contracts: bytesHash(readFileSync(new URL('./contracts.mjs', import.meta.url))) };
  return { pins, runtimePin: hash(pins) };
}
function identity(child) {
  const stat = readFileSync(`/proc/${child.pid}/stat`, 'utf8');
  return { pid: child.pid, supervisorPid: process.pid,
    bootId: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    startTicks: stat.slice(stat.lastIndexOf(') ') + 2).split(' ')[19] };
}
/** Internal process mechanism, exported for deterministic failure-witness tests.
 * launch is installed code only. Never accept it from artifact/HTTP data. */
export function superviseProcess({ launch, payload, limits, signal, onSpawn, exitGraceMs = 1000 }) {
  return new Promise(resolve => {
    const start = performance.now(); let child, processIdentity = null, result = null, buffer = '', outputBytes = 0;
    const phasesObserved = []; let phaseStarted = start;
    let phase = 'compile', stopped = null, finished = false, exited = false, stageTimer, graceTimer, totalTimer;
    const phases = ['compile', 'instantiate', 'execute']; let phaseIndex = -1;
    const clean = () => { clearTimeout(stageTimer); clearTimeout(totalTimer); clearTimeout(graceTimer); signal?.removeEventListener('abort', abort); };
    const finish = (termination, code = null) => {
      if (finished) return;
      if (!stopped && code === 0 && result?.status === 'ok' && (performance.now()-start > limits.wallMs || performance.now()-phaseStarted > limits[`${phase}Ms`])) stopped = 'deadline_exceeded';
      finished = true; clean();
      resolve({ status: !termination.exited && !termination.noLaunch ? 'unknown' : stopped ?? (code === 0 && result ? result.status : 'incomplete'),
        code: stopped ?? result?.code ?? null, phase, phasesObserved, result, processIdentity, termination,
        wallMs: performance.now()-start });
    };
    const stop = reason => {
      if (stopped || finished) return; stopped = reason; clearTimeout(stageTimer);
      if (!child?.pid) return;
      // SIGKILL is requested; only the subsequent exit event is a witness.
      try { child.kill('SIGKILL'); } catch {}
      graceTimer = setTimeout(() => { child.unref?.(); child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy();
        finish({ exited: false, noLaunch: false, code: null, signal: null }); }, exitGraceMs);
    };
    const abort = () => stop('cancelled');
    if (signal?.aborted) { stopped = 'cancelled'; finish({ exited: false, noLaunch: true, code: null, signal: null }); return; }
    try { child = launch(); } catch { finish({ exited: false, noLaunch: true, code: null, signal: null }); return; }
    totalTimer = setTimeout(() => stop('wall_timeout'), limits.wallMs);
    stageTimer = setTimeout(() => stop('compile_timeout'), limits.compileMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => { if (!child.pid) finish({ exited: false, noLaunch: true, code: null, signal: null }); else stop('process_error'); });
    child.stdin.on('error', () => stop('input_pipe_error'));
    child.stderr.on('data', data => { outputBytes += data.length; if (outputBytes > 65536 + limits.outputBytes*2) stop('protocol_limit'); });
    child.stdout.on('data', data => {
      if (stopped || finished) return;
      outputBytes += data.length;
      if (outputBytes > 65536 + limits.outputBytes*2) { stop('protocol_limit'); return; }
      buffer += data.toString('utf8');
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index+1);
        try {
          const message = JSON.parse(line);
          if (message.phase) {
            check(phases[++phaseIndex] === message.phase && !result, 'phase order');
            if (performance.now()-phaseStarted > limits[`${phase}Ms`]) { stop(`${phase}_timeout`); return; }
            if (message.phase !== 'compile') phaseStarted = performance.now();
            phase = message.phase; phasesObserved.push({ phase, wallMs: performance.now()-start });
            // Compile's timer includes startup, and cannot be reset by ready.
            if (phase !== 'compile') { clearTimeout(stageTimer); stageTimer = setTimeout(() => stop(`${phase}_timeout`), limits[`${phase}Ms`]); }
          } else {
            check(message.result && !result && ['ok', 'error'].includes(message.result.status), 'result protocol');
            result = message.result; // Timer remains active until actual exit.
          }
        } catch { stop('protocol_error'); return; }
      }
    });
    child.once('exit', (code, signalName) => { exited = true; finish({ exited: true, noLaunch: false, code, signal: signalName }, code); });
    child.once('spawn', async () => {
      try {
        processIdentity = identity(child);
        if (onSpawn) await onSpawn(copy(processIdentity)); // Receiver commits identity before any guest bytes.
        if (!stopped && !finished && !exited) child.stdin.end(JSON.stringify(payload)+'\n');
      } catch { stop('launch_gate_failed'); }
    });
  });
}
export async function invoke({ artifact, moduleBytes, input, binding, signal, onSpawn }) {
  // Snapshot everything before await: callers cannot mutate pins while child runs.
  artifact = copy(artifact); moduleBytes = Buffer.from(moduleBytes); binding = copy(binding);
  validateArtifact(artifact, moduleBytes); validateBinding(binding, artifact);
  const runtime = installation(); check(runtime.runtimePin === binding.runtimePin, 'runtime binding mismatch');
  const inputBytes = encodeInput(artifact, input); const l = artifact.limits;
  const args = [`--as=${l.addressSpaceBytes}:${l.addressSpaceBytes}`, `--cpu=${l.cpuSeconds}:${l.cpuSeconds}`,
    `--stack=${l.hostStackBytes}:${l.hostStackBytes}`, `--fsize=${l.fileBytes}:${l.fileBytes}`,
    `--nofile=${l.openFiles}:${l.openFiles}`, '--core=0:0', '--', python, '-I', '-B', childPath];
  const observation = await superviseProcess({
    launch: () => spawn('/usr/bin/prlimit', args, { env: { LANG: 'C', LC_ALL: 'C' }, cwd: '/', stdio: ['pipe', 'pipe', 'pipe'] }),
    payload: { module: moduleBytes.toString('base64'), moduleDigest: artifact.module.digest,
      input: inputBytes.toString('base64'), limits: l }, limits: l, signal, onSpawn,
  });
  let output = null, outputDigest = null;
  if (observation.status === 'ok') {
    try {
      check(typeof observation.result.output === 'string' && observation.result.output.length <= Math.ceil(l.outputBytes/3)*4, 'output encoding');
      const bytes = Buffer.from(observation.result.output, 'base64'); check(bytes.toString('base64') === observation.result.output, 'output encoding');
      output = decodeOutput(artifact, bytes); outputDigest = bytesHash(bytes);
      const usage = observation.result.usage;
      for (const key of ['cpuMs','peakRssBytes','fuelUsed','compileMs','instantiateMs','executeMs']) check(Number.isFinite(usage[key]) && usage[key] >= 0, 'usage protocol');
      check(usage.fuelUsed <= l.fuel && usage.peakRssBytes <= l.addressSpaceBytes, 'usage bounds');
    } catch { observation.status = 'invalid_output'; output = null; outputDigest = null; }
  }
  const record = { schema: `${SCHEMA}.observation.v1`, binding, inputDigest: bytesHash(inputBytes), outputDigest,
    status: observation.status, code: observation.code, phase: observation.phase, phasesObserved: observation.phasesObserved, processIdentity: observation.processIdentity,
    termination: observation.termination, runtimePin: runtime.runtimePin, limits: l,
    usage: { wallMs: observation.wallMs, ...(observation.status === 'ok' ? observation.result.usage :
      { cpuMs: null, peakRssBytes: null, fuelUsed: null, compileMs: null, instantiateMs: null, executeMs: null }), cost: null },
    observedAt: new Date().toISOString(), outcome: 'observed_execution', compatibility: 'unqualified' };
  return { output, observation: { ...record, id: hash(record) } };
}
