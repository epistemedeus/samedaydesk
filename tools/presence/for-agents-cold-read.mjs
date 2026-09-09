import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures/for-agents-cold-read");
export const APEX_FOR_AGENTS_URL = "https://samedaydesk.com/for-agents";
export const AGENTS_LLMS_URL = "https://agents.samedaydesk.com/llms.txt";
export const AGENTS_SKILLS_URL = "https://agents.samedaydesk.com/.well-known/skills/index.json";
export const MAX_BODY_BYTES = 262144;
const ALTERNATES = [
  { id: "agents_llms", url: AGENTS_LLMS_URL, file: "agents-llms.txt", kind: "text" },
  { id: "agents_skills_index", url: AGENTS_SKILLS_URL, file: "skills-index.json", kind: "json" },
];

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
export function sha256File(name) {
  if (!ALTERNATES.some((a) => a.file === name)) throw new Error("unknown_fixture");
  return sha256Bytes(readFileSync(join(FIXTURE_DIR, name)));
}
export function loadCaptureMeta() {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "capture.json"), "utf8"));
}
function validateBody(body, kind) {
  if (kind === "json") {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.skills) || parsed.skills.length === 0) throw new Error("invalid_skills_index");
  } else if (!/SameDayDesk/i.test(body)) {
    throw new Error("unrecognized_discovery_body");
  }
}
async function readSurface(url, kind, fetchImpl) {
  const observedAt = new Date().toISOString();
  let res;
  try {
    res = await fetchImpl(url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Accept: kind === "json" ? "application/json" : "text/html, text/plain" },
    });
    if (res.url && res.url !== url) throw new Error("unexpected_response_url");
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, url, observedAt, status: res.status, errorClass: "http_error" };
    }
    const declaredLength = Number(res.headers.get("content-length"));
    if (declaredLength > MAX_BODY_BYTES) throw new Error("body_too_large");
    if (!res.body) throw new Error("empty_body");
    const reader = res.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BODY_BYTES) throw new Error("body_too_large");
        chunks.push(Buffer.from(part.value));
      }
    } catch (err) {
      await reader.cancel().catch(() => {});
      throw err;
    } finally {
      reader.releaseLock();
    }
    const raw = Buffer.concat(chunks);
    const body = raw.toString("utf8");
    validateBody(body, kind);
    return { ok: true, url, observedAt, status: res.status, bytes, sha256: sha256Bytes(raw), body };
  } catch (err) {
    await res?.body?.cancel().catch(() => {});
    const known = new Set(["body_too_large", "empty_body", "invalid_skills_index", "unrecognized_discovery_body", "unexpected_response_url"]);
    return {
      ok: false, url, observedAt, status: res?.status ?? null,
      errorClass: known.has(err?.message) ? err.message : "transport_or_invalid_body",
    };
  }
}

/** Read a live free discovery surface; fixtures are an explicit, dated offline mode.
 * Alternate catalogs are partial discovery, not an exact copy of the apex guide.
 * This function never makes a payment or follows a redirect.
 */
export async function resolveForAgentsColdRead({ fetchImpl = fetch, preferFixture = false } = {}) {
  if (preferFixture) {
    const meta = loadCaptureMeta();
    const sources = ALTERNATES.map((a) => {
      const body = readFileSync(join(FIXTURE_DIR, a.file), "utf8");
      const sha256 = sha256Bytes(Buffer.from(body));
      const expected = meta.freeAlternates.find((e) => e.id === a.id);
      if (!expected || expected.sha256 !== sha256) throw new Error("fixture_integrity_mismatch");
      validateBody(body, a.kind);
      return { id: a.id, url: a.url, body, sha256, source: "fixture", capturedAt: meta.capturedAt, captureAuthority: "worker_reported" };
    });
    return { outcome: "offline_fixture", paid: false, liveObserved: false, coverage: "partial_discovery_not_apex_guide", sources };
  }
  const apex = await readSurface(APEX_FOR_AGENTS_URL, "text", fetchImpl);
  if (apex.ok) {
    return { outcome: "apex_live", paid: false, liveObserved: true, coverage: "apex_guide", apex, sources: [apex] };
  }
  const alternates = await Promise.all(ALTERNATES.map(async (a) => ({ id: a.id, ...await readSurface(a.url, a.kind, fetchImpl) })));
  const sources = alternates.filter((a) => a.ok);
  return {
    outcome: sources.length ? "alternate_live" : "unavailable",
    paid: false, liveObserved: sources.length > 0,
    coverage: sources.length ? "partial_discovery_not_apex_guide" : "none",
    apex, alternates, sources,
  };
}
