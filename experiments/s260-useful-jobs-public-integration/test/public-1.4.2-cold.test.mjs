import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const pub = join(repo, "client/public/for-agents/useful-jobs");
const root = mkdtempSync(join(tmpdir(), "useful-jobs-142-http-"));
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
let kit, pin, sequence = 0;
before(async () => {
  pin = read(join(pub, "useful-jobs-1.4.2.sha256.json"));
  const discovery = read(join(repo, "client/public/discovery/useful-jobs.json"));
  assert.equal(discovery.version, "1.4.2");
  const bytes = readFileSync(join(pub, pin.archive));
  assert.equal(bytes.length, pin.bytes); assert.equal(hash(bytes), pin.sha256);
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url !== discovery.archive.path) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "application/gzip", "content-length": bytes.length }); res.end(bytes);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { stdout } = await promisify(execFile)("bash", ["-lc", discovery.coldStart], { cwd: root, env: { ...process.env, TMPDIR: root, USEFUL_JOBS_ORIGIN: "http://127.0.0.1:" + server.address().port }, timeout: 60000 });
    kit = stdout.trim(); assert.ok(kit.startsWith(root + "/"));
    assert.deepEqual(requests, [discovery.archive.path]);
  } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
after(() => rmSync(root, { recursive: true, force: true }));
function run(job, inputs) {
  const out = join(root, "out-" + sequence++);
  const args = [join(kit, "bin/useful-jobs.mjs"), "run", job];
  for (const [key, value] of Object.entries(inputs)) args.push("--" + key, value);
  args.push("--out-dir", out);
  const p = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 30000 });
  return { ...p, body: p.stdout.trim() ? JSON.parse(p.stdout) : null, out };
}
function file(name, data) { const p = join(root, sequence++ + "-" + name); writeFileSync(p, JSON.stringify(data)); return p; }
test("1.4.2 cold archive authenticates every overlay file and old immutable archives", () => {
  for (const [source, expected] of Object.entries(pin.sourceFiles)) {
    const relative = source.startsWith("tools/") ? "engines/" + source.slice(6) : source.replace("server/paid-useful-jobs/release/", "");
    assert.equal(hash(readFileSync(join(kit, relative))), expected, source);
  }
  assert.equal(Object.keys(pin.engineSourceCommits).length, 4);
  for (const prior of pin.immutable) assert.equal(hash(readFileSync(join(pub, prior.archive))), prior.sha256);
});
test("1.4.2 actual CLI detects the independently witnessed Octokit required replacement", () => {
  const before = file("before.json", { $schema: "http://json-schema.org/draft-07/schema", type: "object", required: ["action", "membership", "organization", "sender"] });
  const after = file("after.json", { $schema: "http://json-schema.org/draft-07/schema", type: "object", required: ["action", "changes", "organization", "sender"] });
  const used = file("used.json", { pointers: ["/required"] });
  const r = run("json-schema-webhook-drift", { before, after, used });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(read(join(r.out, "drift-brief.json")).impact.breaking[0].reason, "required-changed");
});
for (const kind of ["devDependencies", "peerDependencies", "optionalDependencies"]) test("1.4.2 cold lockfile install-selection delta: " + kind, () => {
  const fixtures = join(kit, "engines/lockfile-pin-delta/fixtures/generated/npm-install-plans");
  const r = run("lockfile-pin-delta", { before: join(fixtures, "v3-dependencies/package-lock.json"), after: join(fixtures, "v3-" + kind + "/package-lock.json") });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const report = read(join(r.out, "pin-delta.json"));
  assert.equal(report.counts.changed, 1); assert.equal(report.status, "actionable");
});
test("1.4.2 cold Express subset detects a real witness and refuses URL-unsafe literals", () => {
  const fx = join(kit, "engines/route-table-diff/fixtures/express5");
  const r = run("route-table-diff", { before: join(fx, "collision-before.json"), after: join(fx, "collision-after.json") });
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.body.breaking, true);
  const raw = { framework: { name: "express", major: 5 }, settings: { caseSensitive: false, strict: false }, routes: [{ method: "GET", path: "/x\\?y" }] };
  const bad = file("bad-route.json", raw);
  const refusal = run("route-table-diff", { before: bad, after: bad });
  assert.equal(refusal.status, 2); assert.equal(refusal.body.code, "unsupported_express_path");
});
for (const [afterName, verdict] of [["after-noise.json", "unchanged"], ["after-business.json", "changed"]]) test("1.4.2 cold page held-fact witness: " + afterName, () => {
  const fx = join(kit, "engines/page-change-offline-job/fixtures/semantic-witness");
  const job = file("job.json", { id: "cold-142", clock: "2026-09-12T06:00:00.000Z", fields: ["title", "openGraph", "links", "text"], before: join(fx, "before.json"), after: join(fx, afterName) });
  const r = run("page-change-offline-job", { job });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(read(join(r.out, "page-change.json")).report.verdict, verdict);
});
