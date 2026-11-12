// SCHEMA.md 10.3: capability-compat install-and-use test.
// The tgz is not committed. Point SAMEDAYDESK_CLI_COMPAT_TGZ at it (absolute path).
// Without it every test here skips with the reason. With it, the pin, tamper
// refusal and schema checks run dependency-free. The install and the
// describeCapabilities calls also need SAMEDAYDESK_CLI_COMPAT_INSTALL=1 (a VM or
// disposable host: npm installs the pack's two @modelcontextprotocol deps into a
// temp dir). SAMEDAYDESK_CLI_COMPAT_ENDPOINT (a loopback /mcp/page-change URL)
// adds the useful-preview, env-change, wrong-tool and source-change assertions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PackRefused, sha256, tgzMembers, verifyPackArchive } from "./pack-archive.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = JSON.parse(readFileSync(join(root, "vendor/packs/PACKS.json"), "utf8")).packs.find(item => item.name === "samedaydesk-capability-compat");
const tgz = process.env.SAMEDAYDESK_CLI_COMPAT_TGZ;
const noTgz = !tgz ? "SAMEDAYDESK_CLI_COMPAT_TGZ not set (the tgz is not committed)"
  : !isAbsolute(tgz) || !existsSync(tgz) ? `SAMEDAYDESK_CLI_COMPAT_TGZ is not an existing absolute path: ${tgz}` : false;
const noInstall = noTgz || (process.env.SAMEDAYDESK_CLI_COMPAT_INSTALL === "1" ? false : "SAMEDAYDESK_CLI_COMPAT_INSTALL=1 not set (install runs on a VM or disposable host only)");
const endpoint = process.env.SAMEDAYDESK_CLI_COMPAT_ENDPOINT;
const noEndpoint = noInstall || (endpoint && /^http:\/\/127\.0\.0\.1:\d+\/mcp\/page-change$/.test(endpoint) ? false : "SAMEDAYDESK_CLI_COMPAT_ENDPOINT not set to a loopback http://127.0.0.1:PORT/mcp/page-change");
const schemaMember = `package/${entry.schemas[0].path}`;
const NOW = new Date("2026-11-12T12:00:00.000Z");

test("capability-compat tgz matches the PACKS.json pin and its schema hash", { skip: noTgz }, () => {
  const bytes = readFileSync(tgz);
  const verified = verifyPackArchive(entry, bytes);
  assert.equal(verified.sha256, "66158687088ae9347a61b2b97ace25267d65e2d673d1827bf768896bc7f61f41");
  const members = tgzMembers(bytes);
  const pkg = JSON.parse(members.get("package/package.json"));
  assert.deepEqual([pkg.name, pkg.version], [entry.name, entry.version]);
  assert.equal(pkg.exports["./schema/preview.v1"], `./${entry.schemas[0].path}`);
  assert.equal(sha256(members.get(schemaMember)), entry.schemas[0].sha256);
  assert.equal(JSON.parse(members.get("package/PIN.json")).package, entry.name);
});

