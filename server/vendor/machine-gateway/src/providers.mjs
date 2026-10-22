import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { publicFetch } from "../vendor/extractor/public-fetch.mjs";
import { assertPublicHttpUrl } from "../vendor/extractor/url-guard.mjs";
import { compareLockfileTexts } from "../vendor/extractor/lockfile/compare.mjs";
import { parseLockfileText } from "../vendor/extractor/lockfile/parse-lockfile.mjs";
import { object, text, integer, nullable, hashSchema } from "./schemas.mjs";
import { boundedJson, sha256 } from "./util.mjs";
import { fail, GatewayError } from "./errors.mjs";

const countSchema = object(Object.fromEntries(["beforePins", "afterPins", "added", "removed", "changed", "unchanged", "missingIntegrity"].map(key => [key, integer(512)])));
const pinSchema = object({
  id: text(2048), name: nullable(text(2048)), version: nullable(text(2048)), integrity: nullable(text(4096)),
  resolved: nullable(text(4096)), gitCommit: nullable(text(40)), termsHash: hashSchema, missingIntegrity: { type: "boolean" },
});
const pins = { type: "array", maxItems: 256, items: pinSchema };
export const deltaOutputSchema = object({
  schema: { const: "neomorphic.machine-gateway.lockfile-delta.v1" },
  status: { enum: ["partial", "actionable", "informational"] }, counts: countSchema,
  added: pins, removed: pins,
  changed: { type: "array", maxItems: 256, items: object({
    id: text(2048), name: nullable(text(2048)), before: pinSchema, after: pinSchema,
    changeKinds: { type: "array", maxItems: 4, uniqueItems: true, items: { enum: ["name", "version", "integrity", "resolved"] } },
  }) },
});
export const captureOutputSchema = object({
  schema: { const: "neomorphic.machine-gateway.http-capture.v1" },
  status: integer(599, 200), contentType: nullable(text(256)), bytes: integer(65536),
  sha256: hashSchema, bodyBase64: { type: "string", maxLength: 87384, pattern: "^[A-Za-z0-9+/]*={0,2}$" },
});

export const sampleInput = Object.freeze({
  before: JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/alpha": { version: "1.0.0", integrity: "sha512-old" } } }),
  after: JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/alpha": { version: "1.1.0", integrity: "sha512-new" } } }),
});

export function deltaResult(input) {
  const result = compareLockfileTexts(input.before, input.after);
  const { status, counts, added, removed, changed } = result;
  return { schema: "neomorphic.machine-gateway.lockfile-delta.v1", status, counts, added, removed, changed };
}

function deltaPreflight(input) {
  try {
    for (const value of [input.before, input.after]) {
      boundedJson(value, 49152);
      if (parseLockfileText(value).pins.length > 256) fail("pin_limit");
    }
  } catch (error) { if (error instanceof GatewayError) throw error; fail("invalid_lockfile"); }
}

export function runDeltaWorker(input, { signal }) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: input, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
    });
    const abort = () => { void worker.terminate().finally(() => reject(signal.reason)); };
    signal.addEventListener("abort", abort, { once: true });
    worker.once("message", value => value.error ? reject(new GatewayError("provider_failed", 502)) : resolve(value.output));
    worker.once("error", () => reject(new GatewayError("provider_failed", 502)));
    worker.once("exit", code => {
      signal.removeEventListener("abort", abort);
      if (code !== 0) reject(new GatewayError("provider_failed", 502));
    });
  });
}

export function capturePreflight(input) {
  try {
    const url = assertPublicHttpUrl(input.url);
    if (url.hash || (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))) fail("ssrf_blocked");
  } catch (error) { if (error instanceof GatewayError) throw error; fail("ssrf_blocked"); }
}

// Reuses the accepted public IPv4-only, DNS-pinned transport unchanged.
// Native HTTP(S) has no ambient proxy, cookie jar, credentials or redirect loop.
export async function capture(input, { signal }, dependencies) {
  capturePreflight(input);
  let response;
  try {
    response = await publicFetch(input.url, { signal, headers: { accept: "*/*", "accept-encoding": "identity", "user-agent": "Neomorphic-Machine-Gateway/0.1" } }, dependencies);
    if (response.status < 200 || response.status >= 300) {
      await response.body.cancel();
      fail(response.status >= 300 && response.status < 400 ? "redirect_blocked" : "upstream_status", 502);
    }
    const reader = response.body.getReader();
    const chunks = [], hash = createHash("sha256");
    let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 65536) { await reader.cancel(); fail("response_too_large", 502); }
        const chunk = Buffer.from(next.value);
        chunks.push(chunk); hash.update(chunk);
      }
    } finally { reader.releaseLock(); }
    return { schema: "neomorphic.machine-gateway.http-capture.v1", status: response.status,
      contentType: response.headers.get("content-type"), bytes, sha256: hash.digest("hex"), bodyBase64: Buffer.concat(chunks).toString("base64") };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof GatewayError) throw error;
    if (error?.code === "ssrf_blocked") fail("ssrf_blocked");
    fail("upstream_unavailable", 502);
  }
}

export function builtinRoutes({ budgetUnit = "usd-micros" } = {}) {
  return [
    { id: "lockfile.delta", version: "1", provider: "samedaydesk-lockfile-pin-delta", description: "Compare npm v2/v3 lockfile pin identities, including integrity and resolved commit changes.",
      price: { amount: 0, unit: budgetUnit }, timeoutMs: 5000, maxOutputBytes: 262144,
      inputSchema: object({ before: text(49152), after: text(49152) }), outputSchema: deltaOutputSchema,
      preflight: deltaPreflight, run: runDeltaWorker, test: () => deltaResult(sampleInput) },
    { id: "http.capture", version: "1", provider: "public-http", description: "Capture one public HTTP(S) response, limited to 64 KiB, with content hash and bytes.",
      price: { amount: 0, unit: budgetUnit }, timeoutMs: 8000, maxOutputBytes: 100000,
      inputSchema: object({ url: text(2048) }), outputSchema: captureOutputSchema,
      preflight: capturePreflight, run: capture,
      test: () => ({ schema: "neomorphic.machine-gateway.http-capture.v1", status: 200,
        contentType: "text/plain", bytes: 7, sha256: sha256("fixture"), bodyBase64: Buffer.from("fixture").toString("base64") }) },
  ];
}
