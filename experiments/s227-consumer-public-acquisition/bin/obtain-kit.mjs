#!/usr/bin/env node
/**
 * Copy or download the public consumer-repeat archive, verify bytes+sha256,
 * then optionally extract. On mismatch or bad status: no extract, no CLI run.
 * No repository dependencies.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (!n || n.startsWith("--")) out[k] = true;
      else {
        out[k] = n;
        i++;
      }
    }
  }
  return out;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function fail(code, message, extra = {}) {
  const body = {
    ok: false,
    refused: true,
    code,
    message,
    extracted: false,
    executed: false,
    ...extra,
  };
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exit(0);
}

function ok(payload) {
  process.stdout.write(
    `${JSON.stringify({ ok: true, extracted: Boolean(payload.extractDir), executed: false, ...payload }, null, 2)}\n`,
  );
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
      const buf = readFileSync(src);
      return resolveP({ status: 200, buf, via: "file" });
    }
    const lib = from.startsWith("https:") ? https : http;
    const req = lib.get(from, { agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolveP({
          status: res.statusCode || 0,
          buf: Buffer.concat(chunks),
          via: "http",
        });
      });
    });
    req.setTimeout(30_000, () => {
      req.destroy(new Error("fetch timeout"));
    });
    req.on("error", reject);
  });
}

const args = parseArgs(process.argv.slice(2));
if (!args.from || !args["expected-sha256"] || !args["expected-bytes"] || !args.dest) {
  fail("missing-args", "require --from --expected-sha256 --expected-bytes --dest");
}

const expectedBytes = Number(args["expected-bytes"]);
const expectedSha = String(args["expected-sha256"]).toLowerCase();
if (!Number.isInteger(expectedBytes) || expectedBytes <= 0) {
  fail("invalid-expected-bytes", "expected-bytes must be a positive integer");
}
if (!/^[0-9a-f]{64}$/.test(expectedSha)) {
  fail("invalid-expected-sha256", "expected-sha256 must be 64 lowercase hex chars");
}

const dest = resolve(args.dest);
const extractDir = args["extract-dir"] ? resolve(args["extract-dir"]) : null;

let fetched;
try {
  fetched = await fetchToBuffer(args.from);
} catch (err) {
  fail(err.code || "fetch-failed", err.message || "fetch failed");
}

if (fetched.status !== 200) {
  fail("bad-status", `HTTP status ${fetched.status} is not 200`, {
    status: fetched.status,
    destExists: existsSync(dest),
    extractDirExists: extractDir ? existsSync(extractDir) : false,
  });
}
if (fetched.buf.length !== expectedBytes) {
  fail("wrong-size", `size ${fetched.buf.length} != expected ${expectedBytes}`, {
    size: fetched.buf.length,
    expectedBytes,
    destExists: existsSync(dest),
    extractDirExists: extractDir ? existsSync(extractDir) : false,
  });
}
const digest = sha256(fetched.buf);
if (digest !== expectedSha) {
  fail("wrong-digest", `sha256 ${digest} != expected ${expectedSha}`, {
    sha256: digest,
    expectedSha,
    destExists: existsSync(dest),
    extractDirExists: extractDir ? existsSync(extractDir) : false,
  });
}

await mkdir(dirname(dest), { recursive: true });
const tmp = `${dest}.partial`;
writeFileSync(tmp, fetched.buf);
renameSync(tmp, dest);

if (extractDir) {
  await mkdir(extractDir, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", dest, "-C", extractDir], { encoding: "utf8" });
  if (tar.status !== 0) {
    fail("extract-failed", tar.stderr || "tar failed", { dest });
  }
}

ok({
  dest,
  bytes: fetched.buf.length,
  sha256: digest,
  extractDir,
});
