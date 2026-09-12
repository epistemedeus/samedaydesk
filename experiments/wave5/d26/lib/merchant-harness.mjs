import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MERCHANT_ROOT,
  ERROR_CODES,
  LIVE_LOCKFILE_PATH,
  MERCHANT_SHA,
} from "./pins.mjs";
import { throwRefuse } from "./refuse.mjs";

export const PAYER = `0x${"2".repeat(40)}`;
export const PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const NETWORK = "eip155:8453";
const MPP_SECRET = "test-secret-key-test-secret-key-32";

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

export async function startFakeFacilitator({ settleSuccess = true, verifyValid = true } = {}) {
  const calls = { settle: 0, supported: 0, verify: 0 };
  const server = createHttpServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/supported") {
      calls.supported += 1;
      return send(200, { kinds: [{ network: NETWORK, scheme: "exact", x402Version: 2 }], extensions: [], signers: {} });
    }
    if (req.method === "POST" && req.url === "/verify") {
      calls.verify += 1;
      return send(200, {
        isValid: verifyValid,
        invalidReason: verifyValid ? undefined : "invalid_signature",
        payer: PAYER,
      });
    }
    if (req.method === "POST" && req.url === "/settle") {
      calls.settle += 1;
      if (!settleSuccess) {
        return send(200, { success: false, errorReason: "unknown_settlement", transaction: "", network: NETWORK });
      }
      return send(200, {
        success: true,
        payer: PAYER,
        transaction: `0x${"3".repeat(64)}`,
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

export async function startMerchant({
  merchantRoot = DEFAULT_MERCHANT_ROOT,
  facilitatorUrl,
  extraEnv = {},
  enabled = true,
} = {}) {
  const serverJs = join(merchantRoot, "server.js");
  if (!existsSync(serverJs)) {
    throwRefuse(ERROR_CODES.MERCHANT_ROOT_MISSING, `merchant server.js missing at ${merchantRoot}`, {
      merchantRoot,
      expectedSha: MERCHANT_SHA,
    });
  }
  const dataDir = await mkdtemp(join(tmpdir(), "d26-merchant-"));
  const port = await unusedPort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: merchantRoot,
    env: {
      ...process.env,
      PORT: String(port),
      COMMERCE_DATA_DIR: dataDir,
      COMMERCE_RECONCILIATION_INTERVAL_MS: "86400000",
      FACILITATOR: "xpay",
      FACILITATOR_URL: facilitatorUrl,
      MPP_SECRET_KEY: MPP_SECRET,
      IDEMPOTENCY_INFLIGHT_WAIT_MS: "50",
      LOCKFILE_PIN_DELTA_ENABLED: enabled ? "1" : "0",
      EXTRACT_BATCH_ENABLED: "0",
      PUBLIC_URL: "https://agents.samedaydesk.com",
      PAY_TO,
      NETWORK,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`startup timed out: ${output.slice(-2000)}`)), 25_000);
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
  return {
    base: `http://127.0.0.1:${port}`,
    child,
    pid: child.pid,
    dataDir,
    output: () => output,
    merchantRoot,
  };
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
  if (!encoded) return null;
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

export function testPayment(challenge, { id = "d26_lockfile_00000001" } = {}) {
  const accepted = challenge.accepts.find((entry) => entry.network === NETWORK && entry.scheme === "exact");
  if (!accepted) throw new Error("challenge omitted Base exact payment terms");
  const nonce = `0x${Buffer.from(id).toString("hex").padEnd(64, "0").slice(0, 64)}`;
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    resource: challenge.resource,
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
        info: { required: challenge.extensions?.["payment-identifier"]?.info?.required === true, id },
      },
    },
  })).toString("base64");
}

export function jsonPost(body, headers = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  };
}

export function classifyHttp(status, charged) {
  if (status === 200 && charged === true) return "successful";
  if (status === 402) return "unpaid-challenge";
  if (status >= 400 && status < 500) return "refused";
  if (status >= 500) return "failed";
  return "unknown";
}

let paymentSeq = 0;
export function nextPaymentId(prefix = "d26") {
  paymentSeq += 1;
  return `${prefix}_${String(paymentSeq).padStart(18, "0")}`.slice(0, 24);
}

export { LIVE_LOCKFILE_PATH };
