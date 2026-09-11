import { join } from "node:path";
import { createAdapters, loadHonestyInputs, readJson } from "./load.mjs";
import { startIntercept, loadLog } from "./intercept.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";
import { spawnUsefulJob, spawnNodeScript } from "./spawn.mjs";
import { buildReport } from "./report.mjs";
import { refusePaidRetry } from "./refuse.mjs";
import { parseUrl } from "./inspect.mjs";
import {
  enforcementContract,
  observeMustNotRun,
  paymentAttemptFromHits,
} from "./enforcement.mjs";
import { TOOL_ROOT, USEFUL_JOBS_JOB, EXTRACT_EXAMPLE_URL } from "./pins.mjs";

export { createAdapters, loadHonestyInputs, readJson } from "./load.mjs";
export { ensureUsefulJobsKit } from "./kit.mjs";
export { refusePaidRetry } from "./refuse.mjs";
export { hashTermsVersion, assertHashTermsVersion } from "./hash-terms.mjs";
export { inspectRequest, isExtractUrl } from "./inspect.mjs";
export { startIntercept, loadLog } from "./intercept.mjs";
export {
  enforcementContract,
  observeMustNotRun,
  observedMustNotRunMarkers,
  paymentAttemptFromHits,
  classifyHonestyOutcome,
} from "./enforcement.mjs";

function localProbeUrl(intercept, requested) {
  const fallback = `${intercept.origin}/extract?url=https://example.com`;
  if (!requested) {
    return { fetchUrl: fallback, requestedUrl: EXTRACT_EXAMPLE_URL, rewroteRemoteUrl: true };
  }
  const parsed = parseUrl(requested, intercept.origin);
  if (!parsed) return { fetchUrl: fallback, requestedUrl: requested, rewroteRemoteUrl: true };
  const host = parsed.hostname;
  if (host === "127.0.0.1" || host === "localhost") {
    return { fetchUrl: parsed.href, requestedUrl: requested, rewroteRemoteUrl: false };
  }
  return {
    fetchUrl: `${intercept.origin}${parsed.pathname || "/extract"}${parsed.search || ""}`,
    requestedUrl: requested,
    rewroteRemoteUrl: true,
  };
}

function assertLocalUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")) {
    const err = new Error("unhooked probe refuses non-local URL (would be a live GET)");
    err.code = "unhooked_probe_requires_local_url";
    throw err;
  }
  return parsed.href;
}

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
  const urls = localProbeUrl(intercept, options.url || intercept.childEnv.HONESTY_PROBE_URL);
  try {
    const spawned = spawnNodeScript({
      script,
      env: {
        ...intercept.childEnv,
        HONESTY_PROBE_URL: urls.fetchUrl,
      },
    });
    const log = loadLog(intercept.logPath);
    const blob = `${spawned.stdout}\n${spawned.stderr}`;
    const loggedAttempt = paymentAttemptFromHits(log);
    const thrown = spawned.status !== 0 && /honesty_forbidden_request/.test(blob);
    const caught = loggedAttempt || thrown;
    return {
      ok: caught,
      caught,
      escaped: !caught,
      osIsolation: false,
      hooksInstalled: true,
      liveGet: false,
      paymentAttemptDetected: caught,
      outcomeClass: caught ? "payment-attempt-detected" : "enforcement-miss",
      requestedUrl: urls.requestedUrl,
      fetchUrl: urls.fetchUrl,
      rewroteRemoteUrl: urls.rewroteRemoteUrl,
      status: spawned.status,
      code: caught ? "honesty_forbidden_request" : "extract_fetch_escaped",
      log,
      stdout: spawned.stdout,
      stderr: spawned.stderr,
      enforcement: enforcementContract(),
      intercept: {
        origin: intercept.origin,
        kind: intercept.kind,
        osIsolation: false,
        class: "local-runtime",
      },
      purchaseAuthority: false,
      sold: false,
    };
  } finally {
    await intercept.stop();
  }
}

export function probeExtractFetchUnhooked(options = {}) {
  const url = assertLocalUrl(options.url);
  const script = options.script || join(TOOL_ROOT, "fixtures/probes/fetch-extract.mjs");
  const env = { ...process.env, HONESTY_PROBE_URL: url };
  delete env.HONESTY_INTERCEPT_LOG;
  delete env.HONESTY_INTERCEPT_ORIGIN;
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.ALL_PROXY;
  env.NODE_OPTIONS = "";
  const spawned = spawnNodeScript({ script, env });
  const blob = `${spawned.stdout}\n${spawned.stderr}`;
  const escaped = spawned.status === 0 && /"escaped"\s*:\s*true/.test(spawned.stdout);
  const transportFailed = spawned.status !== 0 && !/honesty_forbidden_request/.test(blob);
  return {
    ok: escaped,
    caught: false,
    escaped,
    osIsolation: false,
    hooksInstalled: false,
    liveGet: false,
    paymentAttemptDetected: false,
    outcomeClass: escaped
      ? "js-hooks-not-os-isolation"
      : transportFailed
        ? "transport-failure"
        : "unknown",
    status: spawned.status,
    code: escaped ? "extract_fetch_escaped_without_hooks" : "unhooked_probe_not_escaped",
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    enforcement: enforcementContract(),
    purchaseAuthority: false,
    sold: false,
  };
}

export function refusePaidRetryFile(path) {
  return refusePaidRetry(readJson(path));
}

export function defaultPaidRetryFixture() {
  return join(TOOL_ROOT, "fixtures/probes/paid-retry-wrap.json");
}

export function defaultMustNotRunEcho() {
  return join(TOOL_ROOT, "fixtures/probes/must-not-run-echo.mjs");
}

export function observeMustNotRunScript(script, mustNotRun) {
  const spawned = spawnNodeScript({ script });
  const text = `${spawned.stdout || ""}\n${spawned.stderr || ""}`;
  return {
    ...observeMustNotRun({ text, mustNotRun }),
    status: spawned.status,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
  };
}
