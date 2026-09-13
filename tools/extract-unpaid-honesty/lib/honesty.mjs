import { join } from "node:path";
import { createAdapters, loadHonestyInputs, readJson } from "./load.mjs";
import { startIntercept, loadLog } from "./intercept.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";
import { spawnUsefulJob, spawnNodeScript } from "./spawn.mjs";
import { buildReport } from "./report.mjs";
import { refusePaidRetry } from "./refuse.mjs";
import { TOOL_ROOT, USEFUL_JOBS_JOB, EXTRACT_EXAMPLE_URL } from "./pins.mjs";

export { createAdapters, loadHonestyInputs, readJson } from "./load.mjs";
export { ensureUsefulJobsKit } from "./kit.mjs";
export { refusePaidRetry } from "./refuse.mjs";
export { hashTermsVersion, assertHashTermsVersion } from "./hash-terms.mjs";
export { inspectRequest, isExtractUrl } from "./inspect.mjs";
export { startIntercept, loadLog } from "./intercept.mjs";

export async function runHonestyReport(options = {}) {
  const repoRoot = options.repoRoot;
  const adapters = options.adapters || createAdapters(repoRoot);
  const loaded = loadHonestyInputs(adapters);
  const jobId = options.jobId || USEFUL_JOBS_JOB;
  const example = options.example !== false && !options.input;
  const intercept = await startIntercept({ logPath: options.logPath });
  try {
    const kit = ensureUsefulJobsKit(adapters.repoRoot || repoRoot);
    const spawnResult = spawnUsefulJob({
      kit: kit.kit,
      jobId,
      example,
      input: options.input || null,
      outDir: options.outDir,
      env: intercept.childEnv,
    });
    const log = loadLog(intercept.logPath);
    return buildReport({ loaded, spawnResult, log, intercept, kit });
  } finally {
    await intercept.stop();
  }
}

export async function probeExtractFetch(options = {}) {
  const intercept = await startIntercept({ logPath: options.logPath });
  const script = options.script || join(TOOL_ROOT, "fixtures/probes/fetch-extract.mjs");
  try {
    const spawned = spawnNodeScript({
      script,
      env: {
        ...intercept.childEnv,
        HONESTY_PROBE_URL: options.url || intercept.childEnv.HONESTY_PROBE_URL || EXTRACT_EXAMPLE_URL,
      },
    });
    const log = loadLog(intercept.logPath);
    const blob = `${spawned.stdout}\n${spawned.stderr}`;
    const caught =
      spawned.status !== 0 &&
      (log.some((entry) => entry.forbidden) || /honesty_forbidden_request/.test(blob));
    return {
      ok: caught,
      caught,
      escaped: !caught,
      status: spawned.status,
      code: caught ? "honesty_forbidden_request" : "extract_fetch_escaped",
      log,
      stdout: spawned.stdout,
      stderr: spawned.stderr,
      intercept: { origin: intercept.origin, kind: intercept.kind, class: "local-runtime" },
      purchaseAuthority: false,
      sold: false,
    };
  } finally {
    await intercept.stop();
  }
}

export function refusePaidRetryFile(path) {
  return refusePaidRetry(readJson(path));
}

export function defaultPaidRetryFixture() {
  return join(TOOL_ROOT, "fixtures/probes/paid-retry-wrap.json");
}
