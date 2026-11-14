#!/usr/bin/env node
/**
 * Re-pin or verify the vendored sources listed in vendor/PINS.json.
 *
 *   node scripts/vendor-sync.mjs --check   verify every vendored file against its sha256 (no network)
 *   node scripts/vendor-sync.mjs --sync    refetch every source at its pinned sha with the GitHub CLI
 *                                          (`gh api`), rewrite the vendored bytes and PINS.json hashes
 *
 * To bump a pin: edit the `sha` of a source in vendor/PINS.json, run --sync, then run the tests.
 * Vendored bytes are written exactly as GitHub returns them; nothing is edited.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(root, "vendor");
const pinsPath = join(vendorDir, "PINS.json");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function gh(args) {
  return execFileSync("gh", args, { maxBuffer: 64 * 1024 * 1024 });
}

function listFiles(source) {
  if (Array.isArray(source.files)) return source.files;
  if (!source.path.endsWith("/")) return [source.path];
  const tree = JSON.parse(gh(["api", `repos/${source.repo}/git/trees/${source.sha}?recursive=1`]).toString("utf8"));
  if (tree.truncated) throw new Error(`tree for ${source.repo}@${source.sha} is truncated`);
  return tree.tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(source.path)).map((entry) => entry.path);
}

function destFor(source, repoPath) {
  if (Array.isArray(source.files) || !source.path) return join(source.dest, repoPath);
  if (source.path.endsWith("/")) return join(source.dest, repoPath.slice(source.path.length));
  return source.dest;
}

function check(pins) {
  const failures = [];
  for (const file of pins.files) {
    const actual = sha256(readFileSync(join(vendorDir, file.path)));
    if (actual !== file.sha256) failures.push(`${file.path}: ${actual} != ${file.sha256}`);
  }
  if (failures.length) {
    process.stderr.write(`vendor check failed:\n${failures.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`vendor check ok: ${pins.files.length} files\n`);
}

function sync(pins) {
  const files = [];
  for (const source of pins.sources) {
    const destRoot = join(vendorDir, source.dest);
    if (source.path.endsWith("/") || Array.isArray(source.files)) rmSync(destRoot, { recursive: true, force: true });
    for (const repoPath of listFiles(source)) {
      const bytes = gh(["api", `repos/${source.repo}/contents/${repoPath}?ref=${source.sha}`, "-H", "Accept: application/vnd.github.raw"]);
      const rel = destFor(source, repoPath);
      mkdirSync(dirname(join(vendorDir, rel)), { recursive: true });
      writeFileSync(join(vendorDir, rel), bytes);
      files.push({ path: rel, source: source.name, repo: source.repo, sha: source.sha, repoPath, sha256: sha256(bytes) });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const next = { ...pins, files };
  if (pins.flowassert?.extract) {
    const workflow = JSON.parse(readFileSync(join(vendorDir, pins.flowassert.extract.file), "utf8"));
    const code = workflow.nodes.find((node) => node.name === pins.flowassert.extract.node).parameters.jsCode;
    const from = code.indexOf(pins.flowassert.extract.start);
    const to = code.indexOf(pins.flowassert.extract.end);
    next.flowassert = { ...pins.flowassert, packagedCheckerSha256: sha256(Buffer.from(code.slice(from, to), "utf8")) };
  }
  writeFileSync(pinsPath, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`vendor sync ok: ${files.length} files\n`);
}

const pins = JSON.parse(readFileSync(pinsPath, "utf8"));
if (process.argv.includes("--sync")) sync(pins);
else check(pins);
