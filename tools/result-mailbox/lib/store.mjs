import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertRequestId, parseEnvelope } from "./envelope.mjs";
import { refuse } from "./errors.mjs";
import { MAX_ENVELOPE_BYTES } from "./pins.mjs";

export function envelopeDir(mailbox, requestId) {
  return join(resolve(mailbox), assertRequestId(requestId));
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

export function writeEnvelopeFiles({ mailbox, envelope, files }) {
  const dir = envelopeDir(mailbox, envelope.requestId);
  const arts = artifactsDir(mailbox, envelope.requestId);
  mkdirSync(arts, { recursive: true });
  for (const file of files) {
    const dest = join(arts, file.name);
    copyFileSync(file.path, dest);
  }
  const path = join(dir, "envelope.json");
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);
  return { dir, envelopePath: path, artifactsDir: arts };
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
