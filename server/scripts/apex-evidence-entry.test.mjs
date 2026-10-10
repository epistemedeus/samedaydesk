import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  APEX_REMOTE,
  EVIDENCE_LABEL,
  MANIFEST_PATH,
  MERCHANT_REMOTE,
  PRESERVED_NAMES,
  REGISTRY_NAME,
  SCHEMA_URL,
  coldAcquire,
  corePacket,
  invalidPacket,
  metadataIssues,
  officialValidate,
  readJson,
  specimenPacket,
} from "./apex-evidence-entry.mjs";
import { projectDeclaredEvidence } from "../lib/funnel-evidence/project-evidence.mjs";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import { SERVER_INFO } from "../routes/mcp.js";

const manifest = readJson(MANIFEST_PATH);

function withManifest(patch) {
  return { ...structuredClone(manifest), ...patch };
}

test("server.json is the remote-only apex entry", () => {
  assert.deepEqual(metadataIssues(manifest), []);
  assert.equal(manifest.name, REGISTRY_NAME);
  assert.equal(manifest.version, SERVER_INFO.version);
  assert.equal(manifest.description.length <= 100, true);
  assert.deepEqual(manifest.remotes, [{ type: "streamable-http", url: APEX_REMOTE }]);
  assert.equal(Object.hasOwn(manifest, "packages"), false);
  assert.equal(Object.hasOwn(manifest, "_meta"), false);
  assert.equal(JSON.stringify(manifest).includes("registry.modelcontextprotocol.io"), false);
  assert.equal(JSON.stringify(manifest).includes(MERCHANT_REMOTE), false);
  for (const name of PRESERVED_NAMES) assert.notEqual(manifest.name, name);
});

test("old identities, stale source, stronger claims, and other transports fail", () => {
  assert.ok(metadataIssues(withManifest({ name: "io.github.epistemedeus/x402-data-gateway" })).includes("preserved-identity"));
  assert.ok(metadataIssues(withManifest({ name: "io.github.epistemedeus/ai-readiness" })).includes("preserved-identity"));
  assert.ok(metadataIssues(withManifest({ name: "com.samedaydesk/ai-readiness" })).includes("preserved-identity"));
  assert.ok(metadataIssues(withManifest({
    remotes: [{ type: "streamable-http", url: MERCHANT_REMOTE }],
  })).includes("merchant-mixup"));
  assert.ok(metadataIssues(withManifest({ version: "1.0.0" })).includes("stale-version"));
  assert.ok(metadataIssues(withManifest({
    description: "Five-tool AI search only.",
  })).includes("stale-inventory"));
  assert.ok(metadataIssues(withManifest({ $schema: "https://example.invalid/old.schema.json" })).includes("schema"));
  assert.ok(metadataIssues(withManifest({ description: "" })).includes("description-bounds"));
  assert.ok(metadataIssues(withManifest({
    description: "Verified customer income and causal attribution of real-time market traffic.",
  })).includes("misleading-claim"));
  assert.ok(metadataIssues(withManifest({
    title: "Authoritative observation of comprehensive traffic",
  })).includes("misleading-claim"));
  assert.ok(metadataIssues(withManifest({
    packages: [{ registryType: "npm", identifier: "samedaydesk", transport: { type: "stdio" } }],
  })).includes("unsupported-package"));
  assert.ok(metadataIssues(withManifest({
    remotes: [{ type: "sse", url: APEX_REMOTE }],
  })).includes("unsupported-transport"));
  assert.ok(metadataIssues(withManifest({
    remotes: [{ type: "streamable-http", url: APEX_REMOTE, headers: [{ name: "Authorization", isRequired: true, isSecret: true }] }],
  })).includes("unsupported-dependency"));
  assert.ok(metadataIssues(withManifest({
    remotes: [{ type: "streamable-http", url: "https://{tenant}.samedaydesk.com/mcp", variables: { tenant: { description: "cell" } } }],
  })).includes("unsupported-template"));
  assert.ok(metadataIssues(withManifest({
    repository: { url: "https://github.com/epistemedeus/pilot", source: "github" },
  })).includes("private-repository"));
  assert.ok(metadataIssues(withManifest({ _meta: { "io.modelcontextprotocol.registry/publisher-provided": { rank: 1 } } })).includes("house-meta"));
});

test("official registry validation accepts this manifest and rejects a stale schema", async () => {
  const accepted = await officialValidate(manifest);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.valid, true);
  assert.deepEqual(accepted.body.issues, []);
  const rejected = await officialValidate(withManifest({
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json",
    version: "^1.2.0",
    description: "x".repeat(101),
  }));
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.valid, false);
  assert.ok(rejected.body.issues.length > 0);
});

test("cold client uses the manifest URL and matches HTTP and the direct projection", async () => {
  const receipt = await coldAcquire(manifest);
  assert.equal(receipt.ok, true, JSON.stringify({ parity: receipt.parity, invalid: receipt.invalid, server: receipt.server, tools: receipt.tools }));
  assert.equal(receipt.manifest.remote, APEX_REMOTE);
  assert.equal(receipt.server.protocolVersion, "2025-11-25");
  assert.deepEqual(receipt.server, { protocolVersion: "2025-11-25", ...SERVER_INFO });
  assert.deepEqual(receipt.tools, [...MCP_TOOL_NAMES]);
  assert.equal(receipt.evidenceLabel, EVIDENCE_LABEL);
  assert.equal(receipt.core.decision, "measure");
  assert.equal(receipt.core.authority, "caller-declared");
  assert.equal(receipt.core.recognizedIncomeAtomic, null);
  assert.equal(receipt.core.independentCustomers, null);
  assert.match(receipt.core.next, /source-separated/);
  assert.equal(receipt.specimen.currency, null);
  assert.equal(receipt.specimen.coverage, "not_collected_by_this_projection");
  assert.equal(receipt.specimen.windowComplete, null);
  assert.equal(receipt.specimen.signupRows, null);
  assert.equal(receipt.specimen.paymentRows, null);
  assert.equal(receipt.specimen.recognizedIncomeAtomic, null);
  assert.equal(receipt.specimen.independentCustomers, null);
  assert.match(receipt.specimen.next, /source-qualified/);
  assert.match(receipt.specimen.changes, /does not become recognized income/);
  assert.equal(receipt.invalid.mcp, "request_schema");
  assert.equal(receipt.invalid.httpStatus, 400);
  assert.equal(receipt.invalid.http, "request_schema");
  assert.equal(receipt.leaked, false);
  assert.deepEqual(receipt.parity, {
    coreHttp: true,
    specimenHttp: true,
    coreDirect: true,
    specimenDirect: true,
  });
  const direct = projectDeclaredEvidence(specimenPacket());
  assert.equal(direct.planes.payment.cumulative.currency, null);
  assert.equal(projectDeclaredEvidence(corePacket()).inputFetched, false);
  assert.throws(() => projectDeclaredEvidence(invalidPacket()), (error) => error.code === "request_schema");
});

test("the machine recipe runs as a cold process", async () => {
  const child = spawn(process.execPath, ["server/scripts/apex-evidence-entry.mjs", "cold"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
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
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.manifest.name, REGISTRY_NAME);
  assert.deepEqual(receipt.tools, [...MCP_TOOL_NAMES]);
  assert.equal(stdout.includes("commerce-demand"), false);
  assert.equal(readFileSync(MANIFEST_PATH, "utf8").includes(SCHEMA_URL), true);
});
