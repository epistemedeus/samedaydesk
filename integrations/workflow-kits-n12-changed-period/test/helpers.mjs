import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLIENT_ENDPOINT, REQUEST_KIND, createChangedPeriodEndpoint } from "../src/client-endpoint.mjs";
import { SCENARIO_CLOCK, mappingRegistry } from "../src/fixtures.mjs";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const readText = (rel) => readFileSync(join(root, rel), "utf8");
export const readJson = (rel) => JSON.parse(readText(rel));
export const clone = (value) => JSON.parse(JSON.stringify(value));

export function endpoint(options = {}) {
  return createChangedPeriodEndpoint({ clock: SCENARIO_CLOCK, ...options });
}

export function evaluate(ep, request, { registry = mappingRegistry(), platform = "direct" } = {}) {
  return ep.handle({ url: `${CLIENT_ENDPOINT}/evaluate`, body: { kind: REQUEST_KIND, platform, period: request.period, records: request.records, mappings: registry } });
}

export function apply(ep, record, periodId) {
  return ep.handle({ url: `${CLIENT_ENDPOINT}/apply`, headers: { "Idempotency-Key": record.ledgerKey }, body: { ledgerKey: record.ledgerKey, idempotencyKey: record.idempotencyKey, recordKey: record.recordKey, periodId } });
}

export function replay(ep, record) {
  return ep.handle({ url: `${CLIENT_ENDPOINT}/replay`, headers: { "Idempotency-Key": record.sameIdempotencyKey }, body: { idempotencyKey: record.sameIdempotencyKey, recordKey: record.recordKey } });
}

/** Evaluate and apply every ready record. Returns the evaluation body. */
export function evaluateAndApply(ep, request, options) {
  const body = evaluate(ep, request, options).body;
  for (const record of body.records) if (record.outcome === "ready") apply(ep, record, body.periodId);
  return body;
}

export const byKey = (body) => Object.fromEntries(body.records.map((r) => [r.recordKey, r]));
