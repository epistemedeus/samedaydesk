import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { MAX_INPUT_BYTES } from "./pins.mjs";
import { getJob, optionalKeys, requiredKeys } from "./jobs.mjs";
import { sha256Bytes } from "./digest.mjs";

/**
 * Evaluate caller getters once. Later inspect/materialize/execute must
 * use this object, not the live request.
 */
export function freezeRequest(request = {}) {
  const inputsSrc = request.inputs;
  const inputs = {};
  const fileBytes = {};
  if (inputsSrc && typeof inputsSrc === "object" && !Array.isArray(inputsSrc)) {
    for (const [key, value] of Object.entries(inputsSrc)) {
      if (value && typeof value === "object") {
        try {
          inputs[key] = structuredClone(value);
        } catch {
          inputs[key] = value;
        }
      } else {
        inputs[key] = value;
      }
      if (typeof value === "string" && !looksJsonText(value)) {
        const abs = resolve(value);
        if (existsSync(abs) && statSync(abs).isFile()) {
          fileBytes[key] = readFileSync(abs);
        }
      }
    }
  }
  return {
    jobId: request.jobId,
    example: request.example,
    fundingIntent: request.fundingIntent,
    funding: request.funding,
    payment: request.payment,
    settle: request.settle,
    sold: request.sold,
    liveSettle: request.liveSettle,
    outDir: request.outDir,
    executionId: request.executionId,
    inputs,
    fileBytes,
  };
}

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

const DIRECTORY_KEYS = new Set(["input-root"]);

/**
 * Materialize caller-supplied inputs to files. Never substitutes kit samples
 * unless the caller explicitly set example mode.
 *
 * `input-root` is a directory used by repeat-job-record to verify
 * manifest-declared bytes. It is not a file and must not be byte-hashed.
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

    if (DIRECTORY_KEYS.has(key)) {
      if (typeof value !== "string" || looksJsonText(value)) {
        throw refuse("input-root-not-directory", "input-root must be a filesystem directory path", { key });
      }
      const dirPath = resolve(value);
      if (!existsSync(dirPath)) {
        throw refuse("input-missing-file", `Input ${key} directory not found: ${dirPath}`, { key, path: dirPath });
      }
      const st = statSync(dirPath);
      if (!st.isDirectory()) {
        throw refuse("input-root-not-directory", `Input input-root must be a directory: ${dirPath}`, {
          key,
          path: dirPath,
        });
      }
      const stagedDir = join(workDir, "input-root");
      cpSync(dirPath, stagedDir, { recursive: true });
      files[key] = stagedDir;
      // Receipt path stays the caller directory; the engine consumes the staged copy.
      entries.push({ name: key, path: dirPath, kind: "directory", stagedPath: stagedDir, sourcePath: dirPath });
      continue;
    }

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
      const st = statSync(filePath);
      if (st.isDirectory()) {
        throw refuse("input-not-file", `Input ${key} must be a file, not a directory`, { key, path: filePath });
      }
      const buf = request.fileBytes?.[key] || readFileSync(filePath);
      bytes = buf.length;
      assertNotOversize(key, bytes);
      if (key === "input" || key === "next-run" || filePath.endsWith(".json")) {
        const text = buf.toString("utf8");
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          try {
            JSON.parse(text);
          } catch (err) {
            throw refuse("input-malformed", `Input ${key} is not valid JSON: ${err.message}`, { key, path: filePath });
          }
        }
      }
      const staged = join(workDir, `${key}${extname(filePath) || ""}`);
      writeFileSync(staged, buf);
      files[key] = staged;
      entries.push({
        name: key,
        path: filePath,
        bytes,
        sha256: sha256Bytes(buf),
        kind: "file",
        stagedPath: staged,
        sourcePath: filePath,
      });
      continue;
    } else {
      throw refuse("input-malformed", `Input ${key} must be a file path or JSON object`, { key });
    }

    files[key] = filePath;
    entries.push({ name: key, path: filePath, bytes: bytes ?? statSync(filePath).size, kind: "file" });
  }

  return { example, files, entries, job };
}
