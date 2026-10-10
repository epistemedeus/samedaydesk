#!/usr/bin/env node
// Machine recipe for the hosted SameDayDesk apex. No Pilot checkout is required.
//
//   node server/scripts/apex-evidence-entry.mjs metadata
//   node server/scripts/apex-evidence-entry.mjs official-validate
//   node server/scripts/apex-evidence-entry.mjs cold
//
// cold reads server.json, connects to its streamable-http URL, and compares
// POST /api/funnel-evidence on that same origin. It sends the committed
// empty-source packet, the existing public payment/EIN capture, and one
// schema refusal. It does not submit a task, fetch a URL, or call a paid tool.
// Caller-declared output is not verified income, identity, or attribution.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { projectDeclaredEvidence } from "../lib/funnel-evidence/project-evidence.mjs";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import { SERVER_INFO } from "../routes/mcp.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../..");
export const MANIFEST_PATH = join(REPO_ROOT, "server.json");
export const FIXTURE_DIR = join(here, "fixtures/funnel-evidence-143000");
export const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
export const REGISTRY_NAME = "com.samedaydesk/task-evidence";
export const APEX_REMOTE = "https://samedaydesk.com/mcp";
export const PUBLIC_REPOSITORY = "https://github.com/epistemedeus/samedaydesk";
export const VALIDATE_URL = "https://registry.modelcontextprotocol.io/v0/validate";
export const PRESERVED_NAMES = Object.freeze([
  "io.github.epistemedeus/x402-data-gateway",
  "io.github.epistemedeus/ai-readiness",
  "com.samedaydesk/ai-readiness",
]);
export const MERCHANT_REMOTE = "https://agents.samedaydesk.com/mcp";
export const EVIDENCE_LABEL = "existing-public-capture";

const MISLEADING = [
  "real-time market",
  "comprehensive traffic",
  "verified customer",
  "verified income",
  "causal attribution",
  "authoritative fact",
  "authoritative observation",
];

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function corePacket() {
  return readJson(join(FIXTURE_DIR, "core-only.json"));
}

export function specimenPacket() {
  return {
    schema: "neomorphic.live-measurement-input.v1",
    payment: readJson(join(FIXTURE_DIR, "public-payment-cut.json")),
    ein: readJson(join(FIXTURE_DIR, "ein-window-135600.json")),
    qualified: [],
  };
}

export function invalidPacket() {
  return { schema: "not-a-request" };
}

export function metadataIssues(manifest, serverVersion = SERVER_INFO.version) {
  const issues = [];
  const description = typeof manifest?.description === "string" ? manifest.description : "";
  const title = typeof manifest?.title === "string" ? manifest.title : "";
  const text = `${title}\n${description}`.toLowerCase();
  if (manifest?.$schema !== SCHEMA_URL) issues.push("schema");
  if (manifest?.name !== REGISTRY_NAME) issues.push("identity");
  if (PRESERVED_NAMES.includes(manifest?.name)) issues.push("preserved-identity");
  if (manifest?.version !== serverVersion) issues.push("stale-version");
  if (description.length < 1 || description.length > 100) issues.push("description-bounds");
  if (!description.includes("caller-declared") || !description.includes("TaskMarket") || !description.includes("Fix Pack")) {
    issues.push("apex-scope");
  }
  if (/\b(two|five)-tool\b/i.test(description)) issues.push("stale-inventory");
  if (MISLEADING.some((phrase) => text.includes(phrase))) issues.push("misleading-claim");
  if (manifest?.packages !== undefined) issues.push("unsupported-package");
  if (manifest?._meta !== undefined) issues.push("house-meta");
  const remotes = Array.isArray(manifest?.remotes) ? manifest.remotes : [];
  if (remotes.length !== 1) issues.push("remote-count");
  const remote = remotes[0] || {};
  if (remote.type !== "streamable-http") issues.push("unsupported-transport");
  if (remote.url !== APEX_REMOTE) issues.push("remote-url");
  if (remote.url === MERCHANT_REMOTE || manifest?.websiteUrl === MERCHANT_REMOTE) issues.push("merchant-mixup");
  if (remote.headers !== undefined || remote.variables !== undefined) issues.push("unsupported-dependency");
  if (typeof remote.url === "string" && remote.url.includes("{")) issues.push("unsupported-template");
  const repository = manifest?.repository;
  if (!repository || repository.url !== PUBLIC_REPOSITORY || repository.source !== "github") issues.push("repository");
  if (typeof repository?.url === "string" && /pilot|private/i.test(repository.url)) issues.push("private-repository");
  if (JSON.stringify(manifest).includes("registry.modelcontextprotocol.io")) issues.push("registry-url-in-manifest");
  return issues;
}

