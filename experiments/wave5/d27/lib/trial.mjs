import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyTrial } from "./classify.mjs";
import { BUYER_CLASS, KIND, SELECTED_JOB, TESTED_WRAPPER_SHA, contractRecord, demandRecord } from "./contract.mjs";
import { observedFriction, remainingBinding } from "./friction.mjs";
import { checkHonesty } from "./honesty.mjs";
import {
  EXPECTED_OUTPUTS,
  PAID_CLI,
  PYTHON_TRIAL,
  REPO_ROOT,
  RUNTIME_AFTER,
  RUNTIME_BEFORE,
  RUNTIME_UNSUPPORTED,
} from "./paths.mjs";

function parseJsonFile(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function lastJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function spawnPythonRuntime({
  jobId,
  inputs = {},
  example = false,
  funding,
  payment,
  outDir,
  pythonBin = process.env.SDS_PYTHON || "python3",
  nodeBin = process.env.SDS_NODE || "node",
  timeoutMs = 120_000,
} = {}) {
  if (!existsSync(PYTHON_TRIAL)) {
    return {
      failure: true,
      code: "missing-python-trial",
      error: `missing ${PYTHON_TRIAL}`,
    };
  }
  mkdirSync(outDir, { recursive: true });
  const metaPath = join(outDir, "independent-runtime.json");
  const args = [
    PYTHON_TRIAL,
    "--cli",
    PAID_CLI,
    "--repo",
    REPO_ROOT,
    "--job",
    jobId,
    "--node-bin",
    nodeBin,
    "--out-dir",
    outDir,
    "--meta-path",
    metaPath,
  ];
  if (example) args.push("--example");
  if (funding) args.push("--funding", String(funding));
  if (payment) args.push("--payment", String(payment));
  for (const [key, value] of Object.entries(inputs)) {
    if (value) args.push(`--${key}`, String(value));
  }

  let spawned;
  try {
    spawned = spawnSync(pythonBin, args, {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    return { failure: true, code: "python-spawn-failed", error: err.message || String(err) };
  }

  if (spawned.error && spawned.error.code === "ENOENT") {
    return { failure: true, code: "missing-python", error: `python binary not found: ${pythonBin}` };
  }
  if (spawned.signal) {
    return { failure: true, code: "python-signal", error: `python signal ${spawned.signal}` };
  }

  const payload = lastJson(spawned.stdout);
  const pythonMeta = parseJsonFile(metaPath);
  if (payload?.transportFailure === true) {
    return {
      failure: true,
      code: payload.code || "transport-failure",
      error: payload.error || null,
      payload,
      pythonMeta,
      pythonExit: spawned.status,
    };
  }
  if (!payload) {
    return {
      failure: true,
      code: "missing-wrapper-result",
      error: spawned.stderr || spawned.stdout || "python produced no JSON",
      pythonMeta,
      pythonExit: spawned.status,
    };
  }
  return { failure: false, payload, pythonMeta, pythonExit: spawned.status };
}

export function runTrial(request = {}) {
  const buyerClass = request.buyerClass || request["buyer-class"];
  const recruitmentEvidence = request.recruitmentEvidence || null;
  const honesty = checkHonesty({
    buyerClass,
    recruitmentEvidence,
    demandClaim: request.demandClaim || null,
  });
  const jobId = request.jobId || SELECTED_JOB;
  const outDir = request.outDir || mkdtempSync(join(tmpdir(), "d27-trial-"));
  mkdirSync(outDir, { recursive: true });

  const base = {
    schema: "samedaydesk.wave5.d27.trial-record.v1",
    jobId,
    buyerClass: buyerClass || null,
    testedImplementation: contractRecord().testedImplementation,
    wrapperSha: TESTED_WRAPPER_SHA,
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    demand: demandRecord({ buyerClass: buyerClass || BUYER_CLASS.UNKNOWN, recruitmentEvidence }),
    remainingBinding: remainingBinding(),
    outDir,
  };

  if (honesty.refused) {
    const classified = classifyTrial({ honesty, transport: null, wrapper: null, outDir });
    const record = {
      ...base,
      ok: false,
      ...classified,
      honesty,
      wrapper: null,
      friction: observedFriction({ wrapper: null, pythonMeta: null, wrapperSha: TESTED_WRAPPER_SHA }),
    };
    writeFileSync(join(outDir, "trial-record.json"), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  const spawned = spawnPythonRuntime({
    jobId,
    inputs: request.inputs || {},
    example: request.example === true,
    funding: request.funding,
    payment: request.payment,
    outDir,
    pythonBin: request.pythonBin,
    nodeBin: request.nodeBin,
  });

  if (spawned.failure) {
    const classified = classifyTrial({
      honesty: { refused: false },
      transport: { failure: true, code: spawned.code, error: spawned.error },
      wrapper: spawned.payload || null,
      outDir,
    });
    const record = {
      ...base,
      ok: false,
      ...classified,
      honesty: { refused: false },
      wrapper: spawned.payload || null,
      pythonMeta: spawned.pythonMeta || null,
      friction: observedFriction({
        wrapper: spawned.payload || null,
        pythonMeta: spawned.pythonMeta,
        wrapperSha: TESTED_WRAPPER_SHA,
      }),
    };
    writeFileSync(join(outDir, "trial-record.json"), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  const wrapper = spawned.payload;
  const artifact = parseJsonFile(join(outDir, EXPECTED_OUTPUTS[0]));
  const classified = classifyTrial({
    honesty: { refused: false },
    transport: { failure: false },
    wrapper,
    outDir,
    artifact,
  });
  const record = {
    ...base,
    ok:
      classified.kind === KIND.USEFUL_CHANGE ||
      classified.kind === KIND.USEFUL_NO_CHANGE ||
      classified.kind === KIND.USEFUL_REFUSAL ||
      classified.kind === KIND.USEFUL_PARTIAL,
    ...classified,
    honesty: { refused: false },
    wrapper,
    pythonMeta: spawned.pythonMeta || null,
    artifactStatus: artifact?.status || null,
    artifactSummary: artifact?.summary || null,
    receipt: wrapper.receipt || null,
    friction: observedFriction({
      wrapper,
      pythonMeta: spawned.pythonMeta,
      wrapperSha: TESTED_WRAPPER_SHA,
    }),
  };
  writeFileSync(join(outDir, "trial-record.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function runFirstExecution({ outDir, pythonBin, nodeBin } = {}) {
  const root = outDir || mkdtempSync(join(tmpdir(), "d27-first-"));
  mkdirSync(root, { recursive: true });
  const cases = [
    {
      id: "own-input-change",
      jobId: SELECTED_JOB,
      inputs: { before: RUNTIME_BEFORE, after: RUNTIME_AFTER },
      expectKind: KIND.USEFUL_CHANGE,
    },
    {
      id: "own-input-no-change",
      jobId: SELECTED_JOB,
      inputs: { before: RUNTIME_BEFORE, after: RUNTIME_BEFORE },
      expectKind: KIND.USEFUL_NO_CHANGE,
    },
    {
      id: "own-input-unsupported-html",
      jobId: SELECTED_JOB,
      inputs: { before: RUNTIME_BEFORE, after: RUNTIME_UNSUPPORTED },
      expectKind: KIND.USEFUL_REFUSAL,
    },
  ];
  const results = [];
  for (const item of cases) {
    const one = runTrial({
      jobId: item.jobId,
      inputs: item.inputs,
      buyerClass: BUYER_CLASS.OWNER_QA,
      outDir: join(root, item.id),
      pythonBin,
      nodeBin,
    });
    results.push({
      id: item.id,
      kind: one.kind,
      code: one.code,
      analysis: one.analysis,
      expectKind: item.expectKind,
      matched: one.kind === item.expectKind,
      outDir: one.outDir,
      artifactSummary: one.artifactSummary || null,
      outputsDigest: one.receipt?.outputsDigest || null,
    });
  }
  const suite = {
    schema: "samedaydesk.wave5.d27.first-execution.v1",
    buyerClass: BUYER_CLASS.OWNER_QA,
    demand: demandRecord({ buyerClass: BUYER_CLASS.OWNER_QA }),
    testedImplementation: contractRecord().testedImplementation,
    remainingBinding: remainingBinding(),
    cases: results,
    ok: results.every((row) => row.matched),
    sold: false,
  };
  writeFileSync(join(root, "first-execution.json"), `${JSON.stringify(suite, null, 2)}\n`);
  return { ...suite, outDir: root };
}

export { KIND, BUYER_CLASS };
