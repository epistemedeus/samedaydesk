/**
 * Test-only publication hold, loaded into the owned wrapper child via --import.
 * Slows or truncates named writes so the parent can interrupt around publication.
 * Does not amend F08 source.
 */
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";

const origWriteFileSync = fs.writeFileSync;

function holdNames() {
  return new Set(
    String(process.env.JOA_HOLD_NAMES || "receipt.json")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function sleep(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

function notify(name) {
  const path = process.env.JOA_PUBLISH_NOTIFY;
  if (!path) return;
  try {
    origWriteFileSync.call(fs, path, `${name}\n`);
  } catch {
    // parent may already be killing us
  }
}

function toBuffer(data, options) {
  if (Buffer.isBuffer(data)) return data;
  const encoding =
    typeof options === "string" ? options : options && options.encoding ? options.encoding : "utf8";
  return Buffer.from(String(data), encoding);
}

fs.writeFileSync = function writeFileSyncHeld(file, data, options) {
  const name = basename(String(file));
  if (holdNames().has(name)) {
    notify(name);
    if (process.env.JOA_HOLD_BEFORE === "1") {
      sleep(process.env.JOA_HOLD_MS || 20_000);
    }
    if (process.env.JOA_PARTIAL === "1") {
      const buf = toBuffer(data, options);
      const slice = buf.subarray(0, Math.min(48, buf.length));
      origWriteFileSync.call(fs, file, slice);
      sleep(process.env.JOA_HOLD_MS || 20_000);
      return;
    }
    if (process.env.JOA_HOLD_BEFORE !== "1") {
      sleep(Number(process.env.JOA_HOLD_MS || 0));
    }
  }
  return origWriteFileSync.call(fs, file, data, options);
};

syncBuiltinESMExports();