export function selectedRemote(manifest) {
  const remote = manifest?.remotes?.[0];
  if (!remote || remote.type !== "streamable-http" || typeof remote.url !== "string") {
    throw new Error("manifest has no streamable-http remote");
  }
  return new URL(remote.url);
}

function httpEvidenceUrl(remoteUrl) {
  const url = new URL(remoteUrl);
  url.pathname = "/api/funnel-evidence";
  url.search = "";
  url.hash = "";
  return url;
}

async function postJson(url, body, headers) {
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    referrer: response.headers.get("referrer-policy"),
    text,
    json,
  };
}

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-11-25",
};

function summarize(body) {
  const payment = body?.planes?.payment;
  return {
    decision: body?.projection?.decision?.kind ?? null,
    reasons: body?.projection?.decision?.reasons ?? [],
    next: body?.nextAction?.action ?? "",
    changes: body?.nextAction?.changes ?? "",
    authority: body?.evidenceAuthority ?? null,
    inputFetched: body?.inputFetched ?? null,
    hostedAcquisitionVerified: body?.hostedAcquisitionVerified ?? null,
    recognizedIncomeAtomic: body?.recognizedIncomeAtomic ?? null,
    independentCustomers: body?.independentCustomers ?? null,
    currency: payment?.cumulative?.currency ?? payment?.currency ?? null,
    coverage: payment?.requestedWindow?.coverage ?? null,
    windowComplete: payment?.requestedWindow?.complete ?? null,
    signupRows: body?.planes?.ein?.signupRows ?? null,
    paymentRows: body?.planes?.ein?.paymentRows ?? null,
    rowsMaterialized: body?.rowsMaterialized ?? null,
  };
}

export async function officialValidate(manifest) {
  const response = await postJson(VALIDATE_URL, manifest, {
    "content-type": "application/json",
    accept: "application/json",
  });
  return { status: response.status, body: response.json };
}

