import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { PAID_EVIDENCE_FILENAME } from "../src/historical.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OWNED = path.join(here, "..");
export const PIN = JSON.parse(await readFile(path.join(OWNED, "PIN.json"), "utf8"));
export const MERCHANT_SHA = PIN.merchant.sha;
export const MERCHANT_RO = process.env.D17_MERCHANT_RO || "/tmp/x402-url-extractor-ro";
export const MERCHANT_ROOT = process.env.D17_MERCHANT_ROOT || "/tmp/x402-url-extractor-d17-run";

export const PAYER = `0x${"2".repeat(40)}`;
export const PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const NETWORK = "eip155:8453";
export const PRICE_ATOMIC = "5000";
export const FAKE_SETTLE_TX = `0x${"3".repeat(64)}`;

export function readPinShaFromReadonlyClone() {
  return execFileSync("git", ["-C", MERCHANT_RO, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

export function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.once("error", reject);
  });
}

export async function startFakeFacilitator() {
  const calls = { settle: 0, supported: 0, verify: 0 };
  const server = createHttpServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/supported") {
      calls.supported += 1;
      return send(200, {
        kinds: [{ network: NETWORK, scheme: "exact", x402Version: 2 }],
        extensions: [],
        signers: {},
      });
    }
    if (req.method === "POST" && req.url === "/verify") {
      calls.verify += 1;
      return send(200, { isValid: true, payer: PAYER });
    }
    if (req.method === "POST" && req.url === "/settle") {
      calls.settle += 1;
      return send(200, {
        success: true,
        payer: PAYER,
        transaction: FAKE_SETTLE_TX,
        network: NETWORK,
      });
    }
    return send(404, { error: "unexpected_test_facilitator_request" });
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  return {
    calls,
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

export async function startMerchant({ dataDir, facilitatorUrl, extractBatch = false }) {
  const okHtml = await readFile(path.join(OWNED, "fixtures/public-ok.html"), "utf8");
  const deniedHtml = await readFile(path.join(OWNED, "fixtures/public-403.html"), "utf8");
  const longHtml = `<html><head><title>Long</title></head><body><p>${"x".repeat(2000)}</p></body></html>`;
  const preloadPath = path.join(dataDir, "extract-fetch-hook.mjs");
  await writeFile(preloadPath, `
globalThis.__SAMEDAYDESK_EXTRACT_TIMEOUT_MS__ = 50;
globalThis.__SAMEDAYDESK_EXTRACT_FETCH__ = async (input, init) => {
  const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
  const pages = {
    "https://ok.example/": { status: 200, url: "https://ok.example/", body: ${JSON.stringify(okHtml)} },
    "https://403.example/": { status: 403, url: "https://403.example/", body: ${JSON.stringify(deniedHtml)} },
    "https://long.example/": { status: 200, url: "https://long.example/", body: ${JSON.stringify(longHtml)} },
    "https://gzip.example/": { status: 200, url: "https://gzip.example/", body: "ignored", encoding: "gzip" },
    "https://slow.example/": { hang: true },
  };
  const page = pages[url];
  if (!page) {
    throw Object.assign(new Error("unmapped extract fixture"), { code: "fetch_error" });
  }
  if (page.hang) {
    return new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
      }, { once: true });
    });
  }
  const bytes = new TextEncoder().encode(page.body || "");
  let delivered = false;
  return {
    status: page.status,
    url: page.url,
    headers: {
      get(name) {
        const key = name.toLowerCase();
        if (key === "content-encoding") return page.encoding || "identity";
        if (key === "content-type") return "text/html; charset=utf-8";
        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (delivered) return { done: true };
            delivered = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
  };
};
`, "utf8");

  const port = await unusedPort();
  const existingNodeOptions = String(process.env.NODE_OPTIONS || "").trim();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: MERCHANT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      COMMERCE_DATA_DIR: dataDir,
      COMMERCE_RECONCILIATION_INTERVAL_MS: "86400000",
      FACILITATOR: "xpay",
      FACILITATOR_URL: facilitatorUrl,
      MPP_SECRET_KEY: "",
      EXTRACT_BATCH_ENABLED: extractBatch ? "1" : "0",
      PUBLIC_URL: "https://agents.samedaydesk.com",
      NODE_OPTIONS: [existingNodeOptions, `--import=${pathToFileURL(preloadPath).href}`].filter(Boolean).join(" "),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`startup timed out: ${output.slice(-2000)}`)), 20_000);
    const onData = (chunk) => {
      output = `${output}${chunk}`.slice(-40_000);
      if (!output.includes(`x402-merchant listening on :${port}`)) return;
      clearTimeout(timer);
      resolve();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`startup exited before listening: code=${code} signal=${signal}\n${output.slice(-4000)}`));
    });
    child.once("error", reject);
  });
  return { base: `http://127.0.0.1:${port}`, child, output: () => output, port };
}

