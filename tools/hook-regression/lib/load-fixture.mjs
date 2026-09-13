import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FIXTURES_DIR, PACK_ROOT } from "./paths.mjs";
import { isPlainObject } from "./json.mjs";
import { DEFAULT_REQUIREMENTS } from "./rules.mjs";

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function resolveFixturePath(input) {
  if (typeof input !== "string" || !input) {
    throw new Error("fixture path required");
  }
  if (isAbsolute(input) && existsSync(input)) return input;
  const fromCwd = resolve(process.cwd(), input);
  if (existsSync(fromCwd)) return fromCwd;
  const fromPack = join(PACK_ROOT, input);
  if (existsSync(fromPack)) return fromPack;
  const fromFixtures = join(FIXTURES_DIR, input);
  if (existsSync(fromFixtures)) return fromFixtures;
  throw new Error(`fixture not found: ${input}`);
}

export function loadFixture(filePath) {
  const resolved = resolveFixturePath(filePath);
  const raw = readFileSync(resolved);
  const parsed = JSON.parse(raw.toString("utf8"));
  if (!isPlainObject(parsed)) {
    throw new Error(`fixture is not a JSON object: ${resolved}`);
  }
  const paymentPayload = isPlainObject(parsed.paymentPayload)
    ? parsed.paymentPayload
    : parsed;
  const declared = isPlainObject(parsed.declared) ? parsed.declared : {};
  const requirements = isPlainObject(parsed.requirements)
    ? parsed.requirements
    : { ...DEFAULT_REQUIREMENTS };
  return {
    path: resolved,
    basename: basename(resolved),
    raw,
    bytes: raw.length,
    digestSha256: sha256Hex(raw),
    mediaType: extname(resolved) === ".json" ? "application/json" : "application/octet-stream",
    json: parsed,
    paymentPayload,
    declared,
    requirements,
    attempt: typeof parsed.attempt === "string" ? parsed.attempt : null,
  };
}
