import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { USEFUL_JOBS, USEFUL_JOBS_NEGATIVE } from "../lib/pins.mjs";
import { envelope, failError } from "../lib/envelope.mjs";
import { fileBytes, sha256File } from "../lib/hash.mjs";
import { digestResult, makeReceipt } from "../lib/receipt.mjs";
import { currentPin, inputDigestFor } from "../lib/stale.mjs";
import { rel } from "../lib/repo.mjs";
import { parseStdoutJson, runNode } from "../lib/spawn.mjs";

function fail(evidence, message, detail) {
  return envelope({
    ok: false,
    command: "run",
    job: "useful-jobs",
    evidence,
    error: failError("ARCHIVE", message, detail),
  });
}

export async function runUsefulJobs(ctx) {
  const { root, dryRun = false, clock, flags = {}, keep = false } = ctx;
  const evidence = [];
  const kit = rel(root, USEFUL_JOBS.kitArchive);
  const twin = rel(root, USEFUL_JOBS.publicArchive);
  const negative = rel(root, USEFUL_JOBS_NEGATIVE.kitArchive);

  evidence.push({ kind: "pin", version: USEFUL_JOBS.version, sha256: USEFUL_JOBS.sha256, bytes: USEFUL_JOBS.bytes });

  if (dryRun) {
    return envelope({
      ok: true,
      command: "run",
      job: "useful-jobs",
      dryRun: true,
      evidence: [
        ...evidence,
        {
          kind: "argv",
          argv: ["tar", "-xzf", USEFUL_JOBS.kitArchive, "-C", "<tmpdir>"],
          then: ["node", USEFUL_JOBS.cli, "list", "--json"],
        },
      ],
      result: { would: ["hash 1.4.7 kit", "extract outside repo", "list --json"] },
    });
  }

  if (!existsSync(kit)) return fail(evidence, "useful-jobs 1.4.7 kit missing");
  const hashed = { sha256: sha256File(kit), bytes: fileBytes(kit) };
  evidence.push({ kind: "kit-hash", path: USEFUL_JOBS.kitArchive, ...hashed });
  if (hashed.sha256 !== USEFUL_JOBS.sha256 || hashed.bytes !== USEFUL_JOBS.bytes) {
    return fail(evidence, "useful-jobs 1.4.7 kit hash/size mismatch", hashed);
  }
  if (!existsSync(twin) || sha256File(twin) !== hashed.sha256) {
    return fail(evidence, "for-agents 1.4.7 archive is not a twin of the kit");
  }
  if (!existsSync(negative)) return fail(evidence, "1.1.0 negative-control archive missing");
  const neg = { sha256: sha256File(negative), bytes: fileBytes(negative) };
  evidence.push({ kind: "negative-hash", version: "1.1.0", ...neg });
  if (neg.sha256 !== USEFUL_JOBS_NEGATIVE.sha256 || neg.sha256 === hashed.sha256) {
    return fail(evidence, "1.1.0 negative control pin mismatch or collides with 1.4.7");
  }

  const extractDir = flags.extractDir || mkdtempSync(join(tmpdir(), "sds-lab-verify-uj-"));
  const repoPrefix = root.endsWith("/") ? root : `${root}/`;
  if (extractDir === root || extractDir.startsWith(repoPrefix)) {
    return fail(evidence, "extract-dir must be outside the git tree", { extractDir, root });
  }
  mkdirSync(extractDir, { recursive: true });
  const createdTmp = !flags.extractDir;
  const tar = spawnSync("tar", ["-xzf", kit, "-C", extractDir], { encoding: "utf8" });
  evidence.push({
    kind: "extract",
    dest: extractDir,
    status: tar.status,
    outsideRepo: !extractDir.startsWith(root),
  });
  if (tar.status !== 0) {
    if (createdTmp && !keep) rmSync(extractDir, { recursive: true, force: true });
    return fail(evidence, tar.stderr || "tar extract failed");
  }

  const cli = join(extractDir, USEFUL_JOBS.rootName, USEFUL_JOBS.cli);
  if (!existsSync(cli)) {
    if (createdTmp && !keep) rmSync(extractDir, { recursive: true, force: true });
    return fail(evidence, `extracted CLI missing: ${USEFUL_JOBS.cli}`);
  }

  const listed = runNode(cli, ["list", "--json"], {
    cwd: join(extractDir, USEFUL_JOBS.rootName),
    timeoutMs: 30_000,
  });
  const parsed = parseStdoutJson(listed.stdout);
  evidence.push({
    kind: "list",
    status: listed.status,
    argv: listed.argv,
    parseOk: parsed.ok,
  });

  if (createdTmp && !keep) rmSync(extractDir, { recursive: true, force: true });

  if (listed.status !== 0 || !parsed.ok) {
    return fail(evidence, "useful-jobs list --json failed", {
      status: listed.status,
      stderr: listed.stderr.slice(0, 500),
    });
  }
  const body = parsed.value;
  const ids = Array.isArray(body.jobs) ? body.jobs.map((job) => job.id) : [];
  const expected = [...USEFUL_JOBS.jobIds];
  if (body.ok !== true || ids.length !== expected.length || expected.some((id, i) => ids[i] !== id)) {
    return fail(evidence, "useful-jobs list ids do not match the 1.4.7 pin", { ids, expected });
  }

  const result = {
    version: USEFUL_JOBS.version,
    sha256: hashed.sha256,
    bytes: hashed.bytes,
    jobIds: ids,
    listOk: true,
    extracted: Boolean(flags.extractDir) || keep,
  };
  const receipt = makeReceipt({
    jobId: "useful-jobs",
    clock,
    pin: currentPin(),
    inputDigest: inputDigestFor("useful-jobs", root),
    resultDigest: digestResult(result),
    ok: true,
    extra: { kit: { sha256: hashed.sha256, bytes: hashed.bytes } },
  });
  return envelope({
    ok: true,
    command: "run",
    job: "useful-jobs",
    evidence,
    result,
    receipt,
  });
}
