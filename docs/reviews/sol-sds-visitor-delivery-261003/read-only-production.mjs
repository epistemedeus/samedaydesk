#!/usr/bin/env node
// Fixed anonymous inspection only. No enrollment, grant, tool execution or pay.
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Budget, within, readResponse } from "../../../tools/hosted-useful-journey-100346/lib/budget.mjs";

const origin = "https://samedaydesk.com";
const budget = new Budget({ deadlineMs: 30_000, totalBytes: 8_388_608, outputBytes: 65_536 });
const records = [];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function get(path, maxBytes = 65_536) {
  const url = new URL(path, origin);
  if (url.origin !== origin || url.username || url.password || url.hash) throw Error("origin_refused");
  budget.spend(Buffer.byteLength(url.href), "request");
  const controller = new AbortController();
  const start = performance.now();
  try {
    const response = await within(fetch(url, { headers: { accept: "application/json" }, redirect: "manual", signal: controller.signal }), budget, 0, () => controller.abort());
    const bytes = await readResponse(response, budget, maxBytes);
    const row = { path: url.pathname, status: response.status, bytes: bytes.length,
      elapsedMs: +(performance.now() - start).toFixed(3), sha256: hash(bytes) };
    records.push(row);
    let json;
    try { json = JSON.parse(bytes); } catch {}
    // Retain selected public facts, never arbitrary headers or environment data.
    if (json && typeof json === "object") {
      row.facts = Object.fromEntries(["service", "enabled", "reason", "store", "schema", "version", "publicEvaluation", "publicationVerified", "productionReady", "clientEntry"].filter(k => json[k] !== undefined).map(k => [k, json[k]]));
      if (json.error) row.facts.error = typeof json.error === "string" ? json.error : json.error.code;
      if (json.configured) row.facts.configured = Object.fromEntries(Object.entries(json.configured).map(([k, v]) => [k, v === true]));
      if (json.skills) row.facts.machineNames = json.skills.map(s => s.id);
    }
    return { row, json, bytes };
  } catch (error) {
    records.push({ path: url.pathname, status: null, error: error.code || "transport_unavailable", elapsedMs: +(performance.now() - start).toFixed(3) });
    return null;
  } finally { controller.abort(); }
}

await get("/api/health");
await get("/api/correspondence/healthz");
await get("/api/correspondence/v1/visitor-entry");
await get("/api/public-readiness/healthz");
await get("/.well-known/agent-card.json");
await get("/api/hosted-useful/recipes");
await get("/api/hosted-useful/healthz");
const hostedMetadata = await get("/api/hosted-useful/client");
await get("/discovery/task-readiness.json");
const activationArchive = await get("/for-agents/relevant-activation/relevant-activation-caller-0.1.1.tgz", 131072);
const discovery = await get("/discovery/useful-jobs.json");
await get("/for-agents/useful-jobs/catalog.json");
let acquisition = { hostedJourney: false, offlinePredecessor: false,
  activationCaller: activationArchive?.row.status === 200 && activationArchive.bytes.length === 68369
    && hash(activationArchive.bytes) === "994ffe92d532c309a1f0b99f20ffcffc6a0c01846f44054f782c0f3ff7744c5b" };
if (hostedMetadata?.row.status === 200 && hostedMetadata.json?.version === "0.1.1"
    && hostedMetadata.json?.sha256 === "84cbb35758e8466cf36dd99d804b0b4c09251b9dc4c2820239c98568b494323d"
    && hostedMetadata.json?.archiveUrl === "/api/hosted-useful/client/archive") {
  const archive = await get(hostedMetadata.json.archiveUrl);
  acquisition.hostedJourney = archive?.row.status === 200 && archive.bytes.length === 10377
    && hash(archive.bytes) === hostedMetadata.json.sha256;
}
if (discovery?.row.status === 200) {
  const manifest = discovery.json;
  const declaredBytes = manifest?.archive?.bytes;
  const declaredSha = manifest?.archive?.sha256;
  const url = manifest?.archive?.url;
  if (Number.isInteger(declaredBytes) && declaredBytes > 0 && declaredBytes <= 6_291_456 && /^[a-f0-9]{64}$/.test(declaredSha || "") && typeof url === "string") {
    const archive = await get(url, declaredBytes);
    if (archive?.row.status === 200 && archive.bytes.length === declaredBytes && hash(archive.bytes) === declaredSha) {
      acquisition = { ...acquisition, offlinePredecessor: true, version: manifest.version, bytes: declaredBytes,
        sha256: declaredSha, path: archive.row.path, executesHostedJobs: false };
    }
  }
}
budget.spend(8192, "receipt-output-reservation");
const receipt = { schema: "samedaydesk.visitor-delivery.production-read-only.v1", observedAt: new Date().toISOString(), origin,
  requests: records, acquisition, budget: budget.snapshot(),
  usefulNegative: { nextAction: "Root must publish the received mount/client and enroll the existing correspondence provider before a visitor can use an existing project grant for a retained job." },
  facts: { anonymous: true, productionWrites: 0, enrollmentCalls: 0, grantsFabricated: false, assessPrepareClaimPayCalls: 0,
    outsideUsefulUse: "unobserved", settledPayment: "unobserved" } };
const output = `${JSON.stringify(receipt, null, 2)}\n`;
if (Buffer.byteLength(output) > 7168) throw Error("receipt_output_exceeded");
await within(writeFile(process.argv[2] || new URL("PRODUCTION-READBACK.json", import.meta.url), output, { mode: 0o600 }), budget);
budget.check();
process.stdout.write(JSON.stringify({ requests: records.length, acquisition, elapsedMs: budget.snapshot().elapsedMs, bytes: budget.used }) + "\n");
