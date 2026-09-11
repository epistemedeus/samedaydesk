import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class ConsumerRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ConsumerRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function looksJsonText(value) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

export function stagedText(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function stagedSha256(text) {
  return sha256Bytes(Buffer.from(stagedText(text), "utf8"));
}

export function encodeInputFile(key, filePath) {
  const abs = resolve(filePath);
  const buf = readFileSync(abs);
  const text = buf.toString("utf8");
  if (!looksJsonText(text)) {
    throw new ConsumerRefuse(
      "non-json-inline",
      `Input ${key} is not JSON text. D01 POST /execute currently materializes JSON objects or JSON strings. Non-JSON bytes still need a D01 envelope.`,
      { key, path: abs, bytes: buf.length },
    );
  }
  try {
    JSON.parse(text);
  } catch (err) {
    throw new ConsumerRefuse("input-malformed", `Input ${key} is not valid JSON: ${err.message}`, {
      key,
      path: abs,
    });
  }
  return {
    key,
    text,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
    stagedSha256: stagedSha256(text),
  };
}

export function encodeExecuteRequest({
  jobId,
  files = {},
  fundingIntent,
  payment = null,
  example = false,
}) {
  if (!jobId) {
    throw new ConsumerRefuse("missing-job", "jobId is required");
  }
  const inputs = {};
  const submitted = {};
  for (const [key, filePath] of Object.entries(files)) {
    if (filePath == null || filePath === false || filePath === "") continue;
    const encoded = encodeInputFile(key, filePath);
    inputs[key] = encoded.text;
    submitted[key] = {
      bytes: encoded.bytes,
      sha256: encoded.sha256,
      stagedSha256: encoded.stagedSha256,
    };
  }
  const request = { jobId, inputs };
  if (fundingIntent) request.fundingIntent = fundingIntent;
  if (example === true) request.example = true;
  if (payment && typeof payment === "object") request.payment = payment;
  return { request, submitted };
}

export function assertNoFilesystemPaths(request, forbiddenSubstrings) {
  const raw = JSON.stringify(request);
  for (const needle of forbiddenSubstrings) {
    if (!needle) continue;
    if (raw.includes(needle)) {
      throw new ConsumerRefuse(
        "path-leaked-into-body",
        "HTTP body contains a local filesystem path. This consumer must send caller bytes, not shared-disk paths.",
        { needle },
      );
    }
  }
}
