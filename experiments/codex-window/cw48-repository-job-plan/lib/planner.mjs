import { readFileSync, writeFileSync, mkdirSync, lstatSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { dirname, join, resolve, relative, parse } from 'node:path';
import { RevisionPair, safePath, sha256, refuse, git } from './git.mjs';
import { JOBS, SOURCE_ROOT, unpackRelease, findJob, exactInputPreflight } from './release.mjs';

export const SCHEMA = 'samedaydesk.repository-job-plan.v1';
export const DEFAULT_LIMITS = Object.freeze({ maxFileBytes: 1048576, maxTotalBytes: 8388608, maxChangedFiles: 256, maxRows: 2000, maxJsonNodes: 50000, maxJsonDepth: 64 });
function keys(object, allowed) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k => !allowed.includes(k))) refuse('invalid_policy');
}
export function validatePolicy(policy) {
  if (Buffer.byteLength(JSON.stringify(policy) || '') > 65536) refuse('policy_byte_limit');
  keys(policy, ['schema', 'callerOwned', 'mode', 'execution', 'costCapAtomic', 'allowedJobs', 'limits', 'bindings']);
  if (policy.schema !== 'samedaydesk.repository-task-policy.v1' || policy.callerOwned !== true || policy.mode !== 'dry-run' || !['offline', 'live-required'].includes(policy.execution) || policy.costCapAtomic !== '0') refuse('policy_authority_required');
  if (!Array.isArray(policy.allowedJobs) || new Set(policy.allowedJobs).size !== policy.allowedJobs.length || policy.allowedJobs.some(j => !JOBS.includes(j))) refuse('invalid_allowed_jobs');
  const limits = { ...DEFAULT_LIMITS, ...policy.limits };
  keys(limits, Object.keys(DEFAULT_LIMITS));
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) refuse('invalid_limit');
  if (!Array.isArray(policy.bindings) || policy.bindings.length > limits.maxChangedFiles) refuse('invalid_bindings');
  const seen = new Set();
  for (const binding of policy.bindings) {
    keys(binding, ['path', 'job', 'used', 'fields', 'clock']);
    safePath(binding.path);
    if (seen.has(binding.path) || binding.job != null && !JOBS.includes(binding.job)) refuse('invalid_binding');
    seen.add(binding.path);
    if (binding.used !== undefined) keys(binding.used, ['pointers']);
  }
  return { ...policy, limits };
}
export function boundedJson(bytes, limits) {
  if (bytes.includes(0)) refuse('binary_input');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { refuse('invalid_json_or_encoding'); }
  const stack = [[value, 0]]; let nodes = 0;
  while (stack.length) {
    const [v, depth] = stack.pop();
    if (++nodes > limits.maxJsonNodes || depth > limits.maxJsonDepth) refuse('json_structure_limit');
    if (Array.isArray(v) && v.length > limits.maxRows) refuse('row_limit');
    if (v && typeof v === 'object') for (const child of Object.values(v)) stack.push([child, depth + 1]);
  }
  return value;
}
function suggestions(file, docs = []) {
  const result = new Set();
  if (/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|go\.sum)$/.test(file)) result.add('lockfile-pin-delta');
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    if (doc.lockfileVersion != null) result.add('lockfile-pin-delta');
    if (doc.$schema || doc.properties) result.add('json-schema-webhook-drift');
    if (Array.isArray(doc.routes) || Array.isArray(doc.catalog) || Array.isArray(doc) && doc.some(r => r?.canonical && r?.path)) result.add('route-table-diff');
    if (Array.isArray(doc.rows)) result.add('vendor-budget-impact');
    if (doc.product === 'samedaydesk-extract-batch') result.add('page-change-offline-job');
  }
  return [...result].sort();
}
export function assertNoSymlinks(target) {
  const full = resolve(target), root = parse(full).root;
  let part = root;
  for (const name of full.slice(root.length).split('/').filter(Boolean)) {
    part = join(part, name);
    try { if (lstatSync(part).isSymbolicLink()) refuse('symlink_path'); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  return full;
}
function manifest(root) {
  const files = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name), st = lstatSync(file);
      if (st.isSymbolicLink()) refuse('artifact_symlink');
      if (st.isDirectory()) walk(file);
      else if (st.isFile()) { const data = readFileSync(file); files.push({ path: relative(root, file), bytes: data.length, sha256: sha256(data) }); }
      else refuse('artifact_not_regular');
    }
  }
  walk(root); return files;
}
export async function createPlan({ repo, base, head, policy: rawPolicy, out }) {
  const policy = validatePolicy(rawPolicy);
  const pair = new RevisionPair(repo, base, head);
  const changes = pair.changes(policy.limits.maxChangedFiles);
  const target = assertNoSymlinks(out);
  // Exclusive creation means cleanup can only remove this invocation's directory.
  mkdirSync(target, { mode: 0o700 });
  try {
    const release = unpackRelease(target);
    const plan = {
      schema: SCHEMA, mode: 'dry-run', status: 'blocked',
      source: { repo: pair.repo, refs: pair.refs, commits: pair.commits, worktreeRead: false, renames: 'delete-and-add' },
      implementation: { sourceHead: git(SOURCE_ROOT, ['rev-parse', 'HEAD']).toString().trim() },
      policy, policySha256: sha256(JSON.stringify(rawPolicy)), release: release.identity,
      authority: { executionAuthorized: false, networkUsed: false, uploadAllowed: false, signingAllowed: false, paymentAllowed: false, costCapAtomic: '0', plannedCostAtomic: '0', costBasis: 'free-local-package; caller compute excluded' },
      semanticNoChangeProven: false, changes: [], selected: [], stops: [],
      totals: { changedFiles: changes.length, inputBytes: 0, rows: 0 },
      liveContract: { available: false, reason: 'No current exact live operation and unsigned offer verified. Generic GET /models is not a migration contract.' },
      nextAction: 'Review stops and frozen input hashes. Verify this bundle before running any selected local argv. Stop on engine refusal, incomplete/unknown output, missing promised files, or any request for network/payment/signing. No semantic no-change claim is made by a plan.',
    };
    for (const change of changes) {
      const item = { ...change, state: 'stop', suggestions: suggestions(change.path), suggestionAuthority: 'heuristic-only-until-exact-input-preflight', selectedId: null, stopCode: null };
      plan.changes.push(item);
      try {
        if ([change.baseMode, change.headMode].some(m => m === '120000' || m === '160000')) refuse('symlink_or_gitlink');
        if (change.status !== 'M' || !['100644', '100755'].includes(change.baseMode) || !['100644', '100755'].includes(change.headMode)) refuse('paired_snapshot_required');
        if (!change.path.endsWith('.json')) refuse('unsupported_format', 'Only explicit JSON inputs can pass this released job set; source code and other lock formats are not parsed.');
        const binding = policy.bindings.find(b => b.path === change.path) || {};
        const readBlob = oid => {
          const remaining = policy.limits.maxTotalBytes - plan.totals.inputBytes;
          if (remaining <= 0) refuse('total_byte_limit');
          let data;
          try { data = pair.blob(oid, Math.min(policy.limits.maxFileBytes, remaining)); }
          catch (err) { if (remaining < policy.limits.maxFileBytes && err.code === 'file_byte_limit') refuse('total_byte_limit'); throw err; }
          plan.totals.inputBytes += data.length; return data;
        };
        const beforeBytes = readBlob(change.baseOid);
        const afterBytes = readBlob(change.headOid);
        if (plan.totals.inputBytes > policy.limits.maxTotalBytes) refuse('total_byte_limit');
        const before = boundedJson(beforeBytes, policy.limits), after = boundedJson(afterBytes, policy.limits);
        item.suggestions = suggestions(change.path, [before, after]);
        if (/(?:^|\/)SAMPLE(?:\.|\/|$)/i.test(change.path) || pair.siblingSample(pair.commits.base, change.path) || pair.siblingSample(pair.commits.head, change.path)) refuse('disguised-sample');
        const jobId = binding.job || (item.suggestions.length === 1 ? item.suggestions[0] : null);
        if (!jobId) refuse(item.suggestions.length ? 'ambiguous_job' : 'no_supported_job');
        if (!policy.allowedJobs.includes(jobId)) refuse('job_not_allowed');
        if (policy.execution === 'live-required') refuse('live_contract_unverified');
        const job = findJob(release.catalog, jobId);
        const id = `job-${String(plan.selected.length + 1).padStart(3, '0')}`;
        const dir = join(target, 'inputs', id);
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileSync(join(dir, 'before.json'), beforeBytes);
        writeFileSync(join(dir, 'after.json'), afterBytes);
        const checked = await exactInputPreflight({ release, job, before, after, binding, dir, limits: policy.limits });
        if (plan.totals.rows + checked.rows > policy.limits.maxRows) refuse('total_row_limit');
        plan.totals.rows += checked.rows;
        const argv = ['node', '--max-old-space-size=768', 'bin/useful-jobs.mjs', 'run', jobId];
        for (const [key, file] of Object.entries(checked.flags)) argv.push(`--${key}`, relative(release.kit, file));
        argv.push('--out-dir', `../outputs/${id}`);
        plan.selected.push({ id, path: change.path, job: jobId, operation: 'free-offline', preflight: { ok: true, exactInput: true, engineInvoked: false, receipt: relative(target, join(dir, 'preflight/preflight.json')) }, inputs: [{ slot: 'before', commit: pair.commits.base, blobOid: change.baseOid, bytes: beforeBytes.length, sha256: sha256(beforeBytes) }, { slot: 'after', commit: pair.commits.head, blobOid: change.headOid, bytes: afterBytes.length, sha256: sha256(afterBytes) }], rows: checked.rows, command: { cwd: release.identity.localRoot, argv }, expectedOutputs: job.outputs.map(name => `outputs/${id}/${name}`), outputMeaning: job.summary, limits: job.notes || '', routeAdvice: checked.routeAdvice, stop: 'Review output coverage; refuse any paid or network substitution.', approval: 'Caller review before local execution; paid execution remains prohibited.', costAtomic: '0' });
        item.state = 'selected'; item.selectedId = id;
      } catch (err) {
        item.stopCode = err.code || 'input_preflight_failed';
        plan.stops.push({ path: change.path, code: item.stopCode });
        // A failed candidate may own the next slot. Remove only that slot.
        rmSync(join(target, 'inputs', `job-${String(plan.selected.length + 1).padStart(3, '0')}`), { recursive: true, force: true });
        if (['total_byte_limit', 'total_row_limit'].includes(item.stopCode)) {
          for (const pending of changes.slice(plan.changes.length)) { plan.changes.push({ ...pending, state: 'stop', suggestions: [], suggestionAuthority: 'heuristic-only-until-exact-input-preflight', selectedId: null, stopCode: 'budget_exhausted' }); plan.stops.push({ path: pending.path, code: 'budget_exhausted' }); }
          break;
        }
      }
    }
    for (const binding of policy.bindings) if (!changes.some(c => c.path === binding.path)) plan.stops.push({ path: binding.path, code: 'binding_not_changed' });
    pair.verify();
    plan.status = !changes.length && !plan.stops.length ? 'no_git_changes' : plan.selected.length ? (plan.stops.length ? 'ready_with_stops' : 'ready') : 'blocked';
    plan.integrity = { algorithm: 'sha256', files: manifest(target) };
    for (const file of plan.integrity.files) chmodSync(join(target, file.path), 0o444);
    writeFileSync(join(target, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
    return plan;
  } catch (err) { rmSync(target, { recursive: true, force: true }); throw err; }
}

export function verifyPlan(out, expectedSha256) {
  const root = assertNoSymlinks(out), planPath = assertNoSymlinks(join(root, 'plan.json'));
  const bytes = readFileSync(planPath);
  if (bytes.length > 4 * 1024 * 1024) refuse('plan_byte_limit');
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '') || sha256(bytes) !== expectedSha256) refuse('plan_digest_mismatch');
  const plan = JSON.parse(bytes);
  if (plan.schema !== SCHEMA || !Array.isArray(plan.integrity?.files)) refuse('invalid_plan');
  for (const file of plan.integrity.files) {
    const target = assertNoSymlinks(join(root, safePath(file.path)));
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.size !== file.bytes || sha256(readFileSync(target)) !== file.sha256) refuse('artifact_digest_mismatch');
  }
  return { schema: 'samedaydesk.repository-job-plan-verification.v1', ok: true, planSha256: expectedSha256, verifiedFiles: plan.integrity.files.length, executionAuthorized: false };
}
