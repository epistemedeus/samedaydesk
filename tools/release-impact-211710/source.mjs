import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SUPPORT, OBSERVATION_SCHEMA } from "./support.mjs";
import { EvidenceError, requireEvidence, seal, sha256Hex, validTime } from "./evidence.mjs";

const execute = promisify(execFile);
const REF = /^[a-f0-9]{40}$/;
export function checkRef(ref) { requireEvidence(typeof ref === "string" && REF.test(ref), "exact_commit_ref_required"); }
export async function git(repo, args, deadlineAt = Date.now() + 5000, binary = false) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new EvidenceError("source_check_timed_out", "timed_out");
  try {
    const { stdout } = await execute("git", ["--no-pager", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "remote.origin.promisor=false", "-C", repo, ...args], {
      encoding: binary ? null : "utf8", timeout: remaining, maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" },
    });
    return stdout;
  } catch (error) {
    throw new EvidenceError(error.killed ? "source_check_timed_out" : "source_ref_or_tree_unavailable", error.killed ? "timed_out" : "insufficient_coverage");
  }
}
export async function runtime(deadlineAt = Date.now() + 5000) {
  requireEvidence(Date.now() < deadlineAt, "runtime_check_timed_out", "timed_out");
  try {
    const { stdout } = await execute("tar", ["--version"], { timeout: Math.max(1, deadlineAt - Date.now()), maxBuffer: 4096 });
    return { node: process.version, tar: stdout.split("\n")[0], evidenceKind: "local_analysis_host" };
  } catch (error) { throw new EvidenceError(error.killed ? "runtime_check_timed_out" : "tar_runtime_unavailable", error.killed ? "timed_out" : "insufficient_coverage"); }
}
async function witness(repo, ref, path, deadlineAt) {
  const row = (await git(repo, ["ls-tree", "-z", ref, "--", path], deadlineAt)).split("\0")[0];
  if (!row) return { path, status: "absent", blob: null, sha256: null, mode: null };
  const match = /^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
  requireEvidence(match && match[3] === path && ["100644", "100755"].includes(match[1]), "unsupported_source_entry");
  const bytes = await git(repo, ["cat-file", "blob", match[2]], deadlineAt, true);
  return { path, status: "present", mode: match[1], blob: match[2], sha256: sha256Hex(bytes) };
}
export async function snapshot(repo, ref, deadlineAt = Date.now() + 5000) {
  checkRef(ref);
  requireEvidence((await git(repo, ["cat-file", "-t", ref], deadlineAt)).trim() === "commit", "commit_object_required");
  const source = await witness(repo, ref, SUPPORT.sourcePath, deadlineAt);
  const manifest = await witness(repo, ref, SUPPORT.manifestPath, deadlineAt);
  let nodeRequirement = "<manifest-absent>";
  let packageVersion = null;
  if (manifest.status === "present") {
    let doc;
    try { doc = JSON.parse(await git(repo, ["cat-file", "blob", manifest.blob], deadlineAt)); }
    catch (error) { if (error instanceof EvidenceError) throw error; throw new EvidenceError("source_manifest_invalid"); }
    requireEvidence(doc.name === "samedaydesk", "source_repository_identity_mismatch");
    nodeRequirement = doc.engines?.node || "<requirement-absent>";
    requireEvidence(typeof nodeRequirement === "string" && nodeRequirement.length <= 128, "source_runtime_requirement_missing");
    requireEvidence(nodeRequirement === "<requirement-absent>" || /^[0-9.vxX*<>=~^|+\- ()]+$/.test(nodeRequirement), "source_runtime_requirement_unrecognized");
    packageVersion = doc.version || null;
  }
  return { ref, tree: (await git(repo, ["rev-parse", `${ref}^{tree}`], deadlineAt)).trim(), source, manifest, nodeRequirement, packageVersion };
}
export function observationFields(snapshotValue, runtimeValue) {
  return { sourceBlob: snapshotValue.source.blob || "<source-absent>", node: runtimeValue.node, tar: runtimeValue.tar, nodeRequirement: snapshotValue.nodeRequirement };
}
export function checkRuntime(value) {
  requireEvidence(value && typeof value.node === "string" && value.node.length <= 32 && /^v\d+\.\d+\.\d+$/.test(value.node)
    && typeof value.tar === "string" && value.tar.length <= 64 && /^tar \(GNU tar\) \d+\.\d+(?:\.\d+)?$/.test(value.tar), "runtime_coverage_missing");
  requireEvidence(["local_analysis_host", "operator_supplied_target"].includes(value.evidenceKind), "runtime_evidence_kind_missing");
}
export async function observeSource({ repo, fromRef, toRef, clock, windowStart, runtimeValue, timeoutMs = 5000 }) {
  checkRef(fromRef); checkRef(toRef);
  requireEvidence(validTime(clock) && validTime(windowStart) && Date.parse(windowStart) <= Date.parse(clock), "observation_window_invalid");
  requireEvidence(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000, "invalid_timeout");
  const deadlineAt = Date.now() + timeoutMs;
  const base = { schema: OBSERVATION_SCHEMA, repairId: SUPPORT.repairId, repository: SUPPORT.repository,
    kind: "source_comparison", fromRef, toRef, observedAt: clock, window: { start: windowStart, end: clock },
    coverage: { sourcePaths: [SUPPORT.sourcePath, SUPPORT.manifestPath], dependencyNames: [...SUPPORT.dependencies],
      history: "two_exact_snapshots_only", installedTargetObserved: false },
  };
  let before = null; let after = null;
  try {
    before = await snapshot(repo, fromRef, deadlineAt);
    after = await snapshot(repo, toRef, deadlineAt);
    const observedRuntime = runtimeValue || await runtime(deadlineAt);
    checkRuntime(observedRuntime);
    const changedPaths = (await git(repo, ["diff", "--no-ext-diff", "--name-only", "-z", fromRef, toRef, "--"], deadlineAt)).split("\0").filter(Boolean);
    requireEvidence(changedPaths.length <= 2000, "changed_paths_limit", "partial");
    return seal({ ...base, status: "complete", before, after, runtime: observedRuntime, changedPaths });
  } catch (error) {
    return seal({ ...base, status: before ? (error.outcome === "timed_out" ? "timed_out" : "partial") : (error.outcome === "timed_out" ? "timed_out" : "error"),
      before, after, failureCode: error.code || "source_capture_error", runtime: runtimeValue || null, changedPaths: null });
  }
}
