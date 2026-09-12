import { sha256Bytes } from "./hash.mjs";

const ALLOWED_HOSTS = new Set(["agents.samedaydesk.com", "registry.modelcontextprotocol.io"]);

export const LIVE_GET_TARGETS = Object.freeze([
  {
    name: "openapi",
    url: "https://agents.samedaydesk.com/openapi.json",
    expectStatus: 200,
  },
  {
    name: "mcp-version",
    url: "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.epistemedeus%2Fx402-data-gateway/versions/1.23.49",
    expectStatus: 200,
  },
  {
    name: "x402",
    url: "https://agents.samedaydesk.com/.well-known/x402",
    expectStatus: 200,
  },
  {
    name: "health",
    url: "https://agents.samedaydesk.com/health",
    expectStatus: 404,
  },
]);

function assertAllowedUrl(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== "https:") {
    throw new Error(`refusing non-https live GET ${urlString}`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`refusing live GET host ${url.hostname}`);
  }
  if (url.username || url.password) {
    throw new Error("refusing URLs with userinfo");
  }
  return url;
}

export async function liveGet(urlString, { timeoutMs = 15000 } = {}) {
  const url = assertAllowedUrl(urlString);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: ac.signal,
      headers: {
        accept: "application/json, */*;q=0.1",
        "user-agent": "cw69-machine-offer-discovery/0.1",
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      url: url.toString(),
      method: "GET",
      status: res.status,
      sha256: sha256Bytes(buf),
      bytes: buf.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Optional GET-only rebind against documented capture URLs.
 * Does not replace hosted-evidence identity. Mismatch stays recorded, not guessed.
 */
export async function liveRebind(identityMerchant, { timeoutMs = 15000 } = {}) {
  const observations = [];
  for (const target of LIVE_GET_TARGETS) {
    try {
      const got = await liveGet(target.url, { timeoutMs });
      const captured =
        target.name === "openapi"
          ? identityMerchant?.openapiSha256 || null
          : target.name === "mcp-version"
            ? identityMerchant?.mcpSha256 || null
            : target.name === "x402"
              ? identityMerchant?.x402Sha256 || null
              : null;
      const match = captured ? got.sha256 === captured : null;
      observations.push({
        ...target,
        ...got,
        kind: "live-get",
        expectedStatus: target.expectStatus,
        statusMatch: got.status === target.expectStatus,
        capturedSha256: captured,
        matchesCapture: match,
      });
    } catch (err) {
      observations.push({
        ...target,
        kind: "live-get",
        status: "unknown",
        error: String(err?.message || err),
        matchesCapture: null,
      });
    }
  }
  return {
    kind: "live-get-observation",
    identityRemainsHostedEvidence: true,
    isLatestAuthority: false,
    observations,
  };
}
