import { spawnSync } from "node:child_process";
import {
  CONFIRM_JOB_ID,
  ERROR_CODES,
  F08_BUDGET_AFTER,
  F08_BUDGET_BEFORE,
  F08_CLI,
  F08_FEED_AFTER,
  F08_FEED_BEFORE,
  F08_MODULE,
  PROPOSED_JOB_ID,
  REPO_ROOT,
  TESTED_SDS_SHA,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";

const JOB_INPUTS = {
  [PROPOSED_JOB_ID]: {
    flags: ["--before", F08_BUDGET_BEFORE, "--after", F08_BUDGET_AFTER],
  },
  [CONFIRM_JOB_ID]: {
    flags: ["--before", F08_FEED_BEFORE, "--after", F08_FEED_AFTER],
  },
};

export function defaultInputs(jobId) {
  return JOB_INPUTS[jobId] || null;
}

function parseStdoutJson(stdout) {
  const trimmed = String(stdout || "").trim();
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

export function measureJob(request = {}) {
  const jobId = request.jobId || PROPOSED_JOB_ID;
  const preset = defaultInputs(jobId);
  if (!preset && !(request.args && request.args.length)) {
    return refuse(ERROR_CODES.UNKNOWN_JOB, `no F08 caller inputs pinned for ${jobId}`);
  }

  const args = ["run", jobId];
  if (request.example === true) args.push("--example");
  else if (Array.isArray(request.args) && request.args.length) args.push(...request.args);
  else args.push(...preset.flags);

  if (request.funding) {
    args.push("--funding", String(request.funding));
  }
  if (request.paymentPath) {
    args.push("--payment", String(request.paymentPath));
  }
  if (request.settle === true) args.push("--settle");
  if (request.outDir) {
    args.push("--out-dir", String(request.outDir));
  }

  const started = process.hrtime.bigint();
  const spawned = spawnSync(process.execPath, [F08_CLI, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: request.timeoutMs || 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const ended = process.hrtime.bigint();
  const durationMs = Number(ended - started) / 1e6;
  const body = parseStdoutJson(spawned.stdout);

  const measurement = {
    schema: "samedaydesk.wave5.d26.measurement.v1",
    jobId,
    durationMs,
    exitStatus: spawned.status,
    signal: spawned.signal,
    testedImplementation: {
      repo: "epistemedeus/samedaydesk",
      sha: TESTED_SDS_SHA,
      module: F08_MODULE,
      cli: "server/paid-useful-jobs/bin/cli.mjs",
    },
    body,
    stderr: spawned.stderr || "",
  };

  if (spawned.error && spawned.error.code === "ENOENT") {
    return {
      ...refuse(
        ERROR_CODES.WRAPPER_FAILURE_IS_NOT_COST_BASIS,
        "F08 CLI missing; missing dependency is incomplete, not a skipped pass",
        { path: F08_CLI },
      ),
      measurement,
    };
  }

  if (!body) {
    return {
      ...refuse(
        ERROR_CODES.WRAPPER_FAILURE_IS_NOT_COST_BASIS,
        "F08 CLI produced no JSON (transport or engine failure, not a valid analysis outcome)",
        { exitStatus: spawned.status, stderr: spawned.stderr || "" },
      ),
      measurement,
    };
  }

  if (body.code === "unknown-job" || body.code === "missing-job") {
    return {
      ...refuse(ERROR_CODES.UNKNOWN_JOB, body.error || `unknown job ${jobId}`, { wrapperCode: body.code }),
      measurement,
    };
  }

  if (body.sample === true) {
    return {
      ...refuse(
        ERROR_CODES.SAMPLE_IS_NOT_COST_BASIS,
        "SAMPLE/--example output is labelled fixture, not a paid-offer cost basis",
        { wrapperCode: body.code || null, fundingState: body.fundingState },
      ),
      measurement,
    };
  }

  if (body.ok !== true) {
    const wrapperCode = body.code || "engine-refused";
    const validRefusal =
      body.refused === true &&
      spawned.signal === null &&
      typeof body.fundingState === "string";
    if (validRefusal) {
      return {
        ...refuse(
          ERROR_CODES.ENGINE_REFUSAL_IS_NOT_COST_BASIS,
          "Valid F08 refusal/no-sale outcome is not a crash, and is not a successful offer cost basis",
          { wrapperCode, fundingState: body.fundingState },
        ),
        measurement: {
          ...measurement,
          classification: "valid-analysis-refusal",
        },
      };
    }
    return {
      ...refuse(
        ERROR_CODES.WRAPPER_FAILURE_IS_NOT_COST_BASIS,
        "F08 wrapper failure is not a valid analysis outcome and not a cost basis",
        { wrapperCode, exitStatus: spawned.status },
      ),
      measurement: {
        ...measurement,
        classification: "wrapper-or-engine-failure",
      },
    };
  }

  const outputBytes = Array.isArray(body.outputs)
    ? body.outputs.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0)
    : 0;

  return {
    ok: true,
    refused: false,
    jobId,
    sold: body.sold === true,
    sample: body.sample === true,
    fundingState: body.fundingState,
    purchaseAuthority: body.purchaseAuthority === true,
    liveSettlement: body.liveSettlement || body.receipt?.liveSettlement || null,
    outputs: body.outputs || [],
    outputBytes,
    inputsDigest: body.receipt?.inputsDigest || null,
    outputsDigest: body.receipt?.outputsDigest || null,
    durationMs,
    measurement,
  };
}
