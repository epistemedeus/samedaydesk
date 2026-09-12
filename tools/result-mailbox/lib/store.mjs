import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { assertRequestId, parseEnvelope } from "./envelope.mjs";
import { refuse } from "./errors.mjs";
import { MAX_ENVELOPE_BYTES } from "./pins.mjs";

export function mailboxRoot(mailbox) {
  return resolve(mailbox);
}

export function envelopeDir(mailbox, requestId) {
  const id = assertRequestId(requestId);
  const root = mailboxRoot(mailbox);
  const dir = resolve(root, id);
  const rel = relative(root, dir);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    rel.split(sep).includes("..")
  ) {
    throw refuse("invalid-request-id", "requestId escapes mailbox root", {
      status: "invalid-request-id",
    });
  }
  return dir;
}

export function envelopePath(mailbox, requestId) {
  return join(envelopeDir(mailbox, requestId), "envelope.json");
}

export function artifactsDir(mailbox, requestId) {
  return join(envelopeDir(mailbox, requestId), "artifacts");
}

export function readEnvelope(mailbox, requestId) {
  const path = envelopePath(mailbox, requestId);
  if (!existsSync(path)) {
    throw refuse("unknown-request", `unknown requestId ${requestId}`, {
      status: "unknown-request",
    });
  }
  const buf = readFileSync(path);
  if (buf.length > MAX_ENVELOPE_BYTES) {
    throw refuse("invalid-envelope", "envelope exceeds 1 MiB");
  }
  let parsed;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch {
    throw refuse("invalid-envelope", "envelope.json is not JSON");
  }
  const envelope = parseEnvelope(parsed);
  if (envelope.requestId !== requestId) {
    throw refuse("invalid-envelope", "envelope requestId does not match mailbox slot");
  }
  return { envelope, path };
}

export function retrievedRecordPath(mailbox, requestId) {
  return join(envelopeDir(mailbox, requestId), "retrieved.json");
}

export function ackRecordPath(mailbox, requestId) {
  return join(envelopeDir(mailbox, requestId), "ack.json");
}

function artifactIdentity(envelope) {
  const rows = Array.isArray(envelope?.artifacts) ? envelope.artifacts : [];
  return rows
    .map((row) => `${row.name}:${row.sha256}:${row.bytes}`)
    .sort()
    .join("|");
}

export function writeEnvelopeFiles({ mailbox, envelope, files }) {
  const dir = envelopeDir(mailbox, envelope.requestId);
  const arts = artifactsDir(mailbox, envelope.requestId);
  const path = join(dir, "envelope.json");
  if (existsSync(path)) {
    const existing = parseEnvelope(JSON.parse(readFileSync(path, "utf8")));
    const sameJob = existing.jobId === envelope.jobId;
    const sameArtifacts = artifactIdentity(existing) === artifactIdentity(envelope);
    if (sameJob && sameArtifacts) {
      return { dir, envelopePath: path, artifactsDir: arts, replayed: true, envelope: existing };
    }
    throw refuse("request-id-conflict", "requestId already holds a different delivery", {
      status: "request-id-conflict",
      detail: { requestId: envelope.requestId, existingJobId: existing.jobId, incomingJobId: envelope.jobId },
    });
  }
  mkdirSync(arts, { recursive: true });
  for (const file of files) {
    const dest = join(arts, file.name);
    const buf = file.buf ? Buffer.from(file.buf) : readFileSync(file.path);
    writeFileSync(dest, buf);
  }
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);
  return { dir, envelopePath: path, artifactsDir: arts };
}

export function writeEnvelope(mailbox, envelope) {
  const path = envelopePath(mailbox, envelope.requestId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);
  return path;
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
