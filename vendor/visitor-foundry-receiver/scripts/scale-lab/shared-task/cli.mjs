#!/usr/bin/env node
/**
 * Agent-side shared-task CLI over the existing correspondence HTTP API.
 * No browser dependency. Local/offline when --base-url is omitted.
 *
 * Usage:
 *   node cli.mjs offline-journey
 *   node cli.mjs shared-journey --base-url http://127.0.0.1:8787 --admin-token "$TOKEN"
 *   node cli.mjs create --base-url URL --admin-token-file PATH --out-dir DIR
 *   node cli.mjs grant --base-url URL --token-file PATH --project-id ID --role writer|reader --out-dir DIR
 *   node cli.mjs publish --base-url URL --token-file PATH --project-id ID --kind task|question|evidence|capability [...]
 *   node cli.mjs accept --base-url URL --token-file PATH --project-id ID --proposal-event-id ID
 *   node cli.mjs export --base-url URL --token-file PATH --project-id ID --out FILE
 *   node cli.mjs import --base-url URL --token-file PATH --project-id ID --in FILE
 *   node cli.mjs import --base-url URL --admin-token-file PATH --in FILE --create-project --out-dir DIR
 *   node cli.mjs correct --base-url URL --token-file PATH --project-id ID --corrects-event-id ID --text TEXT
 *   node cli.mjs resume --base-url URL --token-file PATH --project-id ID [--after CURSOR]
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createIdempotencyKey } from "../../../scripts/correspondence/client.mjs";
import { parseCheckpoint, serializeCheckpoint } from "../../../scripts/correspondence/checkpoint.mjs";
import { assertNoSecretInPublicValue, collectSecrets } from "../../../scripts/correspondence/redact.mjs";
import {
  connectSharedWorkspace,
  createOfflineWorkspace,
  openSharedTaskWorkspace,
  parseExportPacket,
  recordBundleFromExport,
} from "./src/index.mjs";

const CLI_STATE_SCHEMA = "neomorphic.shared-task.cli-state.v1";

function args() {
  const out = { _: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  print({
    usage: [
      "node cli.mjs offline-journey",
      "node cli.mjs shared-journey --base-url http://127.0.0.1:8787 --admin-token $TOKEN",
      "node cli.mjs create --base-url URL --admin-token-file PATH --out-dir DIR [--title T] [--summary S]",
      "node cli.mjs grant --base-url URL --token-file PATH --project-id ID --role writer|reader --out-dir DIR",
      "node cli.mjs publish --base-url URL --token-file PATH --project-id ID --kind task|question|evidence|capability [--text TEXT] [--artifact-url URL] [--proposal-event-id ID] [--corrects-event-id ID]",
      "node cli.mjs accept --base-url URL --token-file PATH --project-id ID --proposal-event-id ID [--text NOTE]",
      "node cli.mjs export --base-url URL --token-file PATH --project-id ID --out FILE",
      "node cli.mjs import --base-url URL --token-file PATH --project-id ID --in FILE",
      "node cli.mjs import --base-url URL --admin-token-file PATH --in FILE --create-project --out-dir DIR",
      "node cli.mjs correct --base-url URL --token-file PATH --project-id ID --corrects-event-id ID --text TEXT",
      "node cli.mjs resume --base-url URL --token-file PATH --project-id ID [--after CURSOR] [--checkpoint-out FILE]",
    ],
  });
}

function readSecretFile(path, label) {
  if (!path) throw new Error(`${label} required`);
  const absolute = resolve(path);
  const value = readFileSync(absolute, "utf8").trim();
  if (!value || value.length < 16) throw new Error(`${label} is empty or too short: ${absolute}`);
  return value;
}

function writeSecretFile(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  if (existsSync(absolute)) {
    const current = readFileSync(absolute, "utf8").trim();
    if (current !== value) throw new Error(`refusing to overwrite existing secret file: ${absolute}`);
    return absolute;
  }
  writeFileSync(absolute, `${value}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return absolute;
}

function writeJson(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
  return absolute;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function readToken(opts) {
  if (opts["token-file"]) return readSecretFile(opts["token-file"], "token-file");
  if (opts.token) return String(opts.token);
  throw new Error("token required via --token-file or --token");
}

function readAdminToken(opts) {
  if (opts["admin-token-file"]) return readSecretFile(opts["admin-token-file"], "admin-token-file");
  if (opts["admin-token"]) return String(opts["admin-token"]);
  throw new Error("admin token required via --admin-token-file or --admin-token");
}

function loadState(opts) {
  const path = opts["state-file"];
  if (!path) return null;
  const state = readJson(path);
  if (state.schema !== CLI_STATE_SCHEMA) throw new Error("unsupported CLI state schema");
  return state;
}

function writeState(outDir, fields) {
  const state = {
    schema: CLI_STATE_SCHEMA,
    ...fields,
    updatedAt: new Date().toISOString(),
  };
  return writeJson(resolve(outDir, "state.json"), state);
}

function publicEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    projectId: event.projectId,
    sequence: event.sequence,
    kind: event.kind,
    createdAt: event.createdAt,
  };
}

async function offlineJourney() {
  const ws = createOfflineWorkspace();
  const brief = await ws.createTaskBrief({
    title: "DEMONSTRATION: shared-task offline brief",
    brief: "Local-only brief. Not a hosted shared workspace.",
    fundingClass: "demonstration",
  });
  const proposal = await ws.proposeArtifact({
    summary: "Offline proposal",
    artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
    artifactLabel: "demo receipt",
  });
  const accept = await ws.acceptArtifact({ proposalEventId: proposal.event.id });
  const correction = await ws.correctEvidence({
    correctsEventId: proposal.event.id,
    statement: "Correction: clarify demonstration receipt is unfunded.",
  });
  const changes = await ws.listChanges();
  print({
    mode: ws.mode,
    brief: brief.event.id,
    proposal: proposal.event.id,
    accept: accept.event.id,
    correction: correction.event.id,
    changeCount: changes.events.length,
    export: ws.exportSnapshot(),
  });
}

async function sharedJourney(opts) {
  const owner = await connectSharedWorkspace({
    baseUrl: opts["base-url"],
    adminToken: readAdminToken(opts),
    title: opts.title || "S20 shared task journey",
    summary: "Closed-pilot multi-client shared task over correspondence.",
    bootstrapIdempotencyKey: opts["bootstrap-key"] || createIdempotencyKey(),
  });

  const brief = await owner.createTaskBrief({
    title: "DEMONSTRATION: multi-client shared brief",
    brief: "Create a bounded public-docs note. Unfunded demonstration.",
    fundingClass: "demonstration",
    provenance: { surface: "shared-task-cli", claim: "demonstration" },
    idempotencyKey: createIdempotencyKey(),
  });

  const writerGrant = await owner.createWriterGrant();
  const writer = owner.asPeer({ peerToken: writerGrant.token });

  const proposalKey = createIdempotencyKey();
  const proposal = await writer.proposeArtifact({
    summary: "Writer proposes a completion artifact reference.",
    artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
    artifactLabel: "lab release receipt",
    provenance: { agent: "writer", claim: "published-artifact" },
    idempotencyKey: proposalKey,
  });

  const replay = await writer.proposeArtifact({
    summary: "Writer proposes a completion artifact reference.",
    artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
    artifactLabel: "lab release receipt",
    provenance: { agent: "writer", claim: "published-artifact" },
    idempotencyKey: proposalKey,
  });

  const accept = await owner.acceptArtifact({
    proposalEventId: proposal.event.id,
    note: "Owner accepts the proposed artifact.",
    idempotencyKey: createIdempotencyKey(),
  });

  const correction = await writer.correctEvidence({
    correctsEventId: proposal.event.id,
    statement: "Correction: receipt is demonstration-class, not a customer delivery.",
    provenance: { agent: "writer", claim: "correction" },
    idempotencyKey: createIdempotencyKey(),
  });

  const page1 = await owner.listChanges({ after: null, limit: 2 });
  const page2 = await writer.listChanges({ after: page1.nextCursor, limit: 10 });

  const portable = await owner.exportAll();

  print({
    mode: owner.mode,
    projectId: owner.projectId,
    brief: brief.event.id,
    proposal: proposal.event.id,
    replaySameId: replay.event.id === proposal.event.id,
    accept: accept.event.id,
    correction: correction.event.id,
    page1Count: page1.events.length,
    page1Cursor: page1.nextCursor,
    page2Count: page2.events.length,
    totalExported: portable.events.length,
    writerGrantId: writerGrant.grantId,
  });

  owner.dispose();
  writer.dispose();
}

async function cmdCreate(opts) {
  const outDir = opts["out-dir"];
  if (!outDir) throw new Error("--out-dir required so the owner token is not printed");
  const owner = await connectSharedWorkspace({
    baseUrl: opts["base-url"],
    adminToken: readAdminToken(opts),
    title: opts.title || "S35 CLI correspondence journey",
    summary: opts.summary || "Closed-pilot CLI create/publish/export/import/correct/resume.",
    bootstrapIdempotencyKey: opts.key || opts["bootstrap-key"] || createIdempotencyKey(),
  });
  const tokenFile = writeSecretFile(resolve(outDir, "owner.token"), owner.token);
  const stateFile = writeState(outDir, {
    baseUrl: owner.baseUrl,
    projectId: owner.projectId,
    ownerTokenFile: tokenFile,
    tokenFile,
    role: "owner",
    title: owner.project.title,
    status: owner.project.status,
    version: owner.project.version,
  });
  print({
    ok: true,
    command: "create",
    mode: owner.mode,
    projectId: owner.projectId,
    status: owner.project.status,
    version: owner.project.version,
    ownerTokenFile: tokenFile,
    stateFile,
  });
  owner.dispose();
}

function connectionFromOpts(opts) {
  const state = loadState(opts);
  return {
    baseUrl: opts["base-url"] || state?.baseUrl,
    projectId: opts["project-id"] || state?.projectId,
    tokenFile: opts["token-file"] || state?.tokenFile || state?.ownerTokenFile,
  };
}

async function openFromOpts(opts) {
  const conn = connectionFromOpts(opts);
  if (!conn.baseUrl) throw new Error("--base-url or --state-file required");
  if (!conn.projectId) throw new Error("--project-id or --state-file required");
  const token = opts["token-file"] || conn.tokenFile ? readSecretFile(opts["token-file"] || conn.tokenFile, "token-file") : readToken(opts);
  return connectSharedWorkspace({
    baseUrl: conn.baseUrl,
    projectId: conn.projectId,
    token,
  });
}

async function cmdPublish(opts) {
  const ws = await openFromOpts(opts);
  const kind = opts.kind;
  if (!kind) throw new Error("--kind required (task|question|evidence|capability|request|artifact|needs_human|...)");
  const result = await ws.publishEvent({
    kind,
    title: opts.title,
    text: opts.text,
    brief: opts.brief,
    artifactUrl: opts["artifact-url"],
    artifactLabel: opts["artifact-label"],
    proposalEventId: opts["proposal-event-id"],
    correctsEventId: opts["corrects-event-id"],
    provenance: {
      surface: "shared-task-cli",
      claim: String(kind),
    },
    idempotencyKey: opts.key || createIdempotencyKey(),
  });
  print({
    ok: true,
    command: "publish",
    mode: ws.mode,
    projectId: ws.projectId,
    kind: result.kind,
    replayed: result.replayed,
    event: publicEvent(result.event),
  });
  ws.dispose();
}

async function cmdExport(opts) {
  const ws = await openFromOpts(opts);
  const outPath = opts.out;
  if (!outPath) throw new Error("--out required");
  const packet = await ws.exportAll({
    maxEvents: opts.limit ? Number(opts.limit) : Number.POSITIVE_INFINITY,
  });
  const secrets = collectSecrets(ws.token);
  assertNoSecretInPublicValue(packet, secrets, "export");
  const bundle = recordBundleFromExport(packet);
  assertNoSecretInPublicValue(bundle, secrets, "record-bundle");
  const exportPath = writeJson(outPath, packet);
  let bundlePath = null;
  if (opts.bundle) bundlePath = writeJson(opts.bundle, bundle);
  parseExportPacket(packet);
  print({
    ok: true,
    command: "export",
    mode: ws.mode,
    projectId: ws.projectId,
    schema: packet.schema,
    eventCount: packet.events.length,
    truncated: packet.truncated,
    historyComplete: packet.history?.complete ?? null,
    out: exportPath,
    bundle: bundlePath,
  });
  ws.dispose();
}

async function cmdImport(opts) {
  const inPath = opts.in;
  if (!inPath) throw new Error("--in required");
  const packet = parseExportPacket(readFileSync(resolve(inPath), "utf8"));
  let ws;
  let created = false;
  let tokenFile = null;
  let stateFile = null;
  if (opts["create-project"]) {
    const outDir = opts["out-dir"];
    if (!outDir) throw new Error("--out-dir required with --create-project");
    ws = await connectSharedWorkspace({
      baseUrl: opts["base-url"],
      adminToken: readAdminToken(opts),
      title: opts.title || `Imported ${packet.project?.title || "correspondence"}`.slice(0, 120),
      summary: "Imported portable correspondence export. New identifiers. Not a copy of grant material.",
      bootstrapIdempotencyKey: opts.key || createIdempotencyKey(),
    });
    created = true;
    tokenFile = writeSecretFile(resolve(outDir, "owner.token"), ws.token);
    stateFile = writeState(outDir, {
      baseUrl: ws.baseUrl,
      projectId: ws.projectId,
      ownerTokenFile: tokenFile,
      tokenFile,
      role: "owner",
      importedFrom: packet.project?.id ?? null,
    });
  } else {
    ws = await openFromOpts(opts);
  }
  const imported = await ws.importPacket(packet);
  print({
    ok: true,
    command: "import",
    mode: ws.mode,
    created,
    projectId: ws.projectId,
    sourceProjectId: imported.sourceProjectId,
    imported: imported.imported,
    historyComplete: imported.history.complete,
    truncated: imported.history.truncated,
    note: imported.note,
    mapping: imported.mapping,
    ownerTokenFile: tokenFile,
    stateFile,
  });
  ws.dispose();
}

async function cmdGrant(opts) {
  const role = String(opts.role || "writer").toLowerCase();
  if (role !== "writer" && role !== "reader") {
    throw new Error("--role must be writer or reader");
  }
  const outDir = opts["out-dir"];
  if (!outDir) throw new Error("--out-dir required so the grant token is not printed");
  // Reserve a private output location before issuing a non-idempotent grant.
  const absoluteOut = resolve(outDir);
  if (existsSync(absoluteOut)) {
    if (lstatSync(absoluteOut).isSymbolicLink() || !lstatSync(absoluteOut).isDirectory() || readdirSync(absoluteOut).length) {
      throw new Error("grant --out-dir must be an empty real directory; reconcile any earlier attempt before issuing again");
    }
  } else mkdirSync(absoluteOut, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(absoluteOut, "grant-attempt.json"), JSON.stringify({command: "grant", role, status: "attempted; do not automatically retry"}), {flag: "wx", mode: 0o600});
  const ws = await openFromOpts(opts);
  let grant;
  try { grant = role === "reader" ? await ws.createReaderGrant() : await ws.createWriterGrant(); }
  catch (error) {
    if (error.code === "unknown_outcome") error.message = "Grant outcome unknown. Grant creation has no idempotency key; reconcile/revoke the original attempt with the operator before issuing another grant.";
    throw error;
  }
  const tokenFile = writeSecretFile(resolve(outDir, `${role}.token`), grant.token);
  const stateFile = writeState(outDir, {
    baseUrl: ws.baseUrl,
    projectId: ws.projectId,
    tokenFile,
    role: grant.role,
    grantId: grant.grantId,
    issuedByProjectId: ws.projectId,
  });
  print({
    ok: true,
    command: "grant",
    mode: ws.mode,
    projectId: ws.projectId,
    grantId: grant.grantId,
    role: grant.role,
    tokenFile,
    stateFile,
  });
  ws.dispose();
}

async function cmdAccept(opts) {
  const proposalEventId = opts["proposal-event-id"];
  if (!proposalEventId) throw new Error("--proposal-event-id required");
  const ws = await openFromOpts(opts);
  const result = await ws.acceptArtifact({
    proposalEventId,
    note: opts.text || opts.note || "Accepted proposed artifact.",
    idempotencyKey: opts.key || createIdempotencyKey(),
  });
  print({
    ok: true,
    command: "accept",
    mode: ws.mode,
    projectId: ws.projectId,
    replayed: result.replayed,
    event: publicEvent(result.event),
    proposalEventId,
    acceptanceAuthority: "data-only reply; not an owner-only service endorsement",
  });
  ws.dispose();
}

async function cmdCorrect(opts) {
  const ws = await openFromOpts(opts);
  const correctsEventId = opts["corrects-event-id"];
  if (!correctsEventId) throw new Error("--corrects-event-id required");
  const result = await ws.correctEvidence({
    correctsEventId,
    statement: opts.text || opts.statement || "Correction",
    provenance: { surface: "shared-task-cli", claim: "correction" },
    idempotencyKey: opts.key || createIdempotencyKey(),
  });
  print({
    ok: true,
    command: "correct",
    mode: ws.mode,
    projectId: ws.projectId,
    replayed: result.replayed,
    event: publicEvent(result.event),
    correctsEventId,
  });
  ws.dispose();
}

async function cmdResume(opts) {
  const conn = connectionFromOpts(opts);
  let after = opts.after || null;
  if (opts["checkpoint-file"]) {
    const checkpoint = parseCheckpoint(readFileSync(resolve(opts["checkpoint-file"]), "utf8"));
    if (conn.projectId && checkpoint.projectId !== conn.projectId) {
      throw Object.assign(new Error("checkpoint projectId does not match"), { code: "invalid_cursor" });
    }
    if (conn.baseUrl && checkpoint.baseUrl && checkpoint.baseUrl !== conn.baseUrl) {
      throw Object.assign(new Error("checkpoint baseUrl does not match"), { code: "invalid_cursor" });
    }
    after = opts.after || checkpoint.afterCursor || null;
    conn.projectId = conn.projectId || checkpoint.projectId;
    conn.baseUrl = conn.baseUrl || checkpoint.baseUrl;
  }
  const ws = await connectSharedWorkspace({
    baseUrl: conn.baseUrl,
    projectId: conn.projectId,
    token: readSecretFile(opts["token-file"] || conn.tokenFile, "token-file"),
  });
  const page = await ws.listChanges({ after: after || null, limit: Number(opts.limit || 25) });
  let checkpointPath = null;
  if (opts["checkpoint-out"]) {
    const last = page.events.at(-1);
    const text = serializeCheckpoint({
      baseUrl: ws.baseUrl,
      projectId: ws.projectId,
      afterCursor: page.nextCursor,
      lastEventId: last?.id ?? null,
      lastSequence: last?.sequence ?? null,
      lastKind: last?.kind ?? null,
    });
    checkpointPath = writeJson(opts["checkpoint-out"], JSON.parse(text));
  }
  print({
    ok: true,
    command: "resume",
    mode: ws.mode,
    projectId: ws.projectId,
    after: after || null,
    count: page.events.length,
    nextCursor: page.nextCursor,
    events: page.events.map(publicEvent),
    checkpoint: checkpointPath,
  });
  ws.dispose();
}

const opts = args();
const cmd = opts._[0] || "help";

try {
  if (cmd === "offline-journey") await offlineJourney();
  else if (cmd === "shared-journey") await sharedJourney(opts);
  else if (cmd === "create") await cmdCreate(opts);
  else if (cmd === "grant") await cmdGrant(opts);
  else if (cmd === "publish") await cmdPublish(opts);
  else if (cmd === "accept") await cmdAccept(opts);
  else if (cmd === "export") await cmdExport(opts);
  else if (cmd === "import") await cmdImport(opts);
  else if (cmd === "correct") await cmdCorrect(opts);
  else if (cmd === "resume") await cmdResume(opts);
  else {
    usage();
    process.exitCode = cmd === "help" ? 0 : 1;
  }
} catch (error) {
  print({
    ok: false,
    error: { code: error.code || "error", message: error.message,
      idempotencyKey: error.idempotencyKey || error.cause?.idempotencyKey || null,
      retryable: false },
  });
  process.exitCode = 1;
}