export async function coldAcquire(manifest = readJson(MANIFEST_PATH)) {
  const issues = metadataIssues(manifest);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const remote = selectedRemote(manifest);
  const httpUrl = httpEvidenceUrl(remote);
  const core = corePacket();
  const specimen = specimenPacket();
  const invalid = invalidPacket();
  const initialize = await postJson(remote, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "apex-evidence-entry-147000", version: "0" },
    },
  }, MCP_HEADERS);
  const listed = await postJson(remote, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  }, MCP_HEADERS);
  async function call(id, packet) {
    return postJson(remote, {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: "project_funnel_evidence", arguments: { packet } },
    }, MCP_HEADERS);
  }
  const coreMcp = await call(3, core);
  const specimenMcp = await call(4, specimen);
  const invalidMcp = await call(5, invalid);
  const coreHttp = await postJson(httpUrl, core, { "content-type": "application/json", accept: "application/json" });
  const specimenHttp = await postJson(httpUrl, specimen, { "content-type": "application/json", accept: "application/json" });
  const invalidHttp = await postJson(httpUrl, invalid, { "content-type": "application/json", accept: "application/json" });
  const tools = listed.json?.result?.tools?.map((tool) => tool.name) ?? [];
  const coreBody = coreMcp.json?.result?.structuredContent ?? null;
  const specimenBody = specimenMcp.json?.result?.structuredContent ?? null;
  const directCore = projectDeclaredEvidence(core);
  const directSpecimen = projectDeclaredEvidence(specimen);
  const leaked = [coreMcp, specimenMcp, invalidMcp, coreHttp, specimenHttp, invalidHttp]
    .some((item) => item.text.includes("commerce-demand") || item.text.includes("agents.samedaydesk.com"));
  const parity = {
    coreHttp: JSON.stringify(coreBody) === JSON.stringify(coreHttp.json),
    specimenHttp: JSON.stringify(specimenBody) === JSON.stringify(specimenHttp.json),
    coreDirect: JSON.stringify(coreBody) === JSON.stringify(directCore),
    specimenDirect: JSON.stringify(specimenBody) === JSON.stringify(directSpecimen),
  };
  const receipt = {
    ok: initialize.status === 200
      && listed.status === 200
      && initialize.json?.result?.protocolVersion === "2025-11-25"
      && initialize.json?.result?.serverInfo?.name === SERVER_INFO.name
      && initialize.json?.result?.serverInfo?.version === SERVER_INFO.version
      && JSON.stringify(tools) === JSON.stringify([...MCP_TOOL_NAMES])
      && parity.coreHttp
      && parity.specimenHttp
      && parity.coreDirect
      && parity.specimenDirect
      && invalidMcp.json?.result?.isError === true
      && invalidMcp.json?.result?.structuredContent?.error?.code === "request_schema"
      && invalidHttp.status === 400
      && invalidHttp.json?.error?.code === "request_schema"
      && leaked === false
      && coreBody?.recognizedIncomeAtomic === null
      && specimenBody?.planes?.payment?.cumulative?.currency === null
      && specimenBody?.planes?.payment?.requestedWindow?.coverage === "not_collected_by_this_projection",
    manifest: {
      name: manifest.name,
      version: manifest.version,
      remote: remote.href,
    },
    server: {
      protocolVersion: initialize.json?.result?.protocolVersion ?? null,
      name: initialize.json?.result?.serverInfo?.name ?? null,
      version: initialize.json?.result?.serverInfo?.version ?? null,
    },
    tools,
    evidenceLabel: EVIDENCE_LABEL,
    core: summarize(coreBody),
    specimen: summarize(specimenBody),
    invalid: {
      mcp: invalidMcp.json?.result?.structuredContent?.error?.code ?? null,
      httpStatus: invalidHttp.status,
      http: invalidHttp.json?.error?.code ?? null,
    },
    parity,
    leaked,
  };
  return receipt;
}

function printHelp() {
  process.stdout.write([
    "apex-evidence-entry",
    "metadata           Check server.json identity, claims, and remote-only transport.",
    "official-validate  POST server.json to the official registry /v0/validate endpoint.",
    "cold               Initialize the manifest URL, list tools, and compare funnel HTTP.",
    "Labels: caller-declared evidence, existing public capture, owner QA.",
    "This recipe does not publish, store arguments, or invent a task.",
    "",
  ].join("\n"));
}

async function main() {
  const command = process.argv[2] || "cold";
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }
  const manifest = readJson(MANIFEST_PATH);
  if (command === "metadata") {
    const issues = metadataIssues(manifest);
    process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, issues, name: manifest.name, version: manifest.version })}\n`);
    if (issues.length > 0) process.exitCode = 1;
    return;
  }
  if (command === "official-validate") {
    const result = await officialValidate(manifest);
    const valid = result.body?.valid === true;
    process.stdout.write(`${JSON.stringify({ ok: result.status === 200 && valid, status: result.status, valid, issues: result.body?.issues ?? [] })}\n`);
    if (!(result.status === 200 && valid)) process.exitCode = 1;
    return;
  }
  if (command === "cold") {
    const receipt = await coldAcquire(manifest);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (!receipt.ok) process.exitCode = 1;
    return;
  }
  printHelp();
  process.exitCode = 1;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${String(error.message || error.name || "error").slice(0, 300)}\n`);
    process.exitCode = 1;
  });
}
