import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { writeSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BODY_LIMIT = 262_144;

function emptyState() {
  return { schema: "sds.receive-time-recipient.v1", rows: [] };
}

async function readState(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!parsed || !Array.isArray(parsed.rows)) return emptyState();
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function atomicWrite(file, state) {
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  const handle = await open(tmp, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > BODY_LIMIT) {
        const error = new Error("body_limit");
        error.code = "body_limit";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function deliveryIdFor(report) {
  return createHash("sha256")
    .update(`${report.operationId}\n${report.outcome}\n${report.failureCode || ""}\n`)
    .digest("hex");
}

export function reportDigestFor(report) {
  return createHash("sha256").update(JSON.stringify({
    operationId: report.operationId,
    at: report.at,
    outcome: report.outcome,
    failureCode: report.failureCode ?? null,
    usefulChange: report.usefulChange === true,
    sourceCalls: report.sourceCalls ?? null,
  })).digest("hex");
}

export async function startRecipient({ directory } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "deliveries.json");
  let chain = Promise.resolve();
  const enqueue = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  };
  const server = http.createServer(async (req, res) => {
    req.on("error", () => {});
    res.on("error", () => {});
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/v1/worksheet") {
        send(res, 200, await readState(file));
        return;
      }
      const one = /^\/v1\/deliveries\/([a-f0-9]{64})$/.exec(url.pathname);
      if (req.method === "GET" && one) {
        const state = await readState(file);
        const row = state.rows.find((item) => item.deliveryId === one[1]);
        if (!row) {
          send(res, 404, { error: { code: "not_found" } });
          return;
        }
        send(res, 200, {
          ...row,
          adoptedFrom: row.responseDropped ? "readback" : "stored",
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/deliveries") {
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          send(res, 422, { error: { code: "malformed" } });
          return;
        }
        const report = body?.report;
        if (!report || typeof report.operationId !== "string" || typeof report.outcome !== "string") {
          send(res, 422, { error: { code: "malformed" } });
          return;
        }
        const deliveryId = deliveryIdFor(report);
        const reportDigest = reportDigestFor(report);
        if (body.deliveryId !== deliveryId || body.reportDigest !== reportDigest) {
          send(res, 422, { error: { code: "identity_mismatch" } });
          return;
        }
        const drop = url.searchParams.get("drop") === "1";
        const decision = await enqueue(async () => {
          const state = await readState(file);
          const existing = state.rows.find((item) => item.deliveryId === deliveryId);
          if (existing) {
            if (existing.reportDigest !== reportDigest) {
              return { mismatch: true, existing };
            }
            existing.duplicateCount += 1;
            await atomicWrite(file, state);
            return { duplicate: true, existing };
          }
          const row = {
            deliveryId,
            reportDigest,
            operationId: report.operationId,
            taskId: body.taskId || null,
            outcome: report.outcome,
            failureCode: report.failureCode ?? null,
            usefulChange: report.usefulChange === true,
            at: report.at,
            sourceCalls: report.sourceCalls ?? null,
            responseDropped: drop,
            httpAcknowledged: !drop,
            usefulAcceptance: report.usefulChange === true ? "accepted" : "recorded",
            duplicateCount: 0,
            committedAt: new Date().toISOString(),
          };
          state.rows.push(row);
          await atomicWrite(file, state);
          return { duplicate: false, existing: row };
        });
        if (decision.mismatch) {
          send(res, 409, { error: { code: "digest_mismatch" }, deliveryId });
          return;
        }
        if (drop && !decision.duplicate) {
          res.destroy();
          return;
        }
        send(res, 200, {
          deliveryId,
          reportDigest,
          duplicate: Boolean(decision.duplicate),
          httpAcknowledged: true,
          usefulAcceptance: decision.existing.usefulAcceptance,
          responseDropped: decision.existing.responseDropped === true,
          duplicateCount: decision.existing.duplicateCount,
        });
        return;
      }
      send(res, 404, { error: { code: "not_found" } });
    } catch (error) {
      if (error?.code === "body_limit") return;
      if (!res.headersSent) send(res, 500, { error: { code: "recipient_failed" } });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    file,
    async close() {
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const directory = process.env.RECIPIENT_DIR;
  if (!directory) {
    process.stderr.write("RECIPIENT_DIR is required\n");
    process.exit(1);
  }
  const recipient = await startRecipient({ directory });
  writeSync(1, `READY ${recipient.port}\n`);
  const shutdown = () => {
    recipient.close().then(() => process.exit(0), () => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
