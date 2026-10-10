import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSdsApp } from "../app.js";
import { projectDeclaredEvidence } from "../lib/funnel-evidence/project-evidence.mjs";
import { consume } from "../lib/funnel-evidence/vendor/live-measurement-consumer-142500/src/consume.mjs";
import { projectFunnel } from "../lib/funnel-evidence/vendor/funnel-decision-projection-141100/src/project.mjs";
import { postRpc, probeApex, withShippedHost } from "../../tools/verify/lib/session.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const vendor = join(root, "server/lib/funnel-evidence/vendor");
const fixtures = join(here, "fixtures/funnel-evidence-143000");
const REQUEST = "neomorphic.funnel-decision-request.v1";
const PAYMENT_URL = "https://agents.samedaydesk.com/v0/commerce-demand.json?days=1";
const SECRET = "hostile-143000@example.com";

function gitBlob(path) {
  const body = readFileSync(path);
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

const coreOnly = load("core-only.json");
const paymentCut = load("public-payment-cut.json");
const einWindow = load("ein-window-135600.json");

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(port, { method = "POST", path = "/api/funnel-evidence", body, raw } = {}) {
  const payload = raw !== undefined ? raw : Buffer.from(body === undefined ? "" : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

function syntheticPacket() {
  return {
    schema: REQUEST,
    asOf: "2026-10-10T03:42:00.000Z",
    sources: [{
      adapter: "samedaydesk-evidence",
      sourceId: "owner-qa",
      version: "1",
      capture: { coverage: "partial" },
      records: [{
        schema: "samedaydesk.original-task-receipt.v1",
        synthetic: true,
        submitted: true,
        delivered: true,
        accepted: true,
        taskRef: "taskqa1",
      }],
    }],
  };
}

function mixedCurrencyPacket() {
  return {
    schema: REQUEST,
    asOf: "2026-10-10T03:42:00.000Z",
    sources: [{
      adapter: "samedaydesk-evidence",
      sourceId: "settlements",
      version: "1",
      records: [{
        schema: "samedaydesk.ordinary-delivery-join.v1",
        rows: [
          { paidEvidencePresent: true, currency: "USD", amountAtomic: "100", storedEventId: "payusd1", taskRef: "taskusd1", taskRefBound: true },
          { paidEvidencePresent: true, currency: "EUR", amountAtomic: "200", storedEventId: "payeur1", taskRef: "taskeur1", taskRefBound: true },
        ],
      }],
    }],
  };
}

function measurementPacket() {
  return {
    schema: "neomorphic.live-measurement-input.v1",
    payment: paymentCut,
    ein: einWindow,
    qualified: [],
  };
}

let server;
let port;
const leaked = [];
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  leaked.push(args.map(String).join(" "));
  originalLog(...args);
};
console.error = (...args) => {
  leaked.push(args.map(String).join(" "));
  originalError(...args);
};

test.before(async () => {
  server = await listen(createSdsApp());
  port = server.address().port;
});

test.after(async () => {
  console.log = originalLog;
  console.error = originalError;
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test("vendor blobs stay the accepted projection and consumer", () => {
  assert.equal(gitBlob(join(vendor, "funnel-decision-projection-141100/src/project.mjs")), "9ca997bc2f0a51e1ab283bb87943ada151708ddf");
  assert.equal(gitBlob(join(vendor, "live-measurement-consumer-142500/src/consume.mjs")), "106f71299fce208069f9830d4dd13de1a5a5762f");
  assert.equal(gitBlob(join(vendor, "live-measurement-consumer-142500/src/capture.mjs")), "5a8d191bb62e8b089055cf8c5261077bd7b265e9");
  assert.equal(gitBlob(join(fixtures, "core-only.json")), "337cd439692401b058dbc54f9d5f29fb40432238");
  assert.equal(gitBlob(join(fixtures, "public-payment-cut.json")), "8e40f9b361dd2f379ee8cc1bf02441d9ca0cbb33");
  assert.equal(gitBlob(join(fixtures, "ein-window-135600.json")), "9cc54698971fb269a385fbc620c7dc74a03918f7");
  const transport = readFileSync(join(root, "server/lib/funnel-evidence/project-evidence.mjs"), "utf8");
  assert.equal(transport.includes("readPublicOnce("), false);
  assert.equal(transport.includes("readBounded("), false);
  assert.equal(transport.includes("elapsedMs"), false);
});

test("core-only HTTP matches the direct projection", async () => {
  const started = Date.now();
  const response = await request(port, { body: coreOnly });
  assert.ok(Date.now() - started < 1000);
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  const direct = projectFunnel(coreOnly);
  assert.deepEqual(response.json.projection, direct);
  assert.deepEqual(response.json.nextAction, {
    action: direct.nextMeasurement.measure,
    changes: direct.nextMeasurement.changes,
  });
  assert.equal(response.json.schema, "samedaydesk.funnel-evidence.v1");
  assert.equal(response.json.evidenceAuthority, "caller-declared");
  assert.equal(response.json.inputFetched, false);
  assert.equal(response.json.hostedAcquisitionVerified, false);
  assert.equal(response.json.recognizedIncomeAtomic, null);
  assert.equal(response.json.independentCustomers, null);
  assert.equal(response.json.projection.stages.find((stage) => stage.stage === "account_signup").observed, false);
  assert.equal(response.json.projection.stages.find((stage) => stage.stage === "account_signup").eligibleDenominator, null);
  assert.equal(Object.hasOwn(response.json, "elapsedMs"), false);
  assert.deepEqual(response.json, projectDeclaredEvidence(coreOnly));
});

test("synthetic complete task is excluded and is not caller acceptance", async () => {
  const packet = syntheticPacket();
  const response = await request(port, { body: packet });
  const direct = projectFunnel(packet);
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.projection, direct);
  assert.equal(response.json.projection.excludedSynthetic, 3);
  assert.equal(response.json.projection.stages.find((stage) => stage.stage === "caller_acceptance").observed, false);
  assert.equal(response.json.projection.stages.find((stage) => stage.stage === "valid_delivery").observed, false);
  assert.equal(response.json.projection.stages.find((stage) => stage.stage === "request").observed, false);
});

test("mixed currency stays a conflict and is not added", async () => {
  const packet = mixedCurrencyPacket();
  const response = await request(port, { body: packet });
  const direct = projectFunnel(packet);
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.projection, direct);
  assert.equal(response.json.projection.decision.kind, "repair");
  assert.equal(response.json.projection.conflicts.some((item) => item.code === "mixed_currency"), true);
  assert.equal(response.json.nextAction.action, "Keep each currency on its own settlement. Do not add them.");
});

test("payment and EIN specimens match the consumer and the empty-source projection", async () => {
  const packet = measurementPacket();
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => {
    fetches += 1;
    throw new Error("fetch refused");
  };
  try {
    const started = Date.now();
    const response = await request(port, { body: packet });
    assert.ok(Date.now() - started < 1000);
    assert.equal(fetches, 0);
    assert.equal(response.status, 200);
    assert.equal(response.text.includes(PAYMENT_URL), false);
    const readout = consume(packet);
    assert.equal(readout.renderedAt, "2026-10-10T04:01:52.084Z");
    assert.deepEqual(response.json.projection, readout.projection);
    assert.deepEqual(response.json.nextAction, readout.nextAction);
    assert.deepEqual(response.json.planes.payment, readout.payment);
    assert.deepEqual(response.json.planes.ein, readout.ein);
    assert.deepEqual(response.json.planes.entry, readout.entry);
    assert.equal(response.json.observationTime, readout.observationTime);
    assert.equal(response.json.renderedAt, readout.renderedAt);
    assert.equal(response.json.rowsMaterialized, 0);
    assert.equal(response.json.planes.payment.cumulative.reconciledSettlements, 56);
    assert.equal(response.json.planes.payment.cumulative.amountAtomic, "1132000");
    assert.equal(response.json.planes.payment.currency, null);
    assert.equal(response.json.planes.ein.boundedCount, 65);
    assert.equal(response.json.planes.ein.signupRows, null);
    assert.equal(response.json.planes.ein.paymentRows, null);
    assert.equal(response.json.planes.ein.rowsMaterialized, 0);
    const core = projectFunnel({ schema: REQUEST, asOf: readout.renderedAt, sources: [] });
    assert.deepEqual(response.json.projection.decision, core.decision);
    assert.deepEqual(response.json.projection.stages, core.stages);
    assert.deepEqual(response.json.projection.nextMeasurement, core.nextMeasurement);
    assert.equal(response.json.recognizedIncomeAtomic, null);
    assert.equal(response.json.independentCustomers, null);
    assert.equal(response.json.inputFetched, false);
    assert.deepEqual(response.json, projectDeclaredEvidence(packet));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hostile private, oversize, nested, malformed, and fetch inputs stay unechoed", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => {
    fetches += 1;
    throw new Error("fetch refused");
  };
  const before = leaked.length;
  try {
    const email = await request(port, { body: { ...coreOnly, email: SECRET } });
    assert.equal(email.status, 400);
    assert.deepEqual(email.json, { error: { code: "private_field" } });
    assert.equal(email.text.includes(SECRET), false);
    assert.equal(email.text.includes("example.com"), false);

    const nestedSecret = await request(port, {
      body: { ...coreOnly, note: "bearer hostile-token-143000" },
    });
    assert.equal(nestedSecret.status, 400);
    assert.equal(nestedSecret.json.error.code, "private_field");
    assert.equal(nestedSecret.text.includes("hostile-token-143000"), false);

    const malformed = await request(port, { raw: Buffer.from("{") });
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.json, { error: { code: "malformed_json" } });

    const oversize = await request(port, { raw: Buffer.from(`{"pad":"${"a".repeat(300000)}"}`) });
    assert.equal(oversize.status, 413);
    assert.deepEqual(oversize.json, { error: { code: "oversize" } });
    assert.equal(oversize.text.includes("a".repeat(80)), false);

    let deep = { schema: REQUEST };
    for (let i = 0; i < 40; i += 1) deep = { nest: deep };
    const nested = await request(port, { body: deep });
    assert.equal(nested.status, 400);
    assert.deepEqual(nested.json, { error: { code: "nested_bound" } });

    const sources = Array.from({ length: 25 }, (_, index) => ({ adapter: "core", sourceId: `s${index}` }));
    const counted = await request(port, { body: { schema: REQUEST, asOf: coreOnly.asOf, sources } });
    assert.equal(counted.status, 400);
    assert.equal(counted.json.error.code, "count_bound");

    const fetched = await request(port, {
      body: { schema: "neomorphic.live-measurement-input.v1", fetch: true, payment: paymentCut },
    });
    assert.equal(fetches, 0);
    assert.equal(fetched.status, 400);
    assert.deepEqual(fetched.json, { error: { code: "url_fetch_refused" } });
    assert.equal(fetched.text.includes(PAYMENT_URL), false);

    const mixed = await request(port, { body: { ...coreOnly, payment: paymentCut } });
    assert.equal(mixed.status, 400);
    assert.equal(mixed.json.error.code, "mixed_packet");
    assert.equal(mixed.text.includes(PAYMENT_URL), false);

    const coreRecords = await request(port, {
      body: { schema: REQUEST, asOf: coreOnly.asOf, sources: [{ adapter: "core", records: [{ schema: "x" }] }] },
    });
    assert.equal(coreRecords.status, 400);
    assert.equal(coreRecords.json.error.code, "core_has_records");

    const missing = await request(port, { method: "GET" });
    assert.equal(missing.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const logged = leaked.slice(before).join("\n");
  assert.equal(logged.includes(SECRET), false);
  assert.equal(logged.includes("hostile-token-143000"), false);
  assert.equal(logged.includes(PAYMENT_URL), false);
});

test("cold process projects core-only without the server install", async () => {
  const dir = mkdtempSync(join(tmpdir(), "funnel-evidence-cold-"));
  try {
    cpSync(join(root, "server/lib/funnel-evidence"), dir, { recursive: true });
    const script = `
      globalThis.fetch = () => { console.error("fetched"); process.exit(3); };
      const { readFileSync } = await import("node:fs");
      const { projectDeclaredEvidence } = await import("./project-evidence.mjs");
      const { projectFunnel } = await import("./vendor/funnel-decision-projection-141100/src/project.mjs");
      const packet = JSON.parse(readFileSync(process.argv[1], "utf8"));
      const served = projectDeclaredEvidence(packet);
      const direct = projectFunnel(packet);
      if (JSON.stringify(served.projection) !== JSON.stringify(direct)) process.exit(2);
      if (served.inputFetched !== false) process.exit(4);
      process.stdout.write(JSON.stringify({ decision: served.projection.decision.kind, authority: served.evidenceAuthority }));
    `;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, join(fixtures, "core-only.json")], {
      cwd: dir,
      env: { PATH: process.env.PATH || "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    assert.equal(code, 0, stderr);
    assert.equal(stderr.includes("fetched"), false);
    assert.deepEqual(JSON.parse(stdout), { decision: "measure", authority: "caller-declared" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("maintained MCP client receives the same projection", async () => {
  await withShippedHost(root, async ({ origin, logs }) => {
    const probe = await probeApex(origin);
    assert.equal(probe.absent.status, 200);
    assert.equal(probe.absent.json.error.code, -32602);
    const names = probe.listed.json.result.tools.map((tool) => tool.name);
    assert.equal(names.includes("project_funnel_evidence"), true);
    const call = await postRpc(probe.mcpUrl, {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "project_funnel_evidence", arguments: { packet: coreOnly } },
    });
    assert.equal(call.status, 200);
    assert.equal(call.json.error, undefined);
    assert.equal(call.json.result.isError, undefined);
    assert.deepEqual(call.json.result.structuredContent.projection, projectFunnel(coreOnly));
    assert.match(call.json.result.content[0].text, /^decision: measure/);
    assert.match(call.json.result.content[0].text, /authority: caller-declared/);
    const measurement = await postRpc(probe.mcpUrl, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "project_funnel_evidence", arguments: { packet: measurementPacket() } },
    });
    const readout = consume(measurementPacket());
    assert.deepEqual(measurement.json.result.structuredContent.projection, readout.projection);
    assert.deepEqual(measurement.json.result.structuredContent.nextAction, readout.nextAction);
    assert.equal(JSON.stringify(measurement.json).includes(PAYMENT_URL), false);
    const missing = await postRpc(probe.mcpUrl, {
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: { name: "project_funnel_evidence", arguments: {} },
    });
    assert.equal(missing.json.result.isError, true);
    assert.deepEqual(missing.json.result.structuredContent, { error: { code: "request_schema" } });
    const hostile = await postRpc(probe.mcpUrl, {
      jsonrpc: "2.0",
      id: 43,
      method: "tools/call",
      params: { name: "project_funnel_evidence", arguments: { packet: { ...coreOnly, email: SECRET } } },
    });
    assert.equal(hostile.json.result.isError, true);
    assert.deepEqual(hostile.json.result.structuredContent, { error: { code: "private_field" } });
    assert.equal(JSON.stringify(hostile.json).includes(SECRET), false);
    assert.equal(logs().includes(SECRET), false);
    assert.equal(logs().includes(PAYMENT_URL), false);
  });
});
