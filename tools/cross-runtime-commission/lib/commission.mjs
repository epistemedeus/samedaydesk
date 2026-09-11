import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  DEFAULT_RUNTIMES,
  ENGINE_PIN,
  FIXTURE_SCHEMA,
  JOURNEY_JOB_ID,
  LIVE_EXTRACT,
  OWNED_DIR,
  SCHEMA,
  SIBLINGS,
} from "./pins.mjs";
import { CommissionRefuse } from "./errors.mjs";
import { fileEntry, sha256File } from "./digest.mjs";
import { getJob, JOB_IDS } from "./jobs.mjs";
import { engineVersion, ensureUsefulJobsKit, runEngineJob } from "./engine.mjs";
import {
  captureEnvironment,
  childEnvForRuntime,
  environmentsDifferByMoreThanCwd,
  resolveKind,
} from "./environment.mjs";
import {
  extractPriceMutation,
  inspectSample,
  payingMaintainerClaim,
  wantsCommissionedCustomer,
  wantsF08Wrappers,
} from "./sample-guard.mjs";

function resolveExisting(path, bases) {
  if (!path) return null;
  if (isAbsolute(path) && existsSync(path)) return path;
  for (const base of bases) {
    const candidate = resolve(base, path);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(bases[0] || process.cwd(), path);
}

export function loadFixture(fixturePath, { cwd = process.cwd() } = {}) {
  const abs = resolveExisting(fixturePath, [cwd, OWNED_DIR]);
  if (!abs || !existsSync(abs)) {
    throw new CommissionRefuse("missing-fixture", `fixture not found: ${fixturePath}`);
  }
  const body = JSON.parse(readFileSync(abs, "utf8"));
  return { path: abs, dir: dirname(abs), body };
}

function rejection({ code, message, detail, sample = false, sampleReasons = [], demo = false }) {
  return {
    schema: SCHEMA,
    ok: false,
    refused: true,
    code,
    error: message,
    detail: detail || null,
    independent: false,
    commissionedCustomer: false,
    payingMaintainer: false,
    purchaseAuthority: false,
    sold: false,
    sample,
    sampleReasons,
    demo,
    liveSettlement: "out-of-scope",
    siblings: SIBLINGS,
    liveExtract: LIVE_EXTRACT,
  };
}

function assertJourneyGuards(request) {
  if (wantsF08Wrappers(request)) {
    throw new CommissionRefuse(
      "f08-wrappers-out-of-scope",
      "F08 wrappers are out of scope; import engine pins only",
      { sibling: SIBLINGS.F08 },
    );
  }

  const price = extractPriceMutation(request);
  if (price.mutated) {
    throw new CommissionRefuse(
      "extract-price-immutable",
      `live extract remains ${LIVE_EXTRACT.usdc}; refusing mutation at ${price.path}`,
      { live: LIVE_EXTRACT, attempted: price.value },
    );
  }

  const maintainer = payingMaintainerClaim(request);
  if (maintainer.claimed) {
    throw new CommissionRefuse(
      "invented-paying-maintainer",
      "this scaffold does not invent a paying maintainer",
      { path: maintainer.path },
    );
  }
}

function resolveRuntimes(request) {
  const listed = Array.isArray(request.runtimes) && request.runtimes.length
    ? request.runtimes
    : [...DEFAULT_RUNTIMES];
  return listed.map((row, index) => {
    const label = row.label || row.id || `runtime-${index + 1}`;
    const kind = row.kind || (index === 1 ? "container-fixture" : "local");
    resolveKind(kind);
    return { label, kind, claimedIndependent: row.independent === true };
  });
}

function decideIndependence({ runtimes, environments, request, demo }) {
  const claimed =
    request.independent === true ||
    runtimes.some((row) => row.claimedIndependent === true);

  const envDecision = environmentsDifferByMoreThanCwd(environments);
  let independent = envDecision.independent && runtimes.length >= 2;
  let reason = envDecision.reason;

  if (runtimes.length < 2) {
    independent = false;
    reason = demo
      ? "demo-labelled-single-runtime-cannot-claim-independent"
      : "fewer-than-two-runtimes";
  }

  if (claimed && !independent) {
    throw new CommissionRefuse(
      "one-runtime-not-independent",
      runtimes.length < 2
        ? demo
          ? "demo-labelled single-runtime run cannot claim independent: true"
          : "one runtime cannot be labelled independent"
        : `independent:true refused (${reason})`,
      { reason, runtimeCount: runtimes.length, demo },
    );
  }

  return { independent, reason };
}

function comparablePair(runs) {
  if (runs.length < 2) {
    return { comparable: false, reason: "fewer-than-two-runtimes", resultDigestMatch: false };
  }
  const digests = new Set(runs.map((run) => run.input.sha256));
  if (digests.size !== 1) {
    return { comparable: false, reason: "input-digest-mismatch", resultDigestMatch: false };
  }
  const jobs = new Set(runs.map((run) => run.jobId));
  if (jobs.size !== 1) {
    return { comparable: false, reason: "job-mismatch", resultDigestMatch: false };
  }
  const ok = runs.every((run) => run.ok);
  if (!ok) return { comparable: false, reason: "runtime-not-ok", resultDigestMatch: false };
  const fingerprints = new Set(
    runs.map((run) =>
      JSON.stringify({
        engineStatus: run.result?.engineStatus || null,
        actions: run.result?.stdoutJson?.actions ?? null,
        appId: run.result?.stdoutJson?.appId || null,
      }),
    ),
  );
  const resultDigestMatch = fingerprints.size === 1;
  return {
    comparable: true,
    reason: resultDigestMatch ? "same-input-digest-and-engine-status" : "same-input-digest-results-differ",
    resultDigestMatch,
  };
}

export function runJourney(request = {}) {
  const demo = request.demo === true || request.label === "demo";
  const jobId = request.jobId || JOURNEY_JOB_ID;
  if (jobId !== JOURNEY_JOB_ID && !JOB_IDS.includes(jobId)) {
    return rejection({ code: "unknown-job", message: `unknown job ${jobId}`, demo });
  }
  if (jobId !== JOURNEY_JOB_ID) {
    return rejection({
      code: "journey-job-is-listing-repair-packet",
      message: `this scaffold journey pins ${JOURNEY_JOB_ID}`,
      demo,
    });
  }

  let job;
  try {
    job = getJob(jobId);
  } catch (err) {
    return rejection({ code: err.code || "unknown-job", message: err.message, demo });
  }

  let sampleState = { sample: false, reasons: [] };

  try {
    assertJourneyGuards(request);
    const kit = ensureUsefulJobsKit();
    const inputPath = resolveExisting(request.input, [
      request.cwd || process.cwd(),
      request.fixtureDir || OWNED_DIR,
      OWNED_DIR,
    ]);
    if (!inputPath || !existsSync(inputPath)) {
      throw new CommissionRefuse("missing-input", "listing-repair-packet requires --input");
    }

    sampleState = inspectSample({ ...request, input: inputPath }, { kitRoot: kit });
    if (sampleState.sample && wantsCommissionedCustomer(request)) {
      throw new CommissionRefuse(
        "sample-not-commissioned-customer-work",
        "SAMPLE/demo is not commissioned customer work",
        { sampleReasons: sampleState.reasons },
      );
    }

    const runtimes = resolveRuntimes(request);
    const claimedIndependent =
      request.independent === true || runtimes.some((row) => row.claimedIndependent === true);
    if (claimedIndependent && runtimes.length < 2) {
      throw new CommissionRefuse(
        "one-runtime-not-independent",
        demo
          ? "demo-labelled single-runtime run cannot claim independent: true"
          : "one runtime cannot be labelled independent",
        { runtimeCount: runtimes.length, demo },
      );
    }

    const work = request.workDir || mkdtempSync(join(tmpdir(), "sds-crc-"));
    const input = fileEntry("listing.json", inputPath);
    const runs = [];

    for (const runtime of runtimes) {
      const runtimeDir = join(work, "runtimes", runtime.label);
      const outDir = join(runtimeDir, "out");
      mkdirSync(outDir, { recursive: true });
      const stagedInput = join(runtimeDir, "input.json");
      copyFileSync(inputPath, stagedInput);
      const staged = fileEntry("listing.json", stagedInput);
      if (staged.sha256 !== input.sha256) {
        throw new CommissionRefuse("input-digest-mismatch", "staged input digest diverged from source");
      }

      const environment = captureEnvironment({
        label: runtime.label,
        kind: runtime.kind,
        cwd: runtimeDir,
        outDir,
        inputPath: stagedInput,
      });
      const extraEnv = childEnvForRuntime(runtime.kind, runtime.label);
      const engine = runEngineJob(jobId, {
        input: stagedInput,
        outDir,
        extraEnv,
      });
      const outputFiles = job.outputs
        .map((name) => ({ name, path: join(outDir, name) }))
        .filter((f) => existsSync(f.path))
        .map((f) => fileEntry(f.name, f.path));

      const ok = engine.status === 0 && engine.json && engine.json.ok !== false;
      runs.push({
        label: runtime.label,
        kind: runtime.kind,
        jobId,
        ok,
        environment,
        command: {
          argv: engine.argv,
          cwd: engine.cwd,
          env: extraEnv,
        },
        input: { bytes: staged.bytes, sha256: staged.sha256 },
        result: {
          status: engine.status,
          ok,
          stdoutJson: engine.json,
          digest: engine.json?.digest || null,
          engineStatus: engine.json?.status || null,
          outputs: outputFiles.map((f) => ({ name: f.name, bytes: f.bytes, sha256: f.sha256 })),
        },
        stderr: engine.stderr || "",
      });
    }

    const comparison = comparablePair(runs);
    const independence = decideIndependence({
      runtimes,
      environments: runs.map((run) => run.environment),
      request,
      demo,
    });

    return {
      schema: SCHEMA,
      ok: runs.every((run) => run.ok),
      jobId,
      title: job.title,
      engine: engineVersion(kit),
      input: { name: input.name, bytes: input.bytes, sha256: input.sha256 },
      runtimes: runs,
      comparable: comparison.comparable,
      comparableReason: comparison.reason,
      resultDigestMatch: comparison.resultDigestMatch || false,
      independent: independence.independent,
      independentReason: independence.reason,
      demo,
      sample: sampleState.sample,
      sampleReasons: sampleState.reasons,
      commissionedCustomer: false,
      payingMaintainer: false,
      purchaseAuthority: false,
      sold: false,
      liveSettlement: "out-of-scope",
      label: demo ? "demo" : "scaffold",
      liveExtract: LIVE_EXTRACT,
      siblings: {
        F11: SIBLINGS.F11.note,
        W206: SIBLINGS.W206.note,
        F08: SIBLINGS.F08.note,
      },
    };
  } catch (err) {
    if (err instanceof CommissionRefuse) {
      return rejection({
        code: err.code,
        message: err.message,
        detail: err.detail,
        sample: sampleState.sample || err.code === "sample-not-commissioned-customer-work",
        sampleReasons: err.detail?.sampleReasons || sampleState.reasons,
        demo,
      });
    }
    return rejection({
      code: "internal-error",
      message: err.message || String(err),
      sample: sampleState.sample,
      sampleReasons: sampleState.reasons,
      demo,
    });
  }
}

export function runFixtureFile(fixturePath, extra = {}) {
  const loaded = loadFixture(fixturePath, { cwd: extra.cwd || process.cwd() });
  const body = loaded.body;
  if (body.schema && body.schema !== FIXTURE_SCHEMA && body.schema !== SCHEMA) {
    return rejection({
      code: "unknown-fixture-schema",
      message: `unknown fixture schema ${body.schema}`,
    });
  }
  return runJourney({
    ...body,
    ...extra,
    input: body.input,
    fixtureDir: loaded.dir,
    cwd: extra.cwd || process.cwd(),
  });
}

export function writeReport(result, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  return outPath;
}
