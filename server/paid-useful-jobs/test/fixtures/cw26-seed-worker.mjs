import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
const [mailbox, tag, barrier] = process.argv.slice(2);
const original = fs.writeFileSync;
let paused = false;
fs.writeFileSync = function (file, ...args) {
  const result = original.call(this, file, ...args);
  if (barrier && !paused && String(file).includes("/artifacts/")) {
    paused = true; original(barrier + ".paused", "yes");
    while (!fs.existsSync(barrier + ".resume")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  return result;
};
syncBuiltinESMExports();
const { writeEnvelopeFiles } = await import("../../../../tools/result-mailbox/lib/store.mjs");
const { buildEnvelope } = await import("../../../../tools/result-mailbox/lib/envelope.mjs");
const files = ["budget-impact.json", "budget-impact.md"].map((name) => {
  const buf = Buffer.from(tag + name);
  return { name, buf, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
});
const envelope = buildEnvelope({ requestId: "same-slot", jobId: "vendor-budget-impact", completedAt: "2026-09-12T06:20:00Z", expiresAt: "2026-09-12T07:20:00Z", artifacts: files });
try { console.log(JSON.stringify({ ok: true, ...writeEnvelopeFiles({ mailbox, envelope, files }) })); }
catch (error) { console.log(JSON.stringify({ ok: false, code: error.code, error: error.message })); process.exitCode = 2; }
