/**
 * The changed-period scenario, run the same way through the Make blueprint, the
 * n8n workflow and the direct route, each against a fresh client endpoint with the
 * same injected faults. Deterministic: fixed clock, fixed fixtures.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createChangedPeriodEndpoint } from "./client-endpoint.mjs";
import { runDirectPeriod } from "./direct-route.mjs";
import { mappingRegistry, SCENARIO_CLOCK, SCENARIO_FAULTS } from "./fixtures.mjs";
import { simulateMake, simulateN8n } from "./simulate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
export const ROUTES = Object.freeze(["make", "n8n", "direct"]);

export const STEPS = Object.freeze([
  { step: "period-N", fixture: "fixtures/period-n.request.json", purpose: "first period, mapping v1, all records applied" },
  { step: "period-N+1 unadapted", fixture: "fixtures/period-n-plus-1.unadapted.request.json", purpose: "changed schema sent with the old mapping: schema_changed per record, nothing applied" },
  { step: "period-N+1 attempt", fixture: "fixtures/period-n-plus-1.request.json", purpose: "mapping v2 with an uncommitted record, a lost apply reply, a stale capture and a not-permitted record" },
  { step: "period-N+1 rerun", fixture: "fixtures/period-n-plus-1.rerun.request.json", purpose: "rerun after the partial attempt with a fresh capture: no record applied twice" },
  { step: "period-N+1 rerun again", fixture: "fixtures/period-n-plus-1.rerun.request.json", purpose: "identical rerun: nothing new applied" },
  { step: "period-N under changed terms", fixture: "fixtures/period-n.terms-changed.request.json", purpose: "rerun of the accepted period with the later exchange termsVersion: terms_changed, old terms kept" },
  { step: "period-N+1 local hash", fixture: "fixtures/period-n-plus-1.local-hash.request.json", purpose: "a locally hashed termsVersion that differs from the exchange value: terms_changed" },
]);

export function artifacts() {
  return { make: readJson("make/changed-period.blueprint.json"), n8n: readJson("n8n/changed-period.workflow.json") };
}

function runOnce(route, request, { endpoint, registry, artifactSet, index }) {
  if (route === "make") return simulateMake(artifactSet.make, { body: request, endpoint });
  if (route === "n8n") return simulateN8n(artifactSet.n8n, { body: request, endpoint, executionId: `sim-n8n-${index + 1}` });
  return runDirectPeriod(request, { endpoint, registry });
}

function outcomeMap(body) {
  if (!body?.records) return {};
  return Object.fromEntries(body.records.map((r) => [r.recordKey ?? "?", r.outcome === "exception" ? `exception:${r.exception.code}` : r.outcome]));
}

export function runScenario(route, { artifactSet = artifacts(), registry = mappingRegistry() } = {}) {
  const endpoint = createChangedPeriodEndpoint({ clock: SCENARIO_CLOCK, faults: SCENARIO_FAULTS });
  const steps = [];
  const exceptions = [];
  STEPS.forEach((def, index) => {
    const before = new Set(endpoint.receipts.snapshot().map((r) => r.ledgerKey));
    const run = runOnce(route, readJson(def.fixture), { endpoint, registry, artifactSet, index });
    const after = endpoint.receipts.snapshot();
    const appliedNow = after.filter((r) => !before.has(r.ledgerKey)).map((r) => `${r.periodId}/${r.recordKey}`);
    const body = run.response?.body ?? null;
    for (const r of body?.records ?? []) if (r.outcome === "exception") exceptions.push({ step: def.step, ...r.exception });
    for (const e of body?.configErrors ?? []) exceptions.push({ step: def.step, ...e });
    steps.push({
      step: def.step,
      status: run.status,
      error: run.error ? run.error.message : null,
      responseCode: run.response?.code ?? null,
      summary: body?.summary ?? null,
      outcomes: outcomeMap(body),
      applied: appliedNow,
      calls: run.httpCalls.length,
      externalEffects: endpoint.externalEffects(),
    });
  });
  const receipts = endpoint.receipts.snapshot();
  const perKey = {};
  for (const r of receipts) perKey[r.ledgerKey] = (perKey[r.ledgerKey] ?? 0) + r.applyCount;
  return {
    route,
    steps,
    exceptions,
    receipts: receipts.map(({ platform, ...rest }) => rest),
    externalEffects: endpoint.externalEffects(),
    maxAppliesPerKey: Math.max(0, ...Object.values(perKey)),
    journeyCommits: endpoint.effects.commitCount(),
    calls: endpoint.calls.length,
  };
}
