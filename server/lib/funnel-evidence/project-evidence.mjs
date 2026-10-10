// Thin transport over the unchanged accepted projection and consumer.
// This module does not fetch, store, spend, or rewrite those engines.
import { projectFunnel, REQUEST_SCHEMA } from "./vendor/funnel-decision-projection-141100/src/project.mjs";
import { consume, INPUT_SCHEMA } from "./vendor/live-measurement-consumer-142500/src/consume.mjs";
import { DEFAULT_MAX_BYTES, stripPrivate } from "./vendor/live-measurement-consumer-142500/src/capture.mjs";

export { DEFAULT_MAX_BYTES, INPUT_SCHEMA, REQUEST_SCHEMA };

export const RESULT_SCHEMA = "samedaydesk.funnel-evidence.v1";
export const MAX_DEPTH = 32;
export const MAX_NODES = 4000;
export const MAX_SOURCES = 24;
export const MAX_RECORDS = 400;

const SAFE_CODE = /^[a-z0-9_]+$/;
const FETCH_KEYS = new Set([
  "readPublic",
  "readPublicOnce",
  "publicPayment",
  "fetchUrl",
  "fetch",
  "readBounded",
]);
const PLANE_KEYS = ["payment", "ein", "entry", "qualified"];

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function safeCode(error) {
  const code = error && typeof error.code === "string" ? error.code : "";
  if (SAFE_CODE.test(code) && code.length <= 64) return code;
  return "projection_failed";
}

function walk(value, depth, state) {
  if (depth > MAX_DEPTH) throw coded("nested_bound");
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw coded("count_bound");
  if (Array.isArray(value)) {
    for (const item of value) walk(item, depth + 1, state);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.sources) && value.sources.length > MAX_SOURCES) throw coded("count_bound");
  if (Array.isArray(value.qualified) && value.qualified.length > MAX_SOURCES) throw coded("count_bound");
  if (Array.isArray(value.records) && value.records.length > MAX_RECORDS) throw coded("count_bound");
  for (const [key, item] of Object.entries(value)) {
    if (FETCH_KEYS.has(key)) state.fetch = true;
    walk(item, depth + 1, state);
  }
}

function hasPlane(packet) {
  if (PLANE_KEYS.some((key) => Object.hasOwn(packet, key))) return true;
  if (packet.paymentEvidence) return true;
  if (packet.schema === "pilot.payment-delivery-receiving.v1") return true;
  if (packet.schema === INPUT_SCHEMA) return true;
  if (packet.schema === "samedaydesk.original-task-correspondence.v1") return true;
  return Boolean(packet.window && packet.events && packet.project);
}

function classify(packet) {
  const core = packet.schema === REQUEST_SCHEMA;
  const plane = hasPlane(packet);
  if (core && plane) return "mixed";
  if (core) return "core";
  if (plane) return "consumer";
  return "invalid";
}

function envelope(body) {
  return {
    schema: RESULT_SCHEMA,
    evidenceAuthority: "caller-declared",
    inputFetched: false,
    hostedAcquisitionVerified: false,
    recognizedIncomeAtomic: null,
    independentCustomers: null,
    ...body,
  };
}

export function projectDeclaredEvidence(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) throw coded("request_schema");
  const state = { nodes: 0, fetch: false };
  walk(packet, 1, state);
  if (state.fetch) throw coded("url_fetch_refused");
  let encoded;
  try {
    encoded = Buffer.byteLength(JSON.stringify(packet));
  } catch {
    throw coded("invalid_body");
  }
  if (encoded > DEFAULT_MAX_BYTES) throw coded("oversize");
  const stripped = { stripped: 0 };
  stripPrivate(packet, stripped);
  if (stripped.stripped > 0) throw coded("private_field");
  const kind = classify(packet);
  if (kind === "mixed") throw coded("mixed_packet");
  if (kind === "core") {
    let projection;
    try {
      projection = projectFunnel(packet);
    } catch (error) {
      throw coded(safeCode(error));
    }
    return envelope({
      projection,
      nextAction: {
        action: projection.nextMeasurement?.measure || "",
        changes: projection.nextMeasurement?.changes || "",
      },
    });
  }
  if (kind === "consumer") {
    let readout;
    try {
      readout = consume(packet);
    } catch (error) {
      throw coded(safeCode(error));
    }
    return envelope({
      projection: readout.projection,
      nextAction: readout.nextAction,
      planes: {
        payment: readout.payment,
        ein: readout.ein,
        entry: readout.entry,
      },
      observationTime: readout.observationTime,
      renderedAt: readout.renderedAt,
      ownerQaRecords: readout.ownerQaRecords,
      rowsMaterialized: readout.rowsMaterialized,
    });
  }
  throw coded("request_schema");
}