export async function stopChild(child) {
  if (!child) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000).unref();
  });
}

export function decodePaymentRequired(response) {
  const encoded = response.headers.get("payment-required");
  if (!encoded) throw new Error("extract challenge omitted payment-required");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

export function testPayment(challenge) {
  const accepted = challenge.accepts.find((entry) => entry.network === NETWORK && entry.scheme === "exact");
  if (!accepted) throw new Error("extract challenge omitted Base exact payment terms");
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  const paymentId = `d17_http_${randomBytes(8).toString("hex")}`;
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted,
    payload: {
      signature: `0x${"4".repeat(130)}`,
      authorization: {
        from: PAYER,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce,
      },
    },
    extensions: {
      "payment-identifier": {
        info: { required: challenge.extensions?.["payment-identifier"]?.info?.required === true, id: paymentId },
      },
    },
  })).toString("base64");
}

export async function paidGet(base, route, target) {
  const unpaid = await fetch(`${base}${route}?url=${encodeURIComponent(target)}`);
  if (unpaid.status !== 402) {
    throw new Error(`expected 402, got ${unpaid.status}`);
  }
  const challenge = decodePaymentRequired(unpaid);
  const accepted = challenge.accepts.find((entry) => entry.network === NETWORK && entry.scheme === "exact");
  const paid = await fetch(`${base}${route}?url=${encodeURIComponent(target)}`, {
    headers: { "payment-signature": testPayment(challenge) },
  });
  const bytes = Buffer.from(await paid.arrayBuffer());
  let body = null;
  try {
    body = JSON.parse(bytes.toString("utf8"));
  } catch {
    body = null;
  }
  return { paid, bytes, body, challenge, accepted };
}

export async function waitForPaidEvidence(dataDir, minCount) {
  const file = path.join(dataDir, PAID_EVIDENCE_FILENAME);
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    const text = await readFile(file, "utf8").catch((error) => (
      error?.code === "ENOENT" ? "" : Promise.reject(error)
    ));
    const rows = text.split("\n").filter(Boolean);
    if (rows.length >= minCount) return rows.map((line) => JSON.parse(line));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${minCount} paid-success evidence rows`);
}

export function validExtractBody(overrides = {}) {
  return {
    ok: true,
    requestedUrl: "https://ok.example/",
    finalUrl: "https://ok.example/",
    url: "https://ok.example/",
    status: 200,
    sourceOk: true,
    error: null,
    contentType: "text/html; charset=utf-8",
    title: "Example Domain",
    description: "Public example page used as a controlled extract fixture.",
    canonical: "https://example.com/",
    lang: "en",
    openGraph: {},
    twitter: {},
    jsonLd: [],
    headings: { h1: ["Example Domain"], h2: [] },
    links: [],
    text: "Example Domain This domain is for use in documentation examples without private customer content.",
    aiReadiness: {
      hasJsonLd: false,
      hasOpenGraph: false,
      hasTitle: true,
      hasDescription: true,
      hasCanonical: true,
      schemaTypes: [],
    },
    capture: {
      method: "http-get-no-javascript",
      javascriptExecuted: false,
      maxBodyBytes: 3_000_000,
      textExcerptLimitChars: 1200,
      markdownLimitChars: null,
      bodyBytes: 128,
      bodyTruncated: false,
      textTruncated: false,
      charset: "utf-8",
      charsetSource: "content-type",
    },
    fetchedAt: "2026-09-11T00:00:00.000Z",
    ...overrides,
  };
}

export function historicalV1Row(overrides = {}) {
  return {
    v: 1,
    id: "11111111-1111-4111-8111-111111111111",
    requestStartedAt: "2026-09-11T12:00:00.000Z",
    responseFinishedAt: "2026-09-11T12:00:01.000Z",
    method: "GET",
    route: "/extract",
    originClass: "external",
    source: "direct-or-unattributed",
    payerClass: "unclassified",
    requestDigest: "a".repeat(64),
    credentialFingerprint: "b".repeat(64),
    responseDigest: "c".repeat(64),
    settlementReference: `0x${"d".repeat(64)}`,
    paymentProtocol: "x402",
    runtimeAttribution: "http",
    validatorVerdict: "not_checked",
    validatorAuthority: "none",
    validatorSource: "http_runtime_not_checked",
    ...overrides,
  };
}
