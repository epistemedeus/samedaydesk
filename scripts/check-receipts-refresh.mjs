import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { writeReceiptSnapshot } from "../server/lib/receipt-snapshot.js";
import { receiptId } from "../client/src/data/receiptPages.mjs";

const [origin, snapshotPath] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || "") || !snapshotPath) {
  throw new Error("Private receipt refresh requires a loopback preview and an isolated output file");
}
const old = JSON.parse(await readFile(new URL("../client/public/receipts.json", import.meta.url), "utf8"));
const one = old.entries.find((row) => row.kind === "delivered");
assert.ok(one);
const row = { ...one, for: "Private preview receipt", proof: "https://example.test/preview-receipt", date: "2099-01-01" };
const path = `/receipts/${receiptId(row)}`;
const get = (pathname) => fetch(origin + pathname, { cache: "no-store", signal: AbortSignal.timeout(5000) });
assert.equal((await get(path)).status, 404);
const next = {
  ...old, chainReadThroughBlock: old.chainReadThroughBlock + 1,
  entries: [row, ...old.entries], count: old.count + 1,
  classes: { ...old.classes, delivered: old.classes.delivered + 1 },
};
const bytes = JSON.stringify(next);
await writeReceiptSnapshot(snapshotPath, bytes);
const feed = await get("/receipts.json");
assert.equal(feed.status, 200);
assert.equal(await feed.text(), bytes);
const detail = await get(path);
assert.equal(detail.status, 200);
assert.match(await detail.text(), /<h1>Private preview receipt<\/h1>/);
assert.equal((await get("/receipts/nonexistent")).status, 404);
await assert.rejects(writeReceiptSnapshot(snapshotPath, JSON.stringify(old)), /newer receipt snapshot/);
await writeFile(snapshotPath, "invalid private fixture");
assert.equal(await (await get("/receipts.json")).text(), bytes);
console.log("RECEIPT_REFRESH_OK private scheduled write, same server readback, new shell, stale and invalid refused");