test("a tampered capability-compat tgz is refused before install", { skip: noTgz }, () => {
  const bytes = Buffer.from(readFileSync(tgz));
  bytes[bytes.length >> 1] ^= 0x01; // one byte flip
  assert.throws(() => verifyPackArchive(entry, bytes), error => error instanceof PackRefused && error.code === "pack_sha_mismatch" && error.evidence.expected === entry.sha256 && error.evidence.actual !== entry.sha256);
  assert.throws(() => verifyPackArchive({ ...entry, sha256: null }, readFileSync(tgz)), error => error.code === "pack_unpinned");
  // A tampered file at the pinned path is refused the same way.
  const dir = mkdtempSync(join(tmpdir(), "samedaydesk-compat-tamper-"));
  try {
    const copy = join(dir, entry.file);
    writeFileSync(copy, bytes);
    assert.throws(() => verifyPackArchive(entry, readFileSync(copy)), error => error.code === "pack_sha_mismatch");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("capability-compat installs from the verified tgz and describes capabilities", { skip: noInstall, timeout: 300000 }, async () => {
  const bytes = readFileSync(tgz);
  verifyPackArchive(entry, bytes); // refuse before install
  const work = mkdtempSync(join(tmpdir(), "samedaydesk-compat-install-"));
  try {
    writeFileSync(join(work, "package.json"), `${JSON.stringify({ name: "samedaydesk-compat-consumer", private: true, type: "module", dependencies: { [entry.name]: `file:${tgz}` } }, null, 2)}\n`);
    const npm = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: work, encoding: "utf8", timeout: 240000 });
    assert.equal(npm.status, 0, npm.stderr || npm.stdout);
    const installed = join(work, "node_modules", entry.name);
    const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
    assert.deepEqual([pkg.name, pkg.version], [entry.name, entry.version]);
    assert.equal(sha256(readFileSync(join(installed, entry.schemas[0].path))), entry.schemas[0].sha256);
    const members = tgzMembers(bytes);
    assert.equal(sha256(readFileSync(join(installed, "PIN.json"))), sha256(members.get("package/PIN.json")));
    const pin = JSON.parse(readFileSync(join(installed, "PIN.json"), "utf8"));
    const pack = await import(pathToFileURL(join(installed, pkg.exports["."])).href);
    assert.equal(typeof pack.describeCapabilities, "function");
    assert.equal(pack.ENV_PROTOCOL_KEY, "SAMEDAYDESK_MCP_PROTOCOL");

    // Unreachable loopback: typed failure envelope, no payment, injected clock.
    const port = await new Promise(done => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => done(p)); }); });
    const down = await pack.describeCapabilities({ endpoint: `http://127.0.0.1:${port}/mcp/page-change`, now: () => NOW, env: {} });
    assert.equal(down.schema, "samedaydesk.capability-provider.preview.v1");
    assert.equal(down.ok, false);
    assert.equal(down.error.code, "endpoint_unreachable");
    assert.equal(down.observedAt, NOW.toISOString());
    assert.equal(down.paymentSignature, null);
    assert.equal(pack.exitCodeForEnvelope(down), 2);

    if (noEndpoint) { process.stdout.write(`# capability-compat live-loopback assertions skipped: ${noEndpoint}\n`); return; }
    // 1. Useful preview.
    const useful = await pack.describeCapabilities({ endpoint, now: () => NOW, env: {} });
    assert.equal(useful.ok, true, JSON.stringify(useful.error ?? null));
    assert.equal(useful.observedAt, NOW.toISOString());
    assert.equal(useful.capabilities[0].tool, "compare_page_observations");
    assert.equal(useful.capabilities[0].charged, false);
    assert.notEqual(useful.preview.verdict, null);
    assert.equal(useful.paymentSignature, null);
    // 2. Env change: refused pin is recovered to 2025-11-25.
    const pinned = await pack.describeCapabilities({ endpoint, now: () => NOW, env: { SAMEDAYDESK_MCP_PROTOCOL: "2026-07-28" } });
    const refused = pinned.changes.find(change => change.kind === "protocol_refused");
    assert.equal(refused?.recovered, true);
    assert.equal(refused.recovery.protocol, "2025-11-25");
    assert.notEqual(pinned.preview.verdict, null);
    // 3. Wrong tool: recovered through tools/list.
    const unknown = useful.changes.find(change => change.kind === "unknown_tool");
    assert.equal(unknown?.recovered, true);
    assert.equal(unknown.recovery.nextMethod, "tools/list");
    // 4. Source change: re-pin, preview still returned.
    const stale = await pack.describeCapabilities({ endpoint, now: () => NOW, env: {}, expectedSource: { repo: pin.sourcePins.merchant.repo, sha: "0".repeat(40) } });
    assert.equal(stale.source.changed, true);
    const moved = stale.changes.find(change => change.kind === "source_version_changed");
    assert.deepEqual([moved?.recovered, moved?.recovery.action], [false, "re_pin"]);
    assert.notEqual(stale.preview.verdict, null);
  } finally { rmSync(work, { recursive: true, force: true }); }
});
