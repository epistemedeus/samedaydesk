import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
  return value;
}
function deliveryIdentity(envelope) {
  // Acknowledgment is mutable progress; provenance, TTL and sample terms are not.
  const { deliveredToBuyer, acknowledgedAt, ...identity } = envelope;
  identity.artifacts = [...identity.artifacts].sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(canonical(identity));
}
function digest(buf) { return createHash("sha256").update(buf).digest("hex"); }
function verifiedFiles(envelope, files) {
  if (!Array.isArray(files) || files.length !== envelope.artifacts.length) throw refuse("invalid-artifact", "Artifact files must exactly match envelope");
  const names = new Set();
  return files.map((file) => {
    const listed = envelope.artifacts.find((a) => a.name === file.name);
    if (!listed || names.has(file.name)) throw refuse("invalid-artifact", "Unexpected or duplicate artifact file");
    names.add(file.name);
    if (!file.buf && (!file.path || !lstatSync(file.path).isFile())) throw refuse("invalid-artifact", "Artifact source must be a regular file");
    const buf = file.buf ? Buffer.from(file.buf) : readFileSync(file.path);
    if (buf.length !== listed.bytes || digest(buf) !== listed.sha256) throw refuse("digest-mismatch", "Artifact bytes differ from envelope identity");
    return { name: file.name, buf };
  });
}
export function writeEnvelopeFiles({ mailbox, envelope, files }) {
  envelope = parseEnvelope(envelope);
  const prepared = verifiedFiles(envelope, files);
  const dir = envelopeDir(mailbox, envelope.requestId);
  const arts = artifactsDir(mailbox, envelope.requestId);
  const path = join(dir, "envelope.json");
  const replay = () => {
    const existing = readEnvelope(mailbox, envelope.requestId).envelope;
    if (deliveryIdentity(existing) !== deliveryIdentity(envelope)) {
      throw refuse("request-id-conflict", "requestId already holds different delivery bytes or terms", {
        status: "request-id-conflict", detail: { requestId: envelope.requestId },
      });
    }
    verifiedFiles(existing, existing.artifacts.map((a) => ({ name: a.name, path: join(arts, a.name) })));
    return { dir, envelopePath: path, artifactsDir: arts, replayed: true, envelope: existing };
  };
  if (existsSync(path)) return replay();
  mkdirSync(mailboxRoot(mailbox), { recursive: true });
  const stage = mkdtempSync(join(mailboxRoot(mailbox), "." + envelope.requestId + ".stage-"));
  try {
    const stagedArtifacts = join(stage, "artifacts");
    mkdirSync(stagedArtifacts);
    for (const file of prepared) writeFileSync(join(stagedArtifacts, file.name), file.buf);
    writeFileSync(join(stage, "envelope.json"), JSON.stringify(envelope, null, 2) + "\n");
    try { renameSync(stage, dir); }
    catch (err) {
      if (existsSync(path)) return replay();
      if (existsSync(dir)) throw refuse("incomplete-existing-delivery", "An older incomplete slot is preserved; no new delivery was published");
      throw err;
    }
    return { dir, envelopePath: path, artifactsDir: arts };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + "." + process.pid + "." + randomUUID() + ".tmp";
  try { writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n"); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

export function writeEnvelope(mailbox, envelope) {
  const path = envelopePath(mailbox, envelope.requestId);
  parseEnvelope(envelope);
  writeAtomic(path, envelope);
  return path;
}

export function writeJson(filePath, value) {
  writeAtomic(filePath, value);
}
