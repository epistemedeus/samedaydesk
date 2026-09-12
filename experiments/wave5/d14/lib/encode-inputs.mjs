import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConsumerRefuse } from "./errors.mjs";
import { digestNamedBytes, sha256Bytes } from "./digest-named.mjs";
import { JOB_EXPECTED_OUTPUTS } from "./pins.mjs";
import { assertExecutionId } from "./origin.mjs";

export { ConsumerRefuse, sha256Bytes };

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

export function generateExecutionId() {
  return randomUUID();
}

export function freezeRequestRecord(request) {
  const text = JSON.stringify(request);
  const buf = Buffer.from(text, "utf8");
  return { text, bytes: buf.length, sha256: sha256Bytes(buf) };
}

export function encodeInputFile(key, filePath) {
  const abs = resolve(filePath);
  const buf = readFileSync(abs);
  const text = buf.toString("utf8");
  if (!looksJsonText(text)) {
    throw new ConsumerRefuse(
      "non-json-inline",
      `Input ${key} is not JSON text. POST /execute currently materializes JSON objects or JSON strings. Non-JSON bytes still need an envelope.`,
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
  executionId,
}) {
  if (!jobId) {
    throw new ConsumerRefuse("missing-job", "jobId is required");
  }
  const id = executionId == null ? generateExecutionId() : assertExecutionId(executionId);
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
  const request = { jobId, inputs, executionId: id };
  if (fundingIntent) request.fundingIntent = fundingIntent;
  if (example === true) request.example = true;
  if (payment && typeof payment === "object") request.payment = payment;
  const frozen = freezeRequestRecord(request);
  return {
    request,
    submitted,
    frozen,
    executionId: id,
    expectedOutputs: JOB_EXPECTED_OUTPUTS[jobId] || [],
  };
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

export function digestFromSubmitted(submitted = {}) {
  return digestNamedBytes(
    Object.entries(submitted).map(([name, row]) => ({
      name,
      kind: "file",
      bytes: row.bytes,
      sha256: row.stagedSha256,
    })),
  );
}
