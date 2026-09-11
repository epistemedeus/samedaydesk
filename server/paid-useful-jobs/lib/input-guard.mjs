import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MAX_INPUT_BYTES } from "./pins.mjs";
import { getJob, optionalKeys, requiredKeys } from "./jobs.mjs";

export class WrapperRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "WrapperRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function refuse(code, message, detail) {
  return new WrapperRefuse(code, message, detail);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksJsonText(value) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function assertNotOversize(key, bytes) {
  if (bytes > MAX_INPUT_BYTES) {
    throw refuse("input-oversize", `Input ${key} is ${bytes} bytes; max is ${MAX_INPUT_BYTES}`, {
      key,
      bytes,
      max: MAX_INPUT_BYTES,
    });
  }
}

/**
 * Materialize caller-supplied inputs to files. Never substitutes kit samples
 * unless the caller explicitly set example mode.
 */
export function materializeInputs(jobId, request, workDir) {
  const job = getJob(jobId);
  const example = request?.example === true || request?.example === "true";
  const raw = request?.inputs && typeof request.inputs === "object" ? { ...request.inputs } : {};
  const reqKeys = requiredKeys(job);
  const optKeys = optionalKeys(job);
  const allowed = new Set([...reqKeys, ...optKeys]);

  if (!example) {
    const missing = reqKeys.filter((k) => {
      const v = raw[k];
      return v == null || v === false || v === "";
    });
    if (missing.length) {
      throw refuse(
        "missing-required-inputs",
        `Caller mode requires ${job.requiredInputs.join(", ")}; use --example only for labeled SAMPLE runs (not a sale)`,
        { missing, required: reqKeys },
      );
    }
  }

  mkdirSync(workDir, { recursive: true });
  const files = {};
  const entries = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) continue;
    if (value == null || value === false || value === "") continue;

    let filePath;
    let bytes;

    if (isPlainObject(value) || Array.isArray(value)) {
      const text = `${JSON.stringify(value, null, 2)}\n`;
      bytes = Buffer.byteLength(text, "utf8");
      assertNotOversize(key, bytes);
      filePath = join(workDir, `${key}.json`);
      writeFileSync(filePath, text);
    } else if (typeof value === "string" && looksJsonText(value)) {
      bytes = Buffer.byteLength(value, "utf8");
      assertNotOversize(key, bytes);
      try {
        JSON.parse(value);
      } catch (err) {
        throw refuse("input-malformed", `Input ${key} is not valid JSON: ${err.message}`, { key });
      }
      filePath = join(workDir, `${key}.json`);
      writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`);
    } else if (typeof value === "string") {
      filePath = resolve(value);
      if (!existsSync(filePath)) {
        throw refuse("input-missing-file", `Input ${key} file not found: ${filePath}`, { key, path: filePath });
      }
      bytes = statSync(filePath).size;
      assertNotOversize(key, bytes);
      if (key === "input" || key === "next-run" || filePath.endsWith(".json")) {
        try {
          const text = readFileSync(filePath, "utf8");
          if (text.trim().startsWith("{") || text.trim().startsWith("[")) JSON.parse(text);
        } catch (err) {
          throw refuse("input-malformed", `Input ${key} is not valid JSON: ${err.message}`, { key, path: filePath });
        }
      }
    } else {
      throw refuse("input-malformed", `Input ${key} must be a file path or JSON object`, { key });
    }

    files[key] = filePath;
    entries.push({ name: key, path: filePath, bytes: bytes ?? statSync(filePath).size });
  }

  return { example, files, entries, job };
}
