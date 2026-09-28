#!/usr/bin/env node
/**
 * Copy or download a pinned useful-jobs archive, verify bytes+sha256, optionally extract.
 * On mismatch: no extract, no CLI run. No SDK.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPins } from "../lib/paths.mjs";
import { kitSpec } from "../lib/kit.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = true;
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function fail(code, message, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, refused: true, code, message, extracted: false, executed: false, ...extra })}\n`);
  process.exit(2);
}

function fetchToBuffer(from) {
  return new Promise((resolveP, reject) => {
    if (!/^https?:\/\//i.test(from)) {
      const src = from.startsWith("file:") ? new URL(from).pathname : resolve(from);
      if (!existsSync(src)) {
        const err = new Error(`source not found: ${src}`);
        err.code = "source-missing";
        return reject(err);
      }
      return resolveP({ status: 200, buf: readFileSync(src), via: "file", from: src });
    }
    const lib = from.startsWith("https:") ? https : http;
    const req = lib.get(from, { agent: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchToBuffer(res.headers.location).then(resolveP, reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolveP({ status: res.statusCode || 0, buf: Buffer.concat(chunks), via: "http", from }));
    });
    req.setTimeout(30_000, () => req.destroy(new Error("fetch timeout")));
    req.on("error", reject);
  });
}

const args = parseArgs(process.argv.slice(2));
const pins = loadPins();
const version = String(args.version || pins.defaultVersion);
let spec;
try {
  spec = kitSpec(version, pins);
} catch (err) {
  fail("unknown-version", err.message);
}

if (spec.status === "draft-pr-not-deployed" && !args.from && !args["allow-candidate"]) {
  fail("candidate-not-default", "1.4.1 is a draft PR pin. Pass --allow-candidate and a verifying --from, or use 1.4.0.", {
    pr: spec.pr,
    prUrl: spec.prUrl,
    sha256: spec.sha256,
    bytes: spec.bytes,
  });
}

const dest = args.dest ? resolve(args.dest) : null;
if (!dest) fail("missing-args", "require --dest");
const extractDir = args["extract-dir"] ? resolve(args["extract-dir"]) : null;
const sources = [];
if (args.from) sources.push(args.from);
sources.push(...(spec.urls || []));

let fetched = null;
let lastErr = null;
for (const from of sources) {
  try {
    fetched = await fetchToBuffer(from);
    if (fetched.status === 200) break;
    lastErr = `status ${fetched.status} from ${from}`;
    fetched = null;
  } catch (err) {
    lastErr = err.message;
    fetched = null;
  }
}
if (!fetched) fail("fetch-failed", lastErr || "no source");
if (fetched.status !== 200) fail("bad-status", `HTTP status ${fetched.status}`, { status: fetched.status });
if (fetched.buf.length !== spec.bytes) {
  fail("wrong-size", `size ${fetched.buf.length} != expected ${spec.bytes}`, { size: fetched.buf.length, expectedBytes: spec.bytes });
}
const digest = sha256(fetched.buf);
if (digest !== spec.sha256) {
  fail("wrong-sha256", `sha256 ${digest} != expected ${spec.sha256}`, { sha256: digest, expectedSha256: spec.sha256 });
}

await mkdir(dirname(dest), { recursive: true });
writeFileSync(dest, fetched.buf);

let extracted = false;
if (extractDir) {
  await mkdir(extractDir, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", dest, "-C", extractDir], { encoding: "utf8" });
  if (tar.status !== 0) fail("extract-failed", tar.stderr || "tar failed");
  extracted = true;
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    version: spec.version,
    status: spec.status,
    dest,
    bytes: fetched.buf.length,
    sha256: digest,
    from: fetched.from,
    via: fetched.via,
    extracted,
    extractDir,
    executed: false,
    purchaseAuthority: false,
  })}\n`,
);
