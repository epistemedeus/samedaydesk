#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { artifact, baseline, candidate, harness, manifest, observation } from './fixtures/example-config.mjs';
import { checkCard, compareCohorts, digest, projectReuse, requireThat as need, schemaId } from './src/index.mjs';
const root = fileURLToPath(new URL('./', import.meta.url));
function read(path) {
  const stat = lstatSync(path); need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 65536, 'bounded_regular_file_required');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function write(path, body) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' }); }
function ok(value) { need(value.ok, value.code ?? 'fixture_failed', value.nextAction); return value.result; }
function sameFixture(bundle) {
  need(bundle.provenance === 'owner_controlled_fixture' && digest(bundle.candidate) === digest(candidate()) && digest(bundle.artifact) === digest(artifact), 'fixture_binding_mismatch');
}
function run(command, flags) {
  if (command === 'seed') {
    const body = { schema: schemaId('fixture_bundle'), provenance: 'owner_controlled_fixture', candidate: candidate(), artifact };
    write(flags.output, body); return { candidateFile: flags.output, candidateId: body.candidate.id, provenance: body.provenance };
  }
  if (command === 'replay') {
    const input = read(flags.input); sameFixture(input);
    const h = harness(); const result = h.accept(input.candidate);
    const body = { ...input, receipt: result.receipt, admission: result.result, note: 'Independent assignment mechanism exercised with owner-controlled fixture handles; not production execution.' };
    write(flags.output, body); return { receiptFile: flags.output, ...result.result.result, provenance: input.provenance };
  }
  if (command === 'reuse') {
    const input = read(flags.input); sameFixture(input);
    // Cold process has no saved authenticated session. Re-execute installed policy;
    // a serialized receipt/handle cannot initialize a trusted accepted state.
    const h = harness(); const checked = h.accept(input.candidate);
    const material = r => ({ ...r, usage: null });
    need(digest(material(input.receipt)) === digest(material(checked.receipt)), 'saved_receipt_replay_mismatch');
    const cold = read(`${root}fixtures/cold-task.json`);
    const actual = checkCard(input.artifact, cold.card);
    const succeeded = digest(actual.issues) === digest(cold.expectedIssues);
    const legacyRule = { ...artifact, maxDescriptionLength: 4096 }; // Frozen v0 permissive limit.
    const baselineOutput = checkCard(legacyRule, cold.card).issues;
    const baselineSucceeded = digest(baselineOutput) === digest(cold.expectedIssues);
    h.advance(60000);
    ok(h.command('beneficiary', 'observe', observation({ taskInputDigest: digest(cold.card), outcome: succeeded ? 'useful' : 'failed' })));
    const second = observation({ id: 'reuse:c', taskId: 'task:cold-contribution-arm', taskInputDigest: digest(cold.card), outcome: succeeded ? 'useful' : 'failed', cohort: { ...observation().cohort, arm: 'contribution' } });
    ok(h.command('beneficiary', 'observe', second));
    const frozen = { ...manifest(), cases: [{ id: cold.caseId, taskInputDigest: digest(cold.card) }], baselineSource: { ref: 'fixture:legacy-rule', revision: digest(legacyRule) }, arms: ['baseline', 'reuse_only', 'contribution'] };
    const report = {
      schema: schemaId('cold_reuse_example'), provenance: 'owner_controlled_fixture', productionExecution: false,
      candidateId: input.candidate.id, replayedInColdProcess: true, actual, expectedIssues: cold.expectedIssues, taskSucceeded: succeeded,
      projection: projectReuse(h.service.snapshot()), cohorts: compareCohorts(h.service.snapshot(), frozen, [{ ...baseline(), taskInputDigest: digest(cold.card), outcome: baselineSucceeded ? 'useful' : 'failed' }]),
      repeatTaskAttempt: h.command('beneficiary', 'observe', observation({ id: 'reuse:renamed-repeat', taskInputDigest: digest(cold.card) })),
      note: 'Two owner-controlled fixture arms exercise the same frozen case. This establishes mechanics, not network uplift, independent visitors, total cost, or revenue.',
    };
    write(flags.output, report); return report;
  }
  if (command === 'example') {
    const dir = flags.directory ?? `${root}.local/cold-example-${Date.now()}`;
    mkdirSync(dir, { recursive: true });
    const steps = [ ['seed', '--output', `${dir}/candidate.json`], ['replay', '--input', `${dir}/candidate.json`, '--output', `${dir}/verified.json`], ['reuse', '--input', `${dir}/verified.json`, '--output', `${dir}/reuse.json`] ];
    const outputs = steps.map(args => {
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
      need(child.status === 0, 'cold_child_failed', child.stderr || child.stdout);
      return JSON.parse(child.stdout);
    });
    return { provenance: 'owner_controlled_fixture', directory: resolve(dir), separateColdProcesses: 3, accepted: outputs[1].acceptance, taskSucceeded: outputs[2].taskSucceeded, cohortStatus: outputs[2].cohorts.status, repeatedTaskSuppressed: outputs[2].repeatTaskAttempt.code === 'repeated_task', externalUsefulTasks: outputs[2].projection.cohorts.reduce((n, c) => n + c.establishedUsefulExternalTasks, 0), costsUnknown: true };
  }
  throw new Error('Use: example [--directory DIR] | seed --output FILE | replay --input FILE --output FILE | reuse --input FILE --output FILE');
}
try {
  const [command = 'example', ...args] = process.argv.slice(2); const flags = {};
  const allowed = command === 'example' ? ['directory'] : command === 'seed' ? ['output'] : ['input', 'output'];
  for (let i = 0; i < args.length; i += 2) {
    need(args[i].startsWith('--') && allowed.includes(args[i].slice(2)) && args[i + 1] && !Object.hasOwn(flags, args[i].slice(2)), 'unsupported_cli_argument');
    flags[args[i].slice(2)] = resolve(args[i + 1]);
  }
  if (command !== 'example') need(allowed.every(k => flags[k]), 'missing_cli_argument');
  console.log(JSON.stringify(run(command, flags), null, 2));
} catch (error) { console.error(JSON.stringify({ ok: false, code: error.code ?? 'cli_error', message: error.message, nextAction: error.nextAction })); process.exitCode = 2; }
