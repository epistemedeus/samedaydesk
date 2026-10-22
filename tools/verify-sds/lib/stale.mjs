import {
  HORIZON_HOURS_DEFAULT,
  JOB_IDS,
  MCP,
  PACKS,
  RECEIPT_SCHEMA,
  USEFUL_JOBS,
} from "./pins.mjs";
import { sha256File, sha256Json } from "./hash.mjs";
import { failError } from "./envelope.mjs";
import { ageHours, parseIso } from "./receipt.mjs";
import { rel } from "./repo.mjs";

export function currentPin() {
  return {
    usefulJobs: {
      version: USEFUL_JOBS.version,
      sha256: USEFUL_JOBS.sha256,
      bytes: USEFUL_JOBS.bytes,
    },
    packs: {
      recordRepeat: { sha256: PACKS.recordRepeat.sha256, bytes: PACKS.recordRepeat.bytes },
      distributionRepair: {
        sha256: PACKS.distributionRepair.sha256,
        bytes: PACKS.distributionRepair.bytes,
      },
      consumerRepeat: { sha256: PACKS.consumerRepeat.sha256, bytes: PACKS.consumerRepeat.bytes },
    },
    mcp: { tools: [...MCP.tools] },
  };
}

export function inputDigestFor(jobId, root) {
  if (jobId === "useful-jobs") {
    return sha256Json({
      jobId,
      pin: currentPin().usefulJobs,
      kitSha256: sha256File(rel(root, USEFUL_JOBS.kitArchive)),
    });
  }
  if (jobId === "packs") {
    return sha256Json({
      jobId,
      pin: currentPin().packs,
      archives: {
        recordRepeat: sha256File(rel(root, PACKS.recordRepeat.kitArchive)),
        distributionRepair: sha256File(rel(root, PACKS.distributionRepair.kitArchive)),
        consumerRepeat: sha256File(rel(root, PACKS.consumerRepeat.kitArchive)),
      },
    });
  }
  if (jobId === "mcp") {
    return sha256Json({
      jobId,
      pin: currentPin().mcp,
      inventorySha256: sha256File(rel(root, MCP.inventoryRel)),
    });
  }
  if (jobId === "all") {
    return sha256Json({
      jobId,
      jobs: Object.fromEntries(JOB_IDS.map((id) => [id, inputDigestFor(id, root)])),
    });
  }
  return sha256Json({ jobId, pin: currentPin() });
}

export function classifyStale(receipt, { root, now, horizonHours = HORIZON_HOURS_DEFAULT } = {}) {
  const reasons = [];
  const detail = {};

  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return {
      stale: true,
      reasons: ["invalid_receipt"],
      detail: { message: "receipt must be an object" },
    };
  }
  if (receipt.schema !== RECEIPT_SCHEMA) {
    reasons.push("schema_mismatch");
    detail.schema = receipt.schema ?? null;
    detail.expectedSchema = RECEIPT_SCHEMA;
  }

  const jobId = receipt.jobId;
  if (!JOB_IDS.includes(jobId) && jobId !== "all") {
    reasons.push("unknown_job");
    detail.jobId = jobId ?? null;
  }

  const pin = currentPin();
  const got = receipt.pin || {};
  if (jobId === "useful-jobs" || jobId === "all") {
    const uj = got.usefulJobs || got;
    if (uj.version !== pin.usefulJobs.version || uj.sha256 !== pin.usefulJobs.sha256) {
      reasons.push("pin_mismatch");
      detail.expectedPin = pin.usefulJobs;
      detail.receiptPin = uj;
    }
  }
  if (jobId === "packs" || jobId === "all") {
    const packs = got.packs || got;
    const rr = packs.recordRepeat?.sha256;
    const dr = packs.distributionRepair?.sha256;
    const cr = packs.consumerRepeat?.sha256;
    if (
      rr !== pin.packs.recordRepeat.sha256 ||
      dr !== pin.packs.distributionRepair.sha256 ||
      cr !== pin.packs.consumerRepeat.sha256
    ) {
      reasons.push("pin_mismatch");
      detail.expectedPacks = pin.packs;
      detail.receiptPacks = packs;
    }
  }
  if (jobId === "mcp" || jobId === "all") {
    const tools = got.mcp?.tools || got.tools;
    const expected = pin.mcp.tools.join(",");
    const actual = Array.isArray(tools) ? tools.join(",") : "";
    if (actual !== expected) {
      reasons.push("pin_mismatch");
      detail.expectedTools = pin.mcp.tools;
      detail.receiptTools = tools ?? null;
    }
  }

  if (root && JOB_IDS.includes(jobId)) {
    const expectedDigest = inputDigestFor(jobId, root);
    detail.expectedInputDigest = expectedDigest;
    detail.receiptInputDigest = receipt.inputDigest ?? null;
    if (receipt.inputDigest !== expectedDigest) reasons.push("input_digest_mismatch");
  } else if (jobId === "all" && root) {
    const expectedDigest = inputDigestFor("all", root);
    detail.expectedInputDigest = expectedDigest;
    detail.receiptInputDigest = receipt.inputDigest ?? null;
    if (receipt.inputDigest !== expectedDigest) reasons.push("input_digest_mismatch");
  } else if (!receipt.inputDigest || !/^[0-9a-f]{64}$/.test(String(receipt.inputDigest))) {
    reasons.push("input_digest_mismatch");
  }

  const clock = receipt.clock || receipt.checkedAt;
  const nowIso = now || new Date().toISOString();
  const age = ageHours(clock, nowIso);
  detail.clock = clock ?? null;
  detail.now = nowIso;
  detail.horizonHours = horizonHours;
  detail.ageHours = age;
  if (age == null || !Number.isFinite(parseIso(clock))) {
    reasons.push("unparseable_clock");
  } else if (age < -0.1) {
    reasons.push("clock_in_future");
  } else if (age > Number(horizonHours)) {
    reasons.push("clock_past_horizon");
  }

  const unique = [...new Set(reasons)];
  return { stale: unique.length > 0, reasons: unique, detail };
}

export function staleError(classified) {
  const reasons = classified.reasons.join(", ") || "unknown";
  return failError(
    "STALE_OUTPUT",
    `stale_output: receipt is not current (reasons: ${reasons})`,
    classified.detail,
  );
}

export function loadReceiptObject(raw) {
  if (raw && typeof raw === "object" && raw.schema === RECEIPT_SCHEMA) return raw;
  if (raw && typeof raw === "object" && raw.receipt && raw.receipt.schema === RECEIPT_SCHEMA) {
    return raw.receipt;
  }
  return raw;
}
