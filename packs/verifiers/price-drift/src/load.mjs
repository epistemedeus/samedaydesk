import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ERROR_CODES, MAX_INPUT_BYTES } from "./constants.mjs";

const BLOCKED_FLAG_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function parseArgs(argv) {
  const args = Object.create(null);
  args._ = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const takesValue = next != null && !next.startsWith("--");
      if (BLOCKED_FLAG_KEYS.has(key) || key === "") {
        if (takesValue) i += 1;
        continue;
      }
      if (takesValue) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

export function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function resolveInputPath(value, cwd) {
  if (typeof value !== "string" || !value.trim()) {
    const err = new Error("path is empty");
    err.code = ERROR_CODES.MISSING_REQUIRED_INPUTS;
    throw err;
  }
  if (looksLikeUrl(value)) {
    const err = new Error(`live HTTP refused: ${value}`);
    err.code = ERROR_CODES.LIVE_HTTP_REFUSED;
    throw err;
  }
  return isAbsolute(value) ? value : resolve(cwd, value);
}

export function loadJson(path) {
  const st = statSync(path);
  if (st.size > MAX_INPUT_BYTES) {
    const err = new Error(`input exceeds ${MAX_INPUT_BYTES} bytes`);
    err.code = ERROR_CODES.INVALID_JSON;
    throw err;
  }
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (cause) {
    const err = new Error(`invalid JSON at ${path}: ${cause.message}`);
    err.code = ERROR_CODES.INVALID_JSON;
    throw err;
  }
}
