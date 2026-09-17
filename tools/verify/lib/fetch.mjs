import { envelope, failError } from "./envelope.mjs";
import { APEX_ORIGIN, GATEWAY_ORIGIN, PAYMENT_STOP_PATHS } from "./catalog.mjs";
import { httpRequest, previewBody } from "./http.mjs";
import { readServeState } from "./serve.mjs";

function paymentStop(path) {
  return PAYMENT_STOP_PATHS.some((stop) => path === stop || path.startsWith(`${stop}/`));
}

function originKind(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") return "loopback";
    if (host === "agents.samedaydesk.com") return "gateway";
    if (host === "samedaydesk.com" || host === "www.samedaydesk.com") return "apex";
    return "remote";
  } catch {
    return "invalid";
  }
}

function classifyQuote(quote) {
  return {
    responseKind: quote.kind,
    status: quote.status,
    url: quote.url,
    method: quote.method,
    server: quote.server,
    contentType: quote.contentType,
    preview: previewBody(quote.body),
    json: quote.json && typeof quote.json === "object" ? summarizeJson(quote.json) : null,
  };
}

function summarizeJson(json) {
  if (Array.isArray(json)) return { type: "array", length: json.length };
  const keys = Object.keys(json).slice(0, 12);
  const out = { keys };
  if (json.service) out.service = json.service;
  if (json.ok !== undefined) out.ok = json.ok;
  if (json.openapi) out.openapi = json.openapi;
  if (json.info?.version) out.version = json.info.version;
  if (json.x402Version) out.x402Version = json.x402Version;
  if (json.toolCount != null) out.toolCount = json.toolCount;
  return out;
}

async function fetchOne(url, method = "GET") {
  return httpRequest(url, {
    method,
    headers: { accept: "application/json, text/html, text/plain;q=0.9,*/*;q=0.8" },
  });
}

