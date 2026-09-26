import {PORTABLE_KIND} from './portable-profile.mjs';
import {supervisePortable} from './portable-supervisor.mjs';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { requireThat as need } from '../../validation/src/index.mjs';

/** Private installed supervisor. Host HTTP credentials cannot invoke this port.
 * Persist launch intent BEFORE spawn, then gate child execution on identity commit.
 * Any lost supervisor leaves capacity held. No PID-only automatic reconciliation. */
export async function supervise(store, projectId, assignmentId, { withholdExit = false, ...portableOptions } = {}) {
  const supervisor = `supervisor:${randomUUID()}`;
  const attempt = await store.claimAttempt(projectId, assignmentId, supervisor);
  if(attempt.notLaunched)return {assignmentId,terminationObserved:true,notLaunched:true};
  if(attempt.artifact.kind===PORTABLE_KIND)return supervisePortable(store,projectId,attempt,portableOptions);
  const child = fork(new URL('./runner-child.mjs', import.meta.url), [], {
    execPath: '/usr/bin/prlimit',
    execArgv: ['--cpu=2:2', '--', process.execPath, '--max-old-space-size=64'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { PATH: process.env.PATH, LANG: 'C' },
  });
  const exited = once(child, 'exit');
  const resultPromise = new Promise(resolve => {
    child.once('message', message => resolve(message.type === 'result' ? message.result : null));
    child.once('exit', () => resolve(null));
  });
  const identity = { pid: child.pid, supervisorPid: process.pid,
    bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
    startTicks: (await readFile(`/proc/${child.pid}/stat`, 'utf8')).split(') ')[1].split(' ')[19] };
  try { await store.runnerWrite(projectId, assignmentId, supervisor, attempt.fence, { processIdentity: identity }); }
  catch (error) { child.kill('SIGKILL'); await exited; throw error; }
  child.send({ type: 'execute', withholdExit, input: { assignment: attempt.assignment, artifact: attempt.artifact,
    manifest: attempt.manifest, verification:attempt.verification, dependencyVersions: attempt.manifest.dependencies } });
  // Deterministic bounded evaluator has no network or loops over unbounded data.
  // Wall deadline and V8 heap bound are enforced here; CPU usage is measured.
  // Tests may withhold exit until explicit release, but retain durable capacity.
  const timeout = withholdExit ? null : setTimeout(() => child.kill('SIGKILL'), Math.max(1, Date.parse(attempt.assignment.deadline) - Date.now()));
  const result = await resultPromise;
  if (result) await store.runnerWrite(projectId, assignmentId, supervisor, attempt.fence, { result });
  const finish = async () => {
    const [code, signal] = await exited; clearTimeout(timeout);
    await store.runnerWrite(projectId, assignmentId, supervisor, attempt.fence, { termination: {
      exited: true, code, signal, identity, witnessedBy: supervisor, observedAt: new Date().toISOString() } });
    return { assignmentId, result, terminationObserved: true };
  };
  if (withholdExit) return { assignmentId, result, pid: child.pid, async release() { child.kill('SIGKILL'); return finish(); } };
  return finish();
}
