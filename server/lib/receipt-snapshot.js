import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { receiptId, receiptShell } from "../../client/src/data/receiptPages.mjs";
import { applyRouteShell, SITE_ORIGIN } from "./spa-route-shells.js";

export function qualifiedReceiptSnapshot(bytes) {
  const data = JSON.parse(bytes);
  if (data.schema !== "samedaydesk.receipts.v2" || !Number.isSafeInteger(data.chainReadThroughBlock) ||
      !Number.isFinite(Date.parse(data.generatedAt)) || data.floor !== 12 || !Array.isArray(data.entries) ||
      data.entries.length !== data.count || data.count < data.floor || data.count > 10_000) {
    throw new Error("Invalid receipt snapshot");
  }
  const indexed = new Map();
  for (const row of data.entries) {
    if (!row || !["settlement", "delivered"].includes(row.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        !/^https:\/\//.test(row.proof) || typeof row.for !== "string" || typeof row.delivered !== "string") {
      throw new Error("Invalid receipt row");
    }
    if (row.kind === "settlement" && (!/^0x[0-9a-f]{64}$/.test(row.chain?.transactionHash || "") ||
        row.proof !== `https://basescan.org/tx/${row.chain.transactionHash}` ||
        row.chain.network !== "eip155:8453" || row.chain.status !== "success" ||
        !/^0x[0-9a-f]{40}$/.test(row.payer?.address || "") || !["independent", "unresolved"].includes(row.payer.class))) {
      throw new Error("Invalid paid-call receipt");
    }
    const key = receiptId(row);
    if (indexed.has(key)) throw new Error("Duplicate receipt address");
    indexed.set(key, row);
  }
  const settled = data.entries.filter((entry) => entry.kind === "settlement");
  const independent = settled.filter((entry) => entry.payer.class === "independent").length;
  if (data.classes?.paidCalls !== settled.length || data.classes?.delivered !== data.count - settled.length ||
      data.classes?.distinctWallets !== new Set(settled.map((r) => r.payer.address)).size ||
      data.classes?.independent !== independent || data.classes?.unresolved !== settled.length - independent) {
    throw new Error("Receipt counters disagree with the snapshot");
  }
  return { data, indexed, bytes };
}

export function mountReceiptSnapshot(app, clientDist, snapshotPath = process.env.SDS_RECEIPTS_SNAPSHOT_PATH) {
  if (!snapshotPath) return;
  if (!isAbsolute(snapshotPath)) throw new Error("SDS_RECEIPTS_SNAPSHOT_PATH must be absolute");
  let previous, version, lastReported;
  async function current() {
    try {
      const found = await stat(snapshotPath);
      const key = `${found.ino}:${found.mtimeMs}:${found.size}`;
      if (version === key) return previous;
      if (!found.isFile() || found.size > 12 * 1024 * 1024) throw new Error("Receipt snapshot is not a bounded file");
      const candidate = qualifiedReceiptSnapshot(await readFile(snapshotPath, "utf8"));
      if (previous && candidate.data.chainReadThroughBlock < previous.data.chainReadThroughBlock) return previous;
      previous = candidate;
      version = key;
      lastReported = undefined;
    } catch (error) {
      if (lastReported !== error.message) {
        console.error("[receipts] retained snapshot unavailable or invalid", error.code || error.name);
        lastReported = error.message;
      }
    }
    return previous;
  }
  app.get("/receipts.json", async (_req, res, next) => {
    const snapshot = await current();
    if (!snapshot) return next();
    res.set("Cache-Control", "public, max-age=60").type("application/json").send(snapshot.bytes);
  });
  app.get("/receipts/:id", async (req, res, next) => {
    const snapshot = await current();
    if (!snapshot) return next();
    const row = snapshot.indexed.get(req.params.id);
    if (!row) return res.status(404).type("text/plain").send("Receipt not found");
    const shell = receiptShell(row);
    const indexHtml = await readFile(join(clientDist, "index.html"), "utf8");
    res.set("Cache-Control", "public, max-age=60").type("html").send(
      applyRouteShell(indexHtml, { ...shell, canonical: `${SITE_ORIGIN}${shell.path}` }),
    );
  });
}

export async function writeReceiptSnapshot(snapshotPath, bytes) {
  if (!isAbsolute(snapshotPath)) throw new Error("SDS_RECEIPTS_SNAPSHOT_PATH must be absolute");
  const next = qualifiedReceiptSnapshot(bytes);
  const current = await readFile(snapshotPath, "utf8").catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (current && qualifiedReceiptSnapshot(current).data.chainReadThroughBlock > next.data.chainReadThroughBlock) {
    throw new Error("Refusing to replace a newer receipt snapshot");
  }
  const temporary = `${snapshotPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
  try { await rename(temporary, snapshotPath); }
  finally { await unlink(temporary).catch(() => {}); }
}
