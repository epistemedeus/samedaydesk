// One-shot reader for one allowlisted daily discovery file.
// No public route, no listing, no resident process. app.js remains the only writer.
// Authorization is an enrolled file path (mode 0600, at least 32 bytes). The value is never printed.
// Emitted lines keep journeyDigest and drop every raw token.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_BYTES, MAX_LINES, assertEnrolledAuthFile, projectRecord, resolveDailyFile } from "./bounds.mjs";

export function exportDiscoveryLog({ dir, date, authFile }) {
  assertEnrolledAuthFile(authFile);
  const located = resolveDailyFile(dir, date);
  if (located.size > MAX_BYTES) throw new Error("discovery_export_unbounded");
  const text = fs.readFileSync(located.file);
  if (text.length > MAX_BYTES) throw new Error("discovery_export_unbounded");
  const raw = text.toString("utf8");
  const lines = raw.length === 0 ? [] : raw.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length > MAX_LINES) throw new Error("discovery_export_unbounded");
  const projected = [];
  for (const line of lines) {
    if (!line) throw new Error("discovery_export_record_refused");
    let record;
    try { record = JSON.parse(line); } catch { throw new Error("discovery_export_record_refused"); }
    projected.push(projectRecord(record, date, line));
  }
  return projected.length ? `${projected.join("\n")}\n` : "";
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
    const known = ["--dir", "--date", "--auth-file"];
    if (Object.keys(args).length !== known.length || known.some(key => !Object.hasOwn(args, key))) throw new Error("discovery_export_unauthenticated");
    process.stdout.write(exportDiscoveryLog({ dir: args["--dir"], date: args["--date"], authFile: args["--auth-file"] }));
  } catch (error) {
    const code = /^discovery_export_/.test(error?.message || "") ? error.message : "discovery_export_refused";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
