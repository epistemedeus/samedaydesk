import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";

export type LoadedFixture = {
  path: string;
  basename: string;
  raw: Buffer;
  bytes: number;
  digestSha256: string;
  mediaType: string;
  json: Record<string, unknown>;
  paymentPayload: Record<string, unknown>;
  declared: Record<string, unknown>;
  requirements: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function mediaTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".json") return "application/json";
  if (ext === ".yaml" || ext === ".yml") return "application/yaml";
  if (ext === ".mjs" || ext === ".js" || ext === ".ts") return "text/javascript";
  return "application/octet-stream";
}

export function loadFixture(filePath: string): LoadedFixture {
  const raw = readFileSync(filePath);
  const text = raw.toString("utf8");
  const parsed = JSON.parse(text);
  if (!isPlainObject(parsed)) {
    throw new Error(`fixture is not a JSON object: ${filePath}`);
  }
  const paymentPayload = isPlainObject(parsed.paymentPayload)
    ? parsed.paymentPayload
    : parsed;
  const declared = isPlainObject(parsed.declared) ? parsed.declared : {};
  const requirements = isPlainObject(parsed.requirements)
    ? parsed.requirements
    : { scheme: "exact", network: "eip155:8453" };
  return {
    path: filePath,
    basename: basename(filePath),
    raw,
    bytes: raw.length,
    digestSha256: sha256Hex(raw),
    mediaType: mediaTypeFor(filePath),
    json: parsed,
    paymentPayload,
    declared,
    requirements,
  };
}
