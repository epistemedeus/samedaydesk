// Delete only allowlisted daily discovery files older than an explicit retain-days value.
// There is no timer. The hosted route runs this once, after the caller says the records
// were received, and only for 30 days. The local file check below is a precondition for
// the host command, not export authentication.
// Fixture runs are not hosted retention proof.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FILE_RE, absolutePrivatePath, assertEnrolledAuthFile, hashFileRange, shiftDate, validDate } from "./bounds.mjs";

export const RECEIPT_SCHEMA = "samedaydesk.discovery-log.export-receipt.v1";

export function serverToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** A deletion grant is a completed export receipt. Partial receipts are refused before any unlink. */
export function assertExportReceipts(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0 || receipts.length > 400) throw new Error("discovery_retain_receipt_required");
  const dates = new Set();
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("discovery_retain_receipt_required");
    for (const key of Object.keys(receipt)) {
      if (!["schema", "date", "complete", "watermark", "bytes"].includes(key)) throw new Error("discovery_export_dir_refused");
    }
    if (receipt.schema !== RECEIPT_SCHEMA || !validDate(receipt.date) || dates.has(receipt.date)) throw new Error("discovery_retain_receipt_required");
    if (receipt.complete !== true) throw new Error("discovery_retain_partial");
    if (typeof receipt.watermark !== "string" || !/^[0-9a-f]{64}$/.test(receipt.watermark)) throw new Error("discovery_retain_receipt_required");
    if (!Number.isInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > Number.MAX_SAFE_INTEGER) throw new Error("discovery_retain_receipt_required");
    dates.add(receipt.date);
  }
  return receipts;
}

export function retainDiscoveryLogs({ dir, retainDays, asOf, authFile, preauthorized = false, receipts, now = new Date() }) {
  if (preauthorized) {
    if (authFile) throw new Error("discovery_export_unauthenticated");
  } else {
    assertEnrolledAuthFile(authFile);
  }
  if (!absolutePrivatePath(dir)) throw new Error("discovery_export_traversal");
  if (!Number.isInteger(retainDays) || retainDays < 1 || retainDays > 3650) throw new Error("discovery_retain_days_required");
  const today = serverToday(now);
  const day = asOf === undefined || asOf === null || asOf === "" ? today : asOf;
  if (typeof day === "string" && validDate(day) && day > today) throw new Error("discovery_retain_asof_refused");
  if (!validDate(day)) throw new Error("discovery_retain_days_required");
  const checked = assertExportReceipts(receipts);
  let dirStat;
  try { dirStat = fs.lstatSync(dir); } catch { throw new Error("discovery_prepare_parent_missing"); }
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory() || (dirStat.mode & 0o777) !== 0o700) throw new Error("discovery_prepare_mode_refused");
  const root = fs.realpathSync(dir);
  const oldestKept = shiftDate(day, -retainDays);
  const byDate = new Map(checked.map(receipt => [receipt.date, receipt]));
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    const match = FILE_RE.exec(name);
    if (!match || !validDate(match[1]) || match[1] >= oldestKept || match[1] >= today) continue;
    const receipt = byDate.get(match[1]);
    if (!receipt) continue;
    const file = path.join(root, name);
    const fileStat = fs.lstatSync(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error("discovery_export_traversal");
    const resolved = fs.realpathSync(file);
    if (path.dirname(resolved) !== root || path.basename(resolved) !== name) throw new Error("discovery_export_traversal");
    if (fileStat.size !== receipt.bytes) continue;
    const marked = hashFileRange(resolved, fileStat.size);
    if (marked.watermark !== receipt.watermark || marked.bytes !== receipt.bytes) continue;
    fs.unlinkSync(resolved);
    removed += 1;
  }
  return { ok: true, schema: "samedaydesk.discovery-log.retain.v1", retainDays, removed };
}

function flags(argv) {
  const out = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z-]{1,32}$/.test(key || "") || value === undefined || value.startsWith("--") || Object.hasOwn(out, key)) {
      throw new Error("discovery_export_unauthenticated");
    }
    out[key] = value;
  }
  return out;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = flags(process.argv);
    const known = ["--dir", "--retain-days", "--auth-file", "--receipt-file"];
    if (args["--as-of"]) known.push("--as-of");
    if (Object.keys(args).some(key => !known.includes(key)) || known.filter(key => key !== "--as-of").some(key => !Object.hasOwn(args, key))) {
      throw new Error("discovery_export_unauthenticated");
    }
    const retainDays = /^[0-9]{1,4}$/.test(args["--retain-days"]) ? Number(args["--retain-days"]) : Number.NaN;
    const asOf = args["--as-of"] || serverToday();
    let receipts;
    try { receipts = JSON.parse(fs.readFileSync(args["--receipt-file"], "utf8")); } catch { throw new Error("discovery_retain_receipt_required"); }
    const receipt = retainDiscoveryLogs({ dir: args["--dir"], retainDays, asOf, authFile: args["--auth-file"], receipts });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    const code = /^discovery_(export|retain|prepare)_/.test(error?.message || "") ? error.message : "discovery_retain_refused";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