export async function runFetch(parsed, { root, dryRun = false } = {}) {
  const target = parsed.flags.target || parsed.tokens[0] || "local";
  const method = String(parsed.flags.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return envelope({
      ok: false,
      command: "fetch",
      status: "usage",
      error: failError("USAGE", "fetch allows GET/HEAD only; never POST payment"),
    });
  }

  if (target === "gateway-unpaid") {
    const paths = [
      "/healthz",
      "/openapi.json",
      "/.well-known/x402",
      "/extract?url=https://example.com",
    ];
    const planned = paths.map((path) => `GET ${GATEWAY_ORIGIN}${path}`);
    const evidence = [{ kind: "argv", argv: planned }, { kind: "boundary", paymentSent: false }];
    if (dryRun) {
      return envelope({
        ok: true,
        command: "fetch",
        dryRun: true,
        feature: "x402-unpaid-discovery",
        evidence,
        result: { origin: GATEWAY_ORIGIN, paths },
      });
    }
    const quotes = [];
    for (const path of paths) {
      quotes.push(await fetchOne(`${GATEWAY_ORIGIN}${path}`));
    }
    evidence.push(...quotes.map((quote) => ({ kind: "http", ...classifyQuote(quote) })));
    const network = quotes.find((quote) => quote.kind === "network");
    if (network) {
      return envelope({
        ok: false,
        command: "fetch",
        feature: "x402-unpaid-discovery",
        evidence,
        error: failError("HOST_BUILD", `gateway fetch failed: ${network.body}`),
      });
    }
    const challenge = quotes.find((quote) => quote.kind === "cdn_challenge");
    if (challenge) {
      return envelope({
        ok: false,
        command: "fetch",
        feature: "x402-unpaid-discovery",
        evidence,
        error: failError("cdn_challenge", "gateway returned hcdn/JS challenge; not a product 200"),
      });
    }
    const extract = quotes.find((quote) => quote.url.includes("/extract"));
    if (!extract || extract.status !== 402) {
      return envelope({
        ok: false,
        command: "fetch",
        feature: "x402-unpaid-discovery",
        evidence,
        error: failError("HOST_BUILD", "GET /extract without payment must be HTTP 402", {
          status: extract?.status ?? null,
        }),
      });
    }
    const health = quotes.find((quote) => quote.url.endsWith("/healthz"));
    const docsOk = health && (health.status === 200 || health.kind === "ok");
    return envelope({
      ok: Boolean(docsOk),
      command: "fetch",
      feature: "x402-unpaid-discovery",
      evidence,
      error: docsOk
        ? null
        : failError("HOST_BUILD", "gateway /healthz was not 200"),
      result: {
        unpaidExtract: 402,
        quotes: quotes.map(classifyQuote),
      },
      boundary: { paymentSent: false, toolsCalled: false },
    });
  }

  if (target === "apex") {
    const path = parsed.flags.path || "/mcp";
    const url = `${APEX_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
    const evidence = [{ kind: "argv", argv: ["GET", url] }];
    if (dryRun) {
      return envelope({
        ok: true,
        command: "fetch",
        dryRun: true,
        evidence,
        result: { url, note: "apex hcdn 403 is cdn_challenge, not product 200" },
      });
    }
    const quote = await fetchOne(url);
    evidence.push({ kind: "http", ...classifyQuote(quote) });
    if (quote.kind === "network") {
      return envelope({
        ok: false,
        command: "fetch",
        evidence,
        error: failError("HOST_BUILD", `GET ${url} failed: ${quote.body}`),
        result: classifyQuote(quote),
      });
    }
    if (quote.kind === "cdn_challenge") {
      return envelope({
        ok: false,
        command: "fetch",
        evidence,
        error: failError("cdn_challenge", "apex hcdn 403 is a CDN challenge, not product 200"),
        result: { classification: "cdn_challenge", status: quote.status },
      });
    }
    return envelope({
      ok: quote.status >= 200 && quote.status < 400,
      command: "fetch",
      evidence,
      error:
        quote.status >= 200 && quote.status < 400
          ? null
          : failError("http_error", `GET ${url} -> ${quote.status}`),
      result: classifyQuote(quote),
    });
  }

  const path = parsed.flags.path || (target.startsWith("/") ? target : "/api/health");
  if (paymentStop(path)) {
    return envelope({
      ok: false,
      command: "fetch",
      error: failError("USAGE", "fetch stops before checkout/webhook payment paths"),
    });
  }

  const live = readServeState(root);
  const origin = parsed.flags.origin || live?.origin || (dryRun ? "http://127.0.0.1:0" : null);
  if (!origin) {
    return envelope({
      ok: false,
      command: "fetch",
      status: "usage",
      dryRun,
      error: failError("USAGE", "fetch --path needs --origin or a live `serve start` pid"),
    });
  }
  if (originKind(origin) === "invalid") {
    return envelope({
      ok: false,
      command: "fetch",
      status: "usage",
      error: failError("USAGE", "invalid --origin"),
    });
  }
  if (originKind(origin) === "apex") {
    return envelope({
      ok: false,
      command: "fetch",
      error: failError("cdn_challenge", "do not treat live apex TLS as local host proof"),
    });
  }

  const url = new URL(path, origin.endsWith("/") ? origin : `${origin}/`).href;
  const evidence = [{ kind: "argv", argv: [method, url] }];
  if (dryRun) {
    return envelope({
      ok: true,
      command: "fetch",
      dryRun: true,
      feature: "hosted-readback",
      evidence,
      result: { url },
    });
  }

  const quote = await fetchOne(url, method);
  evidence.push({ kind: "http", path, ...classifyQuote(quote) });
  if (quote.kind === "network") {
    return envelope({
      ok: false,
      command: "fetch",
      feature: "hosted-readback",
      evidence,
      error: failError("HOST_BUILD", `${method} ${url} failed: ${quote.body}`),
      result: { status: 0, json: null },
    });
  }
  if (quote.kind === "cdn_challenge") {
    return envelope({
      ok: false,
      command: "fetch",
      feature: "hosted-readback",
      evidence,
      error: failError("cdn_challenge", "hcdn/JS challenge is not a product 200"),
    });
  }
  if (path.includes("/api/health")) {
    const ok = quote.status === 200 && quote.json?.service === "samedaydesk";
    return envelope({
      ok,
      command: "fetch",
      feature: "hosted-readback",
      evidence,
      error: ok ? null : failError("HOST_BUILD", 'GET /api/health must be {service:"samedaydesk"}'),
      result: { json: quote.json, status: quote.status },
    });
  }
  const ok = quote.status >= 200 && quote.status < 400;
  return envelope({
    ok,
    command: "fetch",
    feature: "hosted-readback",
    evidence,
    error: ok ? null : failError("http_error", `${method} ${url} -> ${quote.status}`),
    result: classifyQuote(quote),
  });
}
